## ADDED Requirements

### Requirement: Direct visual work resolves the selected physical workspace
Workspace preparation SHALL validate existing parent directories before accepting
a missing destination. Direct visual skills SHALL use the shared local/Obsidian
workspace method and resources from the active skill installation, while honoring
an explicit deliverable destination.

#### Scenario: Missing destination under an escaping link
- **WHEN** an existing ancestor redirects the requested workspace outside its selected home
- **THEN** preparation reports a destination conflict before declaring the workspace ready

#### Scenario: Visual skill is invoked directly on any supported runtime
- **WHEN** no parent workflow has supplied a workspace
- **THEN** the skill resolves the configured home before writing working files and resolves renderer resources without depending on another runtime's installation
