## MODIFIED Requirements

### Requirement: Successful updates attempt session activation separately
Codex and OpenCode update SHALL invoke reload after a successful installation or
current-version verification. The installation result SHALL remain authoritative
for disk convergence, and reload SHALL independently assess activation. A pending
approval or failed update SHALL NOT trigger activation of an unverified target.

Across Claude Code, Codex and OpenCode, the ordinary update response SHALL report
the version and actual installation outcome without routine restart or reconnect
commentary, including negative assurances and hypothetical advice. Activation
observations SHALL remain distinct in retained diagnostic evidence; missing host
controls alone SHALL NOT add a restart caveat or imply full activation. Explicit
reload or diagnostic requests SHALL still receive the detailed activation result.

Update SHALL report a failed operation, an observed stale component or an actual
required operator action with its concrete impact and supported next step. Any
exceptional reconnect advice SHALL satisfy the component-evidence requirement;
ordinary summaries SHALL NOT include conditional reconnect boilerplate.

#### Scenario: Installation converges but native hooks remain stale
- **WHEN** update succeeds and actual native execution still uses stale hooks after applicable refreshes
- **THEN** the result reports successful installation and that concrete activation problem separately, with the affected component and supported next step

#### Scenario: Update succeeds with incomplete activation visibility
- **WHEN** installation converges but the host exposes no control to inspect part of live activation
- **THEN** the update response states the installed version and outcome without restart or reconnect commentary, while diagnostic evidence retains the unverified component without claiming it active

#### Scenario: Installation is already current
- **WHEN** update verifies the current version and no operator action is needed
- **THEN** the response states that TH is current without a restart assurance or speculative caveat

#### Scenario: Claude Code needs its native plugin reload
- **WHEN** a new plugin version is installed and activation requires the operator's supported reload command
- **THEN** update reports the version and that command without appending hypothetical reconnect advice

#### Scenario: Python installation is not visible on the current PATH
- **WHEN** a consented Python installation reports success but the current shell cannot resolve it
- **THEN** update reports the unresolved PATH visibility and affected capability without inferring that the terminal must restart

#### Scenario: Installation fails after a completed domain
- **WHEN** installation or convergence fails after earlier work succeeded
- **THEN** update reports the actual failure, completed work and scoped recovery without hiding the failure behind a success summary
