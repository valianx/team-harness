# Cleaner Checkpoint

The cleaner checkpoint is a behavior-preserving cleanup pass inside the
existing `implementation` phase. It runs once per repository candidate with an
eligible changed production surface, after implementation and tester evidence
are committed and before Freeze. A multi-repository pipeline launches one
isolated cleaner per repository, each with its own worktree, allowlist,
baseline anchor, candidate identity, and quality manifest; one cleaner never
receives several projects. It adds no phase, gate, or architecture review.

## Applicability

The checkpoint applies when `.team-harness/quality.json` declares `test` and
`test_contract.path_rules`. If either is absent, the coordinator records
`cleaner_evidence.status: not-applicable` with reason
`repository-quality-manifest-incomplete`; it never invents repository
commands.

The coordinator derives an exact allowlist of existing changed production
files, stores its SHA-256, and excludes every path matched by
`test_contract.path_rules`. Tests, fixtures, snapshots, manifests, generated
files, lockfiles, migrations, public schemas, pipeline state, and unrelated
files remain outside the cleaner's authority. An empty allowlist is an
evidenced no-op.

## Flow

1. Commit the consolidated implementation candidate and require a clean tree.
2. Persist the allowlist, its SHA-256, and the pre-cleanup candidate anchor
   (commit and tree) as the `baseline` record in `cleaner_evidence`.
3. Dispatch one fresh `cleaner` with only that allowlist, the functional AC
   summary, applicable TCs, and the quality manifest. The cleaner may simplify
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
`cleaner-failed` or `cleaner-blocked` and blocks Freeze for that attempt; a
live operator recovery returns to implementation, applies an in-scope
correction, commits a new candidate, and runs one fresh cleaner attempt for
the new candidate/manifest identity.

After the cleaner result and overreach-proof evidence are recorded, only a
small repository-local remainder may become a cleaner handoff: exactly one
repository/worktree, one coherent behavior-preserving objective, at most five
finding IDs and eight files, already-approved scope, no DDL/migration,
public-schema, security-control, external-environment or new decision, local
closure checks, and a complete quality manifest. Anything larger preserves its
commits and evidence but requires a newly activated pipeline decomposed by
repository; it is never packed into one large implementer prompt.

An eligible implementer package pauses with a fresh nonce and asks the
operator to authorize one implementer pass. Neither normal nor autonomous
Gate-1 approval authorizes that pass. The authorized implementer gets one
terminal attempt; the handoff does not increment the pipeline `iteration`
counter or consume its max-3 validation-correction budget. A non-zero closure
result must include the exact command, exit code, and bounded diagnostic —
`exit 1` alone is not evidence. Remaining work requires a new package and
another live authorization; the cleaner still does not run again.

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
