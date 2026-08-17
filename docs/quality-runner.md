# Deterministic Quality Runner

The quality runner is Team Harness's machine authority for repository-declared
quality checks. It executes exact argument arrays against one clean Git
candidate and emits a closed JSON evidence record. It does not select tools,
install dependencies, edit source, or decide whether a test expresses the
approved behavior.

The base runner is used by both the pre-implementation test-transition and the
pre-Freeze cleaner checkpoints.

## Functional contract

Given a versioned repository manifest, an immutable base commit, the checked-out
candidate, a checkpoint name, and a selected set of checks, the runner:

1. verifies that the repository is clean and the candidate is `HEAD`;
2. proves that the base is an ancestor of the candidate and records both tree identities;
3. resolves the changed file surface from Git;
4. executes only manifest-declared `argv` arrays, never a shell command string;
5. bounds stdout, stderr, duration, argument size, changed paths, and metric records;
6. rejects commands that mutate Git-visible tracked or untracked repository state;
7. calculates CRAP itself from normalized complexity and coverage input; and
8. returns one schema-versioned JSON result and a nonzero process status on failure.

Agents may diagnose a failed command or justify a policy exception. They cannot
change a failing machine verdict into a pass.

## Repository manifest

The proposed conventional location is `.team-harness/quality.json`. The file is
committed with the repository so command and policy changes alter its SHA-256
identity and invalidate older evidence.

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

`test_contract.path_rules` opts the repository into deterministic
pre-implementation testing. Every declared test path must match at least one
`prefix`, `suffix`, or directory-`segment` rule. The transition runner also
requires the red commit's complete diff to equal the contract's test paths, so
a permissive suffix cannot hide a production change. See
[Pre-implementation Test Contract](test-contract-runner.md).

Supported command identifiers are `test`, `format_check`, `lint`, `coverage`,
and `crap`. Every command is an argument array. Shell expansion, redirection,
pipes, substitutions, and arbitrary interpolated paths are forbidden. The sole
substitution is the complete-argument `${TH_QUALITY_REPORT}` placeholder in the
`crap` command, replaced by the runner as described below; partial-string
interpolation remains invalid.
`working_directory` must resolve inside the repository. `timeout_ms` defaults to
five minutes and cannot exceed one hour.

`version_argv` is optional. When present, it must succeed before the quality
command. The runner stores a version-output fingerprint rather than replaying
the tool's text into the evidence record.

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

The adapter never supplies the CRAP score. The runner computes it consistently:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

When CRAP is configured, use `--policy-mode measure` before cleanup. Persist the
result and record its SHA-256 in coordinator-owned state. Use
`--policy-mode enforce` after cleanup with `--baseline` pointing to that result
and `--baseline-sha256` carrying the recorded identity. Enforcement rejects a new function over
`new_function_max`, a worsening score when policy
forbids it, a changed function missing from the baseline, a changed manifest,
or a baseline candidate that is not an ancestor of the current candidate. It
also rejects a post-cleaner report that omits any function present in the
baseline (`CRAP_REPORT_INCOMPLETE`); cleanup cannot improve the metric by
renaming, splitting, or suppressing measured functions.

## Invocation

The base must be a full 40- or 64-character commit ID. The candidate may be a
full commit ID or `HEAD`, but it must resolve to the currently checked-out clean
commit. The raw runner does not infer optional checks from the manifest; this
minimal pre-cleaner invocation works with the required `test` command alone:

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/quality-runner.mjs \
  --repo /absolute/path/to/repository \
  --manifest .team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --checkpoint pre-cleaner \
  --checks test \
  --policy-mode measure
```

The corresponding minimal post-cleaner invocation is:

```bash
node /absolute/path/to/loaded/pipeline/skill/scripts/quality-runner.mjs \
  --repo /absolute/path/to/repository \
  --manifest .team-harness/quality.json \
  --base 0123456789abcdef0123456789abcdef01234567 \
  --candidate HEAD \
  --checkpoint post-cleaner \
  --checks test \
  --policy-mode enforce
```

Select optional checks only when the manifest declares them. Before cleanup,
use `--checks test,crap` only when both the `crap` command and CRAP policy are
present. After cleanup, start with `test` and append each declared
`format_check`, `lint`, and `crap` in that order. When the post-cleaner list
includes `crap`, also pass the exact pre-cleaner quality result through
`--baseline /path/to/pre-cleaner-result.json` and its recorded identity through
`--baseline-sha256 89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567`.

Successful command output is counted but not replayed. Failure diagnostics use
the existing bounded-command envelope: independently counted stdout/stderr,
sanitized printable tails, truncation flags, exit code, signal, and duration.
The red/green test-transition checkpoints retain the same bounded diagnostic
for the `test` command even when it exits successfully. This keeps a later
quality postcondition failure distinguishable from a test failure; unbounded
streams are never embedded.
The result contains command and manifest hashes instead of raw argument arrays.
Ignored caches and build artifacts are outside Git identity and may still be
written by repository tools. The runner is an evidence and output-control
layer, not a process sandbox; the active runtime's native permissions remain
the security boundary.

## Cleaner integration

The cleaner companion wraps the raw quality records with a hashed production
allowlist and verifies the exact pre/post transition. It always requires
`test`; `format_check`, `lint`, and `crap` are selected when declared by the
manifest. See [Cleaner Checkpoint with Optional CRAP](cleaner-crap.md).

Both deterministic checkpoints live inside `implementation`; they do not
change the v3 state machine or either Stage Gate.
