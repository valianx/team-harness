---
name: audit-security
description: Run the security self-scan over this repo's shipped assets and present the severity-tagged report.
---
name: audit-security

Run the five-check security self-scan over this repo's shipped assets (`agents/`, `skills/`, `hooks/`, `.claude-plugin/`) and present the severity-tagged report. REPORT-only — no auto-fix action is taken on any audited file.

**IMPORTANT:** This skill runs directly — do NOT invoke the `orchestrator` agent or any other agent. Execute the scanner yourself using Bash and present the output verbatim.

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
- Declarative statements of fact: "The scanner returned exit code 0", "Three findings are present".
- Direct action descriptions: "X was executed", "Y was flagged", "Z requires manual remediation".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

---

## Arguments

| Argument | Description |
|----------|-------------|
| (none)   | Run the full 5-check scan and present the report. |
| `--help` | Print the check list, severity legend, and exit-code contract; do not run the scan. |

---

## Execution

### `--help` path

If `$ARGUMENTS` contains `--help`, print the following and exit without running the scan:

```
/th:audit-security — security self-scan (5-check MVP)

Checks:
  1 (FAIL) — read-only-tier agent carrying Bash in frontmatter tools:
  2 (FAIL) — web-facing agent (WebFetch/WebSearch in tools:) missing §6.6 preamble
  3 (FAIL) — hooks/*.sh injection anti-pattern (eval/$(), curl|bash, rm -rf $VAR)
  4 (WARN) — hook manifest non-canonical command / over-permissive .* matcher
  5 (FAIL) — concrete high-confidence secret in shipped assets

Severity legend:
  [FAIL] — FAIL-severity finding: process exits 1, CI is blocked
  [WARN] — WARN-severity finding: process exits 0, advisory only
  [PASS] — no finding for this check

Exit codes:
  0 — all FAIL checks passed (WARN findings may still be present)
  1 — at least one FAIL finding

REPORT-only: no --fix, no write, no auto-remediation.
```

### Scan path (no `--help`)

1. Run: `python3 tests/test_security_scan.py`
2. Capture and present the full stdout verbatim — do not truncate or reformat.
3. After the output, state the exit code: `Exit code: {N}`
4. If exit code is 0: state "All FAIL-severity checks passed."
5. If exit code is 1: state "FAIL findings present. Manual remediation required — the scanner is REPORT-only and takes no corrective action."

---

## Severity Contract

| Severity | Meaning | CI effect |
|----------|---------|-----------|
| `[FAIL]` | A security invariant is violated | Exit 1 — blocks CI |
| `[WARN]` | An advisory finding (check 4 only) | Exit 0 — advisory |
| `[PASS]` | Check passed, no finding | Contributes to exit 0 |

---

## Report Shape

The scanner prints one tagged line per finding, followed by a summary:

```
[FAIL] check-N — file — reason (names the pattern CLASS, never the matched value)
[WARN] check-4 — manifest entry — reason
[PASS] check-N — N targets clean
---
security self-scan: X FAIL / Y WARN
```

The reason strings name the secret or permission CLASS — they never reproduce a matched secret value.

---

## Output Discipline

Each tool call (Bash) runs silently. Only the scanner's stdout and the concluding exit-code statement are presented to the operator. No intermediate narrative, no tool-call commentary.
