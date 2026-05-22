Re-run the team-harness installer to pull the latest agents, skills, and hooks from the most recent GitHub Release. This is a standalone utility — does NOT route through the orchestrator.

Analyze the input: $ARGUMENTS

---

## What this skill does

1. Detect the host OS.
2. Run the team-harness installer one-liner for that OS, always forwarding `--force` so every team-harness file under `~/.claude/` is overwritten with the bytes from the latest release.
3. Capture the installer output (categorised as `installed` / `updated` / `unchanged`).
4. Render a concise summary back to the operator with the file counts.
5. End with the literal restart reminder.

The skill is intentionally destructive: it always overwrites. Local edits to files under `~/.claude/agents/`, `~/.claude/commands/`, `~/.claude/skills/`, and `~/.claude/hooks/` that originate from team-harness will be replaced. Source-level customizations belong in the team-harness repo and reach the operator via a new release, not via hand-edits in `~/.claude/`. The `MEMORY_MCP_URL`, `MEMORY_MCP_BEARER`, and `CONTEXT7_API_KEY` values are preserved from the existing `~/.claude.json` regardless. This skill never prompts the operator interactively.

---

## Argument parsing

This skill accepts no flags. `$ARGUMENTS` is ignored. If the operator passed any token, print the supported usage and continue with the standard run.

```
Usage: /th-update
  (no flags — the skill always overwrites)
```

---

## OS detection

Run this detection first. The result picks the right one-liner.

```bash
if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
  echo "ENV:WSL"
elif [ "$(uname -s)" = "Linux" ] || [ "$(uname -s)" = "Darwin" ]; then
  echo "ENV:NIX"
elif command -v wsl.exe >/dev/null 2>&1 || [ "$OS" = "Windows_NT" ]; then
  echo "ENV:WIN"
else
  echo "ENV:NIX"
fi
```

| Result | Installer one-liner |
|---|---|
| `ENV:NIX` or `ENV:WSL` | bash via curl pipe with `--force` |
| `ENV:WIN` | PowerShell scriptblock form with `--force` |

---

## Running the installer

### Unix, macOS, WSL (`ENV:NIX` / `ENV:WSL`)

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
```

### Windows PowerShell (`ENV:WIN`)

`iex` cannot forward arguments, so the installer is read into a scriptblock and invoked with `--force` as a positional argument; the bootstrap forwards it to the embedded Go installer via `& $InstallerPath @args`.

```powershell
& ([scriptblock]::Create((irm https://valianx.github.io/team-harness/install.ps1))) --force
```

Capture stdout and stderr from the chosen invocation.

---

## Parsing the installer output

The installer prints a `Summary:` block with the relevant counted buckets:

```
Summary:
  installed: N
  updated:   N
  unchanged: N
```

The `conflicts: N` line is always `0` for this skill because `--force` is always set. If it appears non-zero (installer regression), surface it verbatim — do not hide it.

Extract the integer counts from the `Summary:` block.

---

## Operator-facing summary

Render the following block to the operator. Use declarative facts, no emoji, no enthusiasm.

```
team-harness update
-------------------
installed: N
updated:   N
unchanged: N
```

If the installer exited non-zero (download failure, network error, missing release), surface the literal error from stderr instead of the summary block:

```
team-harness update failed
--------------------------
{stderr verbatim}
```

---

## Closing line (mandatory)

After the summary block, emit this exact sentence as the final line of the response:

```
Restart Claude Code to load the new agents and skills.
```

No emoji, no leading marker, no rephrasing.

---

## Important

- This skill does NOT route through the orchestrator.
- This skill does NOT prompt the operator interactively — the installer's preservation logic carries the existing `MEMORY_MCP_URL`, `MEMORY_MCP_BEARER`, and `CONTEXT7_API_KEY` values across updates.
- This skill does NOT compare versions or print a "you have X, latest is Y" line — the installer itself reports unchanged vs updated counts; that is the source of truth.
- This skill does NOT write to `session-docs/`.
- The only operator-visible state mutation comes from the installer itself, which writes under `~/.claude/`.
- The skill always overwrites. Operators who customize agents should fork the repo or contribute upstream — local edits to `~/.claude/agents/*.md` are explicitly out of scope.
