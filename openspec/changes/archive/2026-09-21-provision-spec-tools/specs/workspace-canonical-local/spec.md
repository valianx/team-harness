## ADDED Requirements

### Requirement: Working artifacts stay outside consumer commits
Across repositories using TH, the shared workspace and PR preparation workflows
SHALL keep task plans, execution reports, evidence, logs and scratch scripts out
of commits and PRs. They SHALL use the selected workspace or permitted temporary
storage and suitable ignore conventions. A necessary durable project artifact
SHALL remain eligible for inclusion with its role explained, including canonical
OpenSpec, maintained tests/tooling, product assets and documentation. File format
or generation alone SHALL NOT decide retention, and this guidance SHALL NOT
delete or untrack unrelated existing work.

#### Scenario: Consumer prepares a PR after a spec or pipeline run
- **WHEN** a consumer repository has working reports, scratch scripts and local provider assets produced during the task
- **THEN** TH inspects the candidate and keeps those task-only files outside the commit and PR in both local and Obsidian mode

#### Scenario: A generated artifact is part of the delivered product
- **WHEN** a generated file, test fixture or Markdown document has a necessary maintained project role
- **THEN** TH may include it with that role explained instead of excluding it merely because it was generated during the task

#### Scenario: Existing tracked files are unrelated
- **WHEN** artifact preparation discovers previously tracked work outside the requested change
- **THEN** TH preserves it and limits candidate cleanup to the authorized change
