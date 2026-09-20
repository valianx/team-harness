## MODIFIED Requirements

### Requirement: Causal evidence routes recovery
After non-success, Main SHALL preserve valid progress, establish safe mutable
ownership, classify the observable cause, and compare immutable recovery
evidence. Main SHALL diagnose operational blockers and attempt a verifiable
authorized repair before pausing. This obligation applies in direct, spec and
pipeline work: contract-format errors, stale paths, missing declared tools or
libraries, and recoverable transport failures do not require another approval
when repairs preserve the approved deliverable, acceptance meaning and authority.
Main SHALL verify the repaired condition and continue under unchanged authority
when a safe action is available and its causal identity differs from the failed
action. Native permissions remain binding; Main SHALL NOT invent evidence, weaken
validation or silently change shipped dependencies or approved intent to repair
the execution environment. Ordinals MUST NOT authorize, deny, pause, or close work.

#### Scenario: The cause is repaired inside approved scope
- **WHEN** evidence supports a different safe action and authority, scope, acceptance meaning, and security floor remain unchanged
- **THEN** Main continues without a live correction decision

#### Scenario: The same failed action would repeat
- **WHEN** operational diagnosis finds no verifiable authorized repair and every known safe action would reproduce the same causal identity
- **THEN** Main pauses with the missing condition and attempted remedies, preserving authority, progress, and evidence

#### Scenario: Recovery changes approved meaning
- **WHEN** the proposed action changes intent, scope, acceptance meaning, security authority, or an outward effect
- **THEN** Main obtains the applicable bounded live decision before dispatch

#### Scenario: A missing library or incorrect path interrupts direct work
- **WHEN** Main can restore a declared prerequisite in a permitted isolated environment or resolve the correct installed path without changing the deliverable
- **THEN** Main performs and verifies the repair, then resumes without asking the operator to approve the operational fix

#### Scenario: A malformed contract interrupts dispatch
- **WHEN** canonical inputs establish the missing formatting or derived coordinate without inventing a decision-bearing fact
- **THEN** Main repairs the owned contract projection, validates it and resumes pending work under existing authority
