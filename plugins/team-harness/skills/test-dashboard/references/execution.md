# Batch execution and results

Use this contract when connecting a consumer dashboard to its HTTP adapter and
existing frontend runners. Keep the adapter in the consumer project and reuse
its server, test tools and transport. The endpoint names below are reference
shapes to adapt, not a hosted TH API or a prescribed web framework.

## Submission

A minimal local service can expose `POST /test-runs` and `GET /test-runs/:runId`.
Use an existing equivalent transport when available. Submission identifies:

```json
{
  "batchId": "login-mixed",
  "caseIds": ["auth-ready", "ui-login"],
  "environment": "local"
}
```

Resolve `batchId` to a validated project batch. When supporting uploaded batch
JSON, validate it through the same contract before registering or running it.
Reject unknown/duplicate case IDs, empty selections, missing prerequisites,
unknown environments, missing variables or unresolved service/runner bindings.
An invalid request starts no execution and returns field/case diagnostics.
Never accept command strings, executable paths or arbitrary service origins
from browser-submitted batch data.

Return a unique `runId` and an initial snapshot promptly. Freeze the batch
revision/content identity, selected case IDs and environment for that run so
later edits or a changed filter cannot change what is executing. Retrying a
submission after an uncertain response must reconcile the original run first;
use a submission key when the consumer supports deduplication. A deliberate
rerun has a new run identity.

## Execution adapters

**API:** resolve the case's service through trusted server-side project
configuration for the selected environment. Validate the substituted relative
path and final destination against that service; reject cross-origin redirects
and batch attempts to replace the origin. Resolve only approved environment
variables, send the real HTTP request with a finite deadline, and compare status,
JSON equality and presence assertions. A response failure is a failed case;
transport/configuration failure is an execution error with sanitized detail.

**Frontend:** map the registered runner profile and test selector to the
project's existing executable, fixed argument construction, working directory
and result parser. Use direct argument arrays rather than a shell command
assembled from batch strings. Validate selector semantics so input cannot turn
into additional flags or arbitrary commands. Resolve which tests the runner
actually collected; a selected identity without matching result evidence is
unverified, even when the process exits zero.

**Mixed:** schedule by dependencies and preserve each case identity when
normalizing both adapters. Do not start a dependent before its prerequisites
pass. If a runner only supports a broader suite, expose the actual execution
scope before running; do not claim that a case-only request was honored.

Keep finite case/run deadlines and bounded output. Avoid overlapping executions
when they share accounts, ports or fixtures. Reuse supported cancellation and
process-tree cleanup; do not promise cancellation when the runner cannot stop.
Never automatically retry a mutating request or flaky browser flow without the
consumer's declared retry/fixture policy.

## Result shape

Keep results addressable by run ID and case ID, with:

- Status: `not_run`, `queued`, `running`, `passed`, `failed`, `skipped`, `blocked`,
  `cancelled` or `error`; render readable labels in the consumer interface.
- Observed start/end times and duration when known.
- Expected versus actual assertions for API cases, including HTTP status and
  a bounded, redacted response preview.
- Failure or unavailable reason, runner identity and evidence references such
  as logs, screenshots, traces or report links when actually produced.

Example result entry:

```json
{
  "caseId": "auth-ready",
  "status": "passed",
  "durationMs": 42,
  "assertions": [{ "field": "status", "expected": 200, "actual": 200, "passed": true }],
  "evidence": []
}
```

Missing matching results for a required selected case cannot become `passed`.
API cases need passing declared assertions; frontend cases need a matched
per-test outcome from the existing automation, even if its reporter does not
expose individual assertions. Use `error` with reason `not_collected` when the
runner provides no matching outcome. Distinguish a failed expectation from an infrastructure/configuration
error and label blocked dependents. Keep skipped, cancelled, unexecuted and
unverified cases visible in counts; aggregate success requires all selected
required cases to pass. Cases outside the selection remain outside its pass rate.

Render batch labels, response bodies and logs as untrusted text. Redact
credentials, authorization headers, cookies, tokens and sensitive fixture data
before retaining or returning evidence. Evidence references resolve only within
the consumer's allowed artifact storage. Local execution binds to loopback;
a shared deployment needs the consumer's authentication and execution controls.
Browser-delivered static HTML alone cannot securely run host commands or keep
API credentials private.

## Verification in the consumer

Exercise valid/invalid batch import, flow filtering, selection, prerequisites,
progress and result detail. Use the existing permitted local test environment
to verify one API case, one frontend case and their mixed execution when both
are in scope. Check a failed assertion, an unavailable runner and a blocked
dependent; verify that an empty collection is not green.

Use `ui-design`'s rendered assessment for interface changes. Record the actual
environment, commands/cases, results and unavailable evidence. Hermetic adapter
tests verify the wiring; a real service/browser run is still needed to claim
functional validation of the application.
