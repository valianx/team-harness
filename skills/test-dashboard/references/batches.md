# Writing functional test batches

Use this contract to prepare batches for a dashboard created with `test-dashboard`.
The [offline validator](../scripts/validate-batch.mjs) checks version 1 JSON.
Keep batches as ordinary files in the consumer's existing test-data layout; when
none exists, use `test-dashboard/batches/`. Show case names in the application's
language and preserve identifiers across edits and reruns.

## Common structure

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exactly `1`. |
| `id`, `name` | Stable batch identifier and readable label. |
| `cases` | Nonempty list of cases; IDs are unique within the batch. |
| Case `id`, `name` | Stable identity and readable description. |
| Case `flow` | User-facing functionality, such as Login or Registration. |
| Case `service` | Registered consumer service/application, such as `auth` or `web`. |
| Case `type` | `api` or `frontend`. A mixed batch contains both. |
| Case `dependsOn` | Optional list of other case IDs that must pass first. |
| Case `timeoutMs` | Optional positive integer deadline, in milliseconds. |

Identifiers (`id`, `service`, `runner`) use lowercase letters, digits, `_` and
`-`, begin with a letter or digit and have at most 64 characters. Labels and
frontend `test` selectors are nonempty strings. Unknown fields are rejected so
misspellings cannot silently change what executes.

## API cases

Start from [api.json](../examples/api.json). Each case specifies:

- `request.method`: uppercase `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` or `OPTIONS`.
- `request.path`: service-relative path starting with `/`, optionally with a query
  string. Absolute URLs, network-path references, backslashes, fragments and
  control characters are rejected. The selected environment supplies the origin.
- Optional `request.headers`: object of string values.
- Optional `request.body`: JSON data. Omit it for requests without a body.
- `expect.status`: exact HTTP status, an integer from 100 through 599.
- Optional `expect.json`: object mapping JSON Pointers to expected JSON values.
  Each pointed value must deeply equal the expected value; unrelated response
  fields may remain. A missing pointer fails the assertion.
- Optional `expect.present`: list of JSON Pointers whose values must exist.
  `false`, `0`, `null` and an empty string still count as present.

For JSON Pointers, `/user/email` addresses a nested field, `/roles/0` an array
element, `~1` escapes `/`, `~0` escapes `~`, and `""` addresses the whole body.
An expected JSON body that cannot be parsed is a failed assertion, not success.
Check meaningful response data alongside status when the case requires it.
Checking that a token exists does not validate its signature or permissions.
GET and HEAD cases omit bodies; APIs should be exercised as their contracts define.

`service: "auth"` resolves through trusted project configuration for the chosen
environment, for example to an `AUTH_BASE_URL` environment variable. An API case
does not carry an arbitrary destination URL or runner command.

## Frontend cases

Start from [frontend.json](../examples/frontend.json). A case adds `runner` and
`test` instead of `request` and `expect`:

- `runner`: a profile registered in the consumer project, such as `web-e2e`.
- `test`: an existing test identity or selector understood by that profile.

The profile owns the working directory, executable/arguments, supported selection,
environment mapping, deadline and result parser. For example, a project's
`web-e2e` profile can map `login-valid` to its existing Playwright test. Another
project can use Cypress or another established runner without changing the batch
shape. These example profile/selector names require actual project bindings.

Assertions and browser setup stay in the referenced automation. If the selected
case has no automation, report it as unavailable rather than inventing success
or interpreting the batch as browser instructions. Request test creation only
when the operator wants that additional work.

## Variables and environments

Use `${NAME}` placeholders in API paths, header values, JSON body strings and
expected JSON string values. Resolve them server-side from the approved run
environment before execution. Missing variables prevent submission and identify
the case and variable name; never display the value. Substitution is literal data
replacement, not code evaluation, and preserves JSON types. Query/path values
must be encoded by the adapter for their position, then the resolved path and
destination must be checked again. Unsupported placeholders are input errors.

Keep credentials in the consumer's existing environment/secret mechanism. The
browser receives variable names and redacted views, not secret values. Runner
profiles decide which approved environment values they receive. Never pass the
entire host environment merely because a batch references a runner.

The examples deliberately reference `TEST_EMAIL`, `TEST_PASSWORD` and `API_TOKEN`;
they contain no credentials and are not runnable without your service contracts,
test accounts and runner bindings. Use test fixtures appropriate to the selected
environment. Mutating API calls and browser flows have their real application
effects; selecting an environment must retain the operator's authorized scope.

## Mixed batches and ordering

[mixed.json](../examples/mixed.json) first checks Auth readiness and then runs a
frontend login case. File order is not an execution guarantee: `dependsOn` defines
the required ordering, accepts forward references and must form an acyclic graph.
Independent cases run sequentially by default; use existing safe concurrency
only when fixtures and consumer runner semantics allow it.

Selection must include prerequisites. If the operator selects a dependent case
alone, show the missing prerequisites and offer to add them before submission.
A failed, unavailable or cancelled prerequisite blocks its dependents. Other
independent cases can continue according to the declared run policy.

Dependencies transfer completion status, not cookies, tokens or response values.
Reuse existing project fixtures or a deliberately defined adapter for shared
state; do not assume an API login authenticates a separate browser session.

## Validate and send

1. Adapt the relevant example to the consumer's actual cases and bindings.
2. Run `node <installed-skill-root>/scripts/validate-batch.mjs <batch.json>`.
3. Load the batch, choose the environment and inspect/select the cases.
4. Submit the selected identities through the consumer's
   [execution interface](execution.md#submission).
5. Inspect per-case assertions and evidence, not just the aggregate badge.

The helper checks shape, IDs, supported assertions and the dependency graph.
It does not read environment values, contact APIs, run browsers, resolve project
profiles or prove application behavior. The consumer validates those bindings
and the resolved inputs before starting the execution.
