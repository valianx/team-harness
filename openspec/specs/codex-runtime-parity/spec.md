# codex-runtime-parity Specification

## Purpose
Codex is a first-class runtime: sandbox failures diagnose to their real cause, declared agent capabilities equal effective capabilities, review artifacts stay inside the workspace, and hook wiring carries no process enforcement Claude Code already retired.

## Requirements

### Requirement: Sandbox diagnosis distinguishes shadowing from stale sessions
When a workspace write probe fails and the target root is declared in the operator-level config, preflight SHALL check whether the checked-out tree's project config declares `writable_roots`; if so it reports config shadowing with the concrete fix (update tree / regenerate config), and only otherwise advises a session restart.

#### Scenario: A pre-#601 tree shadows the global roots
- **WHEN** the write probe fails and the project `.codex/config.toml` declares `writable_roots`
- **THEN** the diagnosis names the shadowing and never enters a restart loop

### Requirement: Setup and update detect and repair sandbox drift
`/th:setup` and `/th:update` (Codex runtime) SHALL warn when the checked-out tree declares project-level `writable_roots`, and SHALL offer — behind the existing confirmation gate — to write required vault roots into the operator-level config with a merge that preserves unrelated keys, followed by the restart instruction. Config migration SHALL preserve structured values (`obsidian_tasks` stays an object; a degraded value is repaired or reported, never silently kept).

#### Scenario: Setup finds a shadowing project config
- **WHEN** setup runs on a tree whose project config declares writable roots while the global config declares the vault
- **THEN** the operator receives the drift warning and a gated offer to fix the operator-level config

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

### Requirement: Codex hook wiring carries the deny floor only
The Codex plugin's PreToolUse wiring SHALL ship the deterministic deny floor (`policy-block`, `gcp-guard`); `gate-guard` is unwired or opt-in, receiving at most the minimal literal-compatibility update (`auto-ship`) and no new logic — matching Claude Code's v2.139.0 retirement of process-enforcing hooks.

#### Scenario: A Bash call runs under the Codex plugin
- **WHEN** the PreToolUse hook chain evaluates the call
- **THEN** only deny-floor hooks gate it, and a broken plugin cache surfaces as a reported launcher error rather than blanket tool denial

### Requirement: Bounded Codex roles use Luna at maximum reasoning
The standard Team Harness Codex profile SHALL assign `gpt-5.6-luna` with `max` reasoning to every role projection that previously selected `gpt-5.6-terra`, including source roles projected from Sonnet or Haiku metadata. Projections that select `gpt-5.6-sol` SHALL remain on Sol with `xhigh` reasoning. The standard pipeline dispatch matrix SHALL therefore use Luna/max for implementer, tester, cleaner, and delivery, while architect, QA, and security remain on Sol/xhigh.

#### Scenario: Standard agent projections are generated
- **WHEN** the canonical Codex registry is projected into installed agents, packaged copies, project configuration, and the generated roster
- **THEN** every formerly Terra-backed role resolves to `gpt-5.6-luna` with `max` reasoning, every Sol-backed role remains `gpt-5.6-sol` with `xhigh` reasoning, and no current standard projection selects Terra

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches the standard pipeline specialists
- **THEN** implementer, tester, cleaner, and delivery are spawned with Luna/max, while architect, QA, and security are spawned with Sol/xhigh

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
