
# Audit

Assess the requested repository, module or architectural question. The current
general agent coordinates the work and judges the findings. Use bounded research
or architect assistance when independent inspection adds value.

Resolve the target from the request; with no narrower target, inspect the current
repository. For an issue, read its actual content using the shared
[GitHub fallback](../../agents/_shared/gh-fallback.md). If access fails, report
what is unavailable and ask for the issue text rather than inventing its scope.

Trace responsibilities and actual consumers before recommending changes. Compare
code with documentation, identify duplication and dead code, and distinguish
confirmed problems from hypotheses. A recommendation to remove something should
explain what capability survives and where. File size or age alone is not evidence
that a component is unnecessary.

Use the [architect's audit method](../../agents/ref-architect-modes.md#audit-mode)
and the [coverage method](references/coverage-method.md) for a diagnostic report
with concrete file references, impact, recommendations and coverage limits.
Trace applicable components, relationships and success, change and failure
scenarios. Distinguish evidence observed directly from reasoning inferred from
code or documentation, and name material interactions that remain unverified.
Preserve the configured workspace/Obsidian destination, language and voice. Save
the report as `research/00-audit.md` in that workspace and present the findings
that affect the operator's next decision.

When an upstream analyzer is useful, read the [shared upstream-tool integration
reference](../spec/references/upstream-tools.md) and use its official entry and
preparation rules. Do not copy provider methods, add a local scanner or turn a
diagnostic result into implementation authority.

Audit is diagnostic. It does not authorize implementation or activate a pipeline.
Use [security](../security/SKILL.md) when the request is specifically a security
audit; architecture inspection need not invoke that separate workflow by default.
