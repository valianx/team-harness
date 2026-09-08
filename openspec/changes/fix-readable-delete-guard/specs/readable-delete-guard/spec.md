## ADDED Requirements

### Requirement: Readable interposed arguments preserve catastrophic deletion decisions
The existing guard SHALL deny the reported simple rm invocations with a quoted or glob argument before combined recursive-force flags and an existing catastrophic destination. It SHALL preserve non-covered decisions for benign relative destinations and inert quoted text, without changing other hook or secret-scanning behavior.

#### Scenario: An argument precedes flags on a catastrophic deletion
- **WHEN** an inert evaluator payload contains the reported simple interposed-argument rm form targeting an already-protected catastrophic destination
- **THEN** the evaluator returns deny without any test executing the command

#### Scenario: The same form targets a benign relative path
- **WHEN** the equivalent invocation targets a relative path outside the existing catastrophic set
- **THEN** the evaluator preserves its non-covered decision

#### Scenario: The input contains inert documentation text
- **WHEN** the reported text appears only as an argument to a non-deletion command
- **THEN** the guard does not introduce a catastrophic-deletion denial
