---
name: release
description: Cut a plugin release — aggregate pending changelog.d/ fragments and version.d/ markers, derive the bump level, bump all three version sites once, and push a release/vX.Y.Z branch. `--with <feature-branch>` folds the same cut into that feature branch's own PR instead (single-PR release path).
---

Analyze the input: $ARGUMENTS

---

**Team-harness-internal release tooling.** This skill hardcodes team-harness's own three plugin version sites and its `changelog.d/`/`version.d/` deferred-batch model (see `CLAUDE.md §6.3`, `docs/cost-and-caching.md`). It is NOT part of the shipped default delivery flow — a consuming repository's per-PR delivery bumps its own project version directly and never invokes this skill.

## What this skill does

`/th:release` cuts a plugin release by:

1. **Read-only discovery** — lists all pending `changelog.d/` fragments and `version.d/` markers, derives the bump level and target version, and presents a summary for operator confirmation.
2. **Confirmation gate** — waits for the operator to confirm before any version change or push.
3. **Release cut** — routes through the orchestrator into delivery `release-mode`, which bumps all three synchronized version sites once, assembles `changelog.d/` fragments into the versioned CHANGELOG section, empties `version.d/`, tags, and pushes a `release/vX.Y.Z` branch.

**Urgent single-PR override:** to release immediately after an urgent/security merge without waiting to batch other pending work, run `/th:release` right after the merge. The release step aggregates all pending fragments including the just-merged one.

**Inline-release mode (`--with <feature-branch>`):** folds the same three-site bump + `changelog.d/` assembly into a feature branch's OWN pull request instead of opening a second `release/vX.Y.Z` PR — one PR, one CI run, one review/merge cycle. See § "Mode — Inline release" below. The no-flag batch mode above is unchanged and remains the right choice when several PRs have accumulated pending work between releases.

---

## Step 1 — Read-only discovery

Before doing anything else, run the following read-only checks:

**1a. List pending `changelog.d/` fragments:**
```bash
ls changelog.d/*.md 2>/dev/null | sort || echo "(none)"
```

For each fragment found, scan its content and record the highest-severity subsection header:

| Subsection | SemVer level |
|---|---|
| `### Removed` | major |
| `### Added` / `### Deprecated` | minor |
| `### Fixed` / `### Changed` / `### Security` | patch |

**1b. List pending `version.d/` markers:**
```bash
ls version.d/*.bump 2>/dev/null | sort || echo "(none)"
```

For each marker found, read its one-line content (`patch`, `minor`, or `major`) and record the level.

**1c. Derive the bump level:**
Take the MAX across all fragment-derived levels and all marker levels. If no fragments and no markers are found, the release has nothing to cut — stop and report:

```
No pending changelog.d/ fragments or version.d/ markers found. Nothing to release.
Run feature pipelines first to accumulate pending work, then re-run /th:release.
```

**1d. Compute the target version:**

Read the current version from `.claude-plugin/plugin.json` (`"version"` field). Apply the derived bump level using SemVer rules (MAJOR resets MINOR and PATCH; MINOR resets PATCH). The result is the target version `X.Y.Z`.

**1e. Present the discovery summary to the operator:**

```
Release discovery:
  Current version:  {current}
  Pending fragments: {N} file(s) in changelog.d/
    {list of fragment filenames}
  Pending markers:   {M} file(s) in version.d/
    {list of marker filenames with their level}
  Derived bump level: {major|minor|patch}
  Target version:     {X.Y.Z}

The release will:
  - Bump .claude-plugin/plugin.json, .claude-plugin/marketplace.json, and CLAUDE.md §3
    from {current} → {X.Y.Z}
  - Assemble changelog.d/ fragments into CHANGELOG.md under ## [{X.Y.Z}] - {date}
  - Delete all changelog.d/ fragments and version.d/ markers
  - Push branch release/v{X.Y.Z} for PR review and merge

Confirm release? [Y/n]
```

Wait for operator reply. If the operator replies `n` or `no`, abort with no changes. If `Y`, `y`, or Enter, proceed to Step 2.

---

## Step 2 — Route to orchestrator in release-mode

Pass to the `orchestrator` agent:

```
Direct Mode Task:
- Mode: deliver
- Feature: release-v{X.Y.Z}
- release-mode: true
- target-version: {X.Y.Z}
- Branch: release/v{X.Y.Z}
- Summary: Release v{X.Y.Z} — aggregate {N} changelog.d/ fragments and {M} version.d/ markers; bump level {major|minor|patch}
```

The orchestrator routes to the `delivery` agent in `release-mode`, which:
- Passes `skip-version: false` and `release-mode: true` to delivery
- Delivery runs Step 9-R (bump-level aggregation), Steps 9.0–9.4a (version bump at all three sites), and Step 9e (CHANGELOG assembly)
- Delivery empties `version.d/` after aggregation (Step 9-R-4)
- Delivery creates and pushes the `release/v{X.Y.Z}` branch
- Delivery opens a PR from `release/v{X.Y.Z}` → `main`

---

## Step 3 — Verify the release tag (post-merge)

**Degraded to verify-only.** `.github/workflows/tag-sync.yml` is the single, deterministic, idempotent tag authority: it fires on every `push: main` that changes `.claude-plugin/plugin.json`, checks `git ls-remote --tags` first, and creates + pushes `v{X.Y.Z}` itself (a no-op if the tag already exists). A manual push here was redundant with that workflow and could race it. This step therefore verifies the tag landed rather than creating it:

```bash
git ls-remote --tags origin "refs/tags/v{X.Y.Z}"
```

If the tag is present, the release cut is complete — no further action. If it is absent after a short wait (`tag-sync.yml` typically completes within a minute of the merge), fall back to the manual create-and-push as a safety net — this remains an outward action gated by `hooks/dev-guard.sh` like any other push and requires operator approval:

```bash
git checkout main
git pull origin main
git tag v{X.Y.Z}
git push origin v{X.Y.Z}
```

Pushing the tag (whether by `tag-sync.yml` or the manual fallback) is what feeds the opencode release pipeline: `.github/workflows/release.yml` triggers on `push: tags: ["v*"]` and cross-compiles the install binaries, writes the `VERSION` asset, and publishes the GitHub Release that `bin/update-opencode.sh` checks against.

---

## Step 4 — Apply the release to local runtimes (post-tag)

Once the tag is pushed (Step 3), the release exists in both places it will be consumed — the marketplace catalog (already on `main`) and the GitHub Release artifacts (published by `release.yml`). This step runs quietly and reports once, in the same output discipline as `/th:update` (`skills/update/SKILL.md § Output discipline`): no intermediate narration, one final operator-facing report.

Two independent legs run, each with its own failure isolation (AC-4): a failure in one leg reports its manual fallback command and does not block the other leg. Neither leg's failure reverts the tag or marks the release as failed — the release is already published and stays published regardless of what happens to the operator's local runtimes.

### Leg 1 — Claude Code (immediate, no gate)

The marketplace catalog for `th` is read from `main`, already merged before this step runs — this leg does not wait on `release.yml`.

```bash
claude plugin marketplace update team-harness-marketplace
claude plugin update th@team-harness-marketplace
```

Report the version delta as installed → downloaded. This leg does **not** sync the managed `~/.claude/CLAUDE.md` blocks — that recurring sync is `/th:update`'s domain (`skills/update/SKILL.md § Division of labour`), not duplicated here. Close by stating that `/reload-plugins` (or restarting Claude Code) is an action for the operator to take — never state that `{X.Y.Z}` is active.

If `claude` is not on PATH or either command errors, record the failure for this leg's report row and state the manual fallback: `Run /th:update after installing the claude CLI.` Continue to Leg 2 regardless.

### Leg 2 — opencode (gated on publication)

`release.yml` needs roughly a minute to cross-compile the binaries and publish the `VERSION` asset, so this leg polls for that publication before running the updater.

**Publication gate.** Poll `https://github.com/valianx/team-harness/releases/latest/download/VERSION`, comparing the trimmed response against `{X.Y.Z}` exactly:

- Interval: 15 seconds. Maximum attempts: 12 (180-second ceiling).
- A 404, a version mismatch, or a network hiccup all mean "not yet published — keep polling"; none of these is treated as a failure on its own.
- On a match, proceed to the updater below.
- If the ceiling is reached without a match, report `opencode: publication gate timed out after 180s — run the updater manually: ./bin/update-opencode.sh (or .\bin\update-opencode.ps1 on Windows; without a checkout, download the updater from https://valianx.github.io/team-harness/update-opencode.sh to a file and run it)` and continue to the final report. Do not abort or retry beyond the ceiling.

**Updater.** Once the gate clears, run the OS-appropriate updater, preferring the repo copy over the published fallback:

- Linux/macOS: `./bin/update-opencode.sh` when the repo is present at the working directory; otherwise download first, then execute — never pipe the remote script directly into the shell: `TMP_UPD=$(mktemp) && curl -fsSL -o "$TMP_UPD" https://valianx.github.io/team-harness/update-opencode.sh && bash "$TMP_UPD"; rm -f "$TMP_UPD"`.
- Windows: `.\bin\update-opencode.ps1` when the repo is present; otherwise download the equivalent Pages URL to a temp file with `Invoke-WebRequest -OutFile` and run that file — never `iwr … | iex`.

The download-then-execute form avoids running a truncated or tampered stream directly; the strong supply-chain floor is one layer down and unchanged by this step: the updater's own cheap `VERSION` pre-check and its SHA256 fail-closed verification of the release binary. The Go binary it invokes re-confirms the three-state delta authoritatively: update-available (applied) / already current / installed ahead. Report that delta using this exact vocabulary. Close by stating that restarting opencode is an action for the operator to take — never state that `{X.Y.Z}` is active.

If the updater errors (missing CLI, network failure) after the gate cleared, record the failure for this leg's report row and state the manual fallback command shown above. This does not affect Leg 1's report or the already-published release.

### Final report (AC-5)

Emit exactly one operator-facing message after both legs complete — no per-leg narration in between. Use this template, filling values from the run (no version literals in the surrounding prose — only the resolved values belong inside the block):

```
release local-apply — <both applied | partial | both manual>

  claude code
    catalog refresh     done
    installed version   <X>
    downloaded version  <Y>            (or "already current" | "manual: <reason> — run /th:update")
  opencode
    artifact gate       published (VERSION={X.Y.Z})   (or "timed out after 180s — run the updater manually")
    result               <update-available applied | already current | installed ahead | manual: <reason>>
```

Closing line (outside the fence): `Next: /reload-plugins (or restart Claude Code) to activate {X.Y.Z} in Claude Code; restart opencode to activate it there.`

---

## Mode — No input provided

When `$ARGUMENTS` is empty, proceed directly to Step 1 (discovery). No feature name is required — the release always aggregates ALL pending `changelog.d/` and `version.d/` work.

---

## Mode — Inline release (`--with <feature-branch>`)

Folds the release cut into an already-open feature branch's own pull request instead of opening a second `release/vX.Y.Z` PR. Use this when a single feature PR should ship as its own release (no other pending work needs batching) — one PR, one CI run, one review/merge cycle. This decouples the release path from the `release/vX.Y.Z` branch-name convention via an in-tree marker; see `hooks/ts/bodies/prepublish-guard.ts` § release-cut recognition.

Parse `$ARGUMENTS` for `--with <feature-branch>`. If the named branch does not exist locally or on `origin`, abort and report the branch was not found — do not guess a substitute branch.

**Step 1 (inline) — Read-only discovery.** Identical to Step 1a–1d above (list `changelog.d/` fragments and `version.d/` markers, derive the bump level and target version). The discovery summary additionally states the target branch and that no new branch will be created:

```
Release discovery (inline — feature branch {feature-branch}):
  Current version:  {current}
  ...(same fields as Step 1e)...

The release will:
  - Bump .claude-plugin/plugin.json, .claude-plugin/marketplace.json, and CLAUDE.md §3
    from {current} → {X.Y.Z} ON {feature-branch} (no new branch)
  - Assemble changelog.d/ fragments into CHANGELOG.md under ## [{X.Y.Z}] - {date}
  - Write version.d/.release-cut = v{X.Y.Z} so prepublish-guard recognizes the release-path
    on this feature branch
  - Delete all changelog.d/ fragments and version.d/*.bump markers (the .release-cut marker
    itself is not deleted — see agents/delivery.md Step 9-R-5)
  - Fold all of the above into {feature-branch}'s existing (or about-to-open) PR — no second PR

Confirm inline release? [Y/n]
```

Wait for operator reply; abort with no changes on `n`/`no`.

**Step 2 (inline) — Route to orchestrator in inline-release mode.** Pass to the `orchestrator` agent:

```
Direct Mode Task:
- Mode: deliver
- Feature: {feature-branch's own feature name}
- inline-release: true
- target-version: {X.Y.Z}
- Branch: {feature-branch}
- Summary: Inline release v{X.Y.Z} on {feature-branch} — aggregate {N} changelog.d/ fragments and {M} version.d/ markers; bump level {major|minor|patch}
```

The orchestrator routes to `delivery` in `inline-release` mode (see `agents/delivery.md` Step 9's mode table), which bumps all three sites, assembles `changelog.d/`, writes the `version.d/.release-cut` marker, and continues the SAME feature PR through its normal STAGE-GATE-3 — no separate release branch, no second PR.

**Step 3 (inline) — Verify the tag, same as batch mode.** Once the feature PR merges to `main`, the tag verification in Step 3 above applies unchanged (`tag-sync.yml` is the single tag authority regardless of which mode cut the release).

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly.
- Batch mode: the `release/vX.Y.Z` branch name is the release-PR discriminator used by `hooks/ts/bodies/prepublish-guard.ts`. Inline mode: the `version.d/.release-cut` marker (or a `release-cut: vX.Y.Z` commit trailer) is the discriminator instead — the branch name stays the feature branch's own name. Either path enforces the same three-site-bumped-and-matching invariant; the marker authorizes RUNNING that check on a feature branch, never bypassing it.
- Do NOT skip the confirmation gate at Step 1e (batch mode) or its inline-mode equivalent — the operator must confirm before any version change is made.
- After the PR is merged to `main`, `claude plugin update` will serve the new version to all operators, and Step 3 above verifies the tag that feeds the opencode artifact pipeline (`release.yml`).
- Step 4 runs the download/apply legs for both local runtimes but never performs the activation itself — `/reload-plugins` (Claude Code) and restarting opencode stay operator-driven, and Step 4 never states that the new version is active before that happens.
- Step 4's Claude Code leg does not sync the managed `~/.claude/CLAUDE.md` blocks; that recurring sync remains `/th:update`'s standalone contract (`skills/update/SKILL.md`), not duplicated here.
- Output (batch mode): `release/vX.Y.Z` branch, CHANGELOG.md updated, all three version sites bumped, `changelog.d/` emptied, `version.d/*.bump` emptied, PR opened, `vX.Y.Z` tag verified (or created as fallback) post-merge, both local runtimes' download/apply legs run with a per-runtime report.
- Output (inline mode): the named feature branch gains the same version-site bumps + CHANGELOG assembly + `version.d/.release-cut` marker, folded into its existing PR — no new branch, no second PR; tag verification is identical to batch mode.
