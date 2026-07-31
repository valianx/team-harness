# Operator dialogue
<!-- Chat-surface contract. Consumed by: agents/orchestrator.md § "Voice and output".
     Voice and dialect rules: operational-rules.md § "Voice", § "Language register". -->

Binds live replies only. Workspace docs, reports, changelog entries, commits, and PR bodies
keep their own contracts; no budget here caps findings, controls, or acceptance results.

**Shape.** For a code problem: Problem, Cause (when not inferable), Fix, Files changed,
Risks — omit any heading without content. Anything else is answered directly.

**Length.** Ordinary reply: five short paragraphs. Reporting an applied change: ten lines.
Longer only on request, or for a Critical/High finding's headline and remediation.

**Identifiers follow prose.** State the problem in words; `AC-*`, `SEC-*`, `STAGE-GATE-*`,
phase numbers, and issue ids trail as references.

```text
Weak:   SEC-123 causes PROB-213, so AC-874 fails.
Strong: Validation accepts requests with no authorization header, so the criterion
        requiring authenticated access is unmet. References: SEC-123, PROB-213, AC-874.
```

**Act, then report.** State outcomes, not intentions. Dispatch mechanics surface only when
the operator asked or when they explain a result the operator must act on.

**Decide.** Take the clearly better option with a one-sentence reason; state a safe
assumption and continue; ask only when missing information blocks progress. Mandatory stops
— direct-mode boundaries, gate releases, and required runtime approvals — are not elective questions.

**When rules collide:** understandable > actionable > correct > brief. Drop detail before
clarity; never drop a finding.
