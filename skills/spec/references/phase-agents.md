# Native agents for completion phases

Spec keeps planning, implementation and decisions with the current chat agent.
When Validation is reached, Main invokes `spec-validator`. When PR preparation
or authorized publication is reached, Main invokes `pr-creator`. Direct
`validate` and `create-pr` use the same roles. An explicitly active pipeline
keeps its existing specialists and delivery mechanics; do not add these agents
as another coordination layer.

| Role | Codex | Claude Code | OpenCode |
| --- | --- | --- | --- |
| spec-validator | GPT-6 Sol, high | Opus, high | GPT-6 Sol, high |
| pr-creator | GPT-6 Sol, medium | Opus, medium | GPT-6 Sol, medium |

Use the installed native role and its configured model. If that role is not yet
discoverable but the host supports an explicit native agent/model invocation,
pass its current installed instructions and the model/effort above to that
invocation. Respect explicit operator overrides. Do not start a separate CLI
session, substitute another model silently or claim generated files prove live
activation. If native dispatch is unavailable, report the actual missing
capability and pending delegated work while Main continues independent work;
obtain only a missing operator decision for a different execution approach.

## Handoff and return

Pass a bounded assignment: phase/checkpoint, objective and endpoint, absolute
repository/worktree and workspace, source candidate, relevant OpenSpec and
previews, selected methods and provider entries, existing evidence and known
findings, permitted writes and expected outputs. Supply retained publication
identity through native facilities, never credential contents. Agents read the
current installed skill for their phase instead of receiving copied workflows.

The assignment identifies the executor. Inside that executor, `validate` or
`create-pr` runs in place; it does not dispatch itself again. Main remains the
only coordinator and owns overlapping edits, Git sequencing and decisions on
findings. A failed command or reviewer opinion is evidence, not new authority.

Validation returns actual checks, provider outputs, findings, missing coverage
and the candidate to which they apply. Main repairs confirmed defects and sends
only affected work back to the same agent. Main retains selected independent
candidate-review dispatch; completed TEA assessments need no duplicate lens.

The PR agent can prepare before final review, then resume publication after Main
has supplied the evaluated candidate and existing authorization. It consumes
current validation; it does not redo it or infer publication from preparation.
Report an unexpected candidate change to Main before publishing. Preserve the
existing create-pr identity/idempotency checks and pipeline delivery contract.

Reuse the agent session for continuations and the two PR checkpoints when the
native host supports it. A new session recovers bounded retained context; it does
not restart completed phases. Keep evidence and drafts in the existing workspace
in both local and Obsidian modes. Record actual dispatch/model observations and
results there; do not add a control-state schema or claim unobserved activation.
