# Multi-runtime lifecycle

Team Harness ships one canonical role system to Claude Code (CC), Codex, and
opencode. The table retains the detailed CC/opencode comparison; Codex uses the
same tag/version namespace, consumes the tagged Git tree through its repository
marketplace whose `init` skill loads lightweight intake into a clean `Main`
thread and whose `pipeline` skill explicitly loads full orchestration,
and has a separate six-agent installer lifecycle. See
[`codex-runtime.md`](./codex-runtime.md).

Each stage is marked:

- **shared** — one mechanism, one artifact, identical for both runtimes.
- **diverged** — both runtimes need the stage, but the mechanism differs.
- **asymmetric** — the stage exists in a materially different shape for one runtime than the other (a step present for one and absent, or fundamentally different, for the other).

---

## Stage × runtime table

| Stage | Claude Code | opencode | Classification |
|---|---|---|---|
| **author** | Single source: `agents/*.md`, `skills/*.md`, `hooks/ts/bodies/*.ts` + `hooks/ts/entry/*.cc.ts`. | Agents and skills use the canonical bodies. Agents/commands receive an emit-time name/mode delta; the four PR review agents additionally receive a deny-by-default read/glob/grep permission map. Other per-agent permissions remain omitted and no Team Harness hook plugin is installed. | asymmetric |
| **build** | The plugin distributes the git tree as-is; `hooks/ts/dist/*.cjs` are pre-built and tracked in git. | The Go installer binary is cross-compiled per release (`release.yml`, 5 platform targets, `CGO_ENABLED=0`). | asymmetric |
| **test** | `tests/run-all.sh` exercises the wired Claude Code hooks, PR source allowlists, and retained body-level regression suites. | Go and Node projection tests cover the four deny-by-default PR agents in addition to installation, preservation, data-home, ledger, and default-agent configuration. | asymmetric |
| **version** | `.claude-plugin/plugin.json` `version` is the canonical site; `.claude-plugin/marketplace.json` `plugins[0].version`, `plugins/team-harness/.codex-plugin/plugin.json`, `CLAUDE.md §3`, and `cmd/install/main.go`'s fallback `var version` mirror it (fenced five-site invariant in the current tree). | The Go binary's `version` var is injected at build time via `-ldflags "-X main.version=..."`, sourced from the same release tag; the checked-in fallback is verified against that tag. | shared (one version namespace, mirrored sites) |
| **release-cut** | `tag-sync.yml` creates `vX.Y.Z` from `.claude-plugin/plugin.json` and dispatches `release.yml`; the same tag is the Claude Code and Codex plugin boundary. Explicit dispatch avoids GitHub Actions' `GITHUB_TOKEN` recursion guard. | The same event cross-compiles the five opencode binaries, publishes `SHA256SUMS`, and creates the GitHub Release. | shared (one trigger, N runtime artifacts under one version namespace) |
| **distribute** | The tagged git tree IS the CC artifact — no packaging step. The custom marketplace (`valianx/team-harness`) points at the tag. | GitHub Release binary assets (5 platform builds) + `SHA256SUMS`, served to the bootstrap scripts via the deterministic `releases/latest/download/` URL (GitHub Pages: `bin/install.{sh,ps1,cmd}`). | asymmetric |
| **install — mechanism** | `/plugin marketplace add valianx/team-harness` → `/plugin install th` → `/th:setup` (operator keys, once). No build, no installer binary — the marketplace plugin is the only CC install channel. | `install.sh`/`.ps1`/`.cmd` downloads the Go binary, which runs `install apply --runtime opencode` — the plan/apply/uninstall engine with an append-only ownership ledger and SEC-01..08 guards. The Go binary does not install Claude Code; a bare invocation on that binary prints a marketplace redirect notice. | asymmetric |
| **update — mechanism** | `claude plugin marketplace update` (catalog refresh) then `claude plugin update th@team-harness-marketplace` (download). No local diff/confirm step — the plugin runtime replaces the cached version wholesale. | `install update` — three-state version delta (update-available / already-current / installed-ahead), `ComputePlan` diff preview, interactive `[Y/n]` confirm (declining the confirm is a zero-write no-op). | diverged |
| **update — managed-context sync** | Every file in the plugin tree is overwritten by the plugin runtime on `/reload-plugins`; fixed-path managed blocks are synced separately by `/th:update`. | `refreshManagedConfigKeys()` updates installer metadata in `.team-harness.json`; `opencode.json` is merge-updated to select `TH-orchestrator` while preserving operator-owned keys. Previously owned plugin files are removed through the ledger. | diverged |
| **update — notification** | The CLI prints "Restart to apply changes" after `plugin update`; no separate honesty block distinguishes a zero-write outcome. | An explicit restart-to-activate block prints after any apply that wrote something (never claimed live); the already-current and installed-ahead paths print nothing, because they wrote nothing. | asymmetric |
| **activate** | Requires `/reload-plugins` or a Claude Code session restart to load the downloaded plugin version into the running session. | Requires an opencode restart — hot-reload of installed assets is experimental-only (opencode issues #10899/#8751); this is a documented known constraint. | diverged (both require explicit reactivation; the trigger and the underlying reason differ) |
| **deprecate** | Old install modes (`standard`/`low-cost`) exist as vestigial plugin-frontmatter concepts only in the historical Go installer code and are not reachable through the marketplace channel; nothing CC-specific was retired by the hook cutover. | The Go installer's former CC install path is retired (bare invocation prints a redirect notice); `hooks/config.json` (its CC hook-wiring template) and `notify-{windows,mac,linux}.sh` (its only consumers) are deleted. The 11 retired Bash hook bodies + 2 Bash helpers are removed; TypeScript is the sole gate-logic source going forward. | asymmetric |

---

## The unified release event

Before the tag-sync workflow existed, a maintainer had to remember to create and push the release tag by hand after merging a version bump — a silent, undocumented step whose omission left `release.yml` (which only triggers on `push: tags: v*`) never firing, and the two runtimes' artifacts drifting out of sync with no error.

The current flow is one event, not two:

1. A PR bumps `.claude-plugin/plugin.json` `version` (per team-harness's per-PR bump model — `CLAUDE.md §6.3`) and merges to `main`.
2. `tag-sync.yml` (triggered by that push, path-filtered to `plugin.json`) reads the new version, creates and pushes the `vX.Y.Z` tag if it does not already exist, and dispatches `release.yml` via `workflow_dispatch` with that tag as input. The explicit dispatch is required — a tag pushed under `GITHUB_TOKEN` does not itself chain to other workflows.
3. The tagged Git tree is both the Claude Code and Codex plugin artifact; no Codex archive is built. `release.yml` also publishes the cross-platform installer binaries, checksums, and bare-semver `VERSION` asset.
4. `release.yml` triggers `pages.yml`, which republishes the bootstrap scripts (`install.sh`/`.ps1`/`.cmd`) that serve the new version.

One tag, one release event, N runtime artifacts, one version namespace. Re-running the sync against an existing tag is a no-op (idempotent) rather than a duplicate release.

---

## Installer identity

The Go installer (`cmd/install/`) manages opencode assets and the six generated Codex agent TOMLs. It does not install marketplace plugins and does not modify Codex `config.toml`; plugin install/update/remove remains marketplace-owned. Claude Code has no reachable binary-install path.

The Claude marketplace is the Claude Code install channel. The repository Codex marketplace supplies two lifecycle skills (`setup`, `update`) plus seven workflow skills (`@Team-Harness init` is lightweight intake and `@Team-Harness pipeline` is explicit full activation), while `install apply|update|uninstall --runtime codex` separately places six specialist agents. The Go binary remains the opencode install channel as well.

---

## See also

- [`docs/opencode-migration-guide.md`](./opencode-migration-guide.md) — per-asset-type migration process and the hook Bash→TS design record.
- [`docs/opencode-distribution-roadmap.md`](./opencode-distribution-roadmap.md) — what is built in the Go installer, what is genuinely residual, and the adapter/shim design contracts.
- [`docs/setup-update-model.md`](./setup-update-model.md) — the CC-side `/th:setup` vs `/th:update` division of labour (operator keys vs. files vs. flows).
- [`CLAUDE.md §3`](../CLAUDE.md) — Tech Stack table (installer, bootstrap scripts, hooks, distribution rows).
