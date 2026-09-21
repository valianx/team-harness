## ADDED Requirements

### Requirement: Regression evidence uses portable owned inputs
Regression probes SHALL belong physically to their owning review run. Supported
Windows and Unix execution SHALL compare the requested base and head without a
platform-invalid Git configuration path preventing preparation.

#### Scenario: Comparable regression probe runs on Windows
- **WHEN** the required local tools and objects are available
- **THEN** both revisions execute and classification reflects their results rather than a null-config path error

#### Scenario: Probe lies outside its owning run
- **WHEN** a request selects an external file directly or through a link
- **THEN** the request is rejected before copying or executing that probe
