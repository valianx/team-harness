## ADDED Requirements

### Requirement: Provisioning reports observed write outcomes
Setup SHALL distinguish operator decline from a refused or failed approved configuration write. It SHALL verify the result before announcing provisioned rules, SHALL disclose partial or unknown state when verification is incomplete, and SHALL NOT record a runtime refusal as a durable operator decline.

#### Scenario: The operator declines
- **WHEN** the operator declines the provisioning offer
- **THEN** setup preserves the existing decline behavior and performs no provisioning write

#### Scenario: The runtime rejects an approved write
- **WHEN** the operator approved but the runtime refuses the write
- **THEN** setup reports provisioning as unconfirmed, names the pending target and continues independent steps without repeating the same rejected action or widening access

#### Scenario: A later step fails after partial progress
- **WHEN** some configuration operation may have succeeded but final verification is unavailable or fails
- **THEN** setup reports the known partial or unknown result and does not claim that nothing changed or that all rules were provisioned
