# bin/ — Bootstrap scripts

## opencode install (live path)

| Script | Platform | Usage |
|--------|----------|-------|
| `install-opencode.sh` | macOS / Linux | `curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh \| bash` |
| `install-opencode.ps1` | Windows | `iwr https://valianx.github.io/team-harness/install-opencode.ps1 \| iex` |

These scripts download the latest released Go binary, verify its SHA256 checksum against the published `SHA256SUMS`, and run `apply --runtime opencode --scope global`. They are **NOT deprecated** — these are the live opencode install paths.

See the README `### Install into opencode` section for the full env-var contract (`MEMORY_MCP_URL`, `MEMORY_MCP_BEARER`, `CONTEXT7_API_KEY`).

## opencode update (live path)

| Script | Platform | Usage |
|--------|----------|-------|
| `update-opencode.sh` | macOS / Linux | `curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh \| bash` |
| `update-opencode.ps1` | Windows | `iwr https://valianx.github.io/team-harness/update-opencode.ps1 \| iex` |

These scripts:
1. Perform a cheap `releases/latest/download/VERSION` pre-check — no binary download when already current.
2. Download the platform binary and verify its SHA256 checksum (fail-closed, anchored exact-asset-name match, case-insensitive compare — mirrors the install scripts).
3. Run `binary update --runtime opencode --scope global "$@"`, which shows the four-bucket diff preview, prompts `[Y/n]` on a TTY (operator "n" → zero writes), applies asset changes through the proven `ComputePlan`/`ApplyPlan` engine, and bumps only the installer-managed config keys.

After the update: **restart opencode** to activate. The update is NOT live in any running session until restart.

Direct subcommand (headless / CI — skips TTY prompt and applies directly):
```
install update --runtime opencode --scope global --non-interactive
```

---

## Claude Code install (legacy path)

> **These scripts are the legacy install path as of v2.33.0.** The canonical install path is the Claude Code plugin. Use these scripts only for offline environments, CI pipelines, or `low-cost` mode installs.

### Canonical install (recommended)

Run the following three commands inside Claude Code:

```
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

### Legacy bootstrap scripts (DEPRECATED)

| Script | Platform | Usage |
|--------|----------|-------|
| `install.sh` | macOS / Linux / WSL | `curl -fsSL https://valianx.github.io/team-harness/install.sh \| bash` |
| `install.ps1` | Windows — PowerShell | `irm https://valianx.github.io/team-harness/install.ps1 \| iex` |
| `install.cmd` | Windows — cmd.exe | `curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd && install.cmd` |

Each script detects the OS and architecture, downloads the latest released Go binary from GitHub Releases, and runs it. The binary is self-contained — agents, skills, and hooks are embedded and written directly to `~/.claude/`.

These scripts are served at `https://valianx.github.io/team-harness/install.{sh,ps1,cmd}` via GitHub Pages.

## When to use the legacy installer

- **Offline / air-gapped environments** — download the binary from [GitHub Releases](https://github.com/valianx/team-harness/releases) and run it directly.
- **CI pipelines** — use env vars to skip prompts: `MEMORY_MCP_URL`, `CONTEXT7_API_KEY`, `INSTALL_MODE`.
- **`low-cost` mode** — the plugin cannot transform agent frontmatter on install. Set `INSTALL_MODE=low-cost` to install all agents on `sonnet` / `medium` effort.

For full documentation see [`docs/install.md` § Legacy installer](../docs/install.md#legacy-installer-contributors--offline--ci).

## Relationship to cmd/install/

The scripts in this directory download and run the pre-compiled binary from GitHub Releases. Contributors who want to test local edits use `go run ./cmd/install` from the repo root instead — `//go:embed` snapshots the working tree at compile time, so the install reflects local changes immediately.
