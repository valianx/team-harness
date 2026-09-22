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
