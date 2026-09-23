## Why

`design` can describe a solution but does not consistently deliver a document that a Product Owner can evaluate and another developer can implement without the originating chat. The operator selected one document with functional content first and technical detail afterward; length alone must not split the deliverable.

## What Changes

- Make the existing `design` skill produce one self-contained solution proposal, with two clearly identified reading levels for product and development.
- Cover the problem, outcomes, scope, business behavior, applicable wireframes, acceptance and product-facing risks before architecture, affected data, interfaces, alternatives and implementation/testing approach.
- Reuse `sketch` for applicable data models and frontend wireframes, including minimal justified persistence changes. Explain product consequences of technical choices in the functional part.
- Keep long proposals in one document unless the operator asks to split them. Supporting diagram sources and canonical OpenSpec artifacts remain supporting inputs, not separate audience documents.
- Preserve configured workspace ownership, existing OpenSpec intent, design-only endpoints and native coordination across Claude Code, Codex and OpenCode.

## Capabilities

### New Capabilities

- `solution-proposal`: Audience-aware solution proposals through the existing design skill, with one-document delivery and coherent reuse of workflow sources.

### Modified Capabilities

None. Existing workspace, sketch and OpenSpec lifecycle requirements are reused.

## Impact

Canonical `skills/design/`, generated Codex/OpenCode distributions (replacing design's redundant Codex override through the existing synchronizer); bounded architect guidance if needed for delegated design; workflow discovery documentation and focused evaluation scenarios. No new runtime dependency, schema, CLI or installation change.

## Non-Goals

No new skill or pipeline, mandatory review committee, automatic implementation, full arc42 template, forced diagrams unrelated to scope, PDF/DOCX export engine, or new documentation governance. Do not collapse OpenSpec's canonical files into the reader-facing proposal or commit consumer working documents by default.
