---
name: hookify
description: Analyze friction signals from the current session and propose candidate deterministic hook rules for operator review. REPORT-only — never writes or modifies any file under hooks/ or ~/.claude/.
---
name: hookify

Analyze friction signals from this session (operator-supplied corrections, recurring manual fixes) and map each recurring pattern onto a candidate deterministic hook rule. The result is a proposed-rules report for the operator's review; no hook file is created or modified.

**IMPORTANT:** This skill runs directly — do NOT invoke the `orchestrator` agent or any other agent. Execute all analysis yourself using the tools available to you (Read, Grep, Glob) and present the report.

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: regional slang, "shippeo", "bakeado", "wrappear".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "Two friction patterns were identified", "The proposed severity is `ask`".
- Direct action descriptions: "The pattern maps to a `PreToolUse` trigger on `Bash`", "Operator must wire the rule manually".
- Concise summaries: a status block, a table, or a brief outcome statement. No padding, no celebration.

---

## Arguments

| Argument | Description |
|----------|-------------|
| (none)   | Gather friction signals (operator-supplied + trace enrichment) and present the proposed-rules report. |
| `--help` | Print the input model, report shape, and boundary contract; do not run the analysis. |

---

## Execution

### `--help` path

If `$ARGUMENTS` contains `--help`, print the following and exit without running the analysis:

```
/th:hookify — friction-to-hook proposal skill (REPORT-only)

Input model:
  Primary   — operator-supplied recurring corrections or manual fixes
              (paste friction items in the invocation or point to a file via $ARGUMENTS)
  Enrichment — workspace 00-execution-events.jsonl / 00-execution-events.md
              (read opportunistically when a workspace path is in scope)
  NOT read  — the raw chat transcript (not a readable artifact for a skill)

Report shape (per proposed rule):
  Intent          — what the rule prevents or enforces
  Trigger event   — PreToolUse | PostToolUse | Stop
  Matcher         — Bash | Write|Edit | mcp__.*__<verb> | …
  Match sketch    — illustrative regex (not production-ready; human must verify)
  Severity        — ask (default) | deny (destructive-action class only)
  Rationale       — why this recurrence warrants a hook
  False-pos risk  — known cases where the sketch would fire incorrectly
  Suggested hook  — policy-block (content/command guard) | dev-guard (outward-action guard) | new TS hook body
  Manual step     — what the operator must do to wire the rule

REPORT-only boundary:
  This skill NEVER writes or modifies any file under hooks/ or ~/.claude/.
  There is no --fix or --apply path. The operator owns all wiring.

Severity defaults:
  ask   — default for all proposed rules (a sketch is unverified; prompt is the safe default)
  deny  — proposed only for the destructive-action class already denied by policy-block
```

### Analysis path (no `--help`)

**Phase 1 — Gather friction signals**

1. If `$ARGUMENTS` names a file path, `Read` that file and treat its contents as operator-supplied friction items.
2. Otherwise, prompt the operator (if no items were pasted inline): "Paste the recurring corrections or manual fixes to analyze, one item per line."
3. Enrichment — trace file: check whether a workspace is in scope (operator has referenced a workspace path, or `workspaces/` contains a recent session folder). If so, `Grep` for friction event tokens in `00-execution-events.jsonl` or `00-execution-events.md`:
   - Tokens: `"deny"`, `"gate"`, `"failed"`, `"patch-mode"`, `"re-run"`.
   - Bound the search: read at most 200 matching lines. If the trace file is absent or oversized, note it in the report header and continue with operator-supplied items only.
4. **This skill does NOT read the raw chat transcript.** The transcript is not a readable artifact. If the operator expects transcript-based detection, state this limitation clearly.

**Phase 2 — Map signals to candidate hook rules**

For each recurring friction signal (operator-supplied or trace-derived), map it onto the deterministic-hook vocabulary used by the `policy-block` and `dev-guard` gates (TypeScript bodies at `hooks/ts/bodies/policy-block.ts` and `hooks/ts/bodies/dev-guard.ts` — TS is the single source of gate logic for both Claude Code and opencode; each body compiles to `hooks/ts/dist/<name>.cjs` and is wired via `.claude-plugin/hooks.json` → `hooks/run-ts-hook.sh <name>`):

| Field | Description |
|-------|-------------|
| Trigger event | `PreToolUse` (before a tool call) · `PostToolUse` (after) · `Stop` (on agent stop) |
| Matcher | The `tool_name` or MCP verb pattern the hook intercepts |
| Match sketch | An illustrative regex or string pattern (not production-ready — the operator must verify and harden it) |
| Severity | `ask` by default. `deny` only when the pattern maps to the destructive-action class (e.g., `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`) that `policy-block` already denies. |
| Suggested hook | `policy-block` (`hooks/ts/bodies/policy-block.ts`) for content/command guards; `dev-guard` (`hooks/ts/bodies/dev-guard.ts`) for outward-action gates; a new TS body under `hooks/ts/bodies/` for novel coverage. |

A signal qualifies for a candidate rule when it has recurred at least twice and maps to a detectable, deterministic pattern (a specific command shape, a file path, an MCP verb). Single-occurrence or underdetermined signals are listed as `Insufficient signal — observe further` and excluded from the proposed rules.

**Phase 3 — Emit the proposed-rules report**

Present the report using the shape below. Include the report header, one rule block per candidate, and the closing notes section.

---

## Report Shape

```
====================================
  /th:hookify — Proposed Hook Rules
====================================

Input:       {N operator-supplied items | trace enrichment from {path} | operator-supplied only}
Signals:     {N total} | {N qualified → proposed rules} | {N insufficient-signal → excluded}
Transcript:  NOT read — chat transcript is not a readable artifact for this skill

--- Rule {N}: {short intent label} ---
Intent:         {what the rule prevents or enforces}
Trigger event:  {PreToolUse | PostToolUse | Stop}
Matcher:        {Bash | Write|Edit | mcp__.*__<verb> | …}
Match sketch:   {illustrative regex or pattern — NOT production-ready}
Severity:       {ask | deny} — {one-line justification}
Rationale:      {why this recurrence warrants a hook}
False-pos risk: {known patterns that would fire incorrectly}
Suggested hook: {policy-block | dev-guard | new TS hook body}
Manual step:    {what the operator must do to wire this rule}

{repeat for each qualified candidate}

--- Excluded signals ({N}) ---
{signal text} — Insufficient signal — observe further
{repeat}

====================================
  Notes
====================================
- All proposed sketches are illustrative. Verify and harden each regex before wiring.
- Default severity is `ask`. Elevate to `deny` only for the destructive-action class
  (see hooks/ts/bodies/policy-block.ts for the canonical deny list).
- Wire rules in hooks/ts/bodies/policy-block.ts (content/command guard) or
  hooks/ts/bodies/dev-guard.ts (outward-action gate), then rebuild with
  `npm run build` (hooks/ts/) so the compiled hooks/ts/dist/<name>.cjs picks up
  the change — or create a new TS body under hooks/ts/bodies/ for novel coverage.
- This report does not write any file. The operator owns all wiring.
====================================
```

---

## REPORT-only Boundary

**This skill is REPORT-only.** It does NOT write or modify any file under `hooks/` or `~/.claude/`. There is no `--fix` path, no `--apply` path, and no auto-write path of any kind.

The proposed rules in the report are illustrative sketches, not production-ready hook implementations. The operator is responsible for:
1. Reviewing each proposed rule and its false-positive risk.
2. Hardening the match sketch into a verified regex or pattern.
3. Choosing the target hook file and wiring the rule manually.
4. Testing the wired rule before relying on it in production.

If a future request asks this skill to write a hook file or apply a proposed rule automatically, that request falls outside this skill's scope and must be declined.

---

## Output Discipline

Each tool call (Read, Grep, Glob) runs silently. Only the proposed-rules report is presented to the operator. No intermediate narrative, no tool-call commentary, no status updates during analysis.

If no friction signals are available (no operator-supplied items, no workspace trace), state: "No friction signals available. Provide recurring corrections via $ARGUMENTS or paste them inline."
