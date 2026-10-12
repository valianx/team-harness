## Purpose

Study existing applications through a maintained upstream dependency and turn its evidence into project-relevant development ideas while preserving sources and coverage limits.

## ADDED Requirements

### Requirement: Application research uses the upstream dependency
TH SHALL offer `research-app` for an explicit application target, research objective, relevant journeys and destination-project context when available. An exploratory objective SHALL remain usable before a destination project is selected; TH SHALL state assumptions instead of inventing project context. The current general agent SHALL coordinate the work through the official REA workflow and public supported capabilities. TH SHALL accept targets supported by the installed dependency without imposing a technology-first intake or maintaining its own analysis methods, tool catalog or result schema. Complete-source research SHALL follow the upstream workflow's source-research boundary using ordinary repository tools.

#### Scenario: A supported application is selected
- **WHEN** the operator provides an application and a development question
- **THEN** TH supplies the objective, relevant context and selected workspace to the upstream workflow and lets that workflow select applicable analysis

#### Scenario: The target is ambiguous
- **WHEN** available context does not identify which application or artifact should be studied
- **THEN** TH resolves that ambiguity before invoking analysis and continues independent context preparation

#### Scenario: Complete source is available
- **WHEN** the upstream workflow selects ordinary source research for the available repository
- **THEN** TH uses that supported route and reports its actual evidence without requiring a compiled artifact or inventing a substitute analyzer

### Requirement: REA preparation is scoped to application research
At `research-app` entry or resumption, TH SHALL resolve the active host's official REA installation, instructions, version or revision, supported invocation and required capabilities. It SHALL reuse a healthy installation and use the official owner route for authorized preparation or repair. Explicit `setup rea` and `update rea` requests SHALL use that same route without implicitly preparing unrelated providers or inactive hosts. TH SHALL distinguish installed, discoverable and usable states, report concrete recovery for missing capabilities, and never claim execution from file presence alone.

#### Scenario: A healthy dependency is already available
- **WHEN** the selected application can be studied with the active host's usable REA capability
- **THEN** TH reuses it without redundant installation or authorization

#### Scenario: A required capability is unavailable
- **WHEN** the dependency, selected engine or host integration cannot perform the requested analysis
- **THEN** TH reports that specific pending capability and supported recovery, preserves partial evidence and continues independent supported work without claiming analysis ran

### Requirement: Invocation follows actual upstream capabilities
TH SHALL invoke the installed dependency's supported public interfaces and actual advertised schemas. A supported CLI route SHALL remain usable when MCP tools are unavailable. Differences among installed instructions, release versions and live capabilities SHALL remain visible; TH SHALL NOT call absent tools, import provider internals or rewrite the provider to bridge a mismatch.

#### Scenario: Only the CLI is usable
- **WHEN** no usable MCP connection exists and the official CLI supports the selected work
- **THEN** TH follows the upstream CLI route and retains complete output in the selected workspace

#### Scenario: Installed guidance describes a capability absent from the server
- **WHEN** the live server lacks a described tool or argument
- **THEN** TH uses supported alternatives when available and reports remaining limits without pretending that the missing capability executed

### Requirement: Original Evidence remains attributable
TH SHALL retain original REA Evidence, its identities, profiles, provenance, limitations, omissions and diagnostics in the selected workspace using supported upstream output routes. Derived summaries, views and TH interpretations SHALL link back to their original Evidence. TH SHALL distinguish observations, inferences and unknowns and preserve upstream coverage semantics instead of turning a successful command into a claim of exhaustive or runtime analysis.

#### Scenario: Static analysis produces relationships
- **WHEN** REA reports static relationships without corresponding execution evidence
- **THEN** TH preserves that distinction in its report and does not present those relationships as observed runtime behavior

#### Scenario: Analysis returns partial results
- **WHEN** a provider reports skipped scope, unsupported behavior or errors alongside Evidence
- **THEN** TH retains those qualifications with the useful results and exposes them in material project conclusions

### Requirement: Evidence needed later remains portable
TH SHALL retain complete inline Evidence or supported exported artifacts needed for later reuse. Session-retained identifiers SHALL NOT be presented as permanent cross-session or cross-CLI references. Supported summary, view and export capabilities SHALL be used for large results without repeating completed analysis solely to obtain a different representation.

#### Scenario: A connection will close before later reuse
- **WHEN** a retained Evidence identifier is needed by a later task or session
- **THEN** TH preserves a supported portable representation before closing that connection and links the report to the retained files

#### Scenario: A large result needs a focused view
- **WHEN** existing Evidence can answer the next question through a supported summary or view
- **THEN** TH reuses that Evidence and preserves the relationship to the original result

### Requirement: Project ideas remain grounded and actionable
TH SHALL produce a concise research report describing the application scope, observed findings, evidence limits and development opportunities relevant to the stated project or exploratory objective. Each material opportunity SHALL explain user value, project fit or its assumptions, required adaptation and an acceptance example, with links to supporting Evidence or an explicit inference. Selected opportunities SHALL become inputs to `design` or `spec` under the existing task scope; research alone SHALL NOT start their implementation. Provider findings SHALL remain advisory.

#### Scenario: Application research reveals a useful interaction
- **WHEN** the observed application has an interaction relevant to the destination project's users
- **THEN** TH explains how that idea could be adapted, its assumptions and a concrete acceptance example, while preserving its evidence source

### Requirement: Application execution honors scope and ownership
Main or a specifically scoped native executor SHALL own runtime effects. TH SHALL distinguish passive observation from active scenarios and keep application actions within the operator's authorized scope and native permissions. It SHALL preserve ownership of external sessions and distinguish completed actions from verified visible outcomes using the installed provider's evidence requirements. Existing read/search research roles SHALL NOT gain implicit execution authority.

#### Scenario: An existing browser session is observed
- **WHEN** analysis attaches to an operator-owned browser
- **THEN** TH applies the authorized observation scope, preserves that session's ownership and reports visible results only when the relevant evidence exists

### Requirement: Direct diagnosis remains independent of REA
`audit` and `find-bugs` SHALL remain direct TH workflows without REA discovery, preparation, invocation or result consumption. Application-research improvements proposed for those modes SHALL remain separate ideas until independently selected. REA SHALL NOT become an implicit dependency of quality-provider preparation, ordinary spec/pipeline entry or PR review.

#### Scenario: Audit or bug diagnosis is selected
- **WHEN** the operator invokes `audit` or `find-bugs`
- **THEN** TH runs the selected direct method and applicable existing providers without selecting REA

#### Scenario: Research suggests a diagnosis improvement
- **WHEN** the research identifies a useful idea for `audit` or `find-bugs`
- **THEN** TH retains it as a separate proposal without integrating REA into either mode
