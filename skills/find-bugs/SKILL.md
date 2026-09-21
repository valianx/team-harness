---
name: find-bugs
description: Investigate concrete functional defects in a project or module with Semgrep evidence and contextual verification, without requiring a pull-request diff.
---

# Find bugs

Main coordinates the requested diagnosis in the native general agent. Resolve
the named repository or module and preserve the selected local or Obsidian
workspace. A clean checkout is valid input; this workflow does not require a
branch diff or start the `review-pr` flow.

Trace the selected behaviors and failure paths through their actual consumers,
using relevant existing project checks. Investigate contextual candidates even
when an analyzer reports no matches. For a confirmed defect, report its trigger,
expected versus observed behavior, impact and source evidence.

At entry or resumption, read the [shared upstream-tool integration
reference](../spec/references/upstream-tools.md). Prepare selected tools through
their official owners under native permissions, reuse healthy installations and
report installed, discoverable and usable states separately. Do not update or
install unrelated tools, copy upstream skills/rules, or claim readiness from
file presence alone. If a required selected capability is unavailable, report
the concrete recovery and the dependent analysis as pending.

For an applicable target, use Semgrep CE as a deterministic candidate pass and
record its resolved version, rules/configuration, scope, exit status, errors and
skipped files. A zero exit code or empty match set is not proof that the target
is defect-free. Investigate each useful match against surrounding behavior,
actual consumers and expected versus observed behavior; classify it as
confirmed, refuted or unresolved. When a shared cause is confirmed, search
related occurrences within the agreed scope and state the search limit.
Additional project analyzers are optional and must answer a distinct question;
they do not replace contextual investigation or create a second review loop.

Write the diagnostic report to `research/00-find-bugs.md` in the selected
workspace. Keep raw JSON/SARIF, command output and temporary fixtures in that
workspace or permitted temporary storage, never as unrequested repository
files. Report observed and inferred evidence, tool limitations, false-positive
risk and unexamined areas. The workflow is diagnostic: it does not authorize
fixes, commits, publication or a quality gate. Use `audit` for architecture and
health coverage, `review-pr` for an immutable pull-request review, and
`security` for security-specific analysis.
