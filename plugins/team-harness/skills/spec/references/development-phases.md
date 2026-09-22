# Four development phases

## Contents

- [Phase outcomes](#phase-outcomes)
- [Select and account for tools](#select-and-account-for-tools)
- [Real CRAP and evidence reuse](#real-crap-and-evidence-reuse)
- [Candidate and delivery](#candidate-and-delivery)

Use this shared path for development through spec or an explicitly selected
pipeline. Main coordinates with the native host's tools and permissions. Keep
the existing objective, canonical tasks, candidate, review choice and absolute
[workspace](../../workspace/SKILL.md), in its local or Obsidian mode. Entering a
later phase recovers these inputs and completes real gaps; it does not recreate
planning or activate a pipeline.

Continue to the requested endpoint: planning, local completion, PR preparation
or PR publication. An authorized continuation needs no separate prompt for each
selected tool or phase. Resolve only missing material decisions. Review choices
still follow the existing author-review contract; continuity does
not answer an unresolved optional-review choice on the operator's behalf.
Plain-language requests such as “implement this spec”, “validate this change” or “use spec and
continue through the PR” select the corresponding work; they are not new commands.
Existing PR review still uses [review-pr](../../review-pr/SKILL.md).

An implementation request includes applicable Validation: continue directly after
implementation without waiting for another operator message. Keep the phases
visible as successive work and honor an explicit request to stop earlier.

## Phase outcomes

| Phase | Inputs and expected work | Outputs and completion evidence |
| --- | --- | --- |
| **Spec** | Objective, affected repository and current intent. Author/update OpenSpec; resolve design decisions; execute TEA test-design; select later checks and useful methods. Use sketch when requested or helpful to inspect the solution. | Canonical proposal, requirements, design when useful and tasks; structural validate result; workspace testing strategy and phase/tool plan. Planning completion is not implementation completion. |
| **Implementation** | Authorized intent, tasks and testing strategy. Apply changes with maintained tests and documentation; execute selected TEA implementation methods and focused project checks. Update intent when behavior changes. | Product changes, task progress and actual focused-check results. Later verification remains pending until executed. |
| **Validation** | Identified candidate, requirements, tests and selected checks. Run project checks and selected diagnostics; execute spec's TEA test-review/trace, Superpowers completion evidence and OpenSpec implementation verify. Prepare completed archive, then the selected independent candidate review; judge findings and verify corrections. | Current evidence, measured/omitted scope, original assessments and reasoned dispositions in the workspace. Living specs/archive stay in the repository. State what is verified and what remains unknown. |
| **Publication** | Evaluated candidate, evidence, review decision and authorized destination. Use create-pr for candidate/file hygiene and preparation/publication. | Prepared PR or published URL with observed CI/review state and remaining action. Local completion without a PR is a valid endpoint. Merge is separate. |

Only execute capabilities belonging to reached stages. A planning request needs
the testing strategy, not fabricated implementation results. Returning from a
finding to implementation renews affected verification instead of restarting
the whole flow.

## Select and account for tools

Use [upstream tools](upstream-tools.md) for provider preparation, installed native
entries, invocation context and output routing. Reuse healthy installations;
prepare missing selected capabilities through official routes for the active
host. Selection includes executing the capability at its stage, not merely
recommending it. The same method applies in Codex, Claude Code and OpenCode;
installation or generated files alone do not prove live activation.

| Capability | Place in this effort |
| --- | --- |
| OpenSpec | Spec author/update and Implementation apply; structural validate is separate from Validation's implementation verify and archive. |
| TEA test-design, test-review, trace | Spec testing architecture, then Validation's test quality and requirement coverage. These are the declared stages of a spec effort. |
| TEA ATDD / automate | Select from the testing strategy for acceptance-first tests or expanded automation during Implementation. |
| TEA framework / CI / NFR | Framework/CI setup only when needed within the objective; NFR assessment during Validation when relevant non-functional requirements need evidence. |
| Superpowers | Installed verification-before-completion for spec completion claims; other methods such as debugging/TDD when their question is relevant. Preserve OpenSpec as the existing plan. |
| Project tests / build / lint / coverage | Choose actual commands and scope in Spec, use focused checks during Implementation and the agreed set in Validation. |
| CRAP / quality runner | Assess applicability for new or changed executable functions; measure selected scope from real complexity and coverage during Validation, as below. |
| find-bugs / Semgrep | Select for concrete functional defects and supported rule-based candidates. Retain scope, rules, errors and contextual findings. |
| audit / dependency-cruiser / Knip | Select for architecture or dependency questions; JS/TS collectors when applicable. A bounded change does not imply a general project audit. |
| Sentry find-bugs | Optional installed upstream method of the existing general reviewer for captured changes; not another equivalent review. |
| sketch | Inspect a proposed solution on demand, particularly frontend; feed decisions into the current intent. |
| verify / independent lenses | Local author review of the committed candidate under the existing review choice; distinguish this from review-pr on an existing PR. |
| create-pr | Candidate preparation and authorized publication, consuming current evidence and artifact hygiene. |

Keep a short capability table in the existing plan: purpose/selection reason,
scope or candidate, status, actual outcome/evidence link and next action.
Account for the declared spec stages and selected additional methods; give a
brief reason for relevant catalog capabilities left unselected. No blanket
installation or exhaustive empty report tree is needed.

- **Pending:** planned work, missing input/provider or an unusable assessment;
  state the recovery. A future row is not evidence.
- **Executed:** attach the real outcome, including findings, failures or partial
  coverage. Execution does not mean approval.
- **Not applicable:** the question or stack does not apply; explain why.
- **Declined/deferred:** record the explicit decision, reason and effect instead
  of relabeling missing work as passed or not applicable.

This is a readable view, not a new state schema or authority record. Main and
the operator judge recommendations; retain original verdicts and evidence-backed
acceptance, refutation or deferral. Provider scores create no delivery authority.

## Real CRAP and evidence reuse

When complexity against coverage will help assess changed functions, select CRAP
and prepare the project's collectors. Use the installed
[quality runner](../../pipeline/scripts/quality-runner.mjs) in `measure` mode,
with the [manifest and invocation guide](quality-runner.md) and a clean committed candidate. Keep the
manifest, normalized inputs and receipt in the workspace. The adapter supplies
per-function path, symbol, new/changed status, complexity and coverage percent;
the runner computes the score. Collectors and metric versions remain explicit.

Match complexity and coverage to the same source candidate and functions; a
package-wide average or calculator fixture is not a project measurement. Name
omissions and partial scope. If selected measurement lacks a manifest, adapter
or metric, keep it pending with recovery, never zero or a fabricated pass. A
historical helper's `MANIFEST_ABSENT/not-applicable` does not complete that
selected work. Record the selected but unmeasured surface and the concrete recovery
in the plan. A prose-only change has no executable CRAP scope.

Link the exact receipt and inputs from Validation and consume that association
in Publication. Each tool retains its identity rules: do not relabel an immutable
runner receipt with a newer base, candidate/tree, manifest or effective invocation.
Obtain a new receipt when those bindings require it. Reuse other checks only
when their relevant inputs and method permit it. A changed filename for a report
or a still-open PR is not proof that its evidence remains current.

## Candidate and delivery

Use [lifecycle](lifecycle.md) to verify, synchronize and archive completed OpenSpec
work on the delivery branch before final candidate review. Keep archive and
implementation in the same PR. Canonical task checkboxes describe implementation
and its verification; track subsequent archive, final review and publication in
the workspace plan instead of marking future outward actions done to permit archive.
Preserve explicit lifecycle decisions and keep review corrections coherent with
the archived intent and affected verification.

Apply [author review](author-review.md) and [verify](../../verify/SKILL.md) with
the existing selected lenses. An unanswered choice or incomplete accepted review
is not a decline or successful review. Close actual findings and missing required
evidence under that contract. A completed review with concerns can support Main's
decision after evidence-backed closure; no fabricated new pass is needed.

Candidate and PR-body preparation can continue while a review or an explicit
wait instruction keeps outward publication pending. Keep that prepared result
distinct from a published PR and reuse it when the actual prerequisite is resolved.

[create-pr](../../create-pr/SKILL.md) owns preparation/publication. Reuse applicable
evidence, inspect the actual diff and keep working reports, checkpoints, logs,
temporary scripts and provider installations outside commits. Include needed
product code, maintained tests/tooling, durable documentation and canonical
OpenSpec. The workspace's mode does not change these ownership rules.

Report the observed PR/head and remote CI/reviewer state. Pending or skipped
remote work is not a completed review. Honor existing wait-before-push requests;
publication alone does not authorize waiting, merging or deploying. Close with
the result, remaining limits and next action in the same workspace.
