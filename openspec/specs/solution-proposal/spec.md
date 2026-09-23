# solution-proposal Specification

## Purpose
Make solution proposals understandable to Product Owners and actionable for developers through the existing design workflow, without depending on the originating chat or creating a parallel development process.

## Requirements

### Requirement: Design delivers one document for both audiences

The design skill SHALL deliver one reader-facing solution proposal with a clearly identified functional part before its technical part. It SHALL keep the proposal in one document regardless of length unless the operator explicitly requests separation. Supporting visual assets and canonical workflow records SHALL NOT become separate audience proposals by default.

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

The proposal SHALL explain the problem, users, expected outcomes, scope and exclusions, relevant flows and business rules, alternate/error behavior, observable acceptance criteria, assumptions, risks and unresolved decisions. Applicable wireframes SHALL appear with the functional explanation. Technical choices that affect user experience, cost, scope or delivery SHALL have their product consequences explained there. Unverified facts and estimates SHALL be identified as assumptions rather than commitments.

#### Scenario: The PO reads only the functional part
- **WHEN** the PO evaluates the proposal without reading technical details
- **THEN** they can understand the intended behavior, its acceptance and the trade-offs requiring a product decision

### Requirement: Technical content enables a proportionate handoff

The technical part SHALL describe the proposed responsibilities, boundaries, relevant integrations and interfaces, justified decisions and alternatives, dependencies, implementation increments and verification approach. It SHALL reuse sketch guidance for affected data models and frontend wireframes, justify new persistent data and preserve useful existing designs. Migration, operation and measurable quality concerns SHALL be addressed when relevant; missing material inputs SHALL remain explicit. Unaffected topics SHALL NOT generate speculative designs or empty annexes.

#### Scenario: The solution changes persistence and a screen
- **WHEN** the proposal changes a data model and frontend behavior
- **THEN** the document includes the affected current/proposed model with justified fields and migration considerations, plus wireframes and relevant UI states, sufficient for a developer to understand the agreed boundaries

#### Scenario: The solution changes neither database nor frontend
- **WHEN** the proposal only changes a workflow skill
- **THEN** the document describes that workflow and its checks without inventing database columns, screens or unrelated infrastructure

### Requirement: Proposals preserve workflow ownership and portability

The proposal SHALL use the selected local or Obsidian workspace, honor explicit output destinations and keep consumer working artifacts out of commits unless they have a necessary durable role. When OpenSpec already owns intent, the proposal SHALL be a readable synthesis linked to that source, with scope and decision changes reconciled there rather than maintained independently. A design-only request SHALL end with the proposal and unresolved questions; creating it SHALL NOT activate implementation, pipeline coordination or additional approval gates. Claude Code, Codex and OpenCode SHALL expose equivalent proposal behavior through their native entries.

#### Scenario: Design accompanies an existing OpenSpec change
- **WHEN** a proposal is requested for a change that already has requirements and design decisions
- **THEN** the proposal explains those sources to its readers, links them and reconciles changes without creating another editable task plan or replacing OpenSpec's file layout

#### Scenario: A standalone proposal is requested in Obsidian mode
- **WHEN** the operator asks only for a solution proposal using any supported host
- **THEN** the agent delivers it in the configured workspace without a local duplicate, mandatory repository initialization, implementation or pipeline activation
