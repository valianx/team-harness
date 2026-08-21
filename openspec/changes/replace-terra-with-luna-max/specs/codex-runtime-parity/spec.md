## ADDED Requirements

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
