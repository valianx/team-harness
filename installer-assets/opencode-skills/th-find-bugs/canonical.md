
# Find bugs

Main coordinates the requested diagnosis in the native general agent. Resolve
the repository or module and preserve the bound [context](../workspace/SKILL.md).
A clean checkout is valid input; this workflow does not require a
branch diff or start the `review-pr` flow.

Start with a concrete behavioral question. Trace inputs and preconditions
through relevant data and state transitions and the defective operation or
contract to the downstream symptom. Follow actual consumers and relevant
seams, using existing project checks; investigate contextual candidates even
when an analyzer reports no matches. For a supported defect, report its trigger,
expected versus actual behavior, impact and source evidence, distinguishing
reproduction from inference.

Use the [shared diagnostic finding/evidence method](../audit/references/project-audit.md#findings-and-evidence)
for material causes and reproductions: retain real versus simulated dependencies,
the actual integration boundary and oracle, environment identity and measurement
conditions. A reproduced defect is not a passed product regression. Preserve one
cause/ID and linked occurrences when the caller consolidates several lenses.

Use available history or version differences as optional leads, then check the
current consumer contract. A difference alone proves neither a defect nor a
regression; leave unsupported origin unknown. No diff, fetch or whole-history
review is required.

Reuse evidence at entry or resumption only while its question, source,
environment and configuration still apply. When those inputs change, renew
evidence for affected and dependent analysis; preserve completed independent
work and its limits.

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

Main retains diagnosis in the same Page, or `research/00-find-bugs.md` in file
modes. Keep JSON/SARIF, command output and fixtures in declared real local
operational storage, never as unrequested repository
files. Separate source observations, observed runtime behavior and inferred
outcomes. Identify material unverified steps or environmental assumptions and
the smallest missing observation that could resolve each uncertainty. Include
tool limitations, false-positive risk and unexamined areas.

The workflow is diagnostic: it does not authorize
fixes, commits, publication or a quality gate. Use `audit` for architecture and
health coverage, `review-pr` for an immutable pull-request review, and
`security` for security-specific analysis.
