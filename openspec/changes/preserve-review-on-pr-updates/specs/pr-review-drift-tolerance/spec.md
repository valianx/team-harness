## REMOVED Requirements

### Requirement: Lens invalidation keys on code identity only
**Reason**: Any remote commit movement currently discards valid historical review work.
**Migration**: Preserve captured results and reconcile only affected findings under the new PR-update requirements.

### Requirement: The pre-publish freshness restart is capped
**Reason**: Capping automatic restarts still loses completed work and can prevent publication.
**Migration**: Retain the original review and publish with an accurate scope and operator approval.

## ADDED Requirements

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
