# Acceptance Matrix: th-friction-redesign

45/45 AC PASS across 5 tasks. Per-AC evidence (file:line) is in the Test / QA evidence columns below.

## Task-1 — dev-guard branch-aware push gating + PR-create autogate opt-in (16 AC)

| AC | Description | Test | QA evidence | Security |
|----|--------------|------|--------------|----------|
| AC-1 | Single refspec, non-default, origin, no flags → allow | `test_dev_guard.sh:503-508` PASS | `dev-guard.ts:246-248` PASS | clean |
| AC-2 | `allow` EXCLUSIVELY for the closed form | Suite 83b (all disqualifying forms) PASS | `dev-guard.ts:181-293` PASS | clean |
| AC-3 | Colon-refspec destination = right side of LAST colon | `test_dev_guard.sh:574-582` PASS | `dev-guard.ts:219-229` PASS | clean |
| AC-4 | Push to default branch → ask | `test_dev_guard.sh:512-515` PASS | `dev-guard.ts:240-244` PASS | clean |
| AC-5 | Multi-refspec / `--mirror`/`--all` fail-closed | `test_dev_guard.sh:588-593` PASS | `dev-guard.ts:286-290` PASS | clean |
| AC-6 | Non-origin remote/URL → ask by name | `test_dev_guard.sh:520-527` PASS | `dev-guard.ts:270-275` PASS | clean |
| AC-7 | Tag push forms → ask | `test_dev_guard.sh:532-540` PASS | `dev-guard.ts:234-238` PASS | clean |
| AC-8 | Force by flag → ask; policy-block double floor | `test_dev_guard.sh:546-551` PASS | `dev-guard.ts:142,164,259-264` PASS | clean |
| AC-9 | Force by `+refspec`/`--mirror` self-covered | `test_dev_guard.sh:557-568` PASS | `dev-guard.ts:213-217` PASS | clean |
| AC-10 | Delete refspec/`--delete`/`-d` → ask | `test_dev_guard.sh:598-606` PASS | `dev-guard.ts:222-227,146,168` PASS | clean |
| AC-11 | Bare push resolved → allow; failure → ask | `test_dev_guard.sh:638-686` PASS | `dev-guard.ts:181-205` PASS | clean |
| AC-12 | `gh pr create` autogate; no prepublish-guard bypass | `test_dev_guard.sh:699-711` PASS | `dev-guard.ts:302-308,357-366` PASS | clean |
| AC-13 | Remote=origin by NAME; remote-mutating stays prompted | structural PASS | `dev-guard.ts:48-52,270-275` PASS | clean |
| AC-14 | Payload-cwd scoping; argv-fixed exec; fail-open | structural PASS | `dev-guard.cc.ts:123-142`, `dev-guard.opencode.ts:122-141` PASS | clean |
| AC-15 | dist regenerated & clean | rebuild+diff PASS (byte-stable, re-verified in delivery) | PASS | clean |
| AC-16 | No regression of existing `ask` cases | `test_dev_guard.sh:608-629` PASS | PASS | clean |

## Task-2 — batch GraphQL review-disposition mutation + payload preview (7 AC)

| AC | Description | Test | QA evidence | Security |
|----|--------------|------|--------------|----------|
| AC-1 | N+M mutations in ONE aliased request, reply-before-resolve | structural PASS | `gh-fallback.md:607-640` PASS | clean |
| AC-2 | Exactly one `ask` per batch | structural PASS | `dev-guard.ts:397` PASS | clean |
| AC-3 | Partial failure read per-alias, no retry of succeeded | structural PASS | `gh-fallback.md:713-735` PASS | clean |
| AC-4 | Every reply body via `-f`/`--input`, never interpolated | structural PASS | `gh-fallback.md:646-663` PASS | clean |
| AC-5 | Payload preview mandated before gated call | structural PASS | `gh-fallback.md:690-711` PASS | clean |
| AC-6 | Single-thread per-op sections remain fallback | structural PASS | `gh-fallback.md:585-595` PASS | clean |
| AC-7 | Fixed template; `-F` reserved numeric/boolean only | structural PASS | `gh-fallback.md:607-663` PASS | clean |

## Task-3 — distribute read-only allowlist + disjointness invariant (8 AC)

| AC | Description | Test | QA evidence | Security |
|----|--------------|------|--------------|----------|
| AC-1 | Offered set at site A+B, gated Y/n | structural PASS | `SKILL.md:158-219`, `orchestrator.md:177-193,212-216` PASS | clean |
| AC-2 | Disjunction VERIFY enforced by test | Suite 147 PASS | `test_permission_disjointness.py:247-262` PASS | clean |
| AC-3 | Excludes effective git verbs; inert-only | Suite 148 PASS | `permission-provisioning.md:95-97` PASS | clean |
| AC-4 | Disjunction holds under #18312 | Suite 147 canary PASS | `test_permission_disjointness.py:269-292` PASS | clean |
| AC-5 | Canonical doc + 3 identical sites | Suite 148 PASS | `permission-provisioning.md:75-111` PASS | clean |
| AC-6 | `.git/` exclusion / resolved-value floor unchanged | Suite 148 PASS | PASS | clean |
| AC-7 | No form of `gh api`; read verbs included | Suite 147+148 PASS | `permission-provisioning.md:91-93,85-86` PASS | clean |
| AC-8 | Catalogue-driven test with canary + coupling | Suite 147 PASS | `test_permission_disjointness.py:100-121,177-185,264-292` PASS | clean |

## Task-4 — single-PR release path via marker (10 AC)

| AC | Description | Test | QA evidence | Security |
|----|--------------|------|--------------|----------|
| AC-1 | Marker/trailer + 3 sites bumped+matching → release-path | `test_prepublish_bump_floor.sh:1523-1561,1686-1730` PASS | `prepublish-guard.ts:513-533` PASS | clean |
| AC-2 | Marker + stale site → deny | `test_prepublish_bump_floor.sh:1564-1599` PASS | `prepublish-guard.ts:402-412` PASS | clean |
| AC-3 | No marker + stray bump → deny (unchanged) | `test_prepublish_bump_floor.sh:1602-1639` PASS | `prepublish-guard.ts:376-390` PASS | clean |
| AC-4 | Batch multi-PR unaffected; dist clean | structural + rebuild PASS | PASS | clean |
| AC-5 | Inline `--with` mode folds into feature PR; Step 3 verify-only | structural PASS | `SKILL.md:111-129,197-239`, `delivery.md:429,465-466,1059-1091` PASS | clean |
| AC-6 | Conditional-noop gate, not `paths-ignore` | structural PASS | `test.yml:25-87` PASS | clean |
| AC-7 | cost-and-caching.md + CLAUDE.md §6.3 reflect opt-in path | structural PASS | PASS | clean |
| AC-8 | Bootstrap case documented (this build uses deferred cut) | structural PASS | PASS | clean |
| AC-9 | Non-semver marker → deny | `test_prepublish_bump_floor.sh` PASS | PASS | clean |
| AC-10 | Fail-open on CLAUDE.md §3 documented, unchanged | structural PASS | `prepublish-guard.ts:407-408` PASS | clean |

## Task-5 — multi-site dev-guard contract reconciliation (4 AC)

| AC | Description | Test | QA evidence | Security |
|----|--------------|------|--------------|----------|
| AC-1 | Refined statement present at all 9 sites | Suite 149 PASS | structural grep PASS | clean |
| AC-2 | Managed-block source updated for `/th:update` propagation | Suite 149 PASS | PASS | clean |
| AC-3 | "fires unconditionally" preserved at every site | Suite 149 PASS | PASS | clean |
| AC-4 | Per-site regression assertion (refined present / old absent) | Suite 149 PASS | PASS | clean |

## Residuals (accepted, not blocking)

- `origin/HEAD` staleness/spoofing for non-standard default branches: operator-accepted; recovery documented as `git remote set-head origin -a`; `main`/`master` unaffected (static floor).
- **suite82(uwh13)** — pre-existing stale check for a consumed `changelog.d/` fragment; resolved in this delivery run (see delivery summary) by re-anchoring the check to the released `CHANGELOG.md [2.125.1]` section instead of the (by-design, already-deleted) fragment file.
