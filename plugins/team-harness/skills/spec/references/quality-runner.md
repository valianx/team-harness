# Deterministic Quality Runner

- [Functional contract](#functional-contract)
- [Workspace manifest](#workspace-manifest)
- [CRAP adapter contract](#crap-adapter-contract)
- [CRAP validation workflow](#crap-validation-workflow)
- [Invocation](#invocation)
- [Cleaner integration](#cleaner-integration)

The quality runner records deterministic evidence for repository-declared
quality checks. It executes exact argument arrays against one clean Git
candidate and emits a closed JSON evidence record. It does not select tools,
install dependencies, edit source, or decide whether a test expresses the
approved behavior.

Use the runner during the Validation phase when the objective and stack make a
deterministic check useful. A selected CRAP check is measure-only by default:
it records matched per-function complexity and coverage as diagnostic evidence
and does not become a merge gate. The same runner can support an opt-in
test-transition checkpoint during Implementation; that separate contract is
described by the repository's test-transition guidance.

The coordinator records the selected checks, their actual verdicts and their
evidence in the shared workspace plan. A failed or unavailable check remains
visible for coordinator disposition; an agent recommendation does not override
the machine result or decide delivery. There is no mandatory Freeze, cleaner
lease or single universal quality checkpoint. Reuse a receipt only while its
candidate, manifest, selected inputs and output identity remain unchanged.

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

Command, policy and selected-input changes alter the manifest's SHA-256
identity and invalidate older evidence that depended on it. A changed
candidate commit or tree also requires a new run; publication may cite an
unchanged receipt only after comparing those identities.
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
cache. The quality runner remains non-mutating. Before selecting a command, the
coordinator prepares the repository-local dependencies through the host's
native project setup when the project requires them. A missing or unusable
local dependency is reported as `PREREQUISITE_UNAVAILABLE`; the runner never
asks a quality command to install a package or silently switches to a shared
cache.

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
[Pre-implementation Test Contract](https://github.com/valianx/team-harness/blob/main/docs/test-contract-runner.md).

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

## CRAP validation workflow

Use this bounded sequence when Validation selects CRAP:

1. Identify the changed executable files and the functions whose complexity and
   coverage can be matched by the project's collectors.
2. Prepare the official, already-supported collectors through the host's native
   project setup. Team Harness does not install a collector as part of the
   quality run. If preparation is needed, record it as implementation work or
   defer the selected check with a reason.
3. Run the native complexity and coverage commands against the clean candidate.
   Keep their raw output, any temporary adapter and the manifest under the
   selected local or Obsidian workspace. Normalize only unambiguous
   repository-relative `(path, symbol)` pairs; name omitted functions and do
   not convert unknown coverage to zero.
4. Invoke the runner with `--policy-mode measure` and an explicit `crap` check.
   Record the runner result, receipt, report hash and collector versions in the
   phase evidence table. `not_applied` means the values are diagnostic, not
   that the check was skipped.
5. At Publication, reuse that evidence only when candidate commit/tree,
   manifest, selected checks, collector inputs and report identity still
   match. A changed candidate or input requires a new measurement; the old
   receipt remains historical evidence and is never relabeled.

For a missing collector, a path mismatch or an incomplete mapping, report the
selected capability as pending with its concrete reason. A no-code change can
make CRAP not applicable; missing data cannot be silently treated as
not-applicable or as a passing score.

The adapter never supplies the CRAP score. The runner computes it consistently:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

The Validation phase runs CRAP measure-only: the default `--policy-mode
measure` records per-function values as informational diagnostics with verdict
`not_applied`, and no baseline comparison gates the run. `--policy-mode
enforce` remains a standalone runner capability for repositories that want a
hard threshold outside the four-phase workflow; with `--baseline` and
`--baseline-sha256` it rejects a new function over `new_function_max`, a
worsening score when policy forbids it, a changed function missing from the
baseline (`CRAP_REPORT_INCOMPLETE`), a changed manifest, or a baseline
candidate that is not an ancestor of the current candidate. The four-phase
workflow does not select enforce mode by default.

## Invocation

The base must be a full 40- or 64-character commit ID. The candidate may be a
full commit ID or `HEAD`, but it must resolve to the currently checked-out clean
commit. The raw runner does not infer optional checks from the manifest. The
coordinator selects the checks that the Validation plan names and passes any
required checks explicitly:

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/quality-runner.mjs \
  --repo /absolute/path/to/repository \
  --workspace /absolute/path/to/workspace \
  --manifest /absolute/path/to/workspace/.team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --checkpoint validation \
  --checks test,format_check,lint,crap \
  --policy-mode measure
```

Select checks only when the manifest declares them. The example is illustrative:
the phase plan can choose a smaller set, and an unavailable selected adapter is
reported as pending rather than converted into a score or a pass. The runner
executes the declared commands in the order supplied by `--checks`.

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

Cleaner work is an optional implementation activity owned by the coordinator.
It does not create a phase, a lease, a Freeze gate or a mandatory quality
checkpoint. If cleanup changes the candidate, the coordinator reruns the
affected validation checks against the new clean candidate and records the new
identity. If cleanup is documentation-only or produces no candidate change,
unaffected evidence may be reused with its original identity disclosed.

The repository may retain low-level cleaner helper contracts for compatibility,
but those contracts do not authorize an agent to dispatch cleanup or turn CRAP
into a delivery decision. The current CRAP path is the Validation invocation
above, using measure-only diagnostics and an explicit workspace evidence row.
