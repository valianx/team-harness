## MODIFIED Requirements

### Requirement: Setup preserves native policy and workspace preferences
Ordinary Codex setup and generated project configuration SHALL leave global sandbox,
approval, network and writable-root decisions to the operator and native runtime.
TH SHALL retain skill discovery, complete agent installation, reviewer read-only
role defaults, voice, language and workspace/Obsidian preferences. Workspace
selection SHALL preserve structured settings and resolve through the shared
three-mode workspace mechanism; writing remains subject to native permissions.
Only authorized setup SHALL persist the active runtime's native preferences and
non-secret `workspace-space-id` and `workspace-container-page-id`, after actual
native destination verification. Remote setup SHALL validate the whole selected
destination and SHALL report configured, accessible, readable and writable results
separately, including partial readiness when a remote result exists but local
persistence fails. It SHALL preserve unrelated settings, native policy, runtime
roots and existing import authorization. Update SHALL change owned metadata
without contacting Pages or moving context.

Remote mode SHALL require the delivering release and a host with actual native
Space capability. Unsupported hosts SHALL retain its configuration and identity
and report unavailable capability. TH SHALL NOT claim that older readers support
the new selector or that another host has working activation, read, write or
continuation without evidence.

#### Scenario: Setup runs with custom native policy
- **WHEN** setup installs TH roles and saves collaboration preferences
- **THEN** it preserves native execution-policy values, including absent values, and does not add cache or vault roots to global permissions

#### Scenario: Obsidian is selected
- **WHEN** the operator configures an existing vault and a valid TH subfolder
- **THEN** TH retains that destination and creates workflow artifacts there only through an authorized native write without requiring a global policy rewrite

#### Scenario: Project projections are regenerated
- **WHEN** the Codex generator emits the project's TH agent configuration
- **THEN** it preserves the complete role roster and Main's model choice without emitting project execution-policy defaults

#### Scenario: Native remote setup verifies its destination
- **WHEN** authorized setup selects `gpt-space`
- **THEN** Main verifies the actual Space root, container ID/title/parent/membership and observed access through native operations before persisting both opaque IDs in active-runtime settings, and reports configuration and access/read/write results separately

#### Scenario: Remote destination data is incomplete or invalid
- **WHEN** the selected remote configuration lacks either required ID or fails whole-destination validation
- **THEN** setup reports the missing or invalid destination and leaves existing configuration bytes unchanged rather than silently selecting local

#### Scenario: Update encounters remote settings
- **WHEN** update or metadata convergence runs with a remote preference, conflict or incomplete destination
- **THEN** it preserves the selection, IDs and unrelated nested settings, diagnoses the state and neither contacts Pages nor moves context

#### Scenario: A host or older installation cannot use remote mode
- **WHEN** the runtime lacks current native Space capability or predates the delivering release
- **THEN** TH states the minimum release and capability boundary, preserves existing remote identity on supported readers and makes no older-reader forward-support or unverified cross-host execution claim
