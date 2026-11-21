---
name: solution-proposal
mode: architecture-design
difficulty: medium
needs_scaffold: false
---

# Architecture design — proposal from agreed decisions

Review the working drafts produced through the current architecture-design skill and
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
- Partial feedback and revision: after the initial delivery, supply these operator
  messages in order and inspect the revised drafts and exports.

  > Confirmo el piloto Banco Norte/CLP y la apertura a los 30 minutos. Todavía
  > tengo que revisar el diseño técnico y el DTO. La cobertura fuera de horario
  > sigue abierta. Conserva estas confirmaciones parciales.
  >
  > Cambiemos solo el plazo a 45 minutos desde la creación del pago y déjalo para
  > revisión. A los 30 minutos todavía no se abre, a los 45 se abre una sola vez.
  > El piloto que confirmé sigue igual. Exporta otra revisión para compartir.

- Explicit scope, format or destination: request only the team document, specify
  an alternate format or provide separate destinations. Verify the requested
  count, format, coverage and paths. If generation is unavailable, inspect the
  reported limit and preserved editable source.
- Existing-contract addition: agree an added field on an existing exchange.
  Verify that the team's overview explains the addition and its consumer use
  with only the context needed to identify the affected exchange.
- Existing OpenSpec: supply canonical requirements/design for the same feature,
  including the current 30-minute rule and exclusions. Request a proposal based
  on that intent and verify source reconciliation for a later rule change.
- Existing draft or issue: supply the same agreed facts through a draft or issue
  instead of conversation history. Request the review drafts and preserve their
  unresolved coverage decision.
- Explicit language: request English for the review documents while keeping the
  Spanish conversation. The explicit document-language request takes precedence.
- Conditional reuse and vendor cost: say reuse of the one-open-review guarantee
  is unverified. Operations needs 90 days of accessible review history. Supply
  a fictional monthly quote at 1,000 reviews: USD 20 for seven days of history
  or USD 45 for 90 days. Ask which plan to fund and what happens to scope and
  budget if the team must build the guarantee. Keep unquoted costs open.
- Legacy entry: request the same proposal through the host's existing `design`
  invocation. Apply the same document defaults. In an active coordination fixture,
  preserve its plan and ownership instead of creating another coordination flow.
- Workflow only: request a proposal to let a CLI accept a local config-file
  argument. State that there is no database, frontend, component-exchange or DTO
  change. Verify that the short document closes with a sentence saying that
  communication and contracts stay the same.

## Expected Behaviors

- The alias alone produces two Spanish documents with a shared functional title
  about reviewing pending payments. The subtitles are "Propuesta de arquitectura"
  and "Propuesta de arquitectura al detalle" for the short and full versions,
  respectively. The provider appears where its role matters. The skill reuses
  the existing brief and honors explicit language, count, coverage, format and
  destination requests.
- Default delivery supplies two review PDFs from the same identifiable working
  revision and preserves their editable sources in the selected workspace. Both
  show just the date in the running header and present as finished documents
  without draft legends. Unresolved decisions remain visible where relevant.
  Exporting them grants no approval or implementation authorization.
- The full engineering proposal provides low-level implementation detail. The
  separate short team document explains the general capability before the Banco
  Norte/CLP pilot and its acceptance criteria, ending with the new exchange and
  DTO overview. Both are readable without the chat. The long control keeps the
  engineering detail navigable and the team document short.
- The opening identifies the affected user, the outcome and the product decision.
  Headings address the reader's questions. Operations can explain who uses the
  system, when a review opens, how confirmation and repeat checks change
  the outcome, what appears in the backoffice and what remains undecided.
- In the initial delivery, the 20-minute example creates no review and the
  30-minute example creates one.
  Both documents' affected explanations, tables, examples, diagrams and contracts
  agree with the current rule, including the time origin. The earlier 15-minute
  decision is replaced as the effective rule.
- With partial feedback, the existing document or workspace context retains the
  explicit pilot and opening-rule confirmations and the open technical/DTO and
  out-of-hours decisions. After the change to 45 minutes, both drafts and their
  PDFs reconcile affected content and identify the same revised source. Only the
  affected rule and its representations return to review, with the pilot
  confirmation preserved.
  The revised 30-minute example creates no review and the 45-minute example
  creates one. Neither the revision nor its export expands approval.
- Engineering can identify responsibility for payment state, provider queries,
  review lifecycle and the backoffice queue in the full proposal, with relevant
  interfaces, persistence, failure handling and checks. The architectural choice
  has a rationale and operating-cost implications.
- For each material promise, Engineering can locate the owner, the change or
  dependency and an observable test. In the conditional control, Product can
  explain what changes if reuse fails and what need justifies the vendor spend.
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
- Treating export as approval or final delivery, losing partial confirmations,
  reopening unaffected decisions or introducing a separate approval ledger,
  mandatory gate or formal review states.
- Adding speculative columns, integrations, SLOs, dates or unrelated sketches.
- Claiming that projection checks prove live host activation or comprehension.
- Scoring required phrases/headings instead of inspecting the actual proposal.

## Output Criteria

Inspect the actual file set, editable sources and review exports against the
conversation's facts, current decision and explicit partial confirmations.
Record concrete passages or visual evidence and deficiencies
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
