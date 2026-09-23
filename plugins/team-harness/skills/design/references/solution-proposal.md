# Solution proposal

Write for a Product Owner deciding what to build and a developer taking over
the work. Explain enough context that neither needs the originating chat.
Use the operator's language, a useful title and the two reading parts below.
These are content prompts: adapt depth and headings to the solution, without
inventing requirements to fill a template.

## Functional proposal

Start with the problem, affected users, expected outcome and recommended
solution. Explain scope and exclusions, the main journeys, business rules,
alternate paths and errors. Give observable acceptance criteria and show
applicable wireframes beside the behavior they explain, including relevant
states and interactions.

Expose assumptions, risks and decisions still needed. Explain the product
consequences of technical choices here when they affect experience, cost,
scope or delivery, even if their detailed rationale appears later. Distinguish
verified facts, recommendations and unknowns; label estimates with assumptions
instead of presenting them as commitments.

## Technical design

Describe the affected current system and proposed responsibilities, boundaries,
integrations and interfaces. Explain meaningful alternatives and why the chosen
approach fits the goal, including reuse or a smaller change when relevant.
Use context, component or sequence diagrams where they clarify decisions;
a complete C4 hierarchy is not a prerequisite.

For database changes, include the affected current/proposed model through
[sketch](../../sketch/SKILL.md): fields, relationships, constraints, migration
effects and justification for each new persisted field, including its producer,
consumer and reuse/derivation alternatives. For frontend work, keep the
wireframe with the functional part and explain technical implications here.
Embed useful visual representations in the document; link editable sources as
supporting assets. A collection of links alone is not a readable handoff.

Outline implementation increments, dependencies and verification against the
acceptance criteria. Address migration, rollback, operation and measurable
quality needs where applicable. State missing material inputs rather than
inventing schemas, infrastructure, performance targets or delivery dates.

## One deliverable and coherent sources

Deliver one Markdown document in the selected workspace, honoring an explicit
output destination or requested format. Keep long proposals navigable with
headings and a contents list when useful. Separate narrative documents only
when the operator asks; length alone is not a reason. Diagrams and editable
visual sources can remain supporting assets, not additional PO/dev proposals.

For standalone design, this document holds the solution under discussion. If
OpenSpec already owns the intent, synthesize its requirements and decisions
faithfully, identify and link the canonical sources, and reconcile changes
there before refreshing the proposal. Do not create another editable task
ledger or replace OpenSpec's files. Internal workflow records are not extra
audience deliverables. Reuse the existing proposal on revision.

Apply workspace artifact guidance: consumer working documents stay outside
commits unless a necessary durable role or explicit delivery request calls for
them. A design-only request ends at the proposal; it does not initiate a pipeline
or implementation. Before handing it over, read the functional part as a PO
and the full document as a developer, resolving contradictions and exposing
questions that still prevent a decision or implementation.

## Industry references

These sources inform content; the single-document default is TH's chosen
workflow preference, not a universal industry rule:

- [Atlassian PRD](https://www.atlassian.com/agile/product-management/requirements): shared product context and concise requirements.
- [arc42 stakeholder needs](https://docs.arc42.org/tips/1-20/): adapt content and detail to readers.
- [C4 context](https://c4model.com/diagrams/system-context): explain people, systems and boundaries before technical detail.
- [Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/): Malte Ubl's account of decisions and trade-offs, not an official Google standard.
