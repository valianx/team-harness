---
name: hookify
description: Analyze recurring friction and recommend workflow or native-runtime improvements. Report only; does not change hooks or configuration.
---

# Analyze workflow friction

Use the current request and available session context to identify recurring corrections,
manual repairs, repeated approvals or stalled handoffs. Keep the `hookify` invocation for
compatibility; its purpose is a useful recommendation, not another TH enforcement layer.

Work directly in the current coordinator. Follow the configured language and the voice
guidance in `agents/_shared/operational-rules.md`. With `--help`, explain the inputs,
report and scope without starting analysis.

## Evidence

Start from examples supplied by the operator and context already available. If a workspace
is already in scope, consult relevant excerpts of its existing execution events or reports
for corroboration. Do not create a workspace, scan unrelated sessions, or claim to read
transcript history unavailable to the current runtime. Ask for a concrete example when
there is insufficient evidence; distinguish a single incident from a recurring pattern.

## Recommendation

Identify the intended outcome, the friction's likely cause and the smallest useful change.
Consider a clearer objective, better task context, removal of duplicated work, an existing
TH skill, or a supported native-runtime capability. Prefer the runtime's existing permission
and approval controls when the problem concerns execution authority; explain any capability
or version uncertainty instead of assuming equivalent policies across hosts.

Do not propose restoring retired TH permission guards or adding a parallel permission
system. If the operator explicitly asks to explore their own native hooks, a report may
assess that option using the selected runtime's supported integration, concrete trigger,
false-positive risk and a verification approach. This does not authorize installation.

Present the evidence, recommendation, expected benefit, tradeoffs and a practical way to
check the result. State when changing nothing or gathering another example is preferable.
Do not turn each incident into a rule or claim measured savings without measurements.

## Report scope

This skill produces analysis in chat. It does not write hook files, change permissions or
configuration, or apply its recommendations. A request to implement a recommendation is
separate work under the operator's scope and the runtime's native permissions.
