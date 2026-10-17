## MODIFIED Requirements

### Requirement: Context hooks confine their own output
Retained hooks SHALL write snapshots and breadcrumbs only to the selected
operational directory's owned regular output files, reject linked outputs
escaping that ownership, and fail open without altering the external target.
Workspace log-subfolder validation SHALL be consistent with workspace selection.
These checks SHALL NOT intercept other tools or change native permissions.

They SHALL consume the native SubagentStop event fields and retain start
observation for both current Agent and legacy Task tool names. SessionStart SHALL
honor canonical selector presence and valid legacy fallback only when canonical
selection is absent. Invalid selection or unavailable remote capability SHALL be
signaled without selecting a local context home. Remote IDs and URLs SHALL be
rejected as `TH_WORKSPACE`. Without an explicit valid operational binding,
optional file writes SHALL be a no-op and SHALL NOT fabricate `00-state.md` or
turn a precompact hook into a remote writer.

#### Scenario: An output aliases an external file
- **WHEN** a hook output is a symbolic or hard link to another file
- **THEN** the hook preserves the target and skips that output.

#### Scenario: A sibling has a matching path prefix
- **WHEN** a resolved output falls in a sibling directory whose name starts with the workspace name
- **THEN** it is not considered inside the workspace.

#### Scenario: Claude sends a native completion event
- **WHEN** SubagentStop supplies agent_type and agent_id at the top level
- **THEN** the corresponding TH breadcrumb is recorded without requiring a synthetic tool_input wrapper.

#### Scenario: SessionStart encounters an authoritative invalid selector
- **WHEN** canonical selection is present but invalid, including beside valid legacy Obsidian
- **THEN** its directive diagnoses invalid selection without legacy or local fallback and does not repair the settings

#### Scenario: SessionStart selects remote context
- **WHEN** canonical selection is `gpt-space` and native capability is unavailable or no operational binding exists
- **THEN** it preserves and signals the remote selection and relevant limitation without declaring a local context home

#### Scenario: A hook receives remote or absent operational binding
- **WHEN** `TH_WORKSPACE` is a remote ID or URL, or no operational directory is bound
- **THEN** no hook output or synthetic `00-state.md` is created and existing safe-output protections remain in effect
