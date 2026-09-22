## MODIFIED Requirements

### Requirement: Critical Codex roles use Astra and bounded roles use Luna
The standard Team Harness Codex profile SHALL assign `gpt-6-astra` with `xhigh` reasoning to existing Opus source projections, including architect, QA, security and PR review verifier. Sonnet and Haiku source projections SHALL use `gpt-6-luna` with `max` reasoning. The spec-validator and pr-creator phase roles SHALL explicitly use `gpt-6-sol` with `high` and `medium` reasoning respectively in Codex and OpenCode, while Claude Code SHALL retain their native `opus` model and corresponding effort. These role-specific defaults SHALL NOT remap existing pipeline roles or overwrite explicit concrete operator model selections. Main's selected chat model SHALL remain unchanged.

#### Scenario: Standard agent projections are generated
- **WHEN** the canonical Codex registry is projected into installed agents, packaged copies, project configuration and the generated roster
- **THEN** Sonnet/Haiku roles resolve to Luna/max, existing Opus roles resolve to Astra/xhigh, and the two completion phase roles resolve to their explicit Sol model and effort without changing the generic fallback.

#### Scenario: A pipeline runs without a live model override
- **WHEN** Main dispatches the standard pipeline specialists
- **THEN** implementer, tester, cleaner and delivery use Luna/max, while architect, QA and security use Astra/xhigh.

#### Scenario: The phase roles are installed in another runtime
- **WHEN** the canonical phase agents are installed in Claude Code or transformed for OpenCode
- **THEN** Claude Code keeps native Opus and OpenCode's JS and Go routes agree on GPT-6 Sol with the role's declared reasoning effort, preserving other role mappings and concrete custom model passthrough.
