# solution-proposal Specification

## Purpose
Develop a full engineering proposal and a short team document as revisable working drafts through architecture-design, using shared decisions and agreed context without depending on the originating chat or creating a parallel development process.

## Requirements

### Requirement: Architecture design reuses the agreed context

The principal skill SHALL be named `architecture-design`, with English instructions. `architecture-proposal` SHALL explicitly request its proposal deliverables. Existing `design` invocations that request a proposal SHALL use the same defaults. Invocations within a selected coordination workflow SHALL retain that workflow's ownership and applicable endpoint. The skill SHALL support standalone invocation after decisions have been agreed in conversation and SHALL reuse a supplied draft or issue as source context. Sufficient agreed context SHALL lead to complete deliverables without requiring the operator to repeat the brief or request their structure. Missing material decisions SHALL remain explicit.

#### Scenario: The idea is ready to document
- **WHEN** the operator has agreed the design in Spanish and invokes only `architecture-proposal`
- **THEN** the skill delivers a full Spanish engineering proposal and a short Spanish team document for review that can each be read without the chat, using the agreed facts and current decisions
- **AND** the short document uses the subtitle "Propuesta de arquitectura" and the full document uses "Propuesta de arquitectura al detalle"
- **AND** it does not restart discovery, request the brief again or return only an outline

#### Scenario: A draft or issue supplies the design
- **WHEN** the operator requests a proposal based on an existing draft or issue
- **THEN** the skill uses that source, preserves unresolved decisions and requests only information material to the deliverables that the source and existing context do not establish

#### Scenario: An existing design invocation requests the same deliverable
- **WHEN** the operator requests a solution proposal through `design`
- **THEN** the deliverables follow the same language, structure, source-fidelity and delivery defaults as `architecture-proposal`

#### Scenario: Design continues within coordination
- **WHEN** an existing `design` invocation continues design in an active selected workflow
- **THEN** it reuses that workflow's plan, ownership and authorization without creating a competing coordination process or automatically requiring a separate audience proposal

### Requirement: Architecture design delivers two complementary documents

By default, the skill SHALL develop a full engineering proposal and a separate short team document as revisable working drafts. Both SHALL share a functional title that describes the capability or outcome in the users' terms. Each SHALL use a distinct subtitle for its purpose. The skill SHALL use the explicitly requested document language, defaulting to the language of the conversation. Headings SHALL answer its readers' questions. Both documents SHALL share the same scope, current decisions, acceptance criteria and unresolved issues, with detail proportionate to their purpose. The skill SHALL honor explicit operator requests for a different document count, coverage, format or destination. Length SHALL NOT create additional narrative documents. Visual assets and canonical workflow records MAY support the two deliverables.

Default review delivery SHALL export two PDFs from the same identifiable working revision and retain their editable sources in the selected workspace. PDF export SHALL preserve the drafts' review context. If a requested format cannot be generated, the skill SHALL report that limit and identify the available source instead of claiming the export succeeded.

#### Scenario: A proposal serves product and development
- **WHEN** the operator requests a proposed solution for a PO and developers
- **THEN** the engineering proposal supplies the complete implementation design and the short team document explains functional behavior before its limited technical overview
- **AND** each document is understandable without reading the chat

#### Scenario: A provider delivers part of a capability
- **WHEN** the proposed player sign-in uses an external identity provider
- **THEN** both main titles describe players signing in to the casino and omit the provider name
- **AND** the proposal names the provider where its responsibilities, integration and pricing matter

#### Scenario: The proposal grows
- **WHEN** the solution requires substantial engineering detail
- **THEN** the engineering proposal retains that detail with useful navigation and the team document remains short

#### Scenario: The operator specifies the deliverables
- **WHEN** the operator explicitly requests only one document or specifies different coverage, formats or destinations
- **THEN** the skill follows that request while preserving consistent shared decisions across the requested deliverables
- **AND** a request for one Markdown document delivers that document alone

#### Scenario: Drafts are exported for review
- **WHEN** the operator requests the default review delivery
- **THEN** two review PDFs represent the same identifiable revision and their editable sources remain in the selected workspace
- **AND** each PDF has a date-only running header and final-quality presentation without draft or review legends, while its filename or metadata identifies the source revision
- **AND** exporting them does not declare finality or approval and does not authorize implementation

### Requirement: Functional content supports product decisions

The team document SHALL start with the problem, who uses the system, expected outcomes, what triggers its behavior, the rules determining outcomes and what users observe. It SHALL explain the general capability before the scope and observable acceptance criteria of the first delivery or pilot. Relevant alternate/error behavior, exclusions, assumptions, risks and unresolved decisions SHALL be explicit. Applicable wireframes SHALL accompany the behavior they explain. Technical choices that affect user experience, cost, scope or delivery SHALL have their product consequences explained here. Unverified facts and estimates SHALL remain identified assumptions in both documents.

#### Scenario: The PO reads only the functional part
- **WHEN** the PO evaluates the team document's functional explanation
- **THEN** they can understand the intended behavior, its acceptance and the trade-offs requiring a product decision
- **AND** the opening of either standalone proposal identifies the affected user, the observable change and the product decision already made or still needed

#### Scenario: The recommended service costs more than another option
- **WHEN** the team compares vendor options at its expected usage
- **THEN** it can identify the user need that justifies the spend, which option meets it, the price basis and source, and any terms still to confirm
- **AND** the estimate distinguishes the provider price from implementation and operating costs

#### Scenario: Operations explains when behavior starts
- **WHEN** an operations reader reads the functional explanation without technical details or the originating conversation
- **THEN** they can explain who uses the system, the triggering conditions, how its rules determine the result and the outcome users observe
- **AND** the general behavior is established before the first delivery's narrower scope and acceptance criteria

### Requirement: The engineering proposal supports implementation review

The engineering proposal SHALL include the agreed functional scope and the full low-level design needed to implement it. It SHALL explain the architectural decision and rationale, operating cost, component responsibilities and boundaries, relevant integrations, interfaces, data contracts, meaningful alternatives, dependencies, implementation increments and verification approach. For a multi-service flow, the skill SHALL reuse the existing Excalidraw skill to embed a communication map. Proposed exchanges SHALL include representative DTOs and each field's consumer use. It SHALL reuse sketch guidance for affected data models and frontend wireframes, justify new persistent data and preserve useful existing designs. Migration, rollback, operation and measurable quality concerns SHALL be addressed when applicable. Missing material inputs SHALL remain explicit. Unaffected topics SHALL NOT generate speculative designs or empty annexes.

#### Scenario: Engineering receives a multi-service proposal
- **WHEN** the proposed solution exchanges data between services
- **THEN** the engineering proposal identifies component ownership, the selected architecture and its rationale and operating cost with implementation-level detail
- **AND** an embedded communication map and a representative DTO explain the calls, exchanged data and each field's consumer use

#### Scenario: A material product promise relies on an unverified capability
- **WHEN** the promised outcome depends on behavior another component may already provide
- **THEN** the detailed proposal identifies the owner, the proposed change or assumed dependency and the observable test for the promise
- **AND** it identifies who can confirm reuse and explains the consequence for scope, cost or rollout in both proposals when the team decision depends on it

#### Scenario: The solution changes persistence and a screen
- **WHEN** the proposal changes a data model and frontend behavior
- **THEN** the document includes the affected current/proposed model with justified fields and migration considerations, plus wireframes and relevant UI states, sufficient for a developer to understand the agreed boundaries

#### Scenario: The solution changes neither database nor frontend
- **WHEN** the proposal only changes a workflow skill
- **THEN** the document describes that workflow and its checks without inventing database columns, screens or unrelated infrastructure

### Requirement: The team document closes with the new exchanges

After its functional explanation, the team document SHALL summarize what the design introduces in component communication and DTOs. For a new exchange, it SHALL identify the participants, what data moves and its purpose. For an existing exchange or DTO, it SHALL cover only the proposed change. Full field definitions belong in the engineering proposal. When communication and contracts stay the same, the team document SHALL close with a single sentence stating that.

#### Scenario: The design combines an unchanged flow and a new exchange
- **WHEN** an existing provider-status flow and DTO remain unchanged and the proposal adds a review-instruction exchange
- **THEN** the team document's technical overview explains the new review exchange, its participants and DTO
- **AND** it uses existing participants only as necessary context and leaves the unchanged flow and DTO out of the overview

#### Scenario: The design introduces no exchange change
- **WHEN** the proposal changes a local CLI argument without adding or changing component exchanges or DTOs
- **THEN** the team document explains the functional change and closes with a sentence confirming that communication and contracts stay the same

#### Scenario: An existing exchange changes
- **WHEN** an existing notification also reports closure and its DTO gains a closure reason
- **THEN** the team overview explains the new trigger and how the recipient uses the reason, leaving unchanged behavior and fields out

### Requirement: Proposals preserve workflow ownership and portability

Both documents and supporting assets SHALL use the selected workspace while honoring explicit destinations. Consumer working artifacts SHALL stay out of commits unless they have a necessary durable role. The skill SHALL reuse write-documents for an editorial pass before delivery. A decision change SHALL reconcile affected prose, worked examples, tables, diagrams and contracts across both documents while preserving unresolved issues. When OpenSpec owns intent, the documents SHALL synthesize and link that source, with scope and decision changes reconciled there. A design-only request SHALL end with the requested review deliverables and unresolved questions. Creating or exporting them SHALL NOT authorize implementation, activate pipeline coordination or introduce approval gates or formal review states. Supported hosts SHALL expose equivalent proposal behavior through their native entries.

#### Scenario: An agreed decision changes
- **WHEN** the operator changes a shared decision
- **THEN** every affected explanation, example, rule table, diagram and data contract across both documents uses the current decision
- **AND** unresolved issues remain visible and canonical intent is reconciled when applicable

#### Scenario: Design accompanies an existing OpenSpec change
- **WHEN** a proposal is requested for a change that already has requirements and design decisions
- **THEN** both documents explain and link those sources and reconcile changes without creating another editable task plan or replacing OpenSpec's file layout

#### Scenario: A standalone proposal is requested in Obsidian mode
- **WHEN** the operator requests a design-only solution proposal using any supported host
- **THEN** the agent delivers both documents in the configured workspace without a local duplicate, mandatory repository initialization, implementation or pipeline activation

### Requirement: Review preserves partial operator confirmation

The skill SHALL retain what the operator explicitly confirmed and what remains open in the existing document or workspace context. Confirmation SHALL identify the parts and source revision it covers and remain applicable to unchanged content in later revisions. A material change SHALL return only the affected parts to review and preserve unaffected confirmations. The updated documents and their exports SHALL keep this distinction visible without creating a separate approval ledger or competing source. Exporting a draft SHALL NOT imply approval of its contents, mark it final or authorize implementation.

#### Scenario: Partial feedback is followed by a material change
- **WHEN** the operator confirms the pilot and opening rule, leaves technical design open and later changes the opening threshold
- **THEN** the skill reconciles the affected content in both working documents and presents the threshold change for review
- **AND** the pilot confirmation and unresolved technical decisions remain recorded, while the updated PDFs share the revised source identity
