---
name: test-dashboard
description: Create or adapt a simple functional test dashboard in a consumer project, with selectable API and frontend batches and per-case results. Use after development is ready for functional validation.
---

# Test dashboard

Prepare a clean interface for inspecting and running functional cases in the
consumer application. A functional API case consumes the actual endpoint and
checks its response; frontend cases use the project's existing automation.
Keep suite authoring outside the default scope.

## Establish the target

Reuse [workspace](../workspace/SKILL.md) and the operator's selected application,
feature, environment and endpoint. Inspect its instructions, design records,
stack, service/API definitions, existing cases, test commands and result formats.
The application owns the dashboard, batches and runner configuration. An installed
TH package is a source of guidance and resources, not the application checkout.
Do not generate the dashboard in Team Harness merely because the skill lives there.

Reuse a suitable dashboard and runner before introducing another. Keep a new
dashboard local by default; shared hosting or CI execution follows the requested
scope. Resolve a missing target or material execution decision before dependent
work, while continuing useful independent preparation.

## Prepare the cases and batches

Read [the batch guide](references/batches.md) when preparing, importing or changing
cases. It defines the shared format, API requests and assertions, frontend runner
references, variables and dependencies. Adapt the relevant complete example:

- [API batch](examples/api.json)
- [Frontend batch](examples/frontend.json)
- [Mixed batch](examples/mixed.json)

Preserve existing cases and identifiers when adding another feature. Connect
existing tests rather than inventing a test suite, endpoint or frontend selector.
Represent missing automation as a concrete preparation gap; ask for suite authoring
only when it is a separate material decision.

Validate each batch before submission with the packaged helper:

```sh
node <installed-skill-root>/scripts/validate-batch.mjs <batch.json>
```

This checks data structure and dependencies offline. It neither executes tests nor
proves that configured services, variables, runner profiles or selectors exist.
The consumer must also validate those bindings before starting a run.

## Build a simple interface

Use [ui-design](../ui-design/SKILL.md) when creating or materially changing the
interface. Pass the actual consumer context and this brief: a developer or QA
operator validates finished functionality by finding cases, selecting them,
running a batch and inspecting failures. Reuse incumbent components and tokens.
Follow its structural preview and rendered-assessment contracts; report an
unavailable visual capability honestly. Ordinary test execution reuses the
settled interface without restarting design.

Default to one working surface:

- Feature/flow filter, search and the selected environment.
- Readable case table: selection, case name, service/type, status and duration.
- A clear action to run the selected cases or the current flow, with an explicit count.
- Expandable case detail for request/expectation, actual result, errors and evidence.

Show empty, invalid-batch, queued, running, failure and recovery states. Preserve
keyboard selection and focus; use text with status colors. Keep case inspection
primary and add metrics, navigation or history only when they serve the request.
Keep technical runner configuration out of the everyday execution flow.

## Connect submission and execution

Read [execution and results](references/execution.md) before implementing or
changing the consumer adapter. Send an explicit batch/selection/environment,
return a run ID and collect results for the selected case identities. APIs run
through a server-side HTTP adapter; frontend cases select registered existing
runners. A batch is data, not a shell program.

Verify batch import, selection, dependencies, a real authorized run and per-case
result inspection in the target project. Exercise failure and unavailable-runner
handling. Keep requests and processes bounded, preserve native permissions and
the existing execution scope, and report missing live services or test evidence.
Do not treat process exit zero, a mock response or a visual preview as proof that
the selected functional cases passed.

## Deliver

Provide the consumer dashboard location and start command, batch location,
configured service/runner mappings, how to add a case or send a batch, and the
actual validation results and limits. Keep working notes in the selected workspace;
maintain the reusable dashboard and batch documentation in the consumer project.
