## MODIFIED Requirements

### Requirement: Verification providers retain upstream ownership
TH SHALL consume Superpowers, BMAD TEA and selected quality tools or skills from their official maintained distributions and SHALL NOT vendor, rewrite or redistribute their engines, skills, agents, templates or runtime hooks. The same ownership boundary SHALL apply to the REA application-research dependency. Provider-generated integrations SHALL remain distinguishable from TH-owned assets and excluded from TH packaging and generated projections. TH SHALL maintain one shared integration reference documenting OpenSpec, Superpowers, TEA, selected quality providers and REA's purposes, triggers, inputs, invocation, outputs, official lifecycle routes and known limitations. Consumer workflows SHALL reference it; provider algorithms, checklists and manuals SHALL remain upstream rather than being reimplemented in TH. Documenting REA in that reference SHALL NOT select it for verification or quality diagnosis.

#### Scenario: A provider is installed or updated
- **WHEN** an authorized upstream installer creates or refreshes native integration files
- **THEN** TH discovers those files without adopting them as canonical TH sources or overwriting them during its own synchronization

#### Scenario: Distribution includes native integration directories
- **WHEN** TH assembles a runtime package or synchronizes generated copies
- **THEN** installed provider assets stay outside that output while their native installations remain usable

#### Scenario: A workflow needs provider guidance
- **WHEN** spec, pipeline or direct work selects an external capability
- **THEN** it uses the shared TH integration reference for selection and context, then the currently installed upstream instructions for execution, without maintaining a second copy of the provider's method

#### Scenario: Application research selects REA
- **WHEN** research-app needs the installed upstream workflow
- **THEN** TH consumes its official instructions and public capabilities without redistributing them or adding REA to unrelated flows
