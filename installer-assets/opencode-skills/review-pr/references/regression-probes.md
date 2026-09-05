# Regression probes

For the review coordinator: capture comparable assertion evidence without granting reviewers execution authority.

## Prepare a request

Author one JSON request per concrete hypothesis under the owned review run. Select an absolute
trusted executable path. `{probe}` is the single literal argv placeholder, replaced with the
same external probe path in both executions; the current directory is the compared source copy.
Keep commands and environment descriptions free of secrets. Record dependency/runtime versions
and relevant differences in `environment`; use `comparable: false` when those differences could
explain the observation. Native execution permissions must already permit the command and its
effects. The helper inherits the current execution environment and adds no sandbox protection.

```json
{
  "schema_version": 1,
  "context": "/owned/run-TOKEN/pr-review-context.json",
  "probe": "/owned/run-TOKEN/preserve-config.mjs",
  "assertion_id": "preserve-config",
  "invariant": "Updating preserves an existing user setting",
  "consumer": "An installation with customized settings",
  "argv": ["/absolute/path/to/node", "{probe}"],
  "timeout_ms": 30000,
  "environment": "Same Node version and dependencies; no environment differences",
  "comparable": true,
  "unavailable_reason": null
}
```

The external probe must exercise one invariant and print exactly `TH_ASSERT:<assertion_id>:PASS`
with exit 0 or `TH_ASSERT:<assertion_id>:FAIL` with exit 1 (an optional trailing newline is
accepted). Emit FAIL only for the named behavioral assertion. Setup errors, missing imports,
unexpected exceptions and other test failures must use a different exit status or output, so
they remain inconclusive. Send diagnostics to stderr. Successful command completion alone does
not establish that the assertion ran. Framework-specific reporters can be wrapped by this probe;
never map every framework failure to the named assertion.

## Capture and validate

```text
node regression-evidence.mjs run /absolute/path/request.json
node regression-evidence.mjs validate /absolute/path/request.json /returned/path/evidence.json RETURNED_SHA256
```

Run only through the host's permitted execution boundary. Retain the returned SHA-256 in
coordinator-owned review metadata, outside the execution copies; never derive the expected hash
from a record being validated. The digest detects changed bytes, not an adversarially forged
receipt. Revalidate before consuming or reusing evidence, including after conversation refresh.
Keep the original probe and request available for validation. Review-run cleanup owns all
generated copies and evidence; do not clean them while reviewers are reading.

The helper makes source-only copies from the captured merge-base and head, without checkout
filters or hooks. Symlinks, submodules, individual blobs above 16 MiB, trees above 64 MiB or
10,000 files, and preparation beyond its deadline are currently unavailable reproductions.
Tests needing Git metadata, LFS hydration, dependency installation or version-specific setup
also need a supported external environment; never treat absent prerequisites as a regression.
Main first attempts permitted repairs of declared prerequisites without changing the deliverable;
the helper itself never installs dependencies. Set `unavailable_reason` when the limit remains,
recording the cause and attempted remedies without launching repository code.

| Observation | Classification |
|---|---|
| Same assertion passes in base, fails in head | `regression-candidate` |
| Same assertion fails in both | `preexisting-failure` |
| Comparable executions; head assertion passes | `no-failure-observed` |
| Missing, ambiguous, timed-out or non-comparable execution | `inconclusive` |

Give validated evidence to the existing verifier. It still checks code, intent and causality;
an intentionally changed behavior is not a defect solely because the old assertion fails.
Summarize tested invariants and limitations in the existing review. Never interpret a passing
probe as proof that the PR is free of bugs.
