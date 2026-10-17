## MODIFIED Requirements

### Requirement: Provider work shares the selected workspace
TH SHALL pass the existing task context and selected context locator to every
provider invocation. In local or Obsidian mode, working test designs, coverage
analyses, research and verification/review reports SHALL be retained as Markdown
in the same resolved absolute workspace, including a faithful summary when the
provider only returns conversational output. In remote mode Main SHALL retain
useful conversational results in the same effort Page. File-output flags SHALL
receive scoped local operational storage through documented settings or flags,
with actual output verified at its destination. Operational and machine artifacts
SHALL retain their native formats and explicit delivery targets. A bare local
path SHALL NOT be presented as a portable remote attachment; unsupported uploads
SHALL be reported pending.

Provider work SHALL NOT require a provider rewrite, unsupported attachment claim,
tracked execution debris, a second task plan or routine Markdown mirror.
Canonical OpenSpec artifacts, product code, maintained tests and durable
documentation SHALL remain in their owning repository locations; provider
installation metadata SHALL remain upstream-managed.

#### Scenario: Output routing is supported
- **WHEN** a selected provider accepts a file output destination
- **THEN** TH supplies the resolved file workspace or scoped operational directory and verifies the actual destination, preserving paths with spaces and the selected context mode

#### Scenario: Output routing is not supported
- **WHEN** a proposed capability requires an incompatible fixed artifact location
- **THEN** TH reports that limitation and a supported recovery action; if the current spec stage requires the capability, its execution remains pending rather than silently skipped, with no duplicate workspace or provider rewrite

#### Scenario: The effort uses Obsidian mode
- **WHEN** the task is already bound to an Obsidian workspace
- **THEN** all retained provider working notes and reports use that same effort folder without creating a repository-local mirror or moving canonical OpenSpec and product files into the vault

#### Scenario: The effort uses local mode
- **WHEN** the task is already bound to a local workspace
- **THEN** provider working notes and reports remain under that resolved home, separated from tracked product files, without switching to Obsidian or creating another workspace

#### Scenario: A remote provider returns conversation and machine artifacts
- **WHEN** a provider produces useful prose plus JSON, a render source or another native file format
- **THEN** Main retains the useful prose in the selected effort Page, verifies machine files in declared operational storage and identifies their explicit delivery target without a second Markdown report home

#### Scenario: A rendered artifact has no supported remote upload
- **WHEN** the host cannot attach a locally rendered output to the selected effort
- **THEN** TH reports attachment delivery pending and preserves the file's real destination without describing its bare local path as a portable attachment
