## ADDED Requirements

### Requirement: Specialist read manifests name produced artifacts
Every workspace artifact a specialist contract names as a read SHALL be registered in `tests/fixtures/workspace-artifacts.json` with the contract file that produces it, or SHALL be marked `retired` and absent from every scanned contract. Acceptance intent SHALL be read from the bound OpenSpec change's `specs/**/spec.md` and `tasks.md`; the `01-plan.md` projection supplies scope and decisions only and is never an acceptance source. A missing bound change blocks; a missing projection does not. `tests/test_workspace_artifacts.py` SHALL fail when a scanned contract names an unregistered artifact, names a retired artifact, or names a producer that does not exist or does not mention the artifact.

#### Scenario: A specialist reads a retired plan shard
- **WHEN** a scanned contract names `plan/tasks/Task-N.md` or another artifact registered as `retired`
- **THEN** the workspace-artifacts test fails naming the file and the token

#### Scenario: A new artifact appears without a producer
- **WHEN** a scanned contract names a workspace artifact absent from the registry
- **THEN** the test fails naming the file and the token, and passes only once the registry records a producer that mentions it

#### Scenario: The bound change is missing at dispatch
- **WHEN** `qa` or `implementer` cannot resolve the bound OpenSpec change named by the projection
- **THEN** it returns `status: blocked`, `failure_kind: artifact-missing` naming the change directory, and never substitutes the projection or a packet summary as the acceptance source
