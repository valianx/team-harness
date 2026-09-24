# codex-runtime-parity Specification

## Purpose
Codex is a first-class runtime: sandbox failures diagnose to their real cause, declared agent capabilities equal effective capabilities, review artifacts stay inside the workspace, and hook wiring carries no process enforcement Claude Code already retired.

## Requirements

### Requirement: Generated package synchronization removes retired owned assets
Synchronization SHALL remove obsolete files from wholly generated package projections and its check mode SHALL report their presence. Cleanup SHALL remain confined to generated ownership and preserve unrelated operator content.

#### Scenario: A canonical role or reference is removed
- **WHEN** its previous generated copy remains in the packaged projection
- **THEN** check mode reports drift and synchronization removes that stale copy.

### Requirement: Sandbox diagnosis distinguishes shadowing from stale sessions
When an actual workspace access fails, TH SHALL identify the target and use available native configuration or host evidence to distinguish project configuration, permission refusal and stale activation. It SHALL NOT infer a required policy value or restart solely from missing evidence, a directory's absence or a different operator preference.

#### Scenario: A pre-#601 tree shadows the global roots
- **WHEN** available evidence shows project configuration shadows an intended workspace permission
- **THEN** TH reports that concrete cause and a scoped native remedy without rewriting global policy or entering a restart loop

#### Scenario: Activation evidence is unavailable
- **WHEN** the host cannot prove whether a changed setting is active
- **THEN** TH reports activation as unverified and does not prescribe restart without a demonstrated need

### Requirement: Declared capability equals effective capability
The canonical agent registry, generated TOMLs, and instruction adapters SHALL
agree on each role's logical role, contract version, capabilities, sandbox
class, instruction identity, and projection identity. Review roles that use
bounded command execution SHALL declare it. The generator SHALL emit
enforceable runtime fields or stop claiming they prove a restriction.
Integration tests SHALL exercise effective transport and forbidden capability
boundaries. A new role ABI manifest SHALL NOT be required.

#### Scenario: A review agent's transport is validated
- **WHEN** the projection test suite runs
- **THEN** each review role reads a fixture through declared transport and forbidden mutations remain unavailable

#### Scenario: A generated role is stale
- **WHEN** canonical role inputs and the generated projection identity disagree
- **THEN** preflight fails before that role is dispatched with the existing regeneration remedy

#### Scenario: The adapter contradicts the semantic source
- **WHEN** semantic contract and effective adapter expose different authority, ownership, or lifecycle behavior
- **THEN** parity validation fails before release

### Requirement: Review artifacts stay inside the workspace
The frozen review worktree SHALL live under the git-ignored `workspaces/` tree and SHALL be pruned at flow close. Snapshot creation on Windows SHALL support nested paths beyond the legacy 260-character limit without changing the operator's Git configuration.

#### Scenario: A review flow completes
- **WHEN** review publication or abort finishes
- **THEN** no prunable review worktrees remain outside the workspace tree

#### Scenario: A nested snapshot exceeds the Windows legacy path limit
- **WHEN** supported repository paths become longer than 260 characters under the isolated review root
- **THEN** capture materializes them successfully using snapshot-local Git configuration and preserves the operator checkout

### Requirement: Critical Codex roles use Astra and bounded roles use Luna
The standard Team Harness Codex profile SHALL assign gpt-6-astra with xhigh reasoning to Opus source projections, including architect, QA, security and PR review verifier. Sonnet and Haiku projections SHALL use gpt-6-luna with max reasoning. The unpublished spec-validator and pr-creator roles and their exclusive runtime mappings SHALL be absent from the delivered roster. Existing native model selection and explicit concrete operator choices SHALL remain supported; Main's selected model and independent reviewer profiles SHALL remain unchanged by coordination simplification.

#### Scenario: Standard agent projections are generated
- **WHEN** the canonical registry is projected into runtime agents, packaged copies and the roster
- **THEN** the existing model tiers remain consistent and no required spec completion roles are introduced.

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches standard pipeline specialists
- **THEN** implementer, tester, cleaner and delivery use Luna/max, while architect, QA and security use Astra/xhigh.

#### Scenario: Explicit native model selection
- **WHEN** the operator selects a supported alternative model or effort
- **THEN** pipeline coordination uses the host's supported selection route without adding a TH model resolver or changing unrelated role defaults.

#### Scenario: The phase roles are installed in another runtime
- **WHEN** skills and roles are distributed to Claude Code or OpenCode
- **THEN** they retain the existing runtime model policy and the same principal/spec and coordinated/pipeline behavior, without completion-role-specific exceptions.

### Requirement: The managed generic fallback converges on Luna max
The generated Codex project configuration and newly installed runtime configuration SHALL use `gpt-6-luna` with `max` reasoning as the generic subagent fallback. Setup and update SHALL migrate only the exact managed `gpt-5.6-terra` / `medium` and `gpt-5.6-luna` / `max` pairs to Luna 6/max with the existing backup and native activation reporting, while preserving every other complete operator-selected pair.

#### Scenario: Setup encounters the former managed Terra fallback
- **WHEN** setup or update reconciles a configuration whose generic subagent fallback is `gpt-5.6-terra` with `medium` effort
- **THEN** it atomically replaces the model and effort with Luna 6/max, preserves unrelated configuration, creates the required backup, and reports the changed configuration for the existing native activation procedure

#### Scenario: Setup encounters the former managed Luna fallback
- **WHEN** setup or update reconciles `gpt-5.6-luna` with `max` effort
- **THEN** it migrates to `gpt-6-luna` with `max`, preserves unrelated configuration, and a second reconciliation is a no-op

#### Scenario: Setup encounters a custom fallback
- **WHEN** setup or update reconciles a complete fallback other than the current or exact former managed pairs, including Luna 5.6 with a different effort
- **THEN** it preserves the complete custom model and effort pair and reports the configuration as custom-preserved

### Requirement: Model policy is execution metadata, not authority
An operator-selected or standard specialist model policy SHALL be recorded as
non-secret resumable execution metadata after the live choice. Losing context
MUST NOT force repetition of an unchanged available choice, and the value MUST
NOT authorize scope, gate release, or outward action.

#### Scenario: Main resumes after compaction
- **WHEN** the accepted execution profile remains available
- **THEN** Main resumes specialist dispatch with that profile without another model ceremony

#### Scenario: The requested profile is unavailable
- **WHEN** runtime preflight cannot resolve the persisted profile
- **THEN** Main requests a new execution preference before dispatch without changing pipeline authority

### Requirement: Codex uses native execution permissions
The Codex plugin SHALL ship no TH PreToolUse permission interceptor or exclusive guard launcher. Setup, update and reload SHALL consider retired hook assets unnecessary and SHALL preserve the operator's native permission settings, configured models and available workflow roles. Documentation SHALL NOT claim the native policy is identical to the removed TH checks.

#### Scenario: A tool call runs with the updated plugin
- **WHEN** Codex evaluates a tool call after loading the updated distribution
- **THEN** native runtime permissions decide execution without a TH guard response

#### Scenario: Installation verification checks the updated release
- **WHEN** no retired hook manifest or launcher exists
- **THEN** verification succeeds based on retained components and does not request a repair or restart for removed assets

### Requirement: Agent setup installs the complete packaged roster
Codex agent setup SHALL inspect, install, and repair every bundled generated role,
including `pr-review-verifier`, in both global and project scopes. Installing a
missing role SHALL report changed installation state; reload SHALL assess its
effective activation without requiring a new conversation solely from the
installation receipt. Repeating sync on a current installation SHALL report no
changed roles and no restart requirement. Regression coverage
SHALL compare the installed roster and bytes with the packaged agent artifacts.

#### Scenario: The review verifier is absent after an older installation
- **WHEN** agent setup sync runs with the verifier missing and all other roles current
- **THEN** it installs the packaged verifier and reports the changed role for activation assessment through supported refresh or reconnect

#### Scenario: All bundled roles are current
- **WHEN** agent setup sync runs again
- **THEN** it reports no changed roles and no restart requirement

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

### Requirement: Inline reviewer readiness preserves the current conversation
Local Codex review SHALL use the selected native read-only reviewer role in the
current conversation. Installed-role inspection SHALL be diagnostic when needed,
not a repeated byte-digest or model-default authorization gate. Main SHALL preserve
native model preferences and disclose unavailable execution or observed stale
activation. A new conversation or proof of loaded profile bytes SHALL NOT be
required. A writable role SHALL NOT substitute for unavailable read-only execution.

#### Scenario: Setup changes only another agent
- **WHEN** the selected native read-only reviewer remains available
- **THEN** local review proceeds in the same conversation without reattesting unchanged installed profiles

#### Scenario: A native reviewer uses a supported customized model
- **WHEN** the selected native read-only role has an operator-selected model or effort
- **THEN** Main preserves that preference without rejecting it for differing from packaged defaults

### Requirement: Review criteria validation launches on Windows without a shell
The local review package helper SHALL launch the pinned OpenSpec validator through
Node and npm's JavaScript entrypoint on Windows, keeping arguments separate and
literal. Missing launcher resolution SHALL be distinguished from a failed change
validation. Neither outcome SHALL bypass immutable written-intent binding.

#### Scenario: Node provides npx as a Windows batch shim
- **WHEN** review packaging validates an authored OpenSpec change
- **THEN** it invokes the npm JavaScript entrypoint with Node and does not attempt execFile on npx.cmd

### Requirement: Shared setup asset checks respect native filesystem modes
Skill synchronization SHALL compare shared setup asset content on every supported platform. It SHALL check the executable mode on POSIX filesystems and SHALL NOT report stale assets solely because native Windows does not expose that POSIX mode.

#### Scenario: Matching content on Windows
- **WHEN** the distributed setup asset has the expected bytes on native Windows
- **THEN** the check succeeds without requiring POSIX executable bits

#### Scenario: Changed content
- **WHEN** a distributed setup asset differs from its canonical bytes
- **THEN** the check reports drift on both Windows and POSIX

#### Scenario: Wrong executable mode on POSIX
- **WHEN** a matching distributed setup asset loses its expected executable mode on POSIX
- **THEN** the check reports mode drift

### Requirement: Pipeline checks native role availability when needed
Main SHALL check the native roles and capabilities needed for the current assignment, not require a separate TH core preflight. Generated-role freshness remains a distribution check, not an authorization system. A missing or incompatible required capability SHALL produce a concrete limitation and supported recovery while preserving completed work. Retired roles SHALL remain absent from the active registry and distribution.

#### Scenario: Design reuses an existing valid change
- **WHEN** the bound OpenSpec change needs no authorship
- **THEN** Main continues without checking or dispatching an unused architect or plan-review role.

#### Scenario: A deferred role fails preflight
- **WHEN** a needed native capability is unavailable or demonstrably incompatible
- **THEN** Main diagnoses the limitation, uses a supported alternative when it satisfies the objective, and reports any unresolved selected coverage without invalidating prior authorization or progress.

#### Scenario: A retired qa-plan projection remains installed
- **WHEN** registry, packaged agents, documentation or generated assets expose qa-plan as dispatchable
- **THEN** distribution validation detects the obsolete role; current work does not dispatch it or manufacture another core gate.

#### Scenario: The standard role profile is selected
- **WHEN** no live override replaces the installed standard profile
- **THEN** native dispatch uses the existing Luna/max and Astra/xhigh settings for their roles, with observed activation limits reported honestly.
