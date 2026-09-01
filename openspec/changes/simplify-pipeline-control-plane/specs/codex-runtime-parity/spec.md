## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Pipeline role preflight is staged and actionable
Codex pipeline activation SHALL validate pipeline core compatibility and the
architect role needed next. Every other role SHALL be validated using the
existing canonical registry and generated-role freshness checks immediately
before its first possible dispatch. An absent or incompatible deferred role
SHALL stop before that role runs with one actionable diagnosis and MUST NOT
invalidate prior Gate authority or completed work.

#### Scenario: Design starts with an unused later role unavailable
- **WHEN** pipeline core and architect validate but a conditional later role is unavailable
- **THEN** Design proceeds and that role is checked only before its first possible dispatch

#### Scenario: A deferred role fails preflight
- **WHEN** its effective role contract is absent, stale, or incompatible
- **THEN** the pipeline pauses with the exact remediation while preserving workspace, authority, and evidence

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
