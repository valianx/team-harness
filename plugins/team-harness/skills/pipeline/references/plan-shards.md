# Sharded plan runtime contract

New Tier 2-4 plans use `plan_format: sharded-v1`:

| Artifact | Authority |
|---|---|
| `01-plan.md` | functional contract, review attestation, classification, manifest, task status index |
| `plan/architecture.md` | decisions, services, assessments, file-level work plan |
| `plan/delivery.md` | dependencies, bases, version, PR grouping |
| `plan/invariants.md` | cross-project/multi-site invariants; omit when none |
| `plan/tasks/Task-N.md` | one task's scope, files, seams, notes, functional AC checkboxes, and technical constraints |

The index begins with `**Plan format:** sharded-v1` and maps every artifact and
task to an exact path. Each fact has one canonical home; never copy
architecture, invariant, task, or AC prose into the index.

`## Review Summary` is the operator-facing functional contract and the first
`##` section. Require these subsections in order: `### Problem and Observable
Outcome` (`- Problem:`, `- Observable outcome:`), `### Actors and Flows` (an
`- Actor:`), `### Business Rules and Examples` (a `- Rule:` and an
`- Example:`), `### Alternate and Error Behavior`, `### Unchanged Behavior`,
`### Non-Goals`, and `### Decisions for human review` (1–7 bullets). Every
decision bullet ends with `→ decided ...` or `→ open question`; when none
remain, use a validator-compatible declaration such as
`- None — no operator decisions remain → decided by approved request`. Use an
explicit `None — {reason}` bullet for any other genuinely empty list. No code fence,
private implementation symbol, file ownership, command, or `file:line`
reference belongs in this functional surface. Public contract names are the
only exception. Confidence, scope shape, classification, and conditional
operator-facing scope/dissent blocks follow it. Technical approach, patterns,
engineering risks/trade-offs, services, and file work live in
`plan/architecture.md`.

Every new task shard has separate `## Acceptance Criteria`,
`## Technical Constraints`, and `## Verification` sections. `AC-N` uses
Given/When/Then and describes only behavior observable by a user, API consumer,
operator, or another system. It does not name private files, functions,
components, frameworks, mocks, or test mechanics unless that name is itself a
supported public contract. `TC-N` owns mandatory internal mechanisms and
engineering invariants. `VERIFY:` acceptance criteria are legacy-recovery input
only and are never emitted by a new plan. Gates count ACs and TCs separately.
The Verification section also declares exactly one literal routing line:
`- **Pre-implementation test:** required` or
`- **Pre-implementation test:** not-applicable — {reason}`.
Use `required` only when the repository quality manifest has both
`commands.test` and `test_contract.path_rules` and the task changes observable runtime behavior.
Otherwise use
`not-applicable` with the concrete reason; this field is neither an AC nor a TC.
It also declares exactly one
`- **Required quality checks:** {comma-separated command IDs}` line, or
`- **Required quality checks:** none — {reason}`. Include every applicable repository control. Main unions
these values per repository and binds the final quality run to that exact set;
a missing manifest command or unselected required check fails closed.

Every task shard must also declare all three fields in one `## Dispatch
anchors` block:

```text
required_invariants: [I...]
required_evidence_anchors: [workspace-relative/path...]
cross_runtime_preservation: <non-empty preservation statement>
```

The OpenSpec overlay mirrors these exact values into the matching
`execution_items` entry. `[]` is valid only when no applicable invariant or
evidence anchor exists; `cross_runtime_preservation` is always non-empty.
Missing, malformed, or mismatched values fail the deterministic plan contract
before Gate 1. Attaching Main's transcript, a sibling task shard, or the full
plan set is never a substitute.

If a shard also contains a legacy `**Required invariants:** ...` field, every
identifier there joins the effective invariant set and must appear in the
overlay entry. The validator never ignores a stricter shard declaration or
silently chooses the less restrictive duplicate.

The overlay schema deliberately names this array `execution_items`; there is no
top-level `tasks`. Main must select exactly one matching `.execution_items[]`
entry by `id`, record its `/execution_items/<index>` JSON Pointer and hash in
the specialist packet, and pass its exact `sources`. Zero/multiple matches or a
packet that assumes `.tasks[]` fails closed rather than probing alternate keys.

Shard paths and `required_evidence_anchors` are relative to the pipeline
workspace artifact root; task `Files:` and OpenSpec source coordinates are
relative to the repository/worktree root. Main passes both absolute canonical
values in `path_roots.repository_root` and
`path_roots.workspace_artifact_root`. No consumer may resolve every relative
path against cwd/worktree or use `../` to cross between these domains.

Resolve paths from the index once. Implementer reads its task plus named design
anchors. Tester reads task ACs and TCs plus the verification packet; QA grades
the task ACs and consumes only relevant TC evidence. Security
reads classification, security anchors, affected invariants, and only
security-relevant tasks. Delivery reads delivery, conditional invariants, and
accepted evidence. Recovery reads the index plus the shard named by
`next_action`. Only the plan panel may inspect every shard.

Targets constrain fixed prose, never AC or TC item counts: index 80 lines/12 KB,
architecture 120 lines/20 KB, delivery 80 lines/12 KB, invariant prose at most
two lines per invariant, and task fixed prose 30 lines plus at most two prose
lines per AC or TC. Preserve all required items and record
`size_reason: required-items` above a target.

Gates synthesize observable delta, actor/flow, representative rule/example,
alternate/error behavior, unchanged behavior, non-goals, open decisions,
decision-bearing risks, counts, links, options, and nonce in at most 12
non-empty lines before required exceptions. Include technical detail only for
compatibility, security, irreversibility, public contracts, cost, or an explicit
trade-off. Routine updates use at
most five lines: outcome, changed state, blocker/risk, next action, link.

A workspace without the format marker is legacy `monolith-v1`. Recovery may
use its old section locators but never migrates it implicitly. New plans never
use the legacy layout.
