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

**How to invoke:** ` + "`Agent(subagent_type='th:orchestrator', ...)`" + `. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task. Do not execute the orchestrator role inline at top level — the orchestrator's contract is its system prompt, and inline execution weakens enforcement of pipeline gates.

**Full pipeline is the default.** Every development task runs the complete pipeline unless the operator explicitly requests a direct mode (research, design, validate, deliver, review). Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

` + "**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.\n\n" + `**Respect ` + "`~/.claude/.team-harness.json`" + ` configuration.** This file controls workspace output mode (` + "`logs-mode`" + `: local or obsidian), vault path (` + "`logs-path`" + `), and subfolder (` + "`logs-subfolder`" + `). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via ` + "`/th:setup`" + `.

**Language propagation.** When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: ` + "`Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.`" + ` This ensures the orchestrator and all downstream agents write in the operator's language.
<!-- orchestrator-dispatch-rule:end -->`

// ensureGlobalClaudeMD creates or updates ~/.claude/CLAUDE.md with the
// orchestrator dispatch rule. The rule is wrapped in HTML comment markers
// for idempotent updates — if the markers exist, the section is replaced;
// otherwise it is appended.

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
				return
			}
			if err := os.WriteFile(path, []byte(updated), 0o644); err != nil {
				fmt.Fprintf(os.Stderr, "  [warn] cannot update ~/.claude/CLAUDE.md: %v\n", err)
				return
			}
			fmt.Println("  ~/.claude/CLAUDE.md: orchestrator rule updated")
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
}
