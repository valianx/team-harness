## MODIFIED Requirements

### Requirement: Sandbox diagnosis distinguishes shadowing from stale sessions
When an actual workspace access fails, TH SHALL identify the target and use available native configuration or host evidence to distinguish project configuration, permission refusal and stale activation. It SHALL NOT infer a required policy value or restart solely from missing evidence, a directory's absence or a different operator preference.

#### Scenario: A pre-#601 tree shadows the global roots
- **WHEN** available evidence shows project configuration shadows an intended workspace permission
- **THEN** TH reports that concrete cause and a scoped native remedy without rewriting global policy or entering a restart loop

#### Scenario: Activation evidence is unavailable
- **WHEN** the host cannot prove whether a changed setting is active
- **THEN** TH reports activation as unverified and does not prescribe restart without a demonstrated need

## ADDED Requirements

### Requirement: Setup preserves native policy and workspace preferences
Ordinary Codex setup and generated project configuration SHALL leave global sandbox, approval, network and writable-root decisions to the operator and native runtime. TH SHALL retain skill discovery, complete agent installation, reviewer read-only role defaults, voice, language and workspace/Obsidian preferences. Workspace selection SHALL preserve structured settings and resolve through the existing workspace mechanism; writing there remains subject to native permissions.

#### Scenario: Setup runs with custom native policy
- **WHEN** setup installs TH roles and saves collaboration preferences
- **THEN** it preserves native execution-policy values, including absent values, and does not add cache or vault roots to global permissions

#### Scenario: Obsidian is selected
- **WHEN** the operator configures an existing vault and a valid TH subfolder
- **THEN** TH retains that destination and creates workflow artifacts there only through an authorized native write without requiring a global policy rewrite

#### Scenario: Project projections are regenerated
- **WHEN** the Codex generator emits the project's TH agent configuration
- **THEN** it preserves the complete role roster and Main's model choice without emitting project execution-policy defaults

## REMOVED Requirements

### Requirement: Setup and update detect and repair sandbox drift
**Reason**: Divergence from TH-selected native policy is not installation drift.
**Migration**: Preserve existing configuration and structured TH preferences; diagnose actual access failures through native evidence without an automatic repair or restart ceremony.
