## ADDED Requirements

### Requirement: Readable interposed arguments preserve catastrophic deletion decisions
The existing guard SHALL deny the reported simple rm invocations with one quoted, glob, or unquoted argument before combined recursive-force flags and an existing catastrophic destination. It SHALL preserve the option terminator's meaning, non-covered decisions for benign relative destinations, and inert quoted text, without changing other hook or secret-scanning behavior.

#### Scenario: An argument precedes flags on a catastrophic deletion
- **WHEN** an inert evaluator payload contains the reported simple interposed-argument rm form targeting an already-protected catastrophic destination
- **THEN** the evaluator returns deny without any test executing the command

#### Scenario: An argument precedes flags and the option terminator
- **WHEN** an inert evaluator payload contains the reported simple interposed-argument rm form followed by `-rf -- /`
- **THEN** the evaluator returns deny because `--` terminates options before the already-protected catastrophic destination

#### Scenario: The same form targets a benign relative path
- **WHEN** the equivalent invocation targets a relative path outside the existing catastrophic set
- **THEN** the evaluator preserves its non-covered decision

#### Scenario: The option terminator precedes a later flag-looking operand
- **WHEN** an inert evaluator payload contains `rm -- x -rf /`
- **THEN** the evaluator preserves its non-covered decision because the later `-rf` text is an operand

#### Scenario: The option terminator is not mistaken for an interposed operand
- **WHEN** an inert evaluator payload contains `rm -- -rf /`
- **THEN** the evaluator preserves its non-covered decision because `--` terminates options before the later flag-looking operand

#### Scenario: The input contains inert documentation text
- **WHEN** the reported text appears only as an argument to a non-deletion command
- **THEN** the guard does not introduce a catastrophic-deletion denial
