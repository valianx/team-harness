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
The normal publication path SHALL present the complete review and ask which action to take. Selecting Approve, Request changes or Comment only by its displayed number or an unambiguous action phrase SHALL authorize publication of that review with the selected event, even when it differs from the recommendation. Main SHALL align the verdict line to that choice and proceed without another confirmation when findings, comments and destination are unchanged. Defer and Cancel SHALL NOT authorize publication. Native publication restrictions SHALL remain in force without silently substituting another event or identity.

Remote PR movement alone SHALL NOT revoke approval of unchanged, accurately scoped review content. The flow SHALL offer publication of the retained review with its reviewed commit and coverage limits, using COMMENT when current applicability or new code coverage is unknown. Changes to the review's substantive content, destination or event outside the operator's choice SHALL be presented for approval unless already explicitly authorized. Failed or uncertain publication SHALL preserve the run for recovery, and an uncertain write SHALL be checked for prior success before retrying.

#### Scenario: The PR keeps moving
- **WHEN** additional commits arrive before publication
- **THEN** the coordinator retains the completed review and its publish choice without requiring a stationary PR or a full restart

#### Scenario: An inline anchor is no longer publishable
- **WHEN** a retained finding cannot be posted at its original inline location
- **THEN** its claim and historical location are preserved in the review body and the revised review is offered for approval

#### Scenario: Publication fails
- **WHEN** GitHub rejects a write or its outcome is uncertain
- **THEN** drafts, reports and the captured snapshot remain available for resume and no duplicate write is attempted without checking the prior outcome

#### Scenario: The operator selects any publication event
- **WHEN** the complete review has been previewed and the operator selects Approve, Request changes or Comment only by number or an unambiguous action phrase
- **THEN** Main treats that selection as confirmation, aligns only the verdict line if needed and proceeds to publication with the selected event without asking again

#### Scenario: The operator defers or cancels
- **WHEN** the operator selects Defer or Cancel
- **THEN** Main performs that selected action and does not publish

#### Scenario: The review changes beyond the selected event
- **WHEN** new or changed findings, comment content or a different destination are not covered by the operator's existing authorization
- **THEN** Main shows the complete revised review and asks only for the missing authorization

#### Scenario: The selected event is unavailable
- **WHEN** GitHub does not permit the selected event for the active identity
- **THEN** Main preserves the review and reports the concrete restriction without asking to confirm the same event again, changing accounts or publishing another event without authorization
