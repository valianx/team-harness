# hooks/

OS-native notification scripts plus the `config.json` template that wires them into Claude Code.

## Files

| File | Purpose |
|---|---|
| `notify-windows.sh` | Windows toast notification via PowerShell. |
| `notify-mac.sh` | macOS notification via `osascript`. |
| `notify-linux.sh` | Linux desktop notification via `notify-send` (libnotify). |
| `notify-stage.sh` | Wrapper invoked by the th-orchestrator at stage boundaries (4 toasts/pipeline). Detects OS and routes to the matching `notify-{os}.sh`. |
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

The default preset is **`ultra-quiet`** — fires **only** when the user needs to take an action:

| Event | Matcher | When it fires | Why it's in the default set |
|---|---|---|---|
| `PreToolUse` | `Bash\|Write\|Edit\|NotebookEdit` | Before any of those tool invocations. | Hard guardrail: blocks destructive commands and writes to sensitive files before they run. Does NOT send a notification — runs `policy-block.sh` silently. |
| `Notification` | `idle_prompt` only | Claude finished a turn and is waiting for the user. | High signal: you need to act for Claude to continue. One notification per user-blocking pause. |

**What was removed from the previous default (and why).** Earlier versions of this repo also wired:

- `Notification` matcher `permission_prompt` — fired every time any (sub)agent asked permission for a tool. With MCPs and pipeline subagents, this fires many times per pipeline. If you have `skipDangerousModePermissionPrompt: true` in `settings.json`, the prompt is auto-resolved but the notification event still emits — so it produces toasts while work continues, with no action required from you.
- `PostToolUseFailure` matcher `*` — fired on every tool failure including transient MCP flutter that gets retried successfully. Toast accumulates but no action is needed.

Both were noisy without being actionable. They were removed because the goal is "notify when the user must act" — not "notify on every event of interest". See the `noisy` preset under **Tuning presets** below if you want them back.

`Stop` (Claude finished its turn) is **not** in any default — it fires on every response, which becomes dozens of notifications a day in active back-and-forth work. See the opt-in `Stop` snippet at the bottom of this file.

## Why Windows users see notifications as "push in the system bar"

On Windows, `notify-windows.sh` uses `Windows.UI.Notifications.ToastNotificationManager`. That API does **two** things:

1. Pops a transient toast in the bottom-right corner for a few seconds.
2. **Persists the toast in the Action Center / notification bar** until the user explicitly clears it.

A toast titled `Claude Code — <project>` looks identical across all events. After a noisy pipeline (the pre-`ultra-quiet` default would fire `permission_prompt` and `PostToolUseFailure` events), the Action Center fills up with dozens of look-alike entries — and because Windows surfaces them in the system tray badge, the user perceives them as "push notifications". They are toasts, not push, but Windows treats them the same as push for UI purposes.

This is the symptom that motivated the move to `ultra-quiet` as the default.

## Tuning presets

Three presets, ordered from least to most noisy. Each one is a drop-in replacement for the `hooks` object in `~/.claude/settings.json`. The `PreToolUse` policy gate is the same across all three — it never produces a notification, only blocks dangerous calls.

### Preset 1 — `ultra-quiet` (default, recommended)

Notifies **only** when Claude is waiting for the user. No toasts for permission prompts, no toasts for tool failures.

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash|Write|Edit|NotebookEdit", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/policy-block.sh", "timeout": 5 }
    ]}
  ],
  "Notification": [
    { "matcher": "idle_prompt", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ]
}
```

**Use this when:** you have `skipDangerousModePermissionPrompt: true` or a similar autonomy setting and don't want a Windows Action Center full of look-alike toasts. This is the new default in `hooks/config.json`.

**Trade-off:** you will not be notified when a tool fails. You'll see the failure in Claude's output if you're watching — and `gate.fail` events still land in `session-docs/{feature}/00-execution-events.jsonl` for pipeline runs (queryable via `/trace <feature> --fails`).

### Preset 2 — `default-quiet` (legacy default before `ultra-quiet`)

Notifies on idle, permission prompts, and tool failures. This was the default in earlier releases of this repo. Kept here for reference and for users who prefer "notify on every event of interest, even if action isn't required."

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash|Write|Edit|NotebookEdit", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/policy-block.sh", "timeout": 5 }
    ]}
  ],
  "Notification": [
    { "matcher": "idle_prompt|permission_prompt", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ],
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ]
}
```

**Use this when:** you don't run with auto-skip-permissions and you'd rather have an extra toast than miss a permission gate. Expect significant Action Center accumulation if you also run MCPs and pipeline subagents.

### Preset 3 — `noisy` (active-monitoring / background-tasks)

Adds `Stop` on top of `default-quiet` — fires every time Claude finishes a turn. Useful when you walk away from long-running tasks and want to be pinged each time the agent is ready for more input.

```json
"hooks": {
  "PreToolUse": [ /* same as above */ ],
  "Notification": [
    { "matcher": "idle_prompt|permission_prompt", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ],
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ],
  "Stop": [
    { "hooks": [
      { "type": "command", "command": "bash ~/.claude/hooks/notify-windows.sh", "timeout": 5 }
    ]}
  ]
}
```

**Use this when:** you're babysitting a long task from another room or another machine and want a ping per response. Expect **dozens of notifications per active hour**. Remove it when you go back to interactive work.

### Swapping presets

1. Open `~/.claude/settings.json`.
2. Back it up: `cp ~/.claude/settings.json ~/.claude/settings.json.bak-$(date +%Y%m%d-%H%M)`.
3. Replace the `"hooks": { ... }` object with one of the snippets above (swap `notify-windows.sh` for `notify-mac.sh` or `notify-linux.sh` on other platforms).
4. Restart Claude Code (the settings file is read at startup).

### Interaction with `agentPushNotifEnabled`

`~/.claude/settings.json` also accepts `"agentPushNotifEnabled": true`. This is a **separate notification channel** that uses Anthropic's push infrastructure — it does not go through `hooks/`. If you have it on AND a verbose hook preset, you may get duplicate notifications per event (one toast via hook, one push via Anthropic). Pick one channel or accept the duplication consciously.

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

Covered by the `noisy` preset under **Tuning presets** above. In short: add a `Stop` hook entry pointing to your platform's `notify-*.sh`. Remove it when you go back to interactive work — it fires dozens of times per hour during active development.

## Stage-end notifications (th-orchestrator pipeline)

`notify-stage.sh` is invoked by the th-orchestrator — not by a Claude Code hook event — at the close of each of the four user-facing pipeline stages. It fires regardless of the `autonomous` mode and regardless of the ultra-quiet hook preset: the preset controls which Claude Code events trigger a toast; this script is called directly by the th-orchestrator's own `Bash` tool.

The th-orchestrator pipes a JSON payload of the form `{"stage":N,"label":"...","status":"...","feature":"...","summary":"...","cwd":"..."}` to stdin. The wrapper derives a one-line message (`Pipeline {feature} · Stage N ({label}) {STATUS} — {summary}`), rebuilds a `{last_assistant_message, cwd}` payload, and routes to the matching `notify-{os}.sh` script in the same directory.

**To silence stage notifications:** remove `~/.claude/hooks/notify-stage.sh` after install. The th-orchestrator checks `test -x ~/.claude/hooks/notify-stage.sh` before calling it; if the file is absent, it logs `stage.notify.skipped` with `reason: wrapper-missing` and continues the pipeline without emitting a toast.

**If a `permission_prompt` fires for the th-orchestrator's bash call:** add `Bash(bash ~/.claude/hooks/notify-stage.sh:*)` to `permissions.allow` in your `~/.claude/settings.json`. Under the default ultra-quiet preset this is not required, but users who enable a louder preset may encounter one prompt per stage call.

## Adding support for another OS

1. Add `notify-<os>.sh` following the existing pattern (read stdin, parse JSON, fire native notification, exit silently on failure).
2. Add a matching section to `config.json` under the new OS key.
3. Update the platform label map in `bin/install.py` if needed.
4. Document the new OS's requirements in this README.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/hooks/`.
- Hooks must stay **generic and portable**. No personal tokens, private URLs, or OpenClaw-style integrations in this folder — those belong in each developer's local `~/.claude/hooks/`.
