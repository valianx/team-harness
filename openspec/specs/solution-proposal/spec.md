# solution-proposal Specification

## Purpose
Make architecture proposals understandable to product and operations readers and actionable for developers through the architecture-design workflow, using agreed context without depending on the originating chat or creating a parallel development process.

## Requirements

### Requirement: Architecture design reuses the agreed context

The principal skill SHALL be named `architecture-design`, with English instructions. `architecture-proposal` SHALL explicitly request its reader-facing proposal. Existing `design` invocations that request a proposal SHALL use the same document defaults. Invocations within a selected coordination workflow SHALL retain that workflow's ownership and applicable endpoint. The skill SHALL support standalone invocation after decisions have been agreed in conversation and SHALL reuse a supplied draft or issue as source context. Sufficient agreed context SHALL lead to a complete document without requiring the operator to repeat the brief or request its structure. Missing material decisions SHALL remain explicit.

#### Scenario: The idea is ready to document
- **WHEN** the operator has agreed the design in Spanish and invokes only `architecture-proposal`
- **THEN** the skill delivers a complete Spanish proposal that can be read without the chat, using the agreed facts and current decisions
- **AND** it does not restart discovery, request the brief again or return only an outline

#### Scenario: A draft or issue supplies the design
- **WHEN** the operator requests a proposal based on an existing draft or issue
- **THEN** the skill uses that source, preserves unresolved decisions and requests only information material to the deliverable that the source and existing context do not establish

#### Scenario: An existing design invocation requests the same deliverable
- **WHEN** the operator requests a solution proposal through `design`
- **THEN** the proposal follows the same language, structure, source-fidelity and delivery defaults as `architecture-proposal`

#### Scenario: Design continues within coordination
- **WHEN** an existing `design` invocation continues design in an active selected workflow
- **THEN** it reuses that workflow's plan, ownership and authorization without creating a competing coordination process or automatically requiring a separate audience proposal

### Requirement: Architecture design delivers one document for both audiences

The skill SHALL deliver one reader-facing solution proposal with a clearly identified functional part before its closing technical part. It SHALL use the explicitly requested document language, defaulting to the language of the conversation, and title the document with the system or capability name. Headings SHALL answer the reader's questions. It SHALL keep the proposal in one document regardless of length unless the operator explicitly requests separation. Supporting visual assets and canonical workflow records SHALL NOT become separate audience proposals by default.

#### Scenario: A proposal serves product and development
- **WHEN** the operator requests a proposed solution for a PO and developers
- **THEN** one document presents functional context first and technical design afterward, understandable without reading the chat

#### Scenario: The proposal grows
- **WHEN** the solution requires substantial technical detail and no split was requested
- **THEN** the agent organizes that detail within the same document using headings and navigation rather than automatically creating a second proposal

#### Scenario: The operator asks for separate documents
- **WHEN** the operator explicitly requests separation
- **THEN** the agent separates the requested parts and links their shared scope and decisions without maintaining conflicting copies

### Requirement: Functional content supports product decisions

The proposal SHALL explain the problem, who uses the system, expected outcomes, what triggers its behavior, the rules determining outcomes and what users observe. It SHALL explain the general capability before the scope and observable acceptance criteria of the first delivery or pilot. Relevant flows, alternate/error behavior, exclusions, assumptions, risks and unresolved decisions SHALL be explicit. Applicable wireframes SHALL appear with the functional explanation. Technical choices that affect user experience, cost, scope or delivery SHALL have their product consequences explained there. Unverified facts and estimates SHALL be identified as assumptions rather than commitments.

#### Scenario: The PO reads only the functional part
- **WHEN** the PO evaluates the proposal without reading technical details
- **THEN** they can understand the intended behavior, its acceptance and the trade-offs requiring a product decision

#### Scenario: Operations explains when behavior starts
- **WHEN** an operations reader reads the functional explanation without technical details or the originating conversation
- **THEN** they can explain who uses the system, the triggering conditions, how its rules determine the result and the outcome users observe
- **AND** the general behavior is established before the first delivery's narrower scope and acceptance criteria

### Requirement: Technical content enables a proportionate handoff

The closing technical part SHALL explain the architectural decision, why it fits the problem, its operating cost, component responsibilities, boundaries, relevant integrations and interfaces, meaningful alternatives, dependencies, implementation increments and verification approach. For a multi-service flow, the skill SHALL reuse the existing Excalidraw skill to embed a communication map showing who calls whom and what data moves between services. For a proposed data exchange, it SHALL include a representative DTO and explain how the consumer uses each field. It SHALL reuse sketch guidance for affected data models and frontend wireframes, justify new persistent data and preserve useful existing designs. Migration, operation and measurable quality concerns SHALL be addressed when relevant. Missing material inputs SHALL remain explicit. Unaffected topics SHALL NOT generate speculative designs or empty annexes.

#### Scenario: Engineering receives a multi-service proposal
- **WHEN** the proposed solution exchanges data between services
- **THEN** the closing technical section identifies component ownership, the selected architecture and its rationale and operating cost
- **AND** an embedded communication map and a representative DTO explain the calls, exchanged data and each field's consumer use

#### Scenario: The solution changes persistence and a screen
- **WHEN** the proposal changes a data model and frontend behavior
- **THEN** the document includes the affected current/proposed model with justified fields and migration considerations, plus wireframes and relevant UI states, sufficient for a developer to understand the agreed boundaries

#### Scenario: The solution changes neither database nor frontend
- **WHEN** the proposal only changes a workflow skill
- **THEN** the document describes that workflow and its checks without inventing database columns, screens or unrelated infrastructure

### Requirement: Proposals preserve workflow ownership and portability

The proposal SHALL use the selected workspace, honor explicit output destinations and keep consumer working artifacts out of commits unless they have a necessary durable role. It SHALL reuse write-documents for an editorial pass before delivery. When decisions change, the skill SHALL reconcile the affected prose, worked examples, tables, diagrams and contracts while preserving unresolved issues. When OpenSpec already owns intent, the proposal SHALL be a readable synthesis linked to that source, with scope and decision changes reconciled there rather than maintained independently. A design-only request SHALL end with the proposal and unresolved questions. Creating it SHALL NOT activate implementation, pipeline coordination or additional approval gates. Supported hosts SHALL expose equivalent proposal behavior through their native entries.

#### Scenario: An agreed decision changes
- **WHEN** the operator changes a decision represented in the proposal
- **THEN** every affected explanation, example, rule table, diagram and data contract uses the current decision
- **AND** unresolved issues remain visible and canonical intent is reconciled when applicable

#### Scenario: Design accompanies an existing OpenSpec change
- **WHEN** a proposal is requested for a change that already has requirements and design decisions
- **THEN** the proposal explains those sources to its readers, links them and reconciles changes without creating another editable task plan or replacing OpenSpec's file layout

#### Scenario: A standalone proposal is requested in Obsidian mode
- **WHEN** the operator asks only for a solution proposal using any supported host
- **THEN** the agent delivers it in the configured workspace without a local duplicate, mandatory repository initialization, implementation or pipeline activation
