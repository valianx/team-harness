package main

import (
	"fmt"
	"os"
	"strings"
)

const orchestratorRuleMarkerStart = "<!-- orchestrator-dispatch-rule:start -->"
const orchestratorRuleMarkerEnd = "<!-- orchestrator-dispatch-rule:end -->"

const orchestratorRule = `<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

**When to use:** For any development task — features, bug fixes, refactors, enhancements, hotfixes — always route through the orchestrator. Do not implement, test, or deliver directly. The orchestrator coordinates the full pipeline (architect → implementer → tester + qa + security → delivery) and enforces quality gates at each stage boundary.

**How to invoke:** ` + "`Agent(subagent_type='th:orchestrator', ...)`" + `. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task.

**Inline orchestration at top level:** executing the orchestrator role inline at top level is PERMITTED ONLY when the filesystem marker ` + "`~/.claude/.dev-mode-active`" + ` contains ` + "`dev_mode: true`" + `. In that case the top-level agent IS the orchestrator — it has Task available and dispatches leaf agents directly without a dispatch_handoff. Developer mode is the default (written by `/th:setup` and `/th:update`); without the marker active, executing orchestration inline — including reading ` + "`agents/orchestrator.md`" + ` "as reference" — is the ad-hoc improvisation that weakens gate enforcement and is PROHIBITED. **FALLBACK:** when dev mode is not active, the canonical invocation is ` + "`Agent(subagent_type='th:orchestrator', ...)`" + ` and the nested-handoff/takeover machinery in ` + "`docs/subagent-orchestration.md`" + ` is the safety net.

**Default to team-harness flows.** For any development task — features, bug fixes, refactors, enhancements, hotfixes, issue work, code review — the top-level agent routes through the orchestrator or the matching ` + "`th`" + ` skill by default. Direct or manual handling (writing code, running commands, editing files outside a pipeline) is the exception and requires an explicit operator opt-out. When in doubt, use th flows.

**Full pipeline is the default.** Every development task runs the complete pipeline unless the operator explicitly requests a direct mode (research, design, validate, deliver, review). Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

` + "**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.\n\n" + `**Respect ` + "`~/.claude/.team-harness.json`" + ` configuration.** This file controls workspace output mode (` + "`logs-mode`" + `: local or obsidian), vault path (` + "`logs-path`" + `), and subfolder (` + "`logs-subfolder`" + `). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via ` + "`/th:setup`" + `.

**Language propagation.** When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: ` + "`Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.`" + ` This ensures the orchestrator and all downstream agents write in the operator's language.

**Report team-harness problems via ` + "`/th:report-issue`" + `.** When a bug, gap, or improvement is detected in the ` + "`th`" + ` plugin itself — its agents, skills, or any orchestrator behavior — report it with ` + "`/th:report-issue <bug|feature|docs|question> \"<summary>\"`" + `, not with ` + "`gh issue create`" + ` directly and not by editing files under the plugin cache (those edits are transient and are overwritten on the next ` + "`th:update`" + `). The skill builds the correct issue pattern (Summary, Environment with ` + "`th`" + `/Claude Code/OS versions), de-duplicates against open issues, and requires confirmation before creating; a manual ` + "`gh issue create`" + ` skips that pattern and the dedup check.
<!-- orchestrator-dispatch-rule:end -->`

const devModeMarkerStart = "<!-- dev-mode:start -->"
const devModeMarkerEnd = "<!-- dev-mode:end -->"

// devModeBlock is the prose written to ~/.claude/CLAUDE.md by the legacy Go
// installer path (deprecated since v2.33.0). It is intentionally kept in sync
// with the plugin-path canonical block (skills/setup/managed-blocks/dev-mode.md)
// for doc-coherence, but the Go installer DOES NOT write the activation marker
// (~/.claude/.dev-mode-active). The marker is asserted on the next plugin-runtime
// session via /th:update, or the operator can run /dev-mode manually.
// Parity gap (by design, not a bug): marker-activation is not added to this
// deprecated path to avoid complexity in code that will be removed in a future
// version. See docs/dev-mode.md § Installation for the documented caveat.
const devModeBlock = `<!-- dev-mode:start -->
## dev mode

**What it is:** The default session disposition for Team Harness. Developer mode activates automatically on install and update (via the plugin path) — the top-level agent adopts the orchestrator role and dispatches leaf agents directly via Task (no nested subagent, no dispatch_handoff round-trip). To exit: run ` + "`/dev-mode off`" + ` — the choice persists so future updates respect it.

**Start it (in-session, no reload):** run ` + "`/dev-mode`" + `. The skill writes the marker ` + "`~/.claude/.dev-mode-active`" + ` (` + "`dev_mode: true`" + `), prints the DEVELOPER MODE banner, adopts the orchestrator operating contract, and persists ` + "`dev_mode_choice: \"on\"`" + ` in ` + "`~/.claude/.team-harness.json`" + `. No ` + "`/clear`" + ` is required.

**Stop it:** run ` + "`/dev-mode off`" + `. The skill removes the marker (` + "`dev-guard.sh`" + ` intercepts with ` + "`permissionDecision: \"ask\"`" + ` — operator confirms), returns to normal mode, and persists ` + "`dev_mode_choice: \"off\"`" + ` so future ` + "`/th:update`" + ` runs respect the opt-out.

**What dev mode does:** Development tasks are routed through the full pipeline (architect -> implementer -> tester + qa + security -> delivery) with all gates enforced. Outward actions (git push, gh pr merge/review/comment, and equivalent API calls) require explicit operator approval via the deterministic gate ` + "`hooks/dev-guard.sh`" + `. Security floors (HI-2, path-pattern auto-escalation, bug-fix forcing rule) are non-waivable — dev mode is a disposition signal, not a stage-switch. Full contract: ` + "`docs/dev-mode.md`" + `.

**What dev mode does NOT do:** It does not skip stages, waive gates, or relax security checks. Ambiguous tasks are routed to the pipeline or confirmed — never handled inline without gates. Outward actions cannot be executed inline by rationalisation — the gate escalates them to operator approval.
<!-- dev-mode:end -->`

const devModeEntryMarkerStart = "<!-- dev-mode-entry:start -->"
const devModeEntryMarkerEnd = "<!-- dev-mode-entry:end -->"

const devModeEntryBlock = `<!-- dev-mode-entry:start -->
## dev-mode trigger recognition

Recognize the following phrases as requests to activate or deactivate developer mode. When one is detected, invoke the corresponding skill — do not ask for confirmation, the phrase is the instruction.

**Activate dev mode** (invoke ` + "`/dev-mode`" + `):
- "dev mode on"
- "activate dev mode"
- "entrá en dev mode"
- "activá modo desarrollo"
- "enable dev mode"

**Deactivate dev mode** (invoke ` + "`/dev-mode off`" + `):
- "dev mode off"
- "deactivate dev mode"
- "salí de dev mode"
- "desactivá modo desarrollo"
- "disable dev mode"

This recognition runs at the top level before any skill loads. It applies only when the phrase appears as a standalone request, not when embedded in a longer task description.
<!-- dev-mode-entry:end -->`

// ensureGlobalClaudeMD creates or updates ~/.claude/CLAUDE.md with the
// orchestrator dispatch rule and dev-mode blocks. The rules are wrapped in
// HTML comment markers for idempotent updates — if the markers exist, the
// section is replaced; otherwise it is appended.

// legacyMarkerStart / legacyMarkerEnd are the v1 inline-rule markers written by
// installer versions before v2.0 — kept to migrate users off the old format.
const legacyMarkerStart = "<!-- th-orchestrator-inline-rule:start -->"
const legacyMarkerEnd = "<!-- th-orchestrator-inline-rule:end -->"

// legacyDispatchMarkerStart / legacyDispatchMarkerEnd are the v2 dispatch-rule
// markers written by installer versions v2.0–v2.28 (th-orchestrator era) — kept
// to migrate users off the old agent name without leaving a duplicate block.
const legacyDispatchMarkerStart = "<!-- th-orchestrator-dispatch-rule:start -->"
const legacyDispatchMarkerEnd = "<!-- th-orchestrator-dispatch-rule:end -->"

func ensureGlobalClaudeMD() {
	home, _ := os.UserHomeDir()
	path := home + "/.claude/CLAUDE.md"

	var existing string
	if data, err := os.ReadFile(path); err == nil {
		existing = string(data)
	}

	// Migrate from v1 inline-rule markers to the current dispatch-rule markers.
	if strings.Contains(existing, legacyMarkerStart) {
		startIdx := strings.Index(existing, legacyMarkerStart)
		endIdx := strings.Index(existing, legacyMarkerEnd)
		if endIdx > startIdx {
			endIdx += len(legacyMarkerEnd)
			existing = existing[:startIdx] + orchestratorRule + existing[endIdx:]
			if err := os.WriteFile(path, []byte(existing), 0o644); err != nil {
				fmt.Fprintf(os.Stderr, "  [warn] cannot migrate ~/.claude/CLAUDE.md: %v\n", err)
				return
			}
			fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule migrated (inline → subagent dispatch)")
			ensureManagedBlock(path, devModeMarkerStart, devModeMarkerEnd, devModeBlock, "dev-mode block")
			removeManagedBlock(path, devModeEntryMarkerStart, devModeEntryMarkerEnd, "dev-mode-entry block (obsolete)")
			return
		}
	}

	// Migrate from v2 th-orchestrator-dispatch-rule markers to the current
	// orchestrator-dispatch-rule markers (rename migration, v2.0–v2.28 → v2.29+).
	if strings.Contains(existing, legacyDispatchMarkerStart) {
		startIdx := strings.Index(existing, legacyDispatchMarkerStart)
		endIdx := strings.Index(existing, legacyDispatchMarkerEnd)
		if endIdx > startIdx {
			endIdx += len(legacyDispatchMarkerEnd)
			existing = existing[:startIdx] + orchestratorRule + existing[endIdx:]
			if err := os.WriteFile(path, []byte(existing), 0o644); err != nil {
				fmt.Fprintf(os.Stderr, "  [warn] cannot migrate ~/.claude/CLAUDE.md: %v\n", err)
				return
			}
			fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule migrated (th-orchestrator → orchestrator)")
			ensureManagedBlock(path, devModeMarkerStart, devModeMarkerEnd, devModeBlock, "dev-mode block")
			removeManagedBlock(path, devModeEntryMarkerStart, devModeEntryMarkerEnd, "dev-mode-entry block (obsolete)")
			return
		}
	}

	if strings.Contains(existing, orchestratorRuleMarkerStart) {
		// Replace existing rule block (idempotent update).
		startIdx := strings.Index(existing, orchestratorRuleMarkerStart)
		endIdx := strings.Index(existing, orchestratorRuleMarkerEnd)
		if endIdx > startIdx {
			endIdx += len(orchestratorRuleMarkerEnd)
			updated := existing[:startIdx] + orchestratorRule + existing[endIdx:]
			if updated == existing {
				fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule unchanged")
			} else {
				if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
					fmt.Fprintf(os.Stderr, "  [warn] cannot update ~/.claude/CLAUDE.md: %v\n", err)
					return
				}
				fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule updated")
			}
			// Ensure dev-mode block exists (idempotent); remove obsolete dev-mode-entry block.
			ensureManagedBlock(path, devModeMarkerStart, devModeMarkerEnd, devModeBlock, "dev-mode block")
			removeManagedBlock(path, devModeEntryMarkerStart, devModeEntryMarkerEnd, "dev-mode-entry block (obsolete)")
			return
		}
	}

	// Append the rule to the end of the file (or create it).
	var content string
	if existing == "" {
		content = "# User-level CLAUDE.md\n\n" + orchestratorRule + "\n"
	} else {
		separator := "\n\n"
		if strings.HasSuffix(existing, "\n\n") {
			separator = ""
		} else if strings.HasSuffix(existing, "\n") {
			separator = "\n"
		}
		content = existing + separator + orchestratorRule + "\n"
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot write ~/.claude/CLAUDE.md: %v\n", err)
		return
	}
	fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule added")

	// Write the dev-mode block on first-time add (markers were absent).
	// The dev-mode-entry block is not written (obsolete since v2.53.0).
	ensureManagedBlock(path, devModeMarkerStart, devModeMarkerEnd, devModeBlock, "dev-mode block")
}

// removeManagedBlock removes a marker-delimited block from the given CLAUDE.md path.
// If the markers are absent, it is a no-op (idempotent).
func removeManagedBlock(path, startMarker, endMarker, label string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	existing := string(data)
	if !strings.Contains(existing, startMarker) {
		return
	}
	startIdx := strings.Index(existing, startMarker)
	endIdx := strings.Index(existing, endMarker)
	if endIdx <= startIdx {
		return
	}
	endIdx += len(endMarker)
	updated := existing[:startIdx] + existing[endIdx:]
	if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot remove %s from ~/.claude/CLAUDE.md: %v\n", label, err)
		return
	}
	fmt.Printf("  ~/.claude/CLAUDE.md: %s removed\n", label)
}

// ensureManagedBlock idempotently writes a marker-delimited block to the given
// CLAUDE.md path. If the markers exist, the content between them is replaced;
// otherwise the block is appended.
func ensureManagedBlock(path, startMarker, endMarker, block, label string) {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot read ~/.claude/CLAUDE.md for %s: %v\n", label, err)
		return
	}
	existing := string(data)

	if strings.Contains(existing, startMarker) {
		startIdx := strings.Index(existing, startMarker)
		endIdx := strings.Index(existing, endMarker)
		if endIdx > startIdx {
			endIdx += len(endMarker)
			updated := existing[:startIdx] + block + existing[endIdx:]
			if updated == existing {
				fmt.Printf("  ~/.claude/CLAUDE.md: %s unchanged\n", label)
				return
			}
			if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
				fmt.Fprintf(os.Stderr, "  [warn] cannot update ~/.claude/CLAUDE.md %s: %v\n", label, err)
				return
			}
			fmt.Printf("  ~/.claude/CLAUDE.md: %s updated\n", label)
			return
		}
	}

	// Append.
	separator := "\n\n"
	if strings.HasSuffix(existing, "\n\n") {
		separator = ""
	} else if strings.HasSuffix(existing, "\n") {
		separator = "\n"
	}
	content := existing + separator + block + "\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "  [warn] cannot write ~/.claude/CLAUDE.md %s: %v\n", label, err)
		return
	}
	fmt.Printf("  ~/.claude/CLAUDE.md: %s added\n", label)
}
