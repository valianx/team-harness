## MODIFIED Requirements

### Requirement: Inline reviewer readiness preserves the current conversation
Local Codex review SHALL use the selected native read-only reviewer role in the
current conversation. Installed-role inspection SHALL be diagnostic when needed,
not a repeated byte-digest or model-default authorization gate. Main SHALL preserve
native model preferences and disclose unavailable execution or observed stale
activation. A new conversation or proof of loaded profile bytes SHALL NOT be
required. A writable role SHALL NOT substitute for unavailable read-only execution.

#### Scenario: Setup changes only another agent
- **WHEN** the selected native read-only reviewer remains available
- **THEN** local review proceeds in the same conversation without reattesting unchanged installed profiles

#### Scenario: A native reviewer uses a supported customized model
- **WHEN** the selected native read-only role has an operator-selected model or effort
- **THEN** Main preserves that preference without rejecting it for differing from packaged defaults
