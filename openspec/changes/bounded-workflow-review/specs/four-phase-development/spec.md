## ADDED Requirements

### Requirement: PR descriptions end with a localized risk flag
PR preparation and publication through create-pr SHALL end the description with one descriptive true/false risk flag in the PR's language. Main SHALL judge actual change impact and available evidence, including material uncertainty, and refresh the flag when relevant changes affect that judgment. The footer SHALL contain only the flag, after other template content. It SHALL inform the operator without automatically requiring human approval or another risk tool.

#### Scenario: English PR
- **WHEN** a PR is prepared in English and Main judges the change risky
- **THEN** its final line is `Risky change: true`, without a risk explanation or added checklist in the footer

#### Scenario: Spanish PR
- **WHEN** a PR is prepared in Spanish and Main judges the change not risky
- **THEN** its final line is `Cambio riesgoso: false`

#### Scenario: Risk changes during preparation
- **WHEN** the prepared candidate changes enough to alter Main's risk judgment
- **THEN** Main refreshes the single localized flag without creating a new approval gate
