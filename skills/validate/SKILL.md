---
name: validate
description: Validate delivered behavior against the intended outcome and report concrete gaps.
---

Handle $ARGUMENTS in the current general agent.

Compare the current implementation with acceptance and run relevant repository
checks. Use independent QA, tester, security or adversarial review where useful.
Record findings, evidence and coverage limits; the coordinator decides the next
step. Reuse applicable checks and verify corrections without universal quotas.

When a workspace contains applicable sketches, read them as design evidence and
report mismatches. Their absence does not fail validation; note missing design
evidence only when the acceptance depends on it. For repository-declared checks,
the optional [quality runner](../pipeline/scripts/quality-runner.mjs) accepts
`--repo`, `--workspace`, `--manifest`, `--base`, `--candidate`,
`--checkpoint`, `--checks` and `--required-checks`; all eight are required.
Select comma-separated check IDs from the manifest and explicitly provide the
required subset (an empty string when none is required). Use a resolved base
commit and a clean checked-out candidate, and inspect the helper's current
input contract before invoking it. This skill does not run either helper
automatically or require a manifest for ordinary validation.
