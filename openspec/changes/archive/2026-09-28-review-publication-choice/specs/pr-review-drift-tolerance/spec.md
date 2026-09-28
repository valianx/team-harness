## MODIFIED Requirements

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
