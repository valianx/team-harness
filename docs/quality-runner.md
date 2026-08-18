# Deterministic Quality Runner

The quality runner is Team Harness's machine authority for repository-declared
quality checks. It executes exact argument arrays against one clean Git
candidate and emits a closed JSON evidence record. It does not select tools,
install dependencies, edit source, or decide whether a test expresses the
approved behavior.

The base runner is used by the pre-implementation test-transition checkpoints
and by the single Freeze quality run (`post_implementation`).

Before the first implementation dispatch, the pipeline runs a fan-complete
readiness pass: each required non-test control is invoked separately so a
failure cannot suppress the remaining diagnostics, and the required RED
transitions also complete. These runs are diagnostic rather than Freeze
acceptance evidence. The coordinator persists every terminal result, groups
the complete finding set by root cause, and supplies one comprehensive initial
implementation package. The same rule applies before a later correction:
never dispatch from the first visible failure while another selected check is
pending. Cleaner runs only after that consolidated set is closed, followed by
one authoritative full-manifest quality run at Freeze.

## Functional contract

Given a versioned repository manifest, an immutable base commit, the checked-out
candidate, a checkpoint name, and a selected set of checks, the runner:

1. verifies that the repository is clean and the candidate is `HEAD`;
2. proves that the base is an ancestor of the candidate and records both tree identities;
3. resolves the changed file surface from Git;
4. executes only manifest-declared `argv` arrays, never a shell command string;
5. bounds stdout, stderr, duration, argument size, changed paths, and metric records;
6. rejects commands that mutate tracked repository state; untracked content —
   pre-existing or a command byproduct — is intentionally outside this check
   and never counts as worktree evidence;
7. calculates CRAP itself from normalized complexity and coverage input; and
8. returns one schema-versioned JSON result and a nonzero process status on failure.

Agents may diagnose a failed command or justify a policy exception. They cannot
change a failing machine verdict into a pass.

## Workspace manifest

The conventional location is `<workspace>/.team-harness/quality.json`. This is
coordinator-owned operational state: it must be an absolute, regular,
non-symlink file below the execution workspace. A workspace may be disjoint
from the checkout, contain its isolated worktree, or be an ignored child of the
checkout; in the last case the runner also proves the manifest is ignored and
untracked. It is never staged, force-added, copied to a product path, or
included in the pull request. The runner requires absolute workspace and
manifest paths and fails closed when either boundary is ambiguous or crossed.

Command and policy changes still alter the manifest's SHA-256 identity and
invalidate older full-manifest readiness and Freeze evidence.
Test-transition schema v3 additionally records a narrower
`test_binding_sha256`, calculated from the normalized manifest schema version,
`commands.test`, and `test_contract`. RED/GREEN compatibility uses that binding
plus the exact contract, test blobs, base, effective argv/resolution, and runtime
version fingerprint. A coverage, lint, format, build, or database-only manifest
change therefore reruns the affected diagnostics and final quality without
discarding otherwise identical RED/GREEN evidence. Any change to the test
binding or its other frozen inputs still fails closed and requires a new RED.

```json
{
  "schema_version": 1,
  "commands": {
    "test": {
      "argv": ["go", "test", "./..."],
      "working_directory": ".",
      "timeout_ms": 300000,
      "version_argv": ["go", "version"]
    },
    "format_check": {
      "argv": ["go", "run", "./tools/formatcheck"],
      "version_argv": ["go", "version"]
    },
    "lint": {
      "argv": ["go", "vet", "./..."],
      "version_argv": ["go", "version"]
    },
    "crap": {
      "argv": ["go", "run", "./tools/crapreport", "--output", "${TH_QUALITY_REPORT}"],
      "version_argv": ["go", "version"]
    }
  },
  "crap": {
    "new_function_max": 10,
    "changed_function_may_worsen": false
  },
  "test_contract": {
    "path_rules": [
      { "type": "prefix", "value": "tests/" },
      { "type": "suffix", "value": "_test.go" }
    ]
  }
}
```

This Go example assumes the repository provides the small `formatcheck` and
`crapreport` adapters under `tools/`; TH does not install them automatically.

Node repositories can declare npm commands instead:

```json
{
  "schema_version": 1,
  "commands": {
    "test": { "argv": ["npm", "test", "--", "--runInBand"] },
    "format_check": { "argv": ["npm", "run", "format:check"] },
    "lint": { "argv": ["npm", "run", "lint"] }
  }
}
```

The runner itself needs Node.js because it is distributed as an `.mjs` script.
The repository does not need npm unless its manifest declares an npm command.

Quality commands must be non-installing. The manifest rejects package-manager
execution/download shims (`npx`, `pnpx`, `bunx`, `npm exec|x`,
`pnpm dlx`, `yarn exec|dlx`, `bun x`, including `corepack`-wrapped forms)
with `NON_HERMETIC_COMMAND` before launching a process. These frontends can
consult or mutate global stores and may bootstrap a missing tool. Declare a
repository-owned package script (`npm|pnpm|yarn|bun run ...`) or an exact
already-installed local executable such as `node_modules/.bin/vitest` instead.
Team Harness never installs dependencies or accepts a diagnostic substitute as
authoritative evidence. The sole mechanical exception is `pnpm exec <tool>`:
before launch, the runner requires an already-linked matching executable under
an ancestor `node_modules/.bin` inside the repository and executes that link
directly, never pnpm. Evidence retains the manifest command hash and separately
records `execution_resolution: linked-local-bin` plus a stable effective-argv
hash; a missing link is `PREREQUISITE_UNAVAILABLE`. This avoids pnpm store
SQLite/install/purge behavior without changing test selection or arguments.
The runner applies the same non-installing resolution to `pnpm <script>` and
`pnpm run <script>` (including common `pnpm test` and `pnpm storybook`
shorthands). It reads the exact `package.json` in the command working directory,
accepts only a single simple argv-like script with no shell syntax, resolves its
first token through an existing repository-local `node_modules/.bin` link, and
executes the link directly without pnpm. Evidence records
`execution_resolution: linked-local-script`. Compound scripts, lifecycle or
dependency-management operations, missing scripts, and missing links fail
closed before pnpm can consult a global store, bootstrap, install, or purge.
When that simple package script is exactly `node <repository-relative
.js|.mjs|.cjs> ...`, the runner verifies the regular non-symlink script below
the repository and invokes it through the current Node executable. Evidence
records `execution_resolution: repository-local-node-script`. This is the
preferred route for repository-owned checks that do not need dependencies:
pnpm's `verify-deps-before-run` and cross-OS StoreIndex are never opened.

A manifest coordinate such as `./node_modules/.bin/vitest` or
`./node_modules/.bin/storybook` is also resolved before execution. The runner
requires the named file and its canonical target to remain inside the current
repository and records `execution_resolution: repository-local-bin`. A
worktree whose whole `node_modules` directory points at another checkout is
therefore `PREREQUISITE_UNAVAILABLE`; it is not treated as a usable local
installation and its wrapper cannot fall through to `npx` or an external npm
cache. The quality runner remains non-mutating. Before the first pipeline
specialist dispatch, Main uses the packaged
`worktree-dependencies.mjs provision --repository <absolute-worktree>` helper
as a normal Gate-1 prerequisite. It derives the frozen install command from one
root lockfile, replaces only an untracked top-level symlink, and verifies a real
worktree-local directory. Failure returns the exact closed `required_action`
instead of asking a specialist to install dependencies or use a shared cache.

For coordinator evidence, pass an absolute `--output <path>`. The runner writes
the complete result atomically and prints only a bounded
`team_harness_quality_receipt` containing the result path, SHA-256, and byte
count. Coordinators verify that receipt against the file. They do not generate
temporary JavaScript wrappers, interpolate allowlists into source, or depend on
a truncated stdout tail.

Quality-result schema v2 adds execution identity fields. Test-transition result
and receipt schema v3 add the independent canonical test binding described
above. Persisted schema-v1
quality baselines are intentionally rejected as `BASELINE_INVALID`; regenerate
them by rerunning the repository's documented quality-runner baseline command
on the current clean base. Pre-v3 red-transition artifacts are intentionally
rejected as `RED_EVIDENCE_INVALID` because they lack the independent test
binding; regenerate them with the documented
`test-transition.mjs red` command before attempting green. Never edit or
relabel old evidence in place.

`test_contract.path_rules` opts the repository into deterministic
pre-implementation testing. Every declared test path must match at least one
`prefix`, `suffix`, or directory-`segment` rule. The transition runner also
requires the red commit's complete diff to equal the contract's test paths, so
a permissive suffix cannot hide a production change. See
[Pre-implementation Test Contract](test-contract-runner.md).

Supported command identifiers are `test`, `build`, `typecheck`,
`format_check`, `lint`, `coverage`, `crap`, `invariants`, `permissions`,
`accessibility`, `contract`, `integration`, and `database`. Tool-specific
aliases such as `storybook_build`, `i18n`, or `openspec` are not manifest IDs;
fold those commands under the matching canonical control. Every command is an argument array. Shell expansion, redirection,
pipes, substitutions, and arbitrary interpolated paths are forbidden. The sole
substitution is the complete-argument `${TH_QUALITY_REPORT}` placeholder in the
`crap` command, replaced by the runner as described below; partial-string
interpolation remains invalid.
`working_directory` must resolve inside the repository. `timeout_ms` defaults to
five minutes and cannot exceed one hour.

`version_argv` is optional. When present, it must succeed before the quality
command. The runner stores a version-output fingerprint rather than replaying
the tool's text into the evidence record. It must probe the runtime that the
runner actually executes after hermetic resolution: for example, a package
script unwrapped to `node scripts/check.mjs` uses `node --version`, not
`pnpm --version`.

Manifest structure is validated globally: schema version, command IDs, closed
fields, argv bounds, paths, timeouts, environments, and CRAP/test-contract
shape must remain valid. Hermetic runtime classification and executable
resolution apply only to the explicitly selected checks. An unselected
command's package manager or version probe cannot block an independent
format/lint checkpoint and is never executed; selecting that command applies
the complete fail-closed validation before launch. Quality result schema v3
records a bounded `error_context` with exactly `command_id` and `field` when a
manifest or hermeticity failure can be attributed safely. It never includes
argv, paths, environment values, or child output.

## CRAP adapter contract

CRAP tooling differs by language. The repository supplies an adapter command
that converts its native coverage and complexity output to this normalized
report:

```json
{
  "schema_version": 1,
  "functions": [
    {
      "path": "internal/pricing/calculate.go",
      "symbol": "Calculate",
      "status": "changed",
      "complexity": 8,
      "coverage_percent": 90
    }
  ]
}
```

The literal argument `${TH_QUALITY_REPORT}` must appear exactly once in the
`crap` command. The runner replaces that complete argument with a private
temporary path; there is no partial string interpolation. The adapter writes
the normalized JSON there. Reported files must belong to the Git change surface.
The report is closed: its only top-level keys are `schema_version` and
`functions`, with at most 512 function entries. Every entry has exactly
`path`, `symbol`, `status`, `complexity`, and `coverage_percent`; `path` is a
safe repository-relative member of the base-to-candidate changed-path set,
`symbol` is non-empty and at most 256 UTF-8 bytes, `status` is `new|changed`,
`complexity` is an integer of at least 1, and coverage is a finite number from
0 through 100. `(path, symbol)` pairs are unique.

`CRAP_REPORT_INVALID` means one of those input/schema/scope rules failed.
`CRAP_REPORT_INCOMPLETE` is different: under `--policy-mode enforce` with a
baseline, a function present in the accepted baseline is absent from the new
report. These two definitions are the diagnostic contract; agents inspect the
bounded report artifact and manifest adapter, not the implementation body of
`quality-runner.mjs`.

The adapter never supplies the CRAP score. The runner computes it consistently:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

The pipeline runs CRAP measure-only: the default `--policy-mode measure`
records per-function values as informational diagnostics with verdict
`not_applied`, and no baseline comparison gates the run. `--policy-mode
enforce` remains a standalone runner capability for repositories that want a
hard threshold outside the pipeline; with `--baseline` and
`--baseline-sha256` it rejects a new function over `new_function_max`, a
worsening score when policy forbids it, a changed function missing from the
baseline (`CRAP_REPORT_INCOMPLETE`), a changed manifest, or a baseline
candidate that is not an ancestor of the current candidate. The pipeline never
selects enforce mode.

## Invocation

The base must be a full 40- or 64-character commit ID. The candidate may be a
full commit ID or `HEAD`, but it must resolve to the currently checked-out clean
commit. The raw runner does not infer optional checks from the manifest. The
pipeline's single Freeze invocation selects every command declared by the
manifest plus the per-repository union of task-declared required checks:

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/quality-runner.mjs \
  --repo /absolute/path/to/repository \
  --workspace /absolute/path/to/workspace \
  --manifest /absolute/path/to/workspace/.team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --checkpoint post_implementation \
  --checks test,format_check,lint,crap \
  --policy-mode measure
```

Select optional checks only when the manifest declares them; `test` leads and
each declared `format_check`, `lint`, and `crap` follows in that order.

Successful command output is counted but not replayed. Failure diagnostics use
the existing bounded-command envelope: independently counted stdout/stderr,
sanitized printable tails, truncation flags, exit code, signal, and duration.
The red/green test-transition checkpoints retain the same bounded diagnostic
for the `test` command even when it exits successfully. This keeps a later
quality postcondition failure distinguishable from a test failure; unbounded
streams are never embedded.
When the enclosing bounded execution is deferred or its terminal response may
exceed the remaining tool context, add `--output <absolute-result-path>` to
`bounded-command.mjs`. It atomically preserves the closed envelope and emits a
small `team_harness_bounded_command_receipt` containing its path, byte size,
SHA-256, outcome, and stream counters. A lost transport response is recovered
by validating and hashing that predeclared artifact, never by rerunning the
quality transition.
The result contains command and manifest hashes instead of raw argument arrays.
Ignored caches and build artifacts are outside Git identity and may still be
written by repository tools. The runner is an evidence and output-control
layer, not a process sandbox; the active runtime's native permissions remain
the security boundary.

## Cleaner integration

The cleaner checkpoint records a hashed production allowlist and a pre-cleanup
baseline anchor, then dispatches one bounded cleanup pass. There is no pre- or
post-cleanup quality run: quality executes exactly once per candidate tree at
the Freeze `post_implementation` checkpoint, and cleanup containment is proven
by a git-native overreach diff at Freeze. See
[Cleaner Checkpoint](cleaner-crap.md).

Both deterministic checkpoints live inside `implementation`; they do not
change the v3 state machine or either Stage Gate.
