# Solution proposal

Prepare two standalone working drafts, a detailed engineering proposal and
a concise proposal for the team. Export them as PDFs by default. Honor an
explicit choice of documents, format or destination. Put the system name in
each title and distinguish the two purposes. Make each document understandable
without the originating chat or the other document. Use the requested
language, defaulting to the language of the conversation. Organize sections
around the reader's questions and put functional content first.

## Detailed proposal

### Functional proposal

Start with who uses the system, what triggers it, which rules determine each
outcome and what people can observe. Explain the problem and the general
capability before the first delivery's scope, exclusions and acceptance criteria.
Cover alternate paths and errors. Use worked examples or rule tables where they
clarify behavior, and ensure each example follows the rule it illustrates.
Show applicable wireframes beside the behavior they explain, including relevant
states and interactions.

Expose assumptions, risks and decisions still needed. Explain the product
consequences of technical choices here when they affect experience, cost,
scope or delivery. Identify verified facts, recommendations and unknowns.
Label estimates with their assumptions.

### Technical design

Describe the affected current system and proposed responsibilities, boundaries,
integrations and interfaces. Explain which component owns each responsibility,
why the chosen approach fits, its operating costs and meaningful alternatives.
Identify the factors driving operating costs and record unknowns when amounts
cannot be estimated.

For a multi-service flow, show who calls whom and what data moves. Use the
Excalidraw workflow to create the diagram or update the existing one.
[excalidraw-diagram](../../excalidraw-diagram/SKILL.md)

Document new and changed interfaces at the level needed to implement them.
Identify the producer, consumer, operation or trigger, inputs and outputs,
and applicable failure and recovery behavior. For a proposed data exchange,
include a representative DTO with field names, types, requiredness and how
the consumer uses each field. Keep examples consistent with the business
rules and data on the diagram.

For database changes, include the affected current and proposed model, covering
fields, relationships, constraints and migration effects. Justify each newly
persisted field with its producer, consumer and reuse or derivation options.
For frontend work, keep the wireframe with the functional part and explain its
technical implications here. [sketch](../../sketch/SKILL.md)

Embed useful visuals so the proposal is readable on its own. Link editable
sources as supporting assets.

Describe implementation increments and dependencies. Explain how to verify
the acceptance criteria and applicable failure paths. Include migration,
rollback, operating procedures and measurable quality needs where applicable.
Mark missing facts and open decisions where they affect implementation.

## Team presentation document

Lead with the functional proposal. Give the team enough context to discuss
who uses the system, what starts the flow, the proposed rules and outcomes,
and the scope of the first delivery. Keep the detail to what the team needs
to understand and discuss the proposal.

Close with a short technical section about what the proposal introduces.
For each new or changed interaction, name the participants and the new
exchange or behavior. Explain what each new DTO carries and why, or summarize
only the change to an existing DTO. Keep unchanged flows and full field
definitions in the detailed proposal where relevant. If communication and
contracts stay the same, say so in one sentence.

## Deliver and revise

Save each document as its own deliverable in the selected workspace. In a
file workspace, use distinct filenames. In a Page workspace, retain both links
in the bound effort Page. Link editable visuals as supporting assets. Honor an
explicit request for one document at the depth its audience needs.

Keep the editable sources in the bound workspace. If OpenSpec owns the intent,
link and reconcile its requirements and decisions there. Show which decisions
the operator has confirmed, which are proposed, and which questions remain
open. Apply feedback to the parts it covers. If a previously confirmed rule
changes, bring the affected decisions back to review and carry forward the
other confirmations. Update both drafts wherever the change affects prose,
examples, tables or contracts. If a flow changes, revise the editable
Excalidraw scene and refresh its embedded view.

Before delivery, apply the `write-documents` editorial pass to both documents.
Resolve contradictions and keep open decisions visible where they matter.
Check that Operations can explain the proposed behavior from the presentation
and Engineering has the implementation detail in the detailed proposal.
[write-documents](../../write-documents/SKILL.md)

Mark both PDFs as drafts for review in the document language and identify the
same source revision on each. Reflect explicit operator sign-off only for the
scope and revision they confirmed. Editorial review and export do not grant
approval or implementation authority. Read back each PDF and check at its
intended size that tables, examples and diagram labels are legible. If an
export is unavailable, keep the editable draft and identify the pending PDF.

## Industry references

- Shared product context and concise requirements. [Atlassian PRD](https://www.atlassian.com/agile/product-management/requirements)
- Content and detail adapted to readers. [arc42 stakeholder needs](https://docs.arc42.org/tips/1-20/)
- People, systems and boundaries before technical detail. [C4 context](https://c4model.com/diagrams/system-context)
- Malte Ubl's account of decisions and trade-offs. [Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/)
