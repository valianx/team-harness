## ADDED Requirements

### Requirement: Active guidance describes supported coordination
Active entrypoints and public installation/workflow documentation SHALL agree with current native installation, four-phase coordination and advisory review. They SHALL NOT require retired gate records, a fixed reviewer or research team, a universal coverage percentage, or a restart without a demonstrated native need. Migration guidance SHALL preserve custom commands and settings.

#### Scenario: An operator follows auxiliary issue or testing guidance
- **WHEN** work begins through a supported auxiliary skill
- **THEN** useful workflow routing remains available and Main selects proportionate work without obsolete mandatory teams or gates.

#### Scenario: An old installation contains custom commands
- **WHEN** the operator follows migration documentation
- **THEN** only verified TH-owned content is eligible for removal and generic wildcard deletion is not prescribed.

#### Scenario: A selected reviewer cannot obtain native read-only isolation
- **WHEN** a supported native read-only alternative cannot recover the selected review
- **THEN** Main records incomplete coverage without manufacturing a pass, preserves native permissions and decides delivery under existing operator authorization; only an explicit unmet operator condition requires a new decision.

### Requirement: Context hooks confine their own output
Retained hooks SHALL write snapshots and breadcrumbs only to the selected workspace's owned regular output files, reject linked outputs escaping that ownership, and fail open without altering the external target. Workspace log-subfolder validation SHALL be consistent with workspace selection. These checks SHALL NOT intercept other tools or change native permissions.

They SHALL consume the native SubagentStop event fields and retain start observation for both current Agent and legacy Task tool names.

#### Scenario: An output aliases an external file
- **WHEN** a hook output is a symbolic or hard link to another file
- **THEN** the hook preserves the target and skips that output.

#### Scenario: A sibling has a matching path prefix
- **WHEN** a resolved output falls in a sibling directory whose name starts with the workspace name
- **THEN** it is not considered inside the workspace.

#### Scenario: Claude sends a native completion event
- **WHEN** SubagentStop supplies agent_type and agent_id at the top level
- **THEN** the corresponding TH breadcrumb is recorded without requiring a synthetic tool_input wrapper.
