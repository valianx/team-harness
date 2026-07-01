---
name: release
description: Cut a plugin release — aggregate pending changelog.d/ fragments and version.d/ markers, derive the bump level, bump all three version sites once, and push a release/vX.Y.Z branch.
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

## Mode — No input provided

When `$ARGUMENTS` is empty, proceed directly to Step 1 (discovery). No feature name is required — the release always aggregates ALL pending `changelog.d/` and `version.d/` work.

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly.
- The `release/vX.Y.Z` branch name is the release-PR discriminator used by `hooks/prepublish-guard.sh`. The guard requires all three version sites bumped and matching the branch version.
- Do NOT skip the confirmation gate at Step 1e — the operator must confirm before any version change is made.
- After the PR is merged to `main`, `claude plugin update` will serve the new version to all operators.
- Output: `release/vX.Y.Z` branch, CHANGELOG.md updated, all three version sites bumped, `changelog.d/` emptied, `version.d/` emptied, PR opened.
