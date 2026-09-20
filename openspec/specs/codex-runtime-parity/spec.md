# codex-runtime-parity Specification

## Purpose
Codex is a first-class runtime: sandbox failures diagnose to their real cause, declared agent capabilities equal effective capabilities, review artifacts stay inside the workspace, and hook wiring carries no process enforcement Claude Code already retired.

## Requirements

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
The frozen review worktree SHALL live under the git-ignored `workspaces/` tree (not a predictable shared `/tmp` path) and SHALL be pruned at flow close.

#### Scenario: A review flow completes
- **WHEN** review publication or abort finishes
- **THEN** no prunable review worktrees remain outside the workspace tree

### Requirement: Critical Codex roles use Astra and bounded roles use Luna
The standard Team Harness Codex profile SHALL assign `gpt-6-astra` with `xhigh` reasoning to Opus source projections, including the installed architect, QA, security, and PR review verifier. Sonnet and Haiku source projections SHALL use `gpt-5.6-luna` with `max` reasoning. The standard pipeline dispatch matrix SHALL therefore use Luna/max for implementer, tester, cleaner, and delivery, and Astra/xhigh for architect, QA, and security. The project configuration SHALL preserve Main's selected chat model.

#### Scenario: Standard agent projections are generated
- **WHEN** the canonical Codex registry is projected into installed agents, packaged copies, project configuration, and the generated roster
- **THEN** every Sonnet/Haiku role resolves to `gpt-5.6-luna` with `max` reasoning, every Opus role resolves to `gpt-6-astra` with `xhigh` reasoning, and no current standard projection selects Terra or Sol

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches the standard pipeline specialists
- **THEN** implementer, tester, cleaner, and delivery are spawned with Luna/max, while architect, QA, and security are spawned with Astra/xhigh

### Requirement: The managed generic fallback converges on Luna max
The generated Codex project configuration and newly installed runtime configuration SHALL use `gpt-5.6-luna` with `max` reasoning as the generic subagent fallback. Setup and update SHALL migrate only the exact managed `gpt-5.6-terra` / `medium` pair to Luna/max with the existing backup and restart-required behavior, while preserving every other complete operator-selected pair.

#### Scenario: Setup encounters the former managed Terra fallback
- **WHEN** setup or update reconciles a configuration whose generic subagent fallback is `gpt-5.6-terra` with `medium` effort
- **THEN** it atomically replaces the model and effort with Luna/max, preserves unrelated configuration, creates the required backup, and reports that a fresh Codex session is required

#### Scenario: Setup encounters a custom fallback
- **WHEN** setup or update reconciles a generic subagent fallback that is neither `gpt-5.6-terra` / `medium` nor missing
- **THEN** it preserves the complete custom model and effort pair and reports the configuration as custom-preserved

### Requirement: Pipeline role preflight is staged and actionable
Codex pipeline activation SHALL validate pipeline core compatibility. It SHALL
validate architect only when Design requires OpenSpec authorship or update, and
SHALL validate every other surviving role using the existing canonical registry
and generated-role freshness checks immediately before its first possible
dispatch. Retired roles, including `qa-plan`, MUST be absent from the active
registry, generated projections, install assets, and dispatch preflight. An
absent or incompatible deferred role SHALL stop before that role runs with one
actionable diagnosis and MUST NOT invalidate prior Gate authority or completed
work.

#### Scenario: Design reuses an existing valid change
- **WHEN** pipeline core validates and the bound OpenSpec change needs no authorship
- **THEN** Design proceeds without requiring or validating architect or any plan-review role

#### Scenario: A deferred role fails preflight
- **WHEN** its effective role contract is absent, stale, or incompatible
- **THEN** the pipeline pauses with the exact remediation while preserving workspace, authority, and evidence

#### Scenario: A retired qa-plan projection remains installed
- **WHEN** registry, packaged agents, documentation, or generated assets still expose `qa-plan` as dispatchable
- **THEN** parity validation fails until the obsolete role and route are removed

#### Scenario: The standard role profile is selected
- **WHEN** no live override replaces the installed standard profile
- **THEN** staged preflight preserves Luna at maximum reasoning for bounded implementation roles and Sol at xhigh reasoning for architect, QA, and security

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
Local Codex review SHALL verify the selected managed reviewer definition and
native read-only dispatch boundary. A new conversation ID or proof of loaded
profile bytes SHALL NOT be required when the host exposes the native reviewer
role and the selected installed definition is verified. Activation visibility
limits SHALL remain explicit. An invalid definition or unavailable native
read-only role SHALL remain unavailable; observed stale activation SHALL use
supported refresh before considering a demonstrated reconnect need.

#### Scenario: Setup changes only another agent
- **WHEN** the selected installed reviewer definition and native read-only role remain available and unchanged
- **THEN** the local review can proceed in the same conversation

### Requirement: Review criteria validation launches on Windows without a shell
The local review package helper SHALL launch the pinned OpenSpec validator through
Node and npm's JavaScript entrypoint on Windows, keeping arguments separate and
literal. Missing launcher resolution SHALL be distinguished from a failed change
validation. Neither outcome SHALL bypass immutable written-intent binding.

#### Scenario: Node provides npx as a Windows batch shim
- **WHEN** review packaging validates an authored OpenSpec change
- **THEN** it invokes the npm JavaScript entrypoint with Node and does not attempt execFile on npx.cmd
