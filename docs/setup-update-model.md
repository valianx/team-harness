# The setup/update model

This document describes the working model that governs how Team Harness is installed and kept current. The model was previously implicit, spread across `skills/setup/SKILL.md` and `skills/update/SKILL.md`. This document brings it together in one place, with the SKILL.md files remaining the authoritative source for per-OS command syntax.

---

## Division of labour: setup vs update

`/th:setup` and `/th:update` are not interchangeable. Each owns a distinct set of concerns and runs at a different frequency.

| What | Owner | Frequency |
|------|-------|-----------|
| Operator KEYS — Memory MCP URL + token, context7 API key, workspace mode (`logs-mode`, `logs-path`, `logs-subfolder`), default `language` | `/th:setup` | One-time bootstrap; re-run to reconfigure |
| FILES — managed `~/.claude/CLAUDE.md` blocks, `output-styles/developer-mode.md`, user-level `/dev-mode` skill | `/th:update` | Every release |
| FLOWS — marketplace catalog refresh, plugin version download | `/th:update` | Every release |
| `~/.claude/.team-harness.json` full write (merge-write-whole-document) | `/th:setup` | One-time bootstrap; re-run to reconfigure |
| `~/.claude/.dev-mode-active` marker (conditional write, reads `dev_mode_choice`) | `/th:setup` Step 4e and `/th:update` Step 6 | Bootstrap and every update |

**Key constraint:** `/th:update` reads `~/.claude/.team-harness.json` (specifically `dev_mode_choice`) but **never writes it**. Writing that file is `/th:setup`'s domain. This means a brand-new operator KEY introduced in a release never arrives via `/th:update` — see [The residual seam: new operator keys](#the-residual-seam-new-operator-keys).

---

## Two propagation classes

Team Harness artifacts fall into two classes based on how they reach an installed machine after a release.

### Cache artifacts (auto-loaded)

These artifacts live inside the plugin cache directory (`~/.claude/plugins/cache/team-harness-marketplace/th/<version>/`) and are loaded automatically by the Claude Code plugin runtime on update and reload. No explicit copy step is required.

**Artifacts in this class:**
- `agents/*.md` — all agent system prompts
- `skills/<name>/SKILL.md` — all namespaced plugin skills (e.g. `/th:update`, `/th:setup`)
- Hooks registered in `.claude-plugin/hooks.json` — loaded via `${CLAUDE_PLUGIN_ROOT}` (the plugin runtime variable that resolves to the cache directory at runtime)

**Evidence:** `.claude-plugin/hooks.json` registers every hook using the form `bash ${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh`. The runtime resolves `${CLAUDE_PLUGIN_ROOT}` to the newly-downloaded version directory after `/reload-plugins`, so the updated hooks take effect automatically without a copy step.

**Implication:** to ship a new agent, skill, or hook, it is sufficient to add the file to the repo and release. No sync step in `/th:update` is required for these artifacts.

### Fixed-path artifacts (explicit sync required)

These artifacts must land at a specific absolute path under `~/.claude/` that the plugin runtime does **not** manage automatically. They require an explicit copy (or write) step in `/th:update` Step 6 every time a release is published.

**Artifacts in this class:**

| Artifact | Target path | Mechanism in `/th:update` Step 6 |
|----------|-------------|----------------------------------|
| `orchestrator-dispatch-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| `nested-dispatch-takeover` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| `voice-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| `dev-mode` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| Developer-mode output style | `~/.claude/output-styles/developer-mode.md` | Force-copy from plugin cache |
| `/dev-mode` user-level skill | `~/.claude/skills/dev-mode/SKILL.md` | Force-copy from plugin cache |
| Dev-mode activation marker | `~/.claude/.dev-mode-active` | Conditional write based on `dev_mode_choice` |

The `/dev-mode` skill requires the user-level path (not the plugin-namespaced path) because the bare `/dev-mode` command is only available as a user-level skill — plugin skills are namespaced as `/th:dev-mode`.

For the exact per-OS command blocks (bash and PowerShell), see `skills/update/SKILL.md` Step 6.

---

## The update flow (three steps)

A `th` update is three distinct steps. The skill performs two; the operator performs one.

1. **Refresh the catalog** — `claude plugin marketplace update team-harness-marketplace`
   Updates the marketplace metadata so the CLI knows a newer version exists. Downloads nothing.

2. **Download the new version** — `claude plugin update th@team-harness-marketplace`
   Fetches the new version into the plugin cache. The CLI prints `Restart to apply changes`. This is the step that actually downloads; the catalog refresh alone does not.

3. **Activate** — `/reload-plugins` (or restart Claude Code)
   Loads the downloaded version into the running session.

`/th:update` performs steps 1 and 2 from Bash, then runs the Step 6 fixed-path sync described in [Fixed-path artifacts (explicit sync required)](#fixed-path-artifacts-explicit-sync-required). Step 3 is operator-driven — the skill cannot reload the session.

Running `/th:update` every release keeps both the cache artifacts (via the plugin runtime) and the fixed-path artifacts (via Step 6) aligned. Re-running `/th:setup` is **not** part of the update flow.

---

## Self-healing / idempotency

`/th:update` Step 6 re-syncs every fixed-path artifact on every run, regardless of whether the plugin version changed:

- **Managed CLAUDE.md blocks** — destructive marker-bounded replace (if markers are present) or append (if markers are absent). No content comparison — marker presence is the only check.
- **Output style and user-level skill** — force-copy from the highest-version plugin cache directory.
- **Dev-mode marker** — conditional write based on `dev_mode_choice` in `~/.claude/.team-harness.json`.

Because Step 6 is unconditional and destructive, a machine that missed one or more updates self-corrects on the next run: the fixed-path artifacts are overwritten with the current version's canonical content.

**Concrete example:** an operator whose `~/.claude/CLAUDE.md` was missing one or more managed blocks — because the version of the plugin they installed did not write them yet — gets those blocks restored on the next `/th:update`. Step 6 appends any block whose start/end markers are absent, so no manual intervention is required. The same behavior applies whether a block was never written or was accidentally deleted: the next update run re-inserts it unconditionally.

---

## Author maintenance invariant (normative)

> When a new fixed-path artifact is introduced under `~/.claude/` in a release, its sync step **MUST** be added to `/th:update` Step 6 in the same release.

If the sync step is omitted, the artifact never reaches installed machines — the plugin runtime does not copy it, and no future update will add it retroactively unless the sync step is also added in that future release.

This is the same family of failure as issue #272: an artifact was shipped to the repo but not wired into the sync step, so installed operators did not receive it until the sync was patched in.

**Checklist for adding a new fixed-path artifact:**

- [ ] Add the artifact file to the plugin cache layout (the appropriate path under `skills/`, `output-styles/`, etc.).
- [ ] Add a sync step in `skills/update/SKILL.md` Step 6 (both the bash and PowerShell command blocks).
- [ ] Add the same idempotent sync in `skills/setup/SKILL.md` (for first-time installs that have not run `/th:update` yet).
- [ ] Confirm the sync is destructive / force-copy (no content comparison — only presence checks for marker-bounded blocks).

---

## The residual seam: new operator keys

`/th:update` never writes `~/.claude/.team-harness.json`. That file is `/th:setup`'s domain — it holds the operator's personal configuration (MCP URLs, tokens, workspace mode, language preference).

**Consequence:** when a new operator KEY is introduced in a release (for example, the `language` key introduced in v2.50+), an operator who already has Team Harness installed does not receive a prompt to configure the new key when they run `/th:update`. The key is simply absent from their `~/.claude/.team-harness.json` until they re-run `/th:setup`.

This is a known, intentional limitation. The alternative — having `/th:update` write to `.team-harness.json` — would require it to prompt for sensitive values (MCP URL, tokens) on every update, which conflicts with the goal of a non-interactive repeatable command.

**Mitigation for operators:** when a release note mentions a new operator-configurable key, run `/th:setup` once to configure it. Subsequent `/th:update` runs continue normally.

---

## See also

- `docs/install.md § Updating` — the concise procedure reference for updating
- `skills/setup/SKILL.md` — authoritative source for setup steps and per-OS command syntax
- `skills/update/SKILL.md` — authoritative source for update steps and per-OS command syntax
- `docs/dev-mode.md` — dev mode disposition, the default-on activation model, and the outward-action gate
