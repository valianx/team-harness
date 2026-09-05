# Cleaner Checkpoint

The cleaner checkpoint is a behavior-preserving cleanup pass inside the
existing `implementation` phase. It runs once per repository candidate with an
eligible changed production surface, after implementation closes and before
Freeze. A multi-repository pipeline launches one isolated cleaner per
repository, each with its own worktree, allowlist, baseline anchor, candidate
identity, and quality manifest; one cleaner never receives several projects. It
adds no phase, gate, or architecture review.

## Applicability

The checkpoint applies when Main can derive a deterministic non-empty
production allowlist under `cleanerEligibility` in the control-plane helper.
A quality manifest is not a cleaner prerequisite; its applicability belongs
to the quality runner.

Main derives the allowlist from the Git diff and repository evidence, stores
its SHA-256, and excludes test paths using repository conventions and any
available `test_contract.path_rules`. Paths whose production role cannot be
established stay outside the grant. Tests, fixtures, snapshots, manifests, generated
files, lockfiles, migrations, public schemas, pipeline state, and unrelated
files remain outside the cleaner's authority. An empty allowlist is an
evidenced no-op.

## Flow

Pre-implementation checks cover prerequisites only. Main derives the allowlist
and baseline from current facts, then issues the cleaner's capability lease
immediately before dispatch. A manifest change after that point changes the
inputs for the candidate and requires fresh validation.

1. Commit the consolidated implementation candidate and require a clean tree.
2. Persist the allowlist, its SHA-256, and the pre-cleanup candidate anchor
   (commit and tree) as the `baseline` record in `cleaner_evidence`.
3. Dispatch one fresh `cleaner` with that allowlist, pointers to the canonical
   OpenSpec intent and applicable test evidence, and any quality manifest under
   its capability lease. The cleaner may simplify
   the approved production surface without changing behavior, dependencies,
   configuration, public contracts, or tests, then commits its bounded result
   or returns a justified no-op.
4. At Freeze, prove overreach containment (below) and run the single quality
   run for the candidate tree.

There is no pre- or post-cleanup quality run. Quality executes exactly once
per candidate tree, at the Freeze `post_implementation` checkpoint, over the
complete unchanged manifest plus the per-repository union of task-declared
`Required quality checks`. A required command that is missing or unselected
fails with `REQUIRED_CHECKS_MISSING`; a declared required environment variable
that is absent fails with `PREREQUISITE_UNAVAILABLE`; an absent manifest with
no required checks is an evidenced not-applicable. An unchanged candidate tree
never re-runs the suite — the recorded run is cited instead. A pre-existing
red suite surfaces at that single run and is attributed using the recorded
baseline anchor.

## Overreach proof — Freeze postcondition

When a cleanup commit exists, the coordinator proves at Freeze that the
cleanup stayed inside its grant:

```text
git diff --name-status --no-renames {baseline_commit} {cleaner_commit}
```

The output must contain only `M` rows whose paths belong to the recorded
allowlist, and the cleanup commit must descend from the baseline commit. Any
addition, deletion, rename, type change, or modification outside the allowlist
blocks Freeze for that attempt. The proof output and its SHA-256 are persisted
as the `post` record in `cleaner_evidence`; with no cleanup commit the proof
is an evidenced not-applicable.

## One dispatch per candidate

Each repository's cleaner is dispatched exactly once per immutable candidate
and manifest identity. If it finds both safe allowlisted cleanup and work that
requires production, migration, test, documentation, or evidence authority, it
commits the safe cleanup first and reports the remainder as complete
implementer findings. A cleaner finding never triggers another cleaner pass.
A `failed` or `blocked` return is persisted with its hashed result as
`cleaner-failed` or `cleaner-blocked` and blocks Freeze for that candidate.
Causal recovery preserves valid progress; when it produces a new candidate or
manifest identity, Main revalidates the lease inputs before any new cleaner
dispatch.

Work outside the cleaner's allowlist or authority remains with its owning role
and is reported in the cleaner's `result_envelope`; the cleaner never dispatches
that work or claims authorization. Main accepts the envelope only after
validating its lease and changed paths.

Any failed or blocked result, or subsequent correction, follows
`agents/_shared/coordinator-recovery.md`. Main preserves valid progress and
revalidates authority, semantic identities, immutable inputs, context,
canonical paths, and ownership before continuing or replacing a lease. A
different safe causal action is required; repeated causal identity pauses. A
semantic, scope, security-authority, or outward-effect change requires the
applicable live operator decision.

## CRAP is measure-only

When the manifest configures a `crap` command, the quality runner measures
per-function CRAP:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

The default `policy_mode: measure` records the measured values as
informational diagnostics with verdict `not_applied`; no threshold gates the
run and no function-level comparison blocks Freeze. The measurement gives the
operator and later pipelines a maintainability signal without converting a
static metric into a merge gate.

The agent owns maintainability judgment — removing redundant comments or dead
code, reusing an exact existing helper, reducing material duplication, and
simplifying avoidable complexity. The deterministic tools own what changed,
what ran, and whether the repository contract passed.
