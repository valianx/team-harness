## ADDED Requirements

### Requirement: Failed version probes retain their actual invocation
When a prerequisite version probe fails, quality evidence SHALL identify the probe that actually executed, its arguments and resolution, and distinguish the unexecuted planned check. Existing successful command evidence SHALL retain its meaning.

#### Scenario: A version probe exits unsuccessfully
- **WHEN** a command's version probe fails before its main check starts
- **THEN** the failure record describes the probe rather than attributing its exit result to the main check.
