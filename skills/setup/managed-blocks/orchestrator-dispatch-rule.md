<!-- orchestrator-dispatch-rule:start -->
## orchestrator dispatch

**When to use:** For any development task — features, bug fixes, refactors, enhancements, hotfixes — always route through the orchestrator. Do not implement, test, or deliver directly. The orchestrator coordinates the full pipeline (architect → implementer → tester + qa + security → delivery) and enforces quality gates at each stage boundary.

**How to invoke:** `Agent(subagent_type='th:orchestrator', ...)`. The orchestrator dispatches phase agents (th:architect, th:implementer, th:tester, th:qa, th:security, th:delivery, etc.) internally via Task. Do not execute the orchestrator role inline at top level — the orchestrator's contract is its system prompt, and inline execution weakens enforcement of pipeline gates.

**Default to team-harness flows.** For any development task — features, bug fixes, refactors, enhancements, hotfixes, issue work, code review — the top-level agent routes through the orchestrator or the matching `th` skill by default. Direct or manual handling (writing code, running commands, editing files outside a pipeline) is the exception and requires an explicit operator opt-out. When in doubt, use th flows.

**Full pipeline is the default.** Every development task runs the complete pipeline unless the operator explicitly requests a direct mode (research, design, validate, deliver, review). Do not skip stages or substitute yourself for a subagent — the pipeline runs in full or stops with a real error.

**Operator-declared fast path.** The operator — and only the operator — may request a lighter pipeline; the orchestrator never shrinks it on its own. Declarations: `--fast` for a very small change (a version bump, a one-line edit) skips the plan review, qa, and security stages; `[TIER: 0]` / `[TIER: 1]` for trivial or docs-only fixes; or Simple Mode keywords (`simple`, `just implement`, `skip tests`). In every case Specify and Delivery still run — every change is spec'd, branched, committed, and shipped as a PR — and security still runs on security-sensitive paths (`auth`, `api`, `db`, `crypto`, `session`) regardless of the declaration.

**Respect `~/.claude/.team-harness.json` configuration.** This file controls workspace output mode (`logs-mode`: local or obsidian), vault path (`logs-path`), and subfolder (`logs-subfolder`). The orchestrator reads this at pipeline start. Do not override these values or hard-code paths — the operator configured them via `/th:setup`.

**Language propagation.** When dispatching the orchestrator, detect the operator's chat language and include it in the prompt: `Operator language: {code}. Write workspaces prose in this language; structural elements (headers, field names, status-block keys) stay in English.` This ensures the orchestrator and all downstream agents write in the operator's language.

**Report team-harness problems via `/th:report-issue`.** When a bug, gap, or improvement is detected in the `th` plugin itself — its agents, skills, or any orchestrator behavior — report it with `/th:report-issue <bug|feature|docs|question> "<summary>"`, not with `gh issue create` directly and not by editing files under the plugin cache (those edits are transient and are overwritten on the next `th:update`). The skill builds the correct issue pattern (Summary, Environment with `th`/Claude Code/OS versions), de-duplicates against open issues, and requires confirmation before creating; a manual `gh issue create` skips that pattern and the dedup check.
<!-- orchestrator-dispatch-rule:end -->
