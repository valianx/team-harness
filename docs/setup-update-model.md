# The setup/update model

This document describes the working model that governs how Team Harness is installed and kept current. The model was previously implicit, spread across `skills/setup/SKILL.md` and `skills/update/SKILL.md`. This document brings it together in one place, with the SKILL.md files remaining the authoritative source for per-OS command syntax.

---

## Division of labour: setup vs update

`/th:setup` and `/th:update` are not interchangeable. Each owns a distinct set of concerns and runs at a different frequency.

| What | Owner | Frequency |
|------|-------|-----------|
| Native preferences — workspace mode (`logs-mode`, `logs-path`, `logs-subfolder`), default `language`, English-learning mode, GitHub identity routes (`github.account_routes`) | `/th:setup` | One-time bootstrap; re-run to reconfigure |
| FILES — reconcile managed `~/.claude/CLAUDE.md` general-agent and voice blocks | `/th:update` | Every update run |
| FLOWS — marketplace catalog refresh, plugin version download | `/th:update` | Every release |
| `~/.claude/.team-harness.json` full write (merge-write-whole-document) | `/th:setup` | One-time bootstrap; re-run to reconfigure |

**Key constraint:** `/th:update` reads the native Team Harness settings document but never writes operator preferences. It does not offer or record machine-wide depth settings, telemetry, or MCP credentials.

---

## Two propagation classes

Team Harness artifacts fall into two classes based on how they reach an installed machine after a release.

### Cache artifacts (auto-loaded)

These artifacts live inside the plugin cache directory (`~/.claude/plugins/cache/team-harness-marketplace/th/<version>/`) and are loaded automatically by the Claude Code plugin runtime on update and reload. No explicit copy step is required.

**Artifacts in this class:**
- `agents/*.md` — all agent system prompts
- `skills/<name>/SKILL.md` — all namespaced plugin skills (e.g. `/th:update`, `/th:setup`)
- Retained session context and observation assets — loaded by the applicable native host integration

**Evidence:** the plugin runtime resolves the installed skill and agent resources from the selected version after `/reload-plugins`; host-native permissions and approvals remain separate and authoritative.

**Implication:** to ship a new agent or skill, it is sufficient to add the file to the repo and release. No sync step in `/th:update` is required for cache artifacts.

### Fixed-path artifacts (explicit sync required)

These artifacts live at fixed paths under `~/.claude/` outside automatic plugin-cache management. `/th:update` Step 6 reconciles them on each run; ownership and current content determine whether a write is needed.

**Artifacts in this class:**

| Artifact | Target path | Mechanism in `/th:update` Step 6 |
|----------|-------------|----------------------------------|
| `orchestrator-dispatch-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Provenance-aware reconciliation; preserve operator edits unless explicitly forced |
| `voice-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Provenance-aware reconciliation; preserve operator edits unless explicitly forced |

> **Retired entry mechanisms:** the `dev-mode`, `nested-dispatch-takeover` and `dev-mode-entry` blocks, activation marker and developer-mode output style are no longer installed. Update removes the retired managed blocks and follows [bounded style migration](dev-mode.md#retire-an-existing-developer-mode-selection) for existing selections. Session startup supplies workflow discovery, language and workspace context. Native host permissions and approvals remain independent of style selection.

For the exact per-OS command blocks (bash and PowerShell), see `skills/update/SKILL.md` Step 6.

---

## The update flow (three steps)

A `th` update is three distinct steps. The skill performs two; the operator performs one.

1. **Refresh the catalog** — `claude plugin marketplace update team-harness-marketplace`
   Updates the marketplace metadata so the CLI knows a newer version exists. Downloads nothing.

2. **Download the new version** — `claude plugin update th@team-harness-marketplace`
   Fetches the new version into the plugin cache. This is the step that actually downloads; the catalog refresh alone does not.

3. **Activate** — `/reload-plugins`
   Loads the downloaded version into the running session. Reconnect only when
   the host reports that a changed component cannot activate in place.

`/th:update` performs steps 1 and 2 from Bash, then runs the Step 6 fixed-path sync described in [Fixed-path artifacts (explicit sync required)](#fixed-path-artifacts-explicit-sync-required). Step 3 is operator-driven — the skill cannot reload the session.

Running `/th:update` every release keeps both the cache artifacts (via the plugin runtime) and the fixed-path artifacts (via Step 6) aligned. Re-running `/th:setup` is **not** part of the update flow.

---

## Self-healing / idempotency

`/th:update` reconciles its managed fixed-path artifacts on every run,
including an equal-version run. For Claude Code blocks, the current
[update method](../skills/update/SKILL.md) owns the decision matrix:

- **Managed CLAUDE.md blocks** — insert absent blocks and stamp their provenance;
  preserve unchanged canonical content; update known harness-owned content;
  preserve operator-edited content unless `--force-blocks` is explicitly selected.
  Unstamped legacy blocks follow the method's adoption rules. A malformed marker
  pair produces a warning and is skipped rather than duplicated.
- **Retired output style** — inspect and migrate verified TH selections separately; preserve custom files and unrelated settings. No style is copied on fresh or repeated runs.

Repeated updates repair missing or eligible managed content while retaining
operator ownership. Their atomic write and rolling backup apply only when a
change is required; a current document remains an idempotent no-op.

For example, an absent managed block is restored on the next update. A block
whose live hash differs from its stored provenance is retained as operator-edited;
restoring canonical content then requires the explicit force option.

---

## Author maintenance invariant (normative)

> When a new fixed-path artifact is introduced under `~/.claude/` in a release, its sync step **MUST** be added to `/th:update` Step 6 in the same release.

If the sync step is omitted, the artifact never reaches installed machines — the plugin runtime does not copy it, and no future update will add it retroactively unless the sync step is also added in that future release.

This is the same family of failure as issue #272: an artifact was shipped to the repo but not wired into the sync step, so installed operators did not receive it until the sync was patched in.

**Checklist for adding a new fixed-path artifact:**

- [ ] Add the artifact file to the plugin cache layout (the appropriate path under `skills/`, `output-styles/`, etc.).
- [ ] Add a sync step in `skills/update/SKILL.md` Step 6 (both the bash and PowerShell command blocks).
- [ ] Add the same idempotent sync in `skills/setup/SKILL.md` (for first-time installs that have not run `/th:update` yet).
- [ ] Verify missing/current/managed/operator-edited/malformed states and the
      explicit force path; preserve unrelated content and repeat-run idempotency.

---

---

## Settings ownership

`/th:update` never writes operator preferences or MCP credentials. `/th:setup`
owns native preference changes such as workspace mode, language, English
learning, and optional Context7 configuration. Existing runtime settings,
registrations, and credentials are preserved, and the update path does not
offer machine-wide depth settings or telemetry toggles.

---

## See also

- `docs/install.md § Updating` — the concise procedure reference for updating
- `skills/setup/SKILL.md` — authoritative source for setup steps and per-OS command syntax
- `skills/update/SKILL.md` — authoritative source for update steps and per-OS command syntax
- `docs/dev-mode.md` — native workflow entry, retained capabilities and the independent execution-boundary contracts
