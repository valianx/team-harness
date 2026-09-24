## ADDED Requirements

### Requirement: Repository changes use the shared PR workflow

Every completed repository change SHALL enter `create-pr` for candidate preparation regardless of whether it modifies code, tests, documentation, configuration or generated assets, and regardless of whether it began as direct, spec, pipeline or another writing workflow. PR publication SHALL be the normal completion path for such changes under the operator's existing authorization and native permissions. An explicit instruction to stop before publication SHALL be honored, with the prepared candidate and remaining action reported. Review of an existing PR and merge-only work SHALL retain their own workflows.

#### Scenario: A direct documentation fix is complete

- **WHEN** an agent has completed and validated a repository documentation edit without an explicit earlier stop
- **THEN** it enters `create-pr`, prepares the candidate and publishes the PR under the existing authorization

#### Scenario: A bootstrap or translation flow edits a repository

- **WHEN** the selected writing workflow leaves a completed repository diff
- **THEN** it hands the diff to `create-pr` rather than ending after a local summary

#### Scenario: The operator stops before publication

- **WHEN** the operator explicitly requests local completion or PR preparation only
- **THEN** `create-pr` prepares the candidate and reports the remaining publication action without creating a PR

### Requirement: Distributed candidates pass release metadata preflight

Before publishing a PR whose diff changes distributed runtime inputs, `create-pr` SHALL run a deterministic base-to-candidate preflight. The same check SHALL run in CI. It SHALL require the repository's four current version sites to contain one valid SemVer value strictly greater than the base value, and a matching `CHANGELOG.md` release heading. Historical sites absent from both revisions MAY remain optional until introduced; a newly introduced site SHALL match the candidate version. It SHALL fail when the base or diff cannot be determined instead of silently skipping verification. A candidate with no distributed input or version-site changes SHALL pass without a release bump.

#### Scenario: An agent omits the version bump

- **WHEN** a distributed runtime asset changes but version metadata is unchanged or inconsistent
- **THEN** the local preflight blocks publication and CI reports the same failure

#### Scenario: Version files are touched without an increase

- **WHEN** the four version files are edited but their SemVer value is unchanged or not greater than the base
- **THEN** preflight fails even if the files appear in the diff

#### Scenario: A distributed asset moves outside its directory

- **WHEN** a rename removes a path under distributed runtime inputs and adds it under ordinary documentation
- **THEN** preflight still requires release metadata for the removed distributed input

#### Scenario: A documentation-only candidate is ready

- **WHEN** a candidate changes only non-distributed documentation and does not edit a version site
- **THEN** preflight succeeds without requiring a release bump

#### Scenario: A historical branch adds a version site

- **WHEN** a supported branch adds the Codex or installer version path absent from its base
- **THEN** preflight checks that path against the candidate version without requiring it in the base
