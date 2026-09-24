# pr-review-drift-tolerance Specification

## Purpose
Preserve completed PR-review work when the remote PR changes, reconcile affected findings without mandatory restarts, and retain the operator's publication choice with an accurate reviewed scope.

## Requirements

### Requirement: The security lens requires a concrete trigger
`security_required` SHALL be true only on a concrete trigger: a sensitive-token content hit, an executable-suffix change, or an existing explicit or tier trigger (explicit operator request and tier-4 classification are preserved). Configuration suffixes SHALL classify as non-executable by default, and an indeterminate classification SHALL NOT default to required.

The configuration suffixes are the closed set `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.properties`; `.env` files and their variants stay outside it. The sensitive-path and sensitive-filename checks keep running first and are unchanged, so dependency manifests such as `package.json` and `go.mod` remain sensitive by filename regardless of suffix. `security_required` SHALL be a pure function of the resolved reason value and the trigger list, and the resolved reason SHALL appear in the preview so a not-required outcome is visible to the operator rather than silent.

#### Scenario: A config-only PR with no sensitive tokens
- **WHEN** a PR changes only configuration files with no sensitive-token hits
- **THEN** the security lens is not dispatched and Main consolidates the required review evidence without a separate consolidator

#### Scenario: A config file contains a credential-shaped token
- **WHEN** the diff's content scan hits a sensitive-token pattern in any file
- **THEN** the security lens is required exactly as today

#### Scenario: The operator explicitly requests the security lens
- **WHEN** an explicit trigger or a tier-4 classification is present
- **THEN** the security lens is required regardless of suffix classification

### Requirement: PR updates preserve captured review work
Changes to the PR head, base, commit list, code, conversation or mergeability SHALL NOT discard captured evidence, reports, findings or drafts or require a full review restart. The coordinator SHALL retain the original reviewed identity, record the latest observation separately and reconcile only affected claims. Existing assessments SHALL remain reusable for their captured snapshot without implying coverage of unreviewed code. A corrupt identity or different repository/PR SHALL remain distinguishable from ordinary movement and SHALL NOT replace valid retained evidence.

#### Scenario: A version commit arrives during review
- **WHEN** a new commit changes only release metadata while findings remain applicable
- **THEN** the existing review proceeds without repeating specialists or discarding the draft

#### Scenario: A change affects a finding
- **WHEN** later code or discussion changes a finding's relevance
- **THEN** the coordinator adjusts that finding with evidence while retaining the original assessment and unrelated completed work

#### Scenario: Refresh fails or returns a different target
- **WHEN** a new observation cannot be captured or validated for the same PR
- **THEN** the original review artifacts remain intact and the limitation is reported without replacing them with unrelated or invalid evidence

### Requirement: Publication preserves completed review work
The normal publication path SHALL present the review and ask whether to publish. Remote PR movement alone SHALL NOT revoke approval of unchanged, accurately scoped review content. The flow SHALL offer publication of the retained review with its reviewed commit and coverage limits, using COMMENT when current applicability or new code coverage is unknown. A changed review event or content SHALL be presented again. Failed or uncertain publication SHALL preserve the run for recovery, and an uncertain write SHALL be checked for prior success before retrying.

#### Scenario: The PR keeps moving
- **WHEN** additional commits arrive before publication
- **THEN** the coordinator retains the completed review and its publish choice without requiring a stationary PR or a full restart

#### Scenario: An inline anchor is no longer publishable
- **WHEN** a retained finding cannot be posted at its original inline location
- **THEN** its claim and historical location are preserved in the review body and the revised review is offered for approval

#### Scenario: Publication fails
- **WHEN** GitHub rejects a write or its outcome is uncertain
- **THEN** drafts, reports and the captured snapshot remain available for resume and no duplicate write is attempted without checking the prior outcome
