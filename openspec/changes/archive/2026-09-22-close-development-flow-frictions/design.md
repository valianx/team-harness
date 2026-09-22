## Context

See proposal.md. Existing phase and provider owners already support evidence reuse,
workspace routing and coordinator judgment. Publication did not link early enough
to repository conventions or the existing identity route. Several tests assumed
POSIX paths, file modes or process configuration on native Windows.

## Goals / Non-Goals

Improve those existing handoffs and fixtures. Do not add a runner, credential
store, approval mechanism or copy of TEA's schemas/coverage algorithm. This
instruction/test change modifies no database or frontend and needs no fake sketch.

## Decisions

- Read contributor/release/test conventions when preparing the validation plan,
  rather than discovering required version changes after claiming PR readiness.
- Use native Git identity and the existing GitHub routing mechanism; preserve
  scoped credentials and resolve only an actually missing identity decision.
- Give provider delegates expected output destinations and evidence scope, and
  check returned completion against their installed method. Preserve unknowns
  and upstream outcomes instead of synthesizing artifacts from desired scores.
- Fix reproduced fixture assumptions while preserving behavioral assertions.
  Use the repository's platform commands and capability-specific limitations;
  neither universal skips nor changing product behavior to satisfy fixtures.
  Normalize equivalent native/Git repository paths in the existing control-plane
  comparison; this restores Windows parity without changing permission policy.
  Use native chmod on the existing temporary configuration file where fchmod is
  unavailable; retain atomic replacement and backups. POSIX isolated-directory
  permission checks remain explicit; Windows publication uses existing native
  account credentials without a new TH ACL validator.
- Reuse the original sketch review and renew only affected amendment evidence.
  Keep the same workspace, PR and one release bump.

## Risks / Trade-offs

- More prose can duplicate rules: update the owning skill/reference and generate
  copies, using links at callers and no new checklist schema.
- A passing Linux run can hide Windows gaps: record both environments and verify
  changed Windows cases directly, keeping permission limits explicit.
- Prose review cannot establish model obedience: preserve that limit without
  manufacturing tests or making external verdicts new publication gates.
