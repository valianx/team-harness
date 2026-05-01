# hooks/

OS-native notification scripts plus the `config.json` template that wires them into Claude Code.

## Files

| File | Purpose |
|---|---|
| `notify-windows.sh` | Windows toast notification via PowerShell. |
| `notify-mac.sh` | macOS notification via `osascript`. |
| `notify-linux.sh` | Linux desktop notification via `notify-send` (libnotify). |
| `policy-block.sh` | PreToolUse policy gate. Blocks destructive Bash commands and writes to sensitive files. Cross-platform (bash + python3). |
| `config.json` | Per-OS hook template — copy the section for your OS into `~/.claude/settings.json`. |

All scripts are Bash and cross-platform:
- Windows runs them via Git Bash.
- macOS and Linux run them natively.

## Script contract

Each script reads the Claude Code hook payload from stdin (JSON), extracts `last_assistant_message` and `cwd`, and fires an OS-native notification. Scripts exit silently on errors so they never block Claude Code.

**Required runtime dependencies:**
- `python3` — used to parse the JSON payload (preinstalled on macOS and most Linux distros; on Windows + Git Bash, requires a Python install).
- Windows: `powershell.exe` (included in Windows).
- macOS: `osascript` (built-in).
- Linux: `notify-send` (package `libnotify-bin` on Debian/Ubuntu).

## Enabling hooks after install

The installer copies these scripts into `~/.claude/hooks/` but does **not** modify `~/.claude/settings.json`. To activate them:

1. Open `config.json` in this folder.
2. Copy the `hooks` object under your OS key (`windows`, `macos`, or `linux`).
3. Merge it into `~/.claude/settings.json` under the top-level `"hooks"` key.
4. Restart Claude Code.

## Events covered

The default set is deliberately **quiet** — only high-signal events:

| Event | When it fires | Why it's in the default set |
|---|---|---|
| `PreToolUse` | Before any `Bash`, `Write`, `Edit`, or `NotebookEdit` invocation. | Hard guardrail: blocks destructive commands and writes to sensitive files before they run. |
| `Notification` | Matcher `idle_prompt\|permission_prompt` — Claude is waiting for input. | High signal: you need to act for Claude to continue. |
| `PostToolUseFailure` | A tool invocation failed. | Rare and important: something broke, worth looking. |

`Stop` (Claude finished its turn) is **not** in the default on purpose — it fires on every response, which becomes dozens of notifications a day in active back-and-forth work.

## Policy gate (`policy-block.sh`)

The `PreToolUse` hook routes through `policy-block.sh`. It reads the tool call JSON from stdin, evaluates it against a denylist, and returns a hook decision that either lets the call proceed (default) or blocks it with a clear reason.

**What it blocks (Bash):**
- `rm -rf` (in any flag order, case-insensitive) targeting `/`, `~`, `$HOME`, or a bare wildcard `*`.
- `git push --force`, `git push -f`, `git push --force-with-lease`.
- `git reset --hard`.
- `git clean -f` (any variant).
- `git commit / rebase / push --no-verify` (bypasses pre-commit hooks).
- Destructive SQL through shell: `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE`.

**What it blocks (Write / Edit / NotebookEdit):**
- Writes to `.env`, `.env.<anything>` (except `.example`, `.sample`, `.template`).
- `*.pem`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`.
- Anything under `.ssh/`.
- `.aws/credentials`, `.aws/config`.
- `credentials.json`, `secrets.{yaml,yml,json,toml}`.

**What it does NOT do:**
- It is not a sandbox. A determined LLM can obfuscate its way around (e.g., split `rm -rf /` across variables). The point is to catch accidents and force visibility on intent — the reviewer remains the last line of defense.
- It does not read files or call external services. The check is purely pattern-matching on the tool call.

**Bypassing for a specific case.** If you genuinely need a denied command (e.g., a one-off cleanup script), run it manually outside Claude. Editing `policy-block.sh` to scope an exception is also fine, but commit the exception so the rest of the team sees it.

**Performance.** The script runs in single-digit milliseconds (one Python process, regex match). Timeout is 5s.

## Opt-in: notify when Claude finishes a turn

If you walk away from long-running tasks and want to be pinged when Claude is done, add a `Stop` entry into the `"hooks"` object of your `~/.claude/settings.json`. Example for macOS:

```json
"Stop": [
  {
    "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-mac.sh", "timeout": 5 }
    ]
  }
]
```

Swap the script path for `notify-windows.sh` or `notify-linux.sh` as needed.

Expect this to be **noisy** during active development. Remove it when you go back to interactive work.

## Adding support for another OS

1. Add `notify-<os>.sh` following the existing pattern (read stdin, parse JSON, fire native notification, exit silently on failure).
2. Add a matching section to `config.json` under the new OS key.
3. Update the platform label map in `bin/install.py` if needed.
4. Document the new OS's requirements in this README.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/hooks/`.
- Hooks must stay **generic and portable**. No personal tokens, private URLs, or OpenClaw-style integrations in this folder — those belong in each developer's local `~/.claude/hooks/`.
