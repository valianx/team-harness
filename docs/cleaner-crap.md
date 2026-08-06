# Cleaner and CRAP Checkpoint

The cleaner checkpoint is an opt-in, behavior-preserving cleanup pass inside
the existing `implementation` phase. It runs once per consolidated candidate,
after implementation evidence is green and immediately before Freeze. It adds
no phase, gate, or architecture review.

## Applicability

The checkpoint applies only when `.team-harness/quality.json` declares all four
commands—`test`, `format_check`, `lint`, and `crap`—plus CRAP policy. Otherwise
the coordinator records `not-applicable` with reason
`repository-quality-manifest-incomplete`; it never invents repository commands.

The coordinator derives an exact allowlist of existing changed production
files, stores its SHA-256, and excludes every path matched by
`test_contract.path_rules`. Tests, fixtures, snapshots, manifests, generated
files, lockfiles, migrations, public schemas, pipeline state, and unrelated
files remain outside the cleaner's authority.

## Transition

1. Commit the consolidated implementation candidate.
2. Run `cleaner-transition.mjs --transition pre` to prove the candidate is
   clean, hash the allowlist, execute `test`, and measure per-function CRAP.
3. Dispatch one fresh `cleaner` with only that allowlist and baseline evidence.
   The cleaner may simplify the approved production surface without changing
   behavior, dependencies, configuration, public contracts, or tests, then
   commits its bounded result.
4. Run `cleaner-transition.mjs --transition post` with the recorded allowlist
   and baseline hashes. It executes `test`, `format_check`, `lint`, and CRAP
   enforcement, rejects added/deleted/renamed/type-changed paths, and proves
   every modified path belongs to the allowlist.
5. Persist the closed evidence, run the existing hygiene scan, then Freeze.

CRAP is not a prose score supplied by an agent. The repository adapter reports
complexity and coverage; the quality runner computes:

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
