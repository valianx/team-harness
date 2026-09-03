## MODIFIED Requirements

### Requirement: Completed changes are archived by the PR that finishes them
Once the pull request that checks the last task of a change is confirmed merged, `openspec archive <change>` SHALL land through a dedicated chore pull request or the next pull request that follows it, never through the completing pull request itself. A change reported complete by `openspec list` across two releases is a lint warning naming the change.

#### Scenario: A change completes without archive
- **WHEN** `openspec list` reports a change complete and the release that followed did not archive it
- **THEN** `/th:lint` warns with the change name

#### Scenario: The next feature pull request carries the archive
- **WHEN** a completed change's pull request is confirmed merged and the next pull request runs `openspec archive <change>`
- **THEN** the archive is accepted as the post-merge vehicle without a separate chore pull request
