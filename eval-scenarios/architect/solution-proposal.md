---
name: solution-proposal
mode: design
difficulty: medium
needs_scaffold: false
---

# Design — proposal for product and development

Evaluate the artifact produced through the current design skill. Retain outputs
in the assigned workspace, outside Git. Give the actor only Input and Context;
an independent reader uses the criteria below, not an actor self-report.

## Input

Prepare a development proposal I can present to a Product Owner and hand to
another developer. Add private article favorites to a knowledge app. Users can
mark/unmark an article and filter their own favorites. Shared favorites, tags
and notifications are out of scope. Design only; do not implement.

## Context

The fictional app uses PostgreSQL with users(id) and articles(id,title).
The authenticated session supplies user_id. React has article list and detail
views. Volume, latency targets and delivery dates have not been established.
Main supplies an absolute local or Obsidian workspace and the current skill
location for the host being evaluated; no production account or repository is
needed. Existing data and behavior above are the fixture's verified facts.

Run these bounded variants independently as useful, recording which ran:

- Long proposal: provide enough affected integrations and error cases to need
  substantial technical detail; do not request multiple documents.
- Explicit split: ask for separate PO and developer documents.
- Existing OpenSpec: supply canonical requirements/design for the same feature,
  including exclusions; request a proposal based on that existing intent.
- Workflow only: request a proposal to let a CLI accept a local config-file
  argument; state that there is no database or frontend change.

## Expected Behaviors

- One self-contained proposal with functional context before technical detail;
  the long variant stays in one document with useful navigation.
- The PO can explain value, scope, business behavior, errors, acceptance and
  unresolved decisions without needing the technical section or original chat.
- Developers can identify responsibilities, interfaces, justified decisions,
  alternatives, implementation increments and checks without guessing scope.
- The favorites model explains current/proposed data, justified fields,
  constraints and migration; UI wireframes explain relevant states and flows.
- Product consequences of technical choices appear in the functional part;
  unknown targets and estimates remain assumptions, not invented commitments.
- Only explicit split creates separate audience narratives. Source diagrams
  and canonical OpenSpec files can remain supporting assets.
- Existing OpenSpec is explained and linked faithfully; changes reconcile there
  without a competing task plan. Workflow-only work invents no UI or database.
- The selected workspace is used without a duplicate local copy or automatic
  implementation/pipeline activation.

## Anti-Patterns

- Splitting by length, leaving the reader only links, or relying on chat context.
- Adding speculative columns, integrations, SLOs, dates or unrelated sketches.
- Claiming that projection checks prove live host activation or comprehension.
- Scoring required phrases/headings instead of inspecting the actual proposal.

## Output Criteria

Review the actual file set and content against supplied facts. Record concrete
evidence and deficiencies per audience and variant, including source fidelity
and side effects. Record the host, selected skill revision and number of samples.
Run identical applicable input through other hosts only when available and
authorized; missing host execution remains an explicit coverage limit.

## Pass-Bar Declaration

- minimum_pass_rate: 1/1 for each executed variant; report unrun variants separately
- failing_dimensions_allowed: 0 on source fidelity, audience delivery and scope boundaries
- rationale: bounded artifact evaluation supports this change; one sample does not establish repeatability or native-host parity, and findings remain advice for Main
