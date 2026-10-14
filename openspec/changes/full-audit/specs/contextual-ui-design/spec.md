## ADDED Requirements

### Requirement: UI audit evaluates tasks without authorizing redesign
An analysis-only UI assignment SHALL evaluate actual roles, critical tasks, loading/empty/error/success and recovery states, keyboard/focus, responsive and applicable browser/device/accessibility concerns using maintained upstream methods and existing testing guidance. It SHALL distinguish expert hypotheses from participant-observed usability and retain unavailable views, interactions or assistive technology as coverage limits. Selecting this audit SHALL NOT authorize redesign or product edits.

#### Scenario: An expert inspects an authenticated journey without participants
- **WHEN** the available review covers an authenticated task and keyboard interaction but no participant sessions
- **THEN** the report preserves its actual task/state evidence and labels usability conclusions as expert hypotheses with the participant observation absent
