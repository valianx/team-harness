# Solution proposal

Use the system name as the title. Make the proposal understandable without
the originating chat. Use the requested language, defaulting to the language
of the conversation. Organize sections around the reader's questions, such
as "When does Operations review a payment?" or "Who owns the review queue?"
End with technical design. Adapt
detail and headings to the facts of the solution.

## Functional proposal

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

## Technical design

Describe the affected current system and proposed responsibilities, boundaries,
integrations and interfaces. Explain which component owns each responsibility,
why the chosen approach fits, its operating costs and meaningful alternatives.
Identify the factors driving operating costs and record unknowns when amounts
cannot be estimated.

For a multi-service flow, show who calls whom and what data moves. Use the
Excalidraw workflow to create the diagram or update the existing one.
[excalidraw-diagram](../../excalidraw-diagram/SKILL.md)

For a proposed data exchange, include a representative DTO and explain how
the consumer uses each field. Keep field meanings and examples consistent
with the business rules and data on the diagram.

For database changes, include the affected current and proposed model, covering
fields, relationships, constraints and migration effects. Justify each newly
persisted field with its producer, consumer and reuse or derivation options.
For frontend work, keep the wireframe with the functional part and explain its
technical implications here. [sketch](../../sketch/SKILL.md)

Embed useful visuals so the proposal is readable on its own. Link editable
sources as supporting assets.

Outline implementation increments, dependencies and verification against the
acceptance criteria. Address migration, rollback, operation and measurable
quality needs where applicable. State missing material inputs rather than
inventing schemas, infrastructure, performance targets or delivery dates.

## One deliverable and coherent sources

Keep one logical proposal in the selected Page or file workspace. Honor explicit
destinations and formats. Use headings and a contents list when useful. Separate
narrative documents only when the operator asks.

For standalone design, this document holds the solution under discussion. If
OpenSpec already owns the intent, synthesize its requirements and decisions
faithfully, identify and link the canonical sources, and reconcile changes
there before refreshing the proposal. Keep task tracking in OpenSpec. On revision,
reuse the existing proposal and check changed decisions against every affected
explanation, example, table, diagram and interface contract.

Follow workspace guidance for working artifacts. Before delivery, apply the
`write-documents` editorial pass to resolve contradictions and surface open
decisions. Check that Operations can explain the behavior from the opening
sections and Engineering can identify ownership and interfaces from the
technical design.
[write-documents](../../write-documents/SKILL.md)

## Industry references

These sources inform content; the single-document default is TH's chosen
workflow preference, not a universal industry rule:

- [Atlassian PRD](https://www.atlassian.com/agile/product-management/requirements): shared product context and concise requirements.
- [arc42 stakeholder needs](https://docs.arc42.org/tips/1-20/): adapt content and detail to readers.
- [C4 context](https://c4model.com/diagrams/system-context): explain people, systems and boundaries before technical detail.
- [Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/): Malte Ubl's account of decisions and trade-offs, not an official Google standard.
