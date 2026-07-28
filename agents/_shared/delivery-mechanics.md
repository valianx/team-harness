# Delivery Mechanics (the coordinator's deterministic half)

This file is the single source of truth for the mechanical, one-correct-answer half of
delivery: every step here is executed by the orchestrator directly (Bash/`gh`/`git`), never
dispatched to a subagent. `delivery` (the subagent) owns the prose half AND its own
best-effort post-PR tail — PR body text, CHANGELOG entry text, `docs/knowledge.md`
capture, README/CLAUDE.md memory updates, worktree teardown, release-tag verification, KG
passive capture, obsidian interlinking, and initiative-overview data — see
`agents/delivery.md`. That tail stays with `delivery` deliberately: every one of those steps
already tolerates running before its trigger condition holds (a PR not yet merged, no
initiative context) by logging a named `skipped:` outcome — there is no ordering conflict to
resolve by relocating them. `agents/orchestrator.md § Phase 4 — Delivery` points here by
reference; do not re-derive or paraphrase this file's procedures inline there.

**Why this split exists, and why it lives in `_shared/` rather than inline in
`agents/orchestrator.md`.** A step with one mechanically correct answer belongs to the
coordinator; a step needing judgment belongs to the lens that judges it. This file is read
once, at Phase 4 — never at boot, unlike anything inlined directly into
`agents/orchestrator.md`, which every dispatch pays for. Same pattern as
`agents/_shared/dispatch-contract.md` and `agents/_shared/gate-contract.md`.

**Ordering — this file's procedures run in the order listed**, immediately after
STAGE-GATE-3 records `gate3_release: ship` and the `delivery` subagent's single dispatch has
returned with its prose artifacts on disk (`docs/knowledge.md`, `README.md`, `CLAUDE.md`,
`changelog.d/{pr-slug}.md`, the Acceptance Matrix appended to `reviews/04-validation.md` or
`03-testing.md`, and the PR-body draft at `workspaces/{feature-name}/inputs/pr-body-draft.md`).

---

## 1. Version sites and the multi-site MATCH check

**Sole version-bump site.** The coordinator is the ONLY executor that sets the project
version — no implementer, tester, or `delivery` subagent step may set or modify it. If a
version change is detected in the diff that this run did not author, treat it as an
unauthorized bump: do NOT proceed until the change is reverted or the operator confirms it
intentional. An over-bump above the mechanical SemVer floor (e.g. a MINOR applied to a
PATCH-floor diff) requires a `bump-override: {level} — <reason>` justification, surfaced at
STAGE-GATE-3 (`agents/orchestrator.md § "STAGE-GATE-3"`, `bump_override` gate-data field) and
recorded as a PR-body/commit-trailer line — this is prose-only, reviewed by the operator at
that gate; no unwired hook enforces it mechanically.

**Shipped default vs repo-local deferral.** No `skip-version` flag, or `skip-version: false`
→ bump once at assembly (min one, max one). `skip-version: true` — set only when the
consuming repository documents a repo-local versioning/release-deferral convention — skips
this whole section; `changelog.d/` assembly (§ 3) still runs, since the fragment itself was
already written by `delivery`.

**Site discovery order:**
1. `01-plan.md § Review Summary` declares a `### Multi-site invariants` block for a
   version-bump invariant → use that site list.
2. Else, the repo documents its own canonical multi-site version table in `CLAUDE.md` or an
   equivalent contributor doc → follow that table.
3. Else, Glob-first-match (single-site repos): search the project root, in order —
   `.claude-plugin/plugin.json`, `package.json`, `pyproject.toml`, `Cargo.toml`,
   `build.gradle`, `pom.xml`, `mix.exs`, `version.txt`, `VERSION`.

**FENCED OFF — never a version-bump site.** A top-level schema/format-version field of a
manifest or registry file (distinct from the project's own version field) is never touched.
Confirm which field a declared site's "version" key actually names before editing it.

**Bump decision (SemVer level).** Read `git diff main...HEAD -- . ':!workspaces'`, classify
each change, pick the highest applicable level:

| Change | Level |
|---|---|
| New public/observable surface (new fn/class, CLI command/flag, HTTP endpoint/field, invokable capability, config key) | MINOR |
| Deprecates an existing public surface | MINOR |
| Bug fix / behavior correction, no new surface | PATCH |
| Performance improvement, no new surface | PATCH |
| Security fix in a shipped surface (MINOR/MAJOR only if the fix itself changes the public contract) | PATCH |
| Internal refactor that ships, no observable change | PATCH |
| Production dependency bump the consumer receives | PATCH |
| A "fix" that makes an existing tool/asset newly reject previously-valid input | MINOR |
| Removes/renames a public surface | MAJOR |
| Changes a default behavior in a way that breaks existing consumers | MAJOR |
| Incompatible config/signature/contract change | MAJOR |
| Repo-internal docs/tests/CI only, no consumer-observable surface | none |

PATCH is the default for shipped changes that add no new observable surface. When multiple
change types coexist, the highest level wins. Warn before a MAJOR bump — breaking changes
must be intentional.

**No version file found** → create one (ecosystem-appropriate: `package.json` for Node,
`pyproject.toml` for Python, `Cargo.toml` for Rust, else `version.txt`), starting at `0.1.0`.

**Multi-site MATCH check (unconditional whenever site discovery resolved a multi-site set —
rules 1 or 2 above; a no-op under rule 3).** For each invariant row, read the actual value at
every listed site. A MATCH means every non-fenced site holds the same value and every fenced
site is unchanged from `main`. On any divergence, STOP — do not proceed to staging — and
report a partial-sync finding naming the invariant, the expected value, and the actual value
at each site.

---

## 2. Branch naming

Base is always `main`, never a sibling branch. Stacked PRs (child branch off a parent PR's
branch) are PROHIBITED — GitHub's async re-targeting on parent-merge races serial merges and
silently drops commits.

- If on `main` (or the prior branch's PR is `MERGED`/`CLOSED`): fetch and fast-forward
  `main` (`git fetch origin main && git checkout main && git pull --ff-only origin main`),
  then create `feature/{issue-number}-{feature-name}` (with a linked issue) or
  `feature/{feature-name}` (without one). If the name collides with a prior delivery, append
  `-v2`, `-v3`, etc.
- If already on a feature/fix/hotfix branch with an `OPEN` PR or no PR at all: use it as-is.
- **Multi-group deliveries** (`§ Delivery Grouping` declares N > 1 groups with a valid split
  reason): open and merge serially — group N+1 branches from the updated `main` only after
  group N's PR lands, and is rebased on `main` before merging.
- Never commit directly to `main`.

---

## 3. `changelog.d/` assembly and the release cut

**Gated on a version bump having been performed (§ 1).** If the bump was skipped
(`skip-version: true`) or produced no change, skip this section entirely.

**Assemble fragments (idempotent).** If `changelog.d/` is absent or empty, this is a no-op —
proceed using whatever `[Unreleased]` content `CHANGELOG.md` already has. Otherwise, read
every `*.md` fragment in lexicographic order, merge their subsection entries
(`### Added`/`### Changed`/`### Fixed`/`### Security`) into one combined block —
deduplicating subsection headers — append it to `## [Unreleased]`, then delete every
fragment file (the directory itself may remain). Reject any fragment filename containing a
path separator or `..` before reading it (path-traversal guard); fragment slugs must match
`[a-z0-9-]+`.

**Promote `[Unreleased]` to a versioned release.** Collect everything under
`## [Unreleased]`. If empty (no entries, no fragments assembled), skip the cut. Otherwise
insert `## [<version>] - <date>` (bumped version, today's date `YYYY-MM-DD`) below a
recreated, empty `## [Unreleased]` placeholder, moving the accumulated entries under the new
heading. Never touch existing `## [X.Y.Z]` headings below the cut point, never reformat
moved entries.

---

## 4. Staging and commit

**Precondition — the implementation diff is already committed.** This step stages and
commits ONLY delivery artifacts — the task's actual implementation diff is `implementer`'s
and `tester`'s own responsibility, already committed at the close of their dispatches
(`agents/implementer.md § Commit Contract`, `agents/tester.md § Commit Contract`). Run
`git status --porcelain` excluding the exact delivery-file paths about to be staged below;
any OTHER path remaining means the implementation diff was never committed — STOP and
escalate to the operator, naming the uncommitted paths. Never stage or commit to close this
gap silently.

**Stage:**
```
git add CLAUDE.md CHANGELOG.md
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json  # only if version bumped
git add docs/                 # only if delivery modified docs/knowledge.md — never docs/specs/
git add README.md             # only if delivery modified it
git add openapi/openapi.yaml  # only if updated
git add changelog.d/{pr-slug}.md  # always stage the fragment when one was written, pre-deletion
```

If version was bumped, verify BOTH `.claude-plugin/plugin.json` AND
`.claude-plugin/marketplace.json` are staged (`git diff --cached .claude-plugin/`) — if
either is missing, stop and fix before committing. Never stage unrelated files.

**Commit** (conventional commits):
```
git commit -m "docs({feature_name}): add documentation, changelog, and version bump for <summary>"   # version bumped
git commit -m "docs({feature_name}): add documentation and changelog for <summary>"                  # version skipped
```

---

## 5. Diff-size gate and diff composition

**Size gate.** Before staging, check the diff against reviewer caps:
```bash
diff_lines=$(git diff origin/main...HEAD --stat | tail -1 | awk '{print $4 + $6}')
diff_files=$(git diff origin/main...HEAD --name-only | wc -l)
```

| Condition | Action |
|---|---|
| `diff_lines ≤ 400` AND `diff_files ≤ 8` | Pass. |
| Either cap exceeded | Read `02-implementation.md § Reviewability Exceptions`. If present, proceed and flag it for the PR body (feeds `delivery`'s Step 9d-equivalent drafting). Otherwise STOP — this is never an unconditional block: document the justification (split preferred, or a stated reason) before proceeding. |

There is no size tier that aborts unconditionally regardless of justification — the
composition breakdown below, presented at STAGE-GATE-3, is what lets the operator judge a
large, unsplit diff; a line-count ceiling never substitutes for that judgment.

**Diff composition (unconditional — computed regardless of whether the size gate flagged).**
Classify every changed file:

- **Mechanical/append-only** — a delivery-authored housekeeping path (`CLAUDE.md`,
  `CHANGELOG.md`, `changelog.d/*`, `docs/**`, `README.md`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`, `openapi/openapi.*`), OR any file whose diff is pure
  addition (zero deleted lines).
- **Substantive** — every other file.

```bash
mechanical_files=$(git diff origin/main...HEAD --numstat | awk '
  {
    file=$3
    is_housekeeping = (file ~ /^(CLAUDE\.md|CHANGELOG\.md|changelog\.d\/|docs\/|README\.md|\.claude-plugin\/(plugin|marketplace)\.json|openapi\/openapi\.)/)
    is_append_only = ($1 != "-" && $2 == 0)
    if (is_housekeeping || is_append_only) count++
  }
  END { print count+0 }
')
substantive_files=$(( diff_files - mechanical_files ))
```

Report `diff_composition: {total_lines, total_files, mechanical_files, substantive_files}` at
STAGE-GATE-3 preparation, adjacent to the Pre-Delivery Security Audit's own `audit_coverage`
self-declaration (`agents/orchestrator.md § "STAGE-GATE-3"`) — computed independently, so a
self-declared `full` coverage claim against a diff whose `substantive_files` count is large
reads as visibly implausible next to it.

---

## 6. The push-step precondition block (three conjuncts, none repairable in place)

**Before pushing, ALL THREE conjuncts below must hold. Each is fail-closed and none is
repaired in place — a failure re-opens process, it is never silently patched to unblock the
push.**

### (a) `gate3_release` / `gate_nonce` re-read

Re-read `gate3_release` from `00-state.md § Current State` immediately before this push,
confirm the bare literal `ship` together with its matching consumed `gate_nonce`, and abort
otherwise. The "No gate-field repair" invariant (`agents/_shared/gate-contract.md § "The
dual-record release"`) applies here without exception: a malformed or absent field is never
repaired to unblock the push.

### (b) Base-advance check

```bash
git fetch origin {default-branch}
git rev-list --count HEAD..origin/{default-branch}
```

This fetch belongs to this leg and is never inherited from any other fetch in this
procedure — nothing else refreshes `origin/{default-branch}`, so a count taken without this
fetch would read a ref last refreshed at Phase 2.8 and could return `0` on a base that has
since advanced, failing open on exactly the defect this leg exists to catch.

A non-zero count — even after STAGE-GATE-3 recorded `ship` — re-opens Phase 2.8 → Phase 3 →
STAGE-GATE-3 (`agents/orchestrator.md § "Phase 2.8 — Freeze"`) and is never resolved by a
merge or rebase that continues to the push.

**The pre-existing `origin/{branch-name}` divergence leg is removed, not retained beside
this one.** Its successor is git's own non-fast-forward push rejection: a non-zero
`HEAD..origin/{branch-name}` count is true precisely when `origin/{branch-name}` is not an
ancestor of `HEAD`, which is exactly when `git push` is refused — it reports immediately and
writes nothing on the remote. A rejected push is a hard stop surfaced to the operator —
**never** resolved by `--force`/`--force-with-lease` in any form, and **never** resolved by
an automatic `git pull --rebase` that continues to the push (which the removed leg did on a
non-zero count). Recovery is operator-directed from here.

**Why the base leg is the security-critical one.** A stale feature-branch ref produces a
loud failure git itself reports; a stale base produces a silent one that nothing reports —
and under this project's worktree discipline (one effort per worktree, one branch per
effort), another actor pushing to this same feature branch is not an admitted case.

### (c) Tree-anchor and post-gate write-allowlist check

Compare the current tree anchor against the fan-open anchor Phase 2.8 recorded
(`00-verify-packet.md § Tree anchor:`). On a mismatch, classify every changed path against
the **post-gate write allowlist** below:

```
CHANGELOG.md, changelog.d/**
{the three declared version sites, per § 1}
docs/knowledge.md, docs/decisions.md, docs/patterns.md
README.md
CLAUDE.md §3, §8, §9
```

Any changed path OUTSIDE this allowlist fails closed — re-open Phase 2.8 → Phase 3 →
STAGE-GATE-3. `agents/**`, `docs/dev-mode.md`, and `CLAUDE.md` §5/§6/§7 are explicitly OFF
this allowlist — every contract-statement surface stating this project's security floors is
never eligible for a silent post-gate pass.

Derive the changed-path set the same way the tree anchor itself is derived — committed range
plus the dirty working tree, untracked paths included; a plain `git diff --name-only HEAD` is
not sufficient on an already-dirty branch.

**Residual, stated at its true width.** This check classifies PATHS, not authorship and not
content — every byte inside an allowlisted path ships unread by construction, including
`docs/decisions.md` and `docs/patterns.md`, which carry no section restriction at all. The
`CLAUDE.md` section restriction is a hunk-header scan, coarser than a semantic diff — a
floor-weakening sentence smuggled inside an allowed §8 row would pass it. PR review is the
named backstop for this whole residual, not a substitute for it.

---

## 7. Push

```
git push --set-upstream origin {branch-name}
```

Never `--force` in any form — `dev-guard`'s destination-based floor gates this push
unconditionally on `gate3_release`, regardless of which agent invokes it; there is no
legitimate reason to force here in the first place, and no code path in this procedure ever
constructs a `--force`/`--force-with-lease`/`+refspec` invocation.

**If `has_remote: false`:** skip §§ 6-7. The branch and commit stay local (already committed
at § 4). Report: "Branch {branch-name} committed locally (no remote configured). Ready for
manual merge: `git checkout main && git merge {branch-name}`."

---

## 8. `gh pr create` / update

**Always target `main`.** Stacked PRs are PROHIBITED (same rationale as § 2). For a
multi-group delivery, follow the serial-merge contract from § 2.

**Check for an existing PR** (`gh pr list --head {branch} --base main --state all --json
number,url,title,state -q '.[0]'`, or the curl Tier A fallback per
`agents/_shared/gh-fallback.md`). `MERGED`/`CLOSED` → this should not happen if branch
creation (§ 2) ran correctly; report `status: failed` naming the stale PR. `OPEN` → update it
(`gh pr edit`). None → create it.

**Body.** Use `workspaces/{feature-name}/inputs/pr-body-draft.md` verbatim as `--body` — this
is `delivery`'s already-drafted prose artifact (its own Return Protocol produces it before
this procedure runs). Recompose only if the draft is missing or stale.

**Title format (by task payload `type:`):**

| `type:` | Format | Example |
|---|---|---|
| `feature`, `enhancement` | `feat({area}): {imperative summary}` | `feat(reports): add GET /reports/daily` |
| `refactor` | `refactor({area}): {imperative summary}` | `refactor(auth): extract token verification` |
| `fix` | `fix({area}): {imperative summary}` | `fix(date-range): exclude to-boundary in picker` |
| `hotfix` | `fix({area}): {imperative summary} (hotfix)` | `fix(auth): bypass on empty token (hotfix)` |

`{area}` is the kebab-case module/service name. Title cap: 72 characters.

```
gh pr create --base main \
  --title "{type-prefix}({area}): {short summary}{hotfix-suffix-if-applicable}" \
  --assignee @me \
  --label "{label1},{label2}" \
  --project "{project-number}" \
  --body "$(cat workspaces/{feature-name}/inputs/pr-body-draft.md)"
```

Labels/project come from the linked GitHub issue when one exists (delivery's Step 2
detection); omit `--project` if no board exists. `Closes #{number}`/`Fixes #{number}` is
inside the draft body already — never synthesize a number when no issue is linked.

**When `has_gh: false`:** use the Tier B fallback chain (`agents/_shared/gh-fallback.md`).
When neither `gh` nor a token is available, emit the compare URL and body file and report
`status: blocked-manual-push` — the pipeline resumes when the operator replies `pr opened
#N`.

**Never fail because a PR already exists** — detect and handle gracefully. **When push
succeeded but `gh pr create` fails:** report `status: blocked-pr-pending` — the remote branch
already exists; do not re-push, emit the compare URL and body file, and wait for the operator
to reply `pr opened #N`.

---

## 9. Merge-state poll (post-create check, mandatory, best-effort, report-only)

**Gate.** Run only when `has_remote: true` AND `has_gh: true` AND a PR number is known. If
`has_gh: false`, log `mergeable_state: not-verified: gh-unavailable` and continue without
failing.

```bash
gh pr view {pr-number} --json mergeable,mergeStateStatus,statusCheckRollup
```

**Bounded backoff for `UNKNOWN`** (GitHub computes `mergeable` asynchronously): retry at 0s,
2s, 4s (3 attempts, ~6s worst case); stop early once `mergeable != UNKNOWN`. Still `UNKNOWN`
after 3 attempts → terminal-undetermined.

| `mergeable` / `mergeStateStatus` | Reported as |
|---|---|
| `MERGEABLE` / `CLEAN` | Merge state: CLEAN |
| `CONFLICTING` / `DIRTY` | Merge state: **CONFLICTING** — base has diverged; PR cannot merge as-is |
| `UNKNOWN` after 3 attempts | Merge state: UNDETERMINED — verify before merge |
| Other (`BLOCKED`/`BEHIND`/`UNSTABLE`) | Surfaced verbatim with a one-line gloss |

**CI, reported without waiting for a conclusion.** Summarize `statusCheckRollup`: all
`SUCCESS` (or empty) → `passing`/`none`; any `FAILURE`/`ERROR`/`TIMED_OUT`/`CANCELLED` →
`failing`; any `PENDING`/`IN_PROGRESS`/`QUEUED` (none failing) → `pending` — reported as
`CI: pending — check with gh pr checks`, never polled to a conclusion. This step closes the
instant it has reported URL, number, merge state, and CI state — it does not wait for CI to
resolve, per the design rationale in `01-plan.md § Proposed Approach → "Close without waiting
for CI"`.

**On `CONFLICTING`:** append a one-line offer (never an automatic action) — "To resolve:
rebase the branch on the current base and resolve conflicts, then re-push." Never perform the
rebase automatically; it is an outward action requiring operator approval.

**No CodeRabbit detection.** This poll reports GitHub's own merge/CI signals only —
automated-review-tool detection is out of scope.

---

## Control rubric

| Control | Enforcer | Failure direction | Invoker | Read at |
|---|---|---|---|---|
| Sole version-bump site is the coordinator | prose-only — no hook checks this | fail-open — an unauthorized bump in the diff is only caught by the read at § 1 | orchestrator, § 1 | this file § 1 |
| Multi-site version MATCH | prose-only, coordinator self-applied | fail-closed — a divergence stops before staging | orchestrator, § 1 | this file § 1 |
| Push-step precondition (a) `gate3_release`/`gate_nonce` | "No gate-field repair" invariant, prose-only | fail-closed — abort, never repaired in place | orchestrator, § 6(a) | `agents/_shared/gate-contract.md § "The dual-record release"` |
| Push-step precondition (b) base-advance | prose-only, coordinator self-applied | fail-closed — re-opens Phase 2.8 → Phase 3 → STAGE-GATE-3 | orchestrator, § 6(b) | this file § 6 |
| Push-step precondition (c) tree-anchor + allowlist | prose-only, coordinator self-applied | fail-closed on any out-of-allowlist path | orchestrator, § 6(c) | this file § 6 |
| No force-push from this procedure | `dev-guard` (destination-based, unconditional on `gate3_release`) | fail-closed — denied at the tool-call level | orchestrator, § 7 | `docs/dev-mode.md § "Outward-Action Gate"` |
| Merge-state poll never blocks on CI conclusion | prose-only | n/a — report-only, never a gate | orchestrator, § 9 | this file § 9 |
