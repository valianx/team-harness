# Dual-runtime lifecycle

Team Harness ships one canonical set of agents, skills, and hooks to two runtimes — Claude Code (CC) and opencode. Answering "how does a change reach both runtimes?" used to require assembling roughly seven files (the roadmap, the migration guide, `release.yml`, `tag-sync.yml`, the installer source, the plugin manifest, and `CLAUDE.md`). This document is the single answer: one table, ten stages, both runtimes side by side.

Each stage is marked:

- **shared** — one mechanism, one artifact, identical for both runtimes.
- **diverged** — both runtimes need the stage, but the mechanism differs.
- **asymmetric** — the stage exists in a materially different shape for one runtime than the other (a step present for one and absent, or fundamentally different, for the other).

---

## Stage × runtime table

| Stage | Claude Code | opencode | Classification |
|---|---|---|---|
| **author** | Single source: `agents/*.md`, `skills/*.md`, `hooks/ts/bodies/*.ts` + `hooks/ts/entry/*.cc.ts`. No CC-specific authoring step. | Same canonical bodies. Agents/commands receive an emit-time frontmatter delta (tool permissions → `permission` object, provider-prefixed model IDs, explicit `mode`) applied by `opencodeRuntimeTransform` at install time — not hand-duplicated. Hooks reuse the same TS body; a sibling `*.opencode.ts` entry adapts the per-runtime event shape. | diverged |
| **build** | None. The plugin distributes the git tree as-is; `hooks/ts/dist/*.cjs` are pre-built and tracked in git — nothing compiles at install time. | Two build steps: (1) `hooks/ts` esbuild compiles bodies + entries → `dist/*.cjs` (the same tracked artifact CC consumes); (2) the Go installer binary itself is cross-compiled per release (`release.yml`, 5 platform targets, `CGO_ENABLED=0`). | asymmetric |
| **test** | `tests/run-all.sh` (policy-block, structure, frontmatter suites) exercises the shared TS artifacts (`hooks/ts/dist/*.cjs`) directly — the same suite validates the logic both runtimes execute at runtime. | Same shared hook suite (single-source logic); plus opencode-only Go tests (`cmd/install/*_test.go` — install modes, preservation, data-home, ledger). | diverged (shared floor, opencode-only layer on top) |
| **version** | `.claude-plugin/plugin.json` `version` is the canonical site; `marketplace.json plugins[0].version` and `CLAUDE.md §3` "Current version" mirror it (fenced multi-site invariant). | The Go binary's `version` var is injected at build time via `-ldflags "-X main.version=..."`, sourced from the same release tag. | shared (one version namespace, mirrored sites) |
| **release-cut** | `tag-sync.yml` (push to main on `plugin.json` version change) creates tag `vX.Y.Z` if it does not already exist, then dispatches `release.yml` via `workflow_dispatch` — a tag pushed with `GITHUB_TOKEN` does not itself trigger other workflows (GitHub's Actions recursion guard), so the explicit dispatch is required. | The same `tag-sync.yml` event triggers `release.yml`, which cross-compiles the 5 opencode binaries + `SHA256SUMS` and publishes the GitHub Release. | shared (one trigger, N runtime artifacts under one version namespace) |
| **distribute** | The tagged git tree IS the CC artifact — no packaging step. The custom marketplace (`valianx/team-harness`) points at the tag. | GitHub Release binary assets (5 platform builds) + `SHA256SUMS`, served to the bootstrap scripts via the deterministic `releases/latest/download/` URL (GitHub Pages: `bin/install.{sh,ps1,cmd}`). | asymmetric |
| **install — mechanism** | `/plugin marketplace add valianx/team-harness` → `/plugin install th` → `/th:setup` (operator keys, once). No build, no installer binary — the marketplace plugin is the only CC install channel. | `install.sh`/`.ps1`/`.cmd` downloads the Go binary, which runs `install apply --runtime opencode` — the plan/apply/uninstall engine with an append-only ownership ledger and SEC-01..08 guards. The Go binary does not install Claude Code; a bare invocation on that binary prints a marketplace redirect notice. | asymmetric |
| **update — mechanism** | `claude plugin marketplace update` (catalog refresh) then `claude plugin update th@team-harness-marketplace` (download). No local diff/confirm step — the plugin runtime replaces the cached version wholesale. | `install update` — three-state version delta (update-available / already-current / installed-ahead), `ComputePlan` diff preview, interactive `[Y/n]` confirm (declining the confirm is a zero-write no-op). | diverged |
| **update — managed-context sync** | Every file in the plugin tree is simply overwritten by the plugin runtime on `/reload-plugins` — no managed-key merge (the plugin owns its full file set); fixed-path artifacts outside the plugin cache (managed `CLAUDE.md` blocks, the developer-mode output style) are synced separately by `/th:update` Step 6. | `refreshManagedConfigKeys()` — a merge-only write that touches exactly `format_version`/`installed_version`/`updated_at` in `opencode.json`, preserving every operator-owned key byte-for-byte, with a backup before write. | diverged |
| **update — notification** | The CLI prints "Restart to apply changes" after `plugin update`; no separate honesty block distinguishes a zero-write outcome. | An explicit restart-to-activate block prints after any apply that wrote something (never claimed live); the already-current and installed-ahead paths print nothing, because they wrote nothing. | asymmetric |
| **activate** | Requires `/reload-plugins` or a Claude Code session restart to load the downloaded plugin version into the running session. | Requires an opencode restart — hot-reload of installed assets is experimental-only (opencode issues #10899/#8751); this is a documented known constraint. | diverged (both require explicit reactivation; the trigger and the underlying reason differ) |
| **deprecate** | Old install modes (`standard`/`low-cost`) exist as vestigial plugin-frontmatter concepts only in the historical Go installer code and are not reachable through the marketplace channel; nothing CC-specific was retired by the hook cutover. | The Go installer's former CC install path is retired (bare invocation prints a redirect notice); `hooks/config.json` (its CC hook-wiring template) and `notify-{windows,mac,linux}.sh` (its only consumers) are deleted. The 11 retired Bash hook bodies + 2 Bash helpers are removed; TypeScript is the sole gate-logic source going forward. | asymmetric |

---

## The unified release event

Before the tag-sync workflow existed, a maintainer had to remember to create and push the release tag by hand after merging a version bump — a silent, undocumented step whose omission left `release.yml` (which only triggers on `push: tags: v*`) never firing, and the two runtimes' artifacts drifting out of sync with no error.

The current flow is one event, not two:

1. A release PR bumps `.claude-plugin/plugin.json` `version` and merges to `main`.
2. `tag-sync.yml` (triggered by that push, path-filtered to `plugin.json`) reads the new version, creates and pushes the `vX.Y.Z` tag if it does not already exist, and dispatches `release.yml` via `workflow_dispatch` with that tag as input. The explicit dispatch is required — a tag pushed under `GITHUB_TOKEN` does not itself chain to other workflows.
3. `release.yml` builds and publishes every runtime artifact from that single tagged commit: 5 cross-compiled opencode binaries + `SHA256SUMS` + a bare-semver `VERSION` asset, all attached to one GitHub Release.
4. `release.yml` triggers `pages.yml`, which republishes the bootstrap scripts (`install.sh`/`.ps1`/`.cmd`) that serve the new version.

One tag, one release event, N runtime artifacts, one version namespace. Re-running the sync against an existing tag is a no-op (idempotent) rather than a duplicate release.

---

## Installer identity

The Go installer (`cmd/install/`) is the **opencode packager and installer**. It does not install Claude Code, has no CC install path reachable from a bare invocation, and its low-cost frontmatter-rewrite mode (`modes.go::lowCostMatrix`) is unreferenced code from the retired CC path — not a live capability of any runtime this binary currently serves. `cmd/install/` therefore stays frozen for fleet model-allocation changes: there is no live low-cost consumer left to keep in sync. The `standard`/`low-cost` split is driven by the `INSTALL_MODE` env var and is not wired into the opencode manifest engine (`install apply --runtime opencode`).

The marketplace plugin (`/plugin marketplace add valianx/team-harness`) is the only Claude Code install channel. The Go binary (`install apply|update|uninstall --runtime opencode`) is the only opencode install channel. Neither channel serves the other runtime.

---

## See also

- [`docs/opencode-migration-guide.md`](./opencode-migration-guide.md) — per-asset-type migration process and the hook Bash→TS design record.
- [`docs/opencode-distribution-roadmap.md`](./opencode-distribution-roadmap.md) — what is built in the Go installer, what is genuinely residual, and the adapter/shim design contracts.
- [`docs/setup-update-model.md`](./setup-update-model.md) — the CC-side `/th:setup` vs `/th:update` division of labour (operator keys vs. files vs. flows).
- [`CLAUDE.md §3`](../CLAUDE.md) — Tech Stack table (installer, bootstrap scripts, hooks, distribution rows).
