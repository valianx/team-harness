# Cleaner Checkpoint with Optional CRAP

The cleaner checkpoint is a behavior-preserving cleanup pass inside the
existing `implementation` phase. It runs once per repository candidate with an
eligible changed production surface, after implementation evidence is green and
immediately before Freeze. A multi-repository pipeline launches one isolated
cleaner per repository, each with its own worktree, allowlist, baseline,
candidate identity, and quality manifest; one cleaner never receives several
projects. It adds no phase, gate, or architecture review.

Claude Code, Codex, and opencode resolve the same runner bytes from the loaded
pipeline skill. The canonical copies live under `skills/pipeline/scripts/`;
runtime projections must remain byte-identical.

## Applicability

The checkpoint applies when `.team-harness/quality.json` declares `test` and
`test_contract.path_rules`. `format_check`, `lint`, and `crap` are optional,
additive checks: the transition executes each one when declared, and a declared
`crap` command still requires CRAP policy. Missing optional checks never disable
the cleaner. If `test` or the path rules are absent, the coordinator records
`not-applicable` with reason `repository-quality-manifest-incomplete`; it never
invents repository commands.

The coordinator derives an exact allowlist of existing changed production
files, stores its SHA-256, and excludes every path matched by
`test_contract.path_rules`. Tests, fixtures, snapshots, manifests, generated
files, lockfiles, migrations, public schemas, pipeline state, and unrelated
files remain outside the cleaner's authority.

## Transition

1. Commit the consolidated implementation candidate.
2. Run `cleaner-transition.mjs --transition pre` to prove the candidate is
   clean, hash the allowlist, execute `test`, and measure per-function CRAP when
   configured.
3. Dispatch one fresh `cleaner` with only that allowlist and baseline evidence.
   The cleaner may simplify the approved production surface without changing
   behavior, dependencies, configuration, public contracts, or tests, then
   commits its bounded result.
4. Run `cleaner-transition.mjs --transition post` with the recorded allowlist
   and baseline hashes. It always executes `test`, executes every declared
   `format_check` and `lint`, enforces CRAP when configured, rejects
   added/deleted/renamed/type-changed paths, and proves every modified path
   belongs to the allowlist.
5. Persist the closed evidence, run the existing hygiene scan, then Freeze.

Each repository's cleaner is dispatched exactly once. If it finds both safe allowlisted
cleanup and work that requires production, migration, test, documentation, or
evidence authority, it commits the safe cleanup first and reports the remainder
as complete implementer findings. A cleaner finding never triggers another
cleaner pass.

After the cleaner result and post-transition evidence are recorded, only a
small repository-local remainder may become a cleaner handoff: exactly one
repository/worktree, one coherent behavior-preserving objective, at most five
finding IDs and eight files, already-approved scope, no DDL/migration,
public-schema, security-control, external environment or new decision, local
closure checks, and a complete quality manifest. Anything larger preserves its
commits and evidence but requires a newly activated pipeline decomposed by
repository; it is never packed into one large implementer prompt.

An eligible implementer package pauses with a fresh nonce and asks the operator
to authorize one implementer pass. Neither normal nor autonomous Gate-1
approval authorizes that pass. The authorized implementer gets one terminal
attempt; the handoff does not increment the pipeline `iteration` counter or
consume its max-3 autonomous validation-correction budget. A non-zero closure result must
include the exact command, exit code, and bounded diagnostic—`exit 1` alone is
not evidence. Main then runs the complete, unchanged
`.team-harness/quality.json` at `post_implementation`, including every declared
check plus the per-repository union of task-declared `Required quality checks`.
The runner supports build/typecheck, invariants, permissions, accessibility,
contract, integration, and database controls in addition to test, format, lint,
coverage, and CRAP. A required command that is missing or unselected fails with
`REQUIRED_CHECKS_MISSING`; a declared required environment variable that is
absent fails with `PREREQUISITE_UNAVAILABLE` rather than producing a false
green. This is never replaced by a touched-file subset, followed by
hygiene. Remaining work requires a new package and another live authorization;
the cleaner still does not run again.

When configured, CRAP is not a prose score supplied by an agent. The repository
adapter reports complexity and coverage; the quality runner computes:

```text
CRAP = complexity² × (1 − coverage)³ + complexity
```

The configured threshold decides whether a new function is acceptable and
whether a changed function may worsen. Every function present in the baseline
must remain represented after cleanup. An incomplete post report fails with
`CRAP_REPORT_INCOMPLETE`, preventing metric improvement through omission or
renaming.

The agent owns maintainability judgment—removing redundant comments or dead
code, reusing an exact existing helper, reducing material duplication, and
simplifying avoidable complexity. The deterministic tools own what changed,
what ran, and whether the repository contract passed.
