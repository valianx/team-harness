package main

import (
	"fmt"
	"os"
	"strings"
)

const orchestratorRuleMarkerStart = "<!-- th-orchestrator-inline-rule:start -->"
const orchestratorRuleMarkerEnd = "<!-- th-orchestrator-inline-rule:end -->"

const orchestratorRule = `<!-- th-orchestrator-inline-rule:start -->
## th-orchestrator inline execution

When the system instructs you to invoke the agent "th-orchestrator" (via @mention or system-reminder), do NOT spawn it as a subagent via Agent(). The orchestrator requires the Task/Agent tool to dispatch phase agents (architect, implementer, tester, qa, security, delivery, etc.). Spawning it as a subagent puts it at depth 1, where Task is stripped by the runtime — making it unable to orchestrate.

**Instead, execute the orchestrator role at top level:**

1. Read ` + "`~/.claude/agents/th-orchestrator.md`" + ` to load the orchestrator contract.
2. Read the manifest at ` + "`~/.claude/.team-harness.json`" + ` to determine ` + "`logs-mode`" + ` and ` + "`logs-path`" + ` for session-docs placement.
3. Follow the orchestrator's pipeline phases (intake → design → implement → verify → deliver), dispatching each phase's agent directly via Agent() at depth 1.
4. Respect all stage gates (STAGE-GATE-1 = mandatory human stop, STAGE-GATE-3 = mandatory before push).
5. You still inherit the "never write code/tests/docs" contract — dispatch agents for that work.

This rule takes precedence over the system-reminder that says "invoke the agent appropriately." The hook ` + "`orchestrator-guard.sh`" + ` enforces this as a safety net.
<!-- th-orchestrator-inline-rule:end -->`

// ensureGlobalClaudeMD creates or updates ~/.claude/CLAUDE.md with the
// orchestrator inline-execution rule. The rule is wrapped in HTML comment
// markers for idempotent updates — if the markers exist, the section is
// replaced; otherwise it is appended.
func ensureGlobalClaudeMD() {
	home, _ := os.UserHomeDir()
	path := home + "/.claude/CLAUDE.md"

	var existing string
	if data, err := os.ReadFile(path); err == nil {
		existing = string(data)
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
