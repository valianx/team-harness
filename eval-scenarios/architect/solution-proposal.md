---
name: solution-proposal
mode: architecture-design
difficulty: medium
needs_scaffold: false
---

# Architecture design — proposal from agreed decisions

Review the deliverables produced through the current architecture-design skill and
its proposal alias. Retain outputs in the assigned workspace, outside Git. Give
the actor only Input and Context, with Context preceding Input as conversation
history. An independent reader uses the supplied facts and criteria below.

## Input

```text
$team-harness:architecture-proposal
```

## Context

Main supplies the selected workspace and the current skill location for the host
being reviewed. Use its native invocation form for the same alias when required.
No production account or repository is needed. The following operator messages
are the agreed conversation history and verified facts for the fictional system.
Preserve their order, including the later decision change.

> El sistema se llama Control de pagos. Operations revisa los pagos que siguen
> pendientes cuando el proveedor no confirma el resultado. Queremos documentar
> el acuerdo para que puedan usarlo Operations y Engineering. Solo
> diseño, sin implementar. La capacidad general debe servir para distintos
> proveedores. La primera entrega cubrirá únicamente Banco Norte y pagos en CLP.
>
> Quedamos en abrir una revisión automáticamente cuando un pago lleve 15 minutos
> pendiente desde su creación. Antes de ese plazo no se abre. Operations verá el
> identificador del pago, proveedor, moneda, tiempo pendiente y motivo en la cola
> de revisiones del backoffice. Cada pago tendrá una sola revisión abierta. Las
> comprobaciones repetidas no deben duplicarla. Si el proveedor confirma antes de
> abrirla, no se crea. Si confirma después, la revisión se cierra y desaparece de
> la cola abierta, conservando el historial. Una caída del proveedor mantiene el
> pago pendiente. Cuando corresponda abrir la revisión, su motivo queda visible.
> Reembolsos y conciliación contable quedan fuera.
>
> Ya existen payments-core, providers-bridge, review-service y el backoffice.
> payments-core conserva el estado y la fecha de creación del pago en PostgreSQL.
> providers-bridge consulta al proveedor y entrega el resultado a payments-core.
> Ese intercambio conserva PaymentStatus con paymentId, provider, status y
> observedAt. Tanto el flujo como ese DTO siguen sin cambios.
> review-service conserva las revisiones y atiende la cola del backoffice. Cada
> equipo mantiene su servicio. El backoffice usa React y ya muestra una cola
> abierta y el detalle con historial. Acordamos añadir un intercambio de
> payments-core a review-service con ReviewInstruction. payments-core decide
> cuándo abrir o cerrar la revisión. El DTO lleva paymentId para identificar el
> pago y evitar duplicados, provider y currency para la cola y el alcance del
> piloto, paymentCreatedAt para mostrar el tiempo pendiente, action para OPEN o
> CLOSE y reason para mostrar el motivo y conservarlo en el historial.
> review-service aplica la instrucción y conserva una sola revisión abierta.
> La propuesta debe justificar la arquitectura y el coste de operación. Aún falta
> acordar quién atenderá las revisiones fuera del horario de Operations. Tampoco
> tenemos volumen de pagos, coste objetivo, latencia objetivo ni fecha de entrega.
>
> Cambiemos el plazo acordado a 30 minutos desde la creación del pago. Lo demás
> sigue igual. Un pago de Banco Norte en CLP que siga pendiente a los 20 minutos
> todavía no abre revisión. Al cumplir 30 minutos se abre una sola vez. Dejemos
> pendiente la cobertura fuera de horario. El resultado debe quedar en el espacio
> de trabajo seleccionado.

Apply these independent controls when reviewing the affected behavior. Record
which controls were exercised and the supplied additional context.

- Long proposal: provide enough affected integrations and error cases to need
  substantial technical detail. Keep the default two deliverables.
- Explicit scope or destination: request only the team document, or provide
  separate explicit destinations. Verify the requested count, coverage and paths.
- Existing-contract addition: agree an added field on an existing exchange.
  Verify that the team's overview explains the addition and its consumer use
  with only the context needed to identify the affected exchange.
- Existing OpenSpec: supply canonical requirements/design for the same feature,
  including the current 30-minute rule and exclusions. Request a proposal based
  on that intent and verify source reconciliation for a later rule change.
- Existing draft or issue: supply the same agreed facts through a draft or issue
  instead of conversation history. Request the final proposal and preserve its
  unresolved coverage decision.
- Explicit language: request English for the final document while keeping the
  Spanish conversation. The explicit document-language request takes precedence.
- Legacy entry: request the same proposal through the host's existing `design`
  invocation. Apply the same document defaults. In an active coordination fixture,
  preserve its plan and ownership instead of creating another coordination flow.
- Workflow only: request a proposal to let a CLI accept a local config-file
  argument. State that there is no database, frontend, component-exchange or DTO
  change. Verify that the short document closes with a sentence saying that
  communication and contracts stay the same.

## Expected Behaviors

- The alias alone produces two Spanish documents identified by the agreed system
  name and their purpose, without another brief, structure request or discovery
  restart. Explicit language, coverage and destination requests take precedence.
- The full engineering proposal provides low-level implementation detail. The
  separate short team document explains the general capability before the Banco
  Norte/CLP pilot and its acceptance criteria, ending with the new exchange and
  DTO overview. Both are readable without the chat. The long control keeps the
  engineering detail navigable and the team document short.
- Headings address the reader's questions. An Operations reader can explain who
  uses the system, when a review opens, how confirmation and repeat checks change
  the outcome, what appears in the backoffice and what remains undecided.
- The 20-minute example creates no review. The 30-minute example creates one.
  Both documents' affected explanations, tables, examples, diagrams and contracts
  agree with the current rule, including the time origin. The earlier 15-minute
  decision is replaced as the effective rule.
- Engineering can identify responsibility for payment state, provider queries,
  review lifecycle and the backoffice queue in the full proposal, with relevant
  interfaces, persistence, failure handling and checks. The architectural choice
  has a rationale and operating-cost implications.
- An embedded communication map produced or reused through the existing
  Excalidraw skill shows the new payments-core to review-service exchange. Its
  ReviewInstruction explains each field's consumer use consistently with the
  agreed responsibilities. Editable sources remain accessible.
- The team document's closing overview covers that new exchange and DTO, using
  existing components only to identify its participants. It omits the unchanged
  providers-bridge to payments-core flow and PaymentStatus DTO. The full proposal
  preserves those existing facts wherever needed for the engineering design.
- Proposed data or UI changes justify persistence and describe relevant states,
  flows, constraints and migration effects through the applicable sketch guidance.
- Product consequences appear in the team document's functional explanation.
  Both documents preserve unknown targets, costs and estimates as open inputs and
  keep the out-of-hours decision visible after the threshold change.
- Source diagrams and canonical OpenSpec files remain supporting assets. Changes
  reconcile in canonical intent without a competing task plan. Workflow-only work
  invents no UI, database, exchange, DTO or empty technical section.
- Both documents receive the write-documents editorial pass and use the selected
  workspace unless an explicit destination overrides it, without duplicate local
  copies or automatic implementation/pipeline activation. Existing coordination
  ownership and authorization are preserved.

## Anti-Patterns

- Delivering one document by default, expanding the short team document into the
  full engineering design, leaving the reader only links or relying on chat context.
- Repeating the unchanged provider-status flow or DTO in the team's closing
  overview, or inventing an exchange when the change introduces none.
- Returning an outline, requesting the already agreed brief or requiring the
  operator to specify the document structure after invoking the alias.
- Keeping the earlier threshold in an example, diagram, rule table or contract,
  or silently resolving the open out-of-hours coverage decision.
- Adding speculative columns, integrations, SLOs, dates or unrelated sketches.
- Claiming that projection checks prove live host activation or comprehension.
- Scoring required phrases/headings instead of inspecting the actual proposal.

## Output Criteria

Inspect the actual file set and both documents against the conversation's facts and
current decision. Record concrete passages or visual evidence and deficiencies
for Operations, Engineering, source fidelity, reconciliation and delivery side
effects. Confirm the applicable editorial and visual skill use through retained
evidence, without requiring a prescribed sentence in the proposal. Record the
host, selected skill revision and controls reviewed. Unexecuted host behavior and
controls remain explicit coverage limits. This fixture supplies acceptance
criteria; editing it does not establish actor execution or reader comprehension.

## Pass-Bar Declaration

- minimum_pass_rate: 1/1 for each executed control; report unrun controls separately
- failing_dimensions_allowed: 0 on source fidelity, audience delivery and scope boundaries
- rationale: independent review of the actual document supports acceptance; unexecuted behavior remains unverified and findings remain advice for Main
