# bin/ — Bootstrap scripts

## opencode install (live path)

| Script | Platform | Usage |
|--------|----------|-------|
| `install-opencode.sh` | macOS / Linux | `curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh \| bash` |
| `install-opencode.ps1` | Windows | `iwr https://valianx.github.io/team-harness/install-opencode.ps1 \| iex` |

These scripts download the latest released Go binary, verify its SHA256 checksum against the published `SHA256SUMS`, and run `apply --runtime opencode --scope global`. They are **NOT deprecated** — these are the live opencode install paths.

See the README `### Install into opencode` section for the native runtime
contract. Context7 can be configured explicitly with `CONTEXT7_API_KEY`;
existing MCP registrations and credentials remain untouched.

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
```text
install update --runtime opencode --scope global --non-interactive
```

---

## Claude Code install

Claude Code uses its native marketplace. Run these commands inside Claude Code:

```
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

### Bootstrap scripts

| Script | Platform | Usage |
|--------|----------|-------|
| `install.sh` | macOS / Linux / WSL | `curl -fsSL https://valianx.github.io/team-harness/install.sh \| bash` |
| `install.ps1` | Windows — PowerShell | `irm https://valianx.github.io/team-harness/install.ps1 \| iex` |
| `install.cmd` | Windows — cmd.exe | `curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd && install.cmd` |

With no arguments, each script prints the native Claude Code commands above and exits without downloading anything. To use the binary for an OpenCode or Codex operation, pass an explicit subcommand such as `apply`, `plan`, `update`, or `uninstall`; all remaining arguments are forwarded unchanged.

These scripts are served at `https://valianx.github.io/team-harness/install.{sh,ps1,cmd}` via GitHub Pages.

For offline or CI use, download a release binary directly and pass the desired native-runtime subcommand. Context7 configuration remains an independent, explicit option; existing MCP entries and credentials are preserved.

## Relationship to cmd/install/

The scripts in this directory download and run the pre-compiled binary from GitHub Releases. Contributors who want to test local edits use `go run ./cmd/install` from the repo root instead — `//go:embed` snapshots the working tree at compile time, so the install reflects local changes immediately.
