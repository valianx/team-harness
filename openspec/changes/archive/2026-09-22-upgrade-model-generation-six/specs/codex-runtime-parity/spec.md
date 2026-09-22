## MODIFIED Requirements

### Requirement: Critical Codex roles use Astra and bounded roles use Luna
The standard Team Harness Codex profile SHALL assign `gpt-6-astra` with `xhigh` reasoning to Opus source projections, including the installed architect, QA, security, and PR review verifier. Sonnet and Haiku source projections SHALL use `gpt-6-luna` with `max` reasoning. The standard pipeline dispatch matrix SHALL therefore use Luna/max for implementer, tester, cleaner, and delivery, and Astra/xhigh for architect, QA, and security. The project configuration SHALL preserve Main's selected chat model.

#### Scenario: Standard agent projections are generated
- **WHEN** the canonical Codex registry is projected into installed agents, packaged copies, project configuration, and the generated roster
- **THEN** every Sonnet/Haiku role resolves to `gpt-6-luna` with `max` reasoning, every Opus role resolves to `gpt-6-astra` with `xhigh` reasoning, and no current standard projection selects Terra or Sol

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches the standard pipeline specialists
- **THEN** implementer, tester, cleaner, and delivery are spawned with Luna/max, while architect, QA, and security are spawned with Astra/xhigh

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
- **THEN** staged preflight preserves Luna at maximum reasoning for bounded implementation roles and Astra at xhigh reasoning for architect, QA, and security
