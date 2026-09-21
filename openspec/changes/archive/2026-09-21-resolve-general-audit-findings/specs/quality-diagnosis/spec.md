## ADDED Requirements

### Requirement: Security self-scan describes its actual checks
The self-scan entry SHALL describe the checks actually executed, including native
review projections. Its read-only role checks SHALL cover the installed inline
reviewer and report an inappropriate write or execution tool if introduced.

#### Scenario: Inline reviewer gains a mutating tool
- **WHEN** the self-scan inspects that changed role
- **THEN** it reports the role/tool regression rather than omitting the role

#### Scenario: The operator reads self-scan help
- **WHEN** the current scan is described
- **THEN** the advertised checks and purpose agree with the executed scanner
