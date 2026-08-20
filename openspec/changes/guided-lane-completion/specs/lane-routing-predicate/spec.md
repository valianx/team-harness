## Purpose

Make the cheaper lane the offered default whenever its predicate passes, render the posture choice honestly, and repair the sensitivity authority the routing predicate depends on.

## ADDED Requirements

### Requirement: Carrier consistency and anchor resolution are enforced by deterministic checks

Predicate consistency across carriers and the resolvability of every cited section anchor SHALL be asserted by deterministic checks that fail when a carrier drifts or a citation stops resolving. These properties MUST NOT rest on prose instructing an author to keep the carriers aligned.

#### Scenario: One carrier is edited and another is not
- **WHEN** the routing predicate is changed in one carrier only
- **THEN** the deterministic check fails and names both the edited carrier and every carrier still holding the previous statement

#### Scenario: A cited section is renamed or removed
- **WHEN** any file cites a section anchor that no longer exists
- **THEN** the deterministic check fails and names the citing file and the unresolved anchor

### Requirement: The spec lane is offered whenever its predicate passes

Live posture guidance SHALL offer the spec lane as an option whenever its routing predicate passes, rather than leaving the offer to coordinator discretion. When the predicate does not pass, the guidance MUST render only the postures that remain available.

#### Scenario: A request satisfies the spec-lane predicate
- **WHEN** posture guidance is rendered for a single-repository request that merits written intent and breaks no public contract
- **THEN** the spec lane appears as an offered option alongside inline and pipeline

#### Scenario: A request fails the spec-lane predicate
- **WHEN** the request is multi-repository, irreversible, or multi-task
- **THEN** the guidance renders without the spec-lane option and names the condition that removed it

### Requirement: Every carrier of the routing predicate states it consistently

The routing predicate and the hard-router list SHALL read consistently across every file that carries them, and a change to the predicate MUST update all carriers in the same change, including the managed block distributed to operator configuration.

#### Scenario: The predicate is changed
- **WHEN** the routing predicate or hard-router list is edited
- **THEN** every carrier — the coordinator kernel, the posture document, the direct-mode reference, the intake reference, the lane skill, the repository instructions, and the managed block — carries the same statement after the change

#### Scenario: A stale inlined copy contradicts its declared source
- **WHEN** a file inlines a copy of the managed block while declaring the managed block to be the source of truth
- **THEN** the inlined copy is reconciled to that source or replaced by a reference to it

### Requirement: The sensitivity authority resolves to a real section

Every reference that resolves security sensitivity SHALL point at an existing section that defines the sensitive categories and the fail-closed default, and no routing rule MAY depend on an anchor that does not resolve.

#### Scenario: A routing rule resolves sensitivity
- **WHEN** a coordinator or reference file resolves whether a scope is sensitive
- **THEN** the cited section exists, lists the sensitive categories, and states that an ambiguous classification is sensitive

#### Scenario: The section is relocated
- **WHEN** the sensitivity section moves
- **THEN** every citing site is updated in the same change so no citation dangles
