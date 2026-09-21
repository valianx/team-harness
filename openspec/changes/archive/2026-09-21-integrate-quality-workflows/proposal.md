## Why

Repeated audits have exposed additional defects without demonstrating which interactions were previously examined. TH needs reproducible upstream evidence and visible diagnostic coverage while reducing the analysis methods and installation logic it maintains itself.

## What Changes

- Make audit account for relevant components, relationships and success, change and failure scenarios, using maintained arc42/ATAM references and explicitly reporting unverified areas.
- Add a discoverable find-bugs workflow for concrete defects in a project or module, using Semgrep CE, existing project checks and contextual investigation.
- Use dependency-cruiser and Knip for applicable JavaScript/TypeScript architectural questions; reuse native/project tools for other stacks.
- Let review-pr consume snapshot-bound Semgrep evidence and the installed Sentry find-bugs method through existing reviewers and finding verification.
- Prepare selected dependencies as part of entering or resuming their consuming flow: detect, officially install or repair missing capabilities, configure outputs and verify readiness on the active host.
- Keep provider methods upstream and working evidence in the selected local/Obsidian workspace. Assess the integration against known historical defects and disclose detection limits, noise and operational cost.

## Capabilities

### New Capabilities

- `quality-diagnosis`: scoped architectural coverage, project bug investigation and evidence-backed diagnostic conclusions.

### Modified Capabilities

- `openspec-dependency-provisioning`: shared preparation extends to selected quality dependencies without making unrelated tools mandatory.
- `external-verification-workflows`: maintained quality providers and their applicable inputs, outputs and ownership join the shared integration reference.
- `native-pr-review-orchestration`: external evidence and an upstream review method participate in the existing snapshot-based review.
- `native-workflow-entry`: native agents discover find-bugs alongside retained workflows.

## Impact

Canonical skills, the architect audit reference, shared dependency guidance/policy, host setup routes, workflow discovery and generated Codex/OpenCode projections change. CLI engines, upstream skills and their update mechanisms stay external. Repository tests validate executable and distribution behavior; adversarial review and a retained pilot assess instructional behavior without asserting prose strings.

The integration builds on the existing shared preparation of OpenSpec, TEA and Superpowers; it extends that preparation instead of introducing a separate installation workflow.

## Non-Goals

No proprietary scanner, generic evidence runner, permission gate, provider fork, automatic refactoring, or new mandatory full-review round. No SonarQube/CodeScene deployment or import of the complete wshobson orchestration. No claim of finding every defect or of live compatibility without evidence. This change does not run every provider in every workflow.
