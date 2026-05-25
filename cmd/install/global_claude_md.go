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

Invoke the orchestrator as a subagent: ` + "`Agent(subagent_type='th:orchestrator', ...)`" + `. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task. Do not execute the orchestrator role inline at top level — the orchestrator's contract is its system prompt, and inline execution weakens enforcement of pipeline gates.

When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: ` + "`Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.`" + ` This ensures the orchestrator and all downstream agents write in the operator's language.
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
