# Delivery Mechanics (the coordinator's deterministic half)

This file is the single source of truth for the mechanical, one-correct-answer half of
delivery: every step here is executed by the orchestrator directly (Bash/`gh`/`git`), never
dispatched to a subagent. `delivery` owns only the prose half: changelog fragment text, the
workspace acceptance matrix, and the PR-body draft. It runs once after STAGE-GATE-3 records
`ship`; it has no prepare mode, knowledge-capture mode, post-PR tail, or post-merge cleanup.
`agents/ref-pipeline.md § Phase 4 — Delivery` points here by reference; do not re-derive or
paraphrase this file's procedures inline there.

**Why this split exists, and why it lives in `_shared/` rather than inline in
`agents/ref-pipeline.md`.** A step with one mechanically correct answer belongs to the
coordinator; a step needing judgment belongs to the lens that judges it. This file is read
once, at Phase 4 — never at boot, unlike anything inlined directly into
`agents/ref-pipeline.md`, which is loaded only for an active pipeline. Same pattern as
`agents/_shared/dispatch-contract.md` and `agents/_shared/gate-contract.md`.

**Ordering — this file's procedures run in the order listed**, immediately after
STAGE-GATE-3 records `gate3_release: ship` and the single `delivery` dispatch returns with
`changelog.d/{pr-slug}.md` when applicable, the workspace Acceptance Matrix, and
`workspaces/{feature-name}/inputs/pr-body-draft.md`. Product documentation, OpenAPI, and
memory files are part of the reviewed implementation tree or are absent; Phase 4 never
authors them.

---

## 1. Version sites and the multi-site MATCH check

**Sole version-bump site.** The coordinator is the ONLY executor that sets the project
version — no implementer, tester, or `delivery` subagent step may set or modify it. If a
version change is detected in the diff that this run did not author, treat it as an
unauthorized bump: do NOT proceed until the change is reverted or the operator confirms it
intentional. An over-bump above the mechanical SemVer floor (e.g. a MINOR applied to a
PATCH-floor diff) requires a `bump-override: {level} — <reason>` justification, surfaced at
STAGE-GATE-3 (`agents/ref-pipeline.md § "STAGE-GATE-3"`, `bump_override` gate-data field) and
recorded as a PR-body/commit-trailer line — this is prose-only, reviewed by the operator at
that gate; no unwired hook enforces it mechanically.

**Shipped default vs repo-local deferral.** No `skip-version` flag, or `skip-version: false`
→ bump once at assembly (min one, max one). team-harness itself does not use this escape
hatch — its own `CLAUDE.md §6.3` documents the per-PR shipped default, not a deferral.
`skip-version: true` — set only when the consuming repository documents a repo-local
versioning/release-deferral convention — skips
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

## 2. Branch validation

Phase 2 already established `working_branch` before any implementation dispatch. Phase 4
validates that decision; it never creates, switches, pulls, merges, or rebases a branch after
review.

Require all of the following:

- `working_branch` is non-null and equals `git branch --show-current`;
- it is not the repository's default branch;
- it uses the prefix resolved at Phase 2 (`feat`, `fix`, `refactor`, `docs`, or `chore`);
- no `MERGED` or `CLOSED` PR already owns the same head/base pair; and
- multi-group delivery is on the exact group branch declared by the approved plan.

Any mismatch is an upstream branch-guarantee failure: STOP and return to Phase 2 entry. Never
"repair" it by creating a late branch around already-reviewed commits. Stacked PRs remain
prohibited; serial groups branch from the newly updated base only after the previous group
lands.

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
`[a-z0-9-]+`. Copy entry text verbatim: assembly may order and deduplicate headings,
but must not reflow, expand, explain, split a bullet, or add notes around the
assembled content.

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

**Stage — explicit paths only, never a directory sweep.** Phase 4 stages only the release
cut, the current changelog fragment state, and resolved version sites. The acceptance matrix and PR-body draft live under the
gitignored workspace; every other tracked artifact was committed before Freeze.
```
git add CHANGELOG.md          # only when § 3 changed it
# Every version site § 1 RESOLVED, not a fixed pair. § 1's resolution order can land on
# package.json, pyproject.toml, Cargo.toml or a declared multi-site list; staging only the
# plugin manifests leaves a generic repo's bumped version uncommitted.
git add {each resolved version site from § 1}   # only if version bumped
git add -- changelog.d/{pr-slug}.md  # when it still exists or a tracked deletion remains — see below
```

**The changelog fragment, stated precisely because the naive form fails.** Resolve its state
after § 3:

- **Still exists** (`skip-version: true` or no release cut): stage the file. This includes a
  newly created fragment; leaving it untracked would make the push precondition fail.
- **Absent but tracked in `HEAD`** (an older fragment assembled and deleted by § 3): stage
  the deletion with `git add -- changelog.d/{pr-slug}.md`.
- **Absent and never tracked** (created and consumed in this same Phase 4): do not stage the
  vanished path; its content is already in `CHANGELOG.md`.

Use a file-existence check followed by
`git ls-files --error-unmatch -- changelog.d/{pr-slug}.md`; never let an expected pathspec
miss abort publication.

If version was bumped, verify EVERY resolved site from § 1 is staged (`git diff --cached --name-only`
must list each one) — if any is missing, stop and fix before committing. Never stage unrelated files.

**Commit** (conventional commits):
```
git commit -m "chore(release): bump <version> for {feature_name}"   # version bumped
git commit -m "docs(changelog): record {feature_name}"              # version skipped, changelog changed
```

When neither version nor CHANGELOG nor a surviving changelog fragment changed, there is no
Phase-4 commit. Do not create an empty commit merely to preserve a historical delivery shape.

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
| Either cap exceeded | Read `02-implementation.md § Reviewability Exceptions`. If present, proceed and persist the justification in Delivery coordinates for the PR body. Otherwise STOP — this is never an unconditional block: document the justification (split preferred, or a stated reason) before proceeding. |

There is no size tier that aborts unconditionally regardless of justification — the
composition breakdown below, presented at STAGE-GATE-3, is what lets the operator judge a
large, unsplit diff; a line-count ceiling never substitutes for that judgment.

**Diff composition (unconditional — computed regardless of whether the size gate flagged).**
Classify every changed file:

- **Mechanical** — only `CHANGELOG.md`, `changelog.d/*`, and the exact version sites
  resolved in § 1.
- **Substantive** — every other file.

**Pure addition is NOT a mechanical signal.** A newly added production source file also has
zero deleted lines, so an append-only shortcut would classify the most substantive change a
diff can contain as housekeeping — undercounting exactly the surface this breakdown exists to
show beside `audit_coverage`, which is what lets the operator judge an implausible `full`
coverage claim. Classification is by PATH, never by deletion count.

Count paths by exact set membership against that rule. Do not use line shape, extension,
directory-wide documentation allowlists, or an "append-only" shortcut. In particular,
README, CLAUDE.md, `docs/**`, OpenAPI, source, tests, and agent contracts are substantive
unless one exact path is also a resolved version site.

Report `diff_composition: {total_lines, total_files, mechanical_files, substantive_files}` at
STAGE-GATE-3 preparation, adjacent to the Pre-Delivery Security Audit's own `audit_coverage`
self-declaration (`agents/ref-pipeline.md § "STAGE-GATE-3"`) — computed independently, so a
self-declared `full` coverage claim against a diff whose `substantive_files` count is large
reads as visibly implausible next to it.

---

## 6. The push-step precondition block (three conjuncts, none repairable in place)

**Before pushing, ALL THREE conjuncts below must hold. Each is fail-closed and none is
repaired in place — a failure re-opens process, it is NEVER silently patched to unblock the
push.**

### (a) `gate3_release` / `gate_nonce` re-read

Re-read `gate3_release` from `00-state.md § Current State` immediately before this push and
confirm the bare literal `ship`. **Read the nonce from the release EVENT, not from the state
field.** Recording the release consumes `gate_nonce` — it is invalid the instant the release
is written (`agents/_shared/gate-contract.md § "The dual-record release"`), so the live field
is null and cannot be matched against anything. The consumed value survives in the other half
of the dual record: the `stage.gate.release` line in `{events_file}`, which carries `stage`,
`decision` and `gate_nonce` (the consumed value). Confirm that event's nonce is the one this
gate issued, and abort otherwise. The "No gate-field repair" invariant (`agents/_shared/gate-contract.md § "The
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
STAGE-GATE-3 (`agents/ref-pipeline.md § "Phase 2.8 — Freeze"`) and is never resolved by a
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

**Independent untracked-file guard (runs FIRST, unconditionally — mirrors
`docs/suite-evidence.md § 4`'s equivalent guard for the identical primitive).** Before
computing or comparing any tree anchor, run `git status --porcelain` on its own. If it
reports ANY untracked path, that alone is sufficient to force re-opening Phase 2.8 → Phase 3
→ STAGE-GATE-3 — **independent of, and in addition to**, whatever the tree-anchor comparison
below would otherwise conclude. Rationale, stated at its true width: `git diff` does not
report untracked paths, so a new file left uncommitted at this, the more security-critical of
the two anchor-comparison sites (it guards the irreversible push), would otherwise leave a
prior anchor looking intact over a tree that in fact changed — the exact failure mode
`docs/suite-evidence.md § 4` names for its own sibling primitive. This guard is unconditional:
it fires even when the tree-anchor comparison below reports a clean match.

Compare the current tree anchor against the fan-open anchor Phase 2.8 recorded
(`00-verify-packet.md § Tree anchor:`), re-deriving the current side FRESH per the canonical
algorithm at `docs/verification-packet.md § 1a` (never re-derived or paraphrased here). On a
mismatch, classify every changed path against
the **post-gate write allowlist** below:

```
CHANGELOG.md, changelog.d/**
{the declared version sites, restricted to the exact version field resolved in § 1}
```

Any changed path OUTSIDE this allowlist fails closed — re-open Phase 2.8 → Phase 3 →
STAGE-GATE-3. Outside an exact resolved version-field update, README, CLAUDE.md, AGENTS.md,
`docs/**`, OpenAPI, product code, tests, and agent contracts are all outside the allowlist.
A required change to one of those surfaces must land before Freeze and pass the normal
verification fan.

Derive the changed-path set the same way the tree anchor itself is derived — per
`docs/verification-packet.md § 1a`'s canonical algorithm, never re-derived or paraphrased
here.

**Residual.** This check classifies paths, not authorship or semantic content. The remaining
allowlist is intentionally limited to release assembly: changelog paths and version sites.
PR review remains the content backstop for those release artifacts.

---

## 7. Push

**Active gh account capture (diagnostic, never blocking).** Immediately before the push,
capture the account this push and the following `gh pr create` will attribute to:

```bash
gh_active_account="$(gh api user -q .login 2>/dev/null || echo "unknown")"
```

Report it in the delivery summary as `gh_account: <login>`. The push is now the
coordinator's own single mechanical step immediately after the gate, so one capture
right here is current by construction. A wrong-account push is a
known operational friction
(the operator's own account may differ from the one `gh auth` currently holds) — this capture
is diagnostic only, it never blocks the push; a `gh api user` failure logs `unknown` and
proceeds.

```
git push --set-upstream origin {branch-name}
```

Never `--force` in any form. `gate3_release: ship` is the operator's approval for this standard
push and the following draft PR; do not ask conversationally again. The active runtime may still
surface a technical tool-approval prompt, but there is no legitimate reason to force here, and no code path in this procedure ever
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

Labels/project come from issue coordinates already captured during Intake in `00-state.md`;
omit either flag when its value is absent. `Closes #{number}`/`Fixes #{number}` is inside the
draft body already — never synthesize a number when no issue is linked.

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
resolve. The reason is durable and does not depend on a per-run workspace artifact: the merge
state is known the instant the PR exists, the CI conclusion is not, and the conclusion only
gates the merge — which is the operator's own, later action.

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
| No force-push from this procedure | coordinator contract + active runtime approval | fail-closed — never invoked | orchestrator, § 7 | this file § 7 |
| Merge-state poll never blocks on CI conclusion | prose-only | n/a — report-only, never a gate | orchestrator, § 9 | this file § 9 |
