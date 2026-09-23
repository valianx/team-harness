## RENAMED Requirements

- FROM: `### Requirement: Pipeline role preflight is staged and actionable`
- TO: `### Requirement: Pipeline checks native role availability when needed`

## MODIFIED Requirements

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
