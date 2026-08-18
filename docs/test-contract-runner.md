# Pre-implementation Test Contract

Team Harness can prove that an implementation makes an unchanged behavioral
test move from red to green. The deterministic runner proves identities and
process outcomes; the tester confirms that the failing assertion represents the
approved functional behavior. Neither may substitute for the other.

## Applicability

The checkpoint is opt-in per repository and explicit per task:

- `.team-harness/quality.json` declares `commands.test` and
  `test_contract.path_rules`;
- a task that changes observable runtime behavior declares
  `Pre-implementation test: required`; and
- docs, assets, comments, no-behavior changes, and repositories without the
  manifest contract declare `not-applicable` with a concrete reason.

It is one checkpoint inside implementation, not another phase or Stage Gate.

## Contract file

Before the implementer runs, the tester writes a coordinator-owned workspace
file and commits only the test paths named inside it:

```json
{
  "schema_version": 1,
  "requirements": ["Task-1-AC-1"],
  "test_identifiers": ["rejects an expired session"],
  "test_paths": ["internal/session/session_test.go"]
}
```

The runner rejects unknown fields, duplicates, unsafe paths, oversized inputs,
or a red commit whose complete Git diff is not exactly `test_paths`. Every path
must also match a manifest rule and resolve to a committed blob.

## Red checkpoint

Use the full commit immediately before tester authoring as `--base`; the test
commit must be current clean `HEAD`.

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/test-transition.mjs \
  --transition red \
  --repo /absolute/path/to/repository \
  --manifest .team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --contract /absolute/workspace/Task-1-test-contract.json
```

A red transition passes only when the exact manifest test command completes
with a nonzero exit, its optional version command succeeds, the commit is
test-only, and the runner records manifest, command, commit, tree, contract, and
test-blob hashes. Persist the complete JSON output and its SHA-256.

Main separately requires `failure_matches_contract: true` from the tester. A
syntax error, broken fixture, missing dependency, infrastructure failure,
unrelated suite failure, or already-passing test is not acceptable red.

## Green checkpoint

After implementation, run the same test command with both persisted hashes:

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/test-transition.mjs \
  --transition green \
  --repo /absolute/path/to/repository \
  --manifest .team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --contract /absolute/workspace/Task-1-test-contract.json \
  --contract-sha256 89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567 \
  --red-evidence /absolute/workspace/Task-1-red.json \
  --red-evidence-sha256 fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
```

Green requires exit zero plus the same contract bytes, canonical test binding,
task baseline, and test blobs. Transition schema v3
records `test_binding_sha256` over the normalized manifest schema version,
`commands.test`, and `test_contract`; unrelated non-test manifest commands are
not part of RED/GREEN identity. Green also requires the same effective argv,
execution resolution, and runtime version fingerprint. The red candidate must
be an ancestor of the green candidate. Changing, deleting, or weakening a
frozen contract test fails mechanically even if the suite is green.

Changing only coverage, lint, format, build, or database controls preserves an
otherwise identical RED/GREEN transition. It still invalidates the affected
readiness diagnostics and the final full-manifest Freeze quality evidence. A
test-binding, contract, test-blob, base, or effective-runtime change requires a
new RED checkpoint.

The helper invokes exact argv without a shell, uses bounded output evidence,
requires a clean checked-out candidate, and never installs tools. It is not a
process sandbox; native runtime permissions remain the security boundary.
