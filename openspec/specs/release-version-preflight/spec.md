# release-version-preflight Specification

## Purpose
Give contributors and CI a shared release check for immutable repository candidates without changing authorized delivery endpoints.

## Requirements

### Requirement: Preflight evaluates committed inputs without mutations
The preflight SHALL accept explicit base and head Git commit references through arguments or declared environment inputs, resolve both before checking content, and fail with an actionable nonzero result when a reference or required Git operation cannot be evaluated. It SHALL read committed content without editing repository files, refs or configuration.

#### Scenario: Working tree differs from the selected head
- **WHEN** uncommitted release metadata differs from the selected head commit
- **THEN** the result reflects the committed metadata and leaves the working tree unchanged

#### Scenario: A reference is invalid
- **WHEN** either requested reference does not resolve to a commit
- **THEN** preflight fails instead of reporting a clean release candidate

### Requirement: Classification covers distributed payload changes
The preflight SHALL require release metadata validation for distributed role, skill, hook, runtime adapter, embedded installer payload, installer implementation, runtime tooling and published bootstrap script changes. Deleted paths and moves out of distributed locations SHALL retain their original classification. Ordinary documentation and test-only changes SHALL not require a release bump.

#### Scenario: OpenCode installer payload changes
- **WHEN** an installer-assets skill or command changes without release metadata updates
- **THEN** preflight fails

#### Scenario: A published bootstrap changes
- **WHEN** a published bin script changes or is deleted without release metadata updates
- **THEN** preflight fails while a bin README-only change requires no bump

#### Scenario: A distributed file moves to documentation
- **WHEN** a distributed file moves outside a distributed path without a version bump
- **THEN** its source deletion still requires release metadata validation

#### Scenario: Only tests or documentation change
- **WHEN** the candidate changes ordinary documentation, tests or installer test files only
- **THEN** preflight succeeds without requiring release metadata changes

### Requirement: Versions agree and increase in SemVer precedence
For a distributed change or explicit version-site edit, the canonical plugin and marketplace versions SHALL exist at both commits. Every additional version site present at either commit SHALL remain present at head. Base versions SHALL agree, head versions SHALL agree, all head versions SHALL be valid SemVer with strictly greater precedence than base, and every applicable site SHALL be updated. Build metadata SHALL not create a precedence increase.

#### Scenario: Version text changes without an increase
- **WHEN** all sites keep the base version or change only build metadata
- **THEN** preflight fails even if each site's file changed

#### Scenario: Historical repository has two version sites
- **WHEN** the canonical plugin and marketplace exist and optional sites exist at neither commit
- **THEN** matching increasing versions in both required sites satisfy version consistency

#### Scenario: An optional site disappears
- **WHEN** a version site present at base is absent at head
- **THEN** preflight fails

### Requirement: Changelog names the candidate release
A validated release change SHALL modify CHANGELOG.md and include a dated release heading matching the head version. The preflight SHALL report the validated transition or explain which contract failed.

#### Scenario: Matching release metadata
- **WHEN** every applicable version site increases consistently and the changed changelog names that head version
- **THEN** preflight succeeds and reports the version transition

#### Scenario: The release heading is missing
- **WHEN** versions increase but the changed changelog lacks the matching dated heading
- **THEN** preflight fails

### Requirement: Local and CI use the same release contract
Contributors SHALL be able to invoke the same committed-revision check that CI runs on pull requests and main pushes. This check SHALL not force PR preparation, publication, model calls or a release for an otherwise authorized local-completion task.

#### Scenario: CI validates a candidate
- **WHEN** CI receives a pull request or main-push base and head
- **THEN** it runs the shared check with those references and surfaces a failure

#### Scenario: Contributor checks an already committed candidate
- **WHEN** a contributor invokes preflight with the same base and head as CI
- **THEN** the same release contract applies without publishing or changing the candidate
