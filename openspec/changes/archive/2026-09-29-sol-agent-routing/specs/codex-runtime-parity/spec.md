## RENAMED Requirements

- FROM: `### Requirement: Critical Codex roles use Astra and bounded roles use Luna`
- TO: `### Requirement: Codex specialists use Sol 6.1 independently of Main`
- FROM: `### Requirement: The managed generic fallback converges on Luna max`
- TO: `### Requirement: The managed generic fallback converges on Sol 6.1 max`

## MODIFIED Requirements

### Requirement: Codex specialists use Sol 6.1 independently of Main
The standard Team Harness Codex profile SHALL assign gpt-6.1-sol to all delivered specialists, including pipeline aliases. Opus projections SHALL retain xhigh reasoning; Sonnet and Haiku projections SHALL retain max reasoning. Astra SHALL be reserved for Main's chat and SHALL NOT be selected or inherited by delegated agents. Main's model SHALL remain independently selected. Retired spec-validator and pr-creator roles SHALL remain absent.

#### Scenario: Standard agent projections are generated
- **WHEN** the registry generates runtime agents, packaged copies and the roster
- **THEN** all twenty delivered specialists explicitly select Sol 6.1 with their existing reasoning efforts, including pipeline aliases

#### Scenario: Main uses Astra
- **WHEN** Main coordinates a pipeline from an Astra chat
- **THEN** delegated specialists use Sol 6.1 without changing Main's model

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches standard pipeline specialists
- **THEN** all use Sol 6.1 with max for implementer, tester, cleaner and delivery, and xhigh for architect, QA and security

#### Scenario: Explicit native model selection
- **WHEN** the operator selects a supported reasoning effort for delegated Sol 6.1 agents
- **THEN** coordination uses the host's supported selection route without changing Main's chat model or introducing a TH model resolver

#### Scenario: The live host lacks Sol 6.1 dispatch
- **WHEN** the active native dispatch capability cannot select Sol 6.1
- **THEN** Main reports that limitation and continues suitable work directly without silently substituting another model

#### Scenario: The phase roles are installed in another runtime
- **WHEN** skills and roles are distributed to Claude Code or OpenCode
- **THEN** they retain their existing runtime model policy

### Requirement: The managed generic fallback converges on Sol 6.1 max
The generated Codex project configuration and newly installed runtime configuration SHALL use `gpt-6.1-sol` with `max` reasoning as the generic subagent fallback. Setup and update SHALL migrate only the exact managed `gpt-5.6-terra` / `medium`, `gpt-5.6-luna` / `max`, and `gpt-6-luna` / `max` pairs to Sol 6.1/max with the existing backup and native activation reporting, while preserving every other complete operator-selected pair.

#### Scenario: Setup encounters the former managed Terra fallback
- **WHEN** setup or update reconciles a configuration whose generic subagent fallback is `gpt-5.6-terra` with `medium` effort
- **THEN** it atomically replaces the model and effort with Sol 6.1/max, preserves unrelated configuration, creates the required backup, and reports the changed configuration for the existing native activation procedure

#### Scenario: Setup encounters the former managed Luna fallback
- **WHEN** setup or update reconciles `gpt-5.6-luna` or `gpt-6-luna` with `max` effort
- **THEN** it migrates to `gpt-6.1-sol` with `max`, preserves unrelated configuration, and a second reconciliation is a no-op

#### Scenario: Setup encounters a custom fallback
- **WHEN** setup or update reconciles a complete fallback other than the current or exact former managed pairs, including Luna 5.6 with a different effort
- **THEN** it preserves the complete custom model and effort pair and reports the configuration as custom-preserved

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
- **THEN** native dispatch uses Sol 6.1 with each role's existing max or xhigh reasoning, with observed activation limits reported honestly.
