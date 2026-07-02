# hooks/

The Claude Code plugin's gate and observability hooks. `.claude-plugin/hooks.json` is the
only CC wiring path — the Go installer's CC path is retired (it now installs the opencode
runtime only; see `docs/lifecycle.md`).

## Files

| File | Purpose |
|---|---|
| `run-ts-hook.sh` | Fail-closed launcher — invoked by `.claude-plugin/hooks.json` for every gate below. No gate logic of its own: execs `node hooks/ts/dist/<name>.cjs`. Emits an explicit deny envelope when node or the `.cjs` artifact is missing for a deny-floor hook; silent exit 0 for the advisory and observational hooks. See § Launcher contract below. |
| `hooks/ts/bodies/policy-block.ts` | PreToolUse policy gate logic. Blocks destructive Bash commands and writes to sensitive files. Always-on (never gated by `TH_HOOK_PROFILE`). |
| `hooks/ts/bodies/dev-guard.ts` | PreToolUse outward-action gate logic (`git push`, `gh pr ...`, ClickUp writes). Always-on. |
| `hooks/ts/bodies/gcp-guard.ts` | PreToolUse gcloud verb-classifying gate logic. Always-on. |
| `hooks/ts/bodies/worktree-guard.ts` | PreToolUse worktree advisory gate logic. Fail-open by contract. |
| `hooks/ts/bodies/prepublish-guard.ts` | PreToolUse pre-publish papercut gate logic. `git push` → Check 1 (version-bump guard); `gh pr create` → Check 2 (`prepublish_check` test guard). Block-on-condition / open-on-fault. Always-on. See § Pre-publish gate below. |
| `hooks/ts/bodies/checkpoint-guard.ts` | PreToolUse reasoning-checkpoint gate logic (`Task` matcher). Always-on. |
| `hooks/ts/bodies/session-start.ts` | SessionStart loader logic — dev-mode disposition, language, workspace-mode, english-learning. |
| `hooks/ts/bodies/language-user-prompt.ts` | UserPromptSubmit language-reminder logic. |
| `hooks/ts/bodies/subagent-trace.ts` | SubagentStop fail-open backstop. Appends a coarse `subagent.stop` breadcrumb to `00-subagent-trace.jsonl` when a `th:*` pipeline subagent finishes. Never blocks; emits nothing on stdout. **Breadcrumb is non-suppressible** — runs unconditionally regardless of `TH_HOOK_PROFILE`. |
| `hooks/ts/bodies/subagent-start.ts` | PreToolUse breadcrumb logic (`Task` matcher, `th:*` scope) — the start-side twin of `subagent-trace.ts`. Wired node-direct (not through the launcher — observational, fail-open). |
| `hooks/ts/bodies/precompact-snapshot.ts` | PreCompact fail-open state snapshot. Copies `00-state.md` to a rolling `00-state.precompact-snapshot.md` sibling before context compaction so `/th:recover` can restore in-flight state. Appends a breadcrumb to `00-precompact.jsonl`. Never blocks compaction; emits nothing on stdout. Gated by `TH_HOOK_PROFILE`. |
| `hooks/ts/bodies/notify-stage.ts` + `hooks/ts/entry/notify-stage.cc.ts` | Stage-boundary OS-native toast (Windows/macOS/Linux native senders live directly in the CC entry — no shell-out to a sibling script). Gated by `TH_HOOK_PROFILE`. |
| `hooks/ts/bodies/hook-profile.ts` | Shared `TH_HOOK_PROFILE` resolver. Provides `getHookProfile()` and `observabilityEnabled(class)`. Imported only by observability/notification bodies; never by enforcement floors. |
| `sketch-guard.sh` | NOT an event hook — invoked by the orchestrator via the Bash tool, not wired in `hooks.json`. Unaffected by the TS cutover. |

`run-ts-hook.sh` and `sketch-guard.sh` are the only `.sh` files at the top level of this
folder — every gate's decision logic is TypeScript, compiled to `hooks/ts/dist/*.cjs`
(tracked in the repo so the marketplace plugin can serve it with no build step).

## Launcher contract (`run-ts-hook.sh`)

Three classes, gated on node/artifact availability:

1. **deny-floors** (`policy-block`, `dev-guard`, `gcp-guard`, `prepublish-guard`,
   `checkpoint-guard`) — node absent OR the `.cjs` missing → emit an explicit deny
   envelope and block. Never pass-through.
2. **advisory** (`worktree-guard`) — fail-open by contract; node/`.cjs` absent →
   silent exit 0 (loses only the reminder, never escalates to deny).
3. **observational** (`notify-stage`, `subagent-trace`, `precompact-snapshot`,
   `language-user-prompt`, `session-start`) — node/`.cjs` absent → silent exit 0.

## Script contract

Each gate body reads the Claude Code hook payload from stdin (JSON) and returns a hook
decision (`permissionDecision: allow|ask|deny`, or empty stdout for a no-decision).
Observability/notification bodies never emit a decision — they read stdin, do their
side effect (toast, breadcrumb, snapshot), and always exit 0.

**Required runtime dependency:** `node` (any version supporting the compiled `.cjs`
bundles — see `hooks/ts/tsconfig.json` for the target). Every hook wired through
`run-ts-hook.sh` fails closed (deny-floors) or fails silently open (advisory,
observational) when node is missing — see § Launcher contract above. Native
notifications additionally shell out to a platform binary: `powershell.exe` (Windows,
included in Windows), `osascript` (macOS, built-in), `notify-send` (Linux, package
`libnotify-bin` on Debian/Ubuntu) — a missing binary is caught and treated as a
failed (non-fatal) notification.

## Enabling hooks after install

The marketplace plugin wires every hook automatically via `.claude-plugin/hooks.json` —
no manual `settings.json` merge is required. Install with:

```sh
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

## Events covered

The default preset is **`ultra-quiet`** — fires **only** when the user needs to take an action:

| Event | Matcher | When it fires | Why it's in the default set |
|---|---|---|---|
| `PreToolUse` | `Bash\|Write\|Edit\|NotebookEdit` | Before any of those tool invocations. | Hard guardrail: blocks destructive commands and writes to sensitive files before they run. Does NOT send a notification — runs `policy-block` silently via `run-ts-hook.sh`. |
| `PreToolUse` | `Bash` | Before `git push` or `gh pr create`. | Pre-publish papercut guard: `git push` → version-bump check; `gh pr create` → declared test-command check. Runs `prepublish-guard` via `run-ts-hook.sh`. Block-on-condition / open-on-fault (separate additive sibling to `dev-guard`, which gates both `git push` and `gh pr create` as outward actions requiring operator approval). |
| `Notification` | `idle_prompt` only | Claude finished a turn and is waiting for the user. | High signal: you need to act for Claude to continue. One notification per user-blocking pause. |
| `SubagentStop` | `th:.*` | When a Team Harness pipeline subagent finishes. | Observability backstop: deterministic proof that a `th:*` subagent boundary occurred. See below. |
| `PreCompact` | `manual\|auto` | Before context compaction runs. | State snapshot: enables `/th:recover` to restore in-flight state after an auto-compact. See below. |

### SubagentStop + PreCompact (observability/state hooks)

**`subagent-trace` (SubagentStop, matcher `th:.*`)** appends a coarse
`subagent.stop` breadcrumb to `00-subagent-trace.jsonl` when a Team Harness
pipeline subagent finishes. This is a **backstop**, not a replacement for the
orchestrator's rich `phase.end` events:

- The SubagentStop payload carries only `agent_type`, `agent_id`, and `cwd`
  (no tokens, no duration, no result). The hook provides deterministic proof a
  subagent boundary occurred — useful when the orchestrator drops a `phase.end`.
- It writes its breadcrumb to `00-subagent-trace.jsonl` (NOT `00-execution-events`),
  preserving the orchestrator's exclusive-writer contract.
- **Non-suppressible breadcrumb:** the breadcrumb write runs unconditionally —
  `TH_HOOK_PROFILE=minimal` does NOT suppress it. Only the scope guard (non-`th:`
  agent) and the base-path check (no resolvable workspace) produce a silent exit
  without a write. Any future richer/optional behavior must be placed after a
  profile gate sourced after the breadcrumb.
- Fail-OPEN: the hook exits 0 on every path, never blocks the subagent, and emits
  nothing on stdout. Non-`th:` subagents are silently skipped.

**`precompact-snapshot` (PreCompact, matcher `manual|auto`)** copies
`00-state.md` to a rolling `00-state.precompact-snapshot.md` sibling
(overwrite-in-place, never an ever-growing set) before context compaction.

- It writes a breadcrumb to `00-precompact.jsonl` (NOT `00-execution-events`).
- It copies ONLY `00-state.md` — no transcripts, no config files, no events files.
- Data exposure (SEC-DR-001): **no new secret value** — the snapshot is
  byte-identical to `00-state.md` and bounded to that one file; the vault is a
  pre-existing surface it inherits but does not widen.
- Fail-OPEN: exits 0 on every path, never blocks compaction, never emits stdout.
- Zero/many `00-state.md` files in the workspace → silent exit 0 (do not guess).

**Why Stop/PostToolUse/SessionEnd are intentionally not wired:**

- `Stop` fires on every turn response — dozens per active hour. Re-introduces the
  per-turn noise the `ultra-quiet` preset removed. No pipeline-phase meaning.
- `PostToolUse` fires after every successful tool call. Pipeline tester/qa/security
  already validate tool output at stage boundaries; a generic hook duplicates that.
- `SessionEnd` overlaps `/th:save-session` + delivery KG capture; the payload
  offers no pipeline-phase signal and cannot affect termination.

### `TH_HOOK_PROFILE` (minimal/standard/strict)

Set the `TH_HOOK_PROFILE` environment variable to control the observability/
notification hooks. The enforcement floors (`policy-block`, `dev-guard`,
`gcp-guard`, `worktree-guard`, `checkpoint-guard`) and
`session-start` / `language-user-prompt` are **always-on** regardless of
this setting — no profile value can disable, skip, or downgrade any enforcement
hook.

| Profile | `idle-notify` (toast notifications) | `pipeline-observability` (new hooks) | `subagent-trace` breadcrumb |
|---------|--------------------------------------|--------------------------------------|-------------------------------|
| `minimal` | suppressed | suppressed | **always written** |
| `standard` (default when unset) | **enabled** | **enabled** | **always written** |
| `strict` | **enabled** | **enabled** | **always written** |

`standard` preserves exactly today's behavior for all existing installs.
`minimal` is the quietest operator experience — all notifications and observability
hooks are silent, but the `subagent-trace` existence breadcrumb is never
suppressed (it is the only non-suppressible observability write). `strict` is the
most-verbose level (today identical to `standard` in effect; reserved as a forward
extension point).

The profile is read via `hooks/ts/bodies/hook-profile.ts`, imported only by
observability/notification bodies. Enforcement floors never import it and are
structurally unable to be gated by it. The `subagent-trace` breadcrumb does not
import `hook-profile.ts` — its write path is unconditional.

**What was removed from the previous default (and why).** Earlier versions of this repo also wired:

- `Notification` matcher `permission_prompt` — fired every time any (sub)agent asked permission for a tool. With MCPs and pipeline subagents, this fires many times per pipeline. If you have `skipDangerousModePermissionPrompt: true` in `settings.json`, the prompt is auto-resolved but the notification event still emits — so it produces toasts while work continues, with no action required from you.
- `PostToolUseFailure` matcher `*` — fired on every tool failure including transient MCP flutter that gets retried successfully. Toast accumulates but no action is needed.

Both were noisy without being actionable. They were removed because the goal is "notify when the user must act" — not "notify on every event of interest". See the `noisy` preset under **Tuning presets** below if you want them back.

`Stop` (Claude finished its turn) is **not** in any default — it fires on every response, which becomes dozens of notifications a day in active back-and-forth work. See the opt-in `Stop` snippet at the bottom of this file.

## Why Windows users see notifications as "push in the system bar"

On Windows, the notify-stage entry's native sender uses `Windows.UI.Notifications.ToastNotificationManager`. That API does **two** things:

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
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh policy-block", "timeout": 5 }
    ]}
  ],
  "Notification": [
    { "matcher": "idle_prompt", "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
    ]}
  ]
}
```

**Use this when:** you have `skipDangerousModePermissionPrompt: true` or a similar autonomy setting and don't want a Windows Action Center full of look-alike toasts. This is the default the marketplace plugin wires via `.claude-plugin/hooks.json`.

**Trade-off:** you will not be notified when a tool fails. You'll see the failure in Claude's output if you're watching — and `gate.fail` events still land in `workspaces/{feature}/00-execution-events.jsonl` (local mode) or `00-execution-events.md` (obsidian mode) for pipeline runs (queryable via `/trace <feature> --fails`).

### Preset 2 — `default-quiet` (legacy default before `ultra-quiet`)

Notifies on idle, permission prompts, and tool failures. This was the default in earlier releases of this repo. Kept here for reference and for users who prefer "notify on every event of interest, even if action isn't required."

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash|Write|Edit|NotebookEdit", "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh policy-block", "timeout": 5 }
    ]}
  ],
  "Notification": [
    { "matcher": "idle_prompt|permission_prompt", "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
    ]}
  ],
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
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
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
    ]}
  ],
  "PostToolUseFailure": [
    { "matcher": "*", "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
    ]}
  ],
  "Stop": [
    { "hooks": [
      { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/run-ts-hook.sh notify-stage", "timeout": 5 }
    ]}
  ]
}
```

**Use this when:** you're babysitting a long task from another room or another machine and want a ping per response. Expect **dozens of notifications per active hour**. Remove it when you go back to interactive work.

### Swapping presets

1. Open `~/.claude/settings.json`.
2. Back it up: `cp ~/.claude/settings.json ~/.claude/settings.json.bak-$(date +%Y%m%d-%H%M)`.
3. Replace the `"hooks": { ... }` object with one of the snippets above — `notify-stage` detects the OS itself, no per-platform swap needed.
4. Restart Claude Code (the settings file is read at startup).

### Interaction with `agentPushNotifEnabled`

`~/.claude/settings.json` also accepts `"agentPushNotifEnabled": true`. This is a **separate notification channel** that uses Anthropic's push infrastructure — it does not go through `hooks/`. If you have it on AND a verbose hook preset, you may get duplicate notifications per event (one toast via hook, one push via Anthropic). Pick one channel or accept the duplication consciously.

## Policy gate (`policy-block`)

The `PreToolUse` hook routes through `policy-block` (via `run-ts-hook.sh`). It reads the tool call JSON from stdin, evaluates it against a denylist, and returns a hook decision that either lets the call proceed (default) or blocks it with a clear reason.

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

**Bypassing for a specific case.** If you genuinely need a denied command (e.g., a one-off cleanup script), run it manually outside Claude. Editing `hooks/ts/bodies/policy-block.ts` to scope an exception is also fine, but commit the exception (and rebuild `dist/policy-block.cjs`) so the rest of the team sees it.

**Performance.** Single node process per invocation (regex match, no external dependency). Timeout is 5s.

## Pre-publish gate (`prepublish-guard`)

The `PreToolUse` hook `prepublish-guard` (via `run-ts-hook.sh`) catches two recurring papercuts at the earliest possible moment. It fires only on `git push` (Check 1) and `gh pr create` (Check 2); all other Bash commands exit immediately with no decision.

### Gate design: block-on-condition / open-on-fault

- **BLOCK** (`permissionDecision: deny`): fires only when the checked condition is confirmed — missing version bump on push, or non-zero test exit at PR-creation.
- **FAIL-OPEN** (`nodecision` + one-line stderr warning): fires on every guard-evaluation fault: `git` absent, not inside a work-tree, `origin/main` does not resolve, `git diff` error, config file unparseable, `prepublish_check` value rejected by the control-char guard, `timeout`/`gtimeout` binary absent, internal-timeout (exit 124), command-not-found (exit 127). A guard fault NEVER blocks the operator.

This hook is a strictly **additive sibling** to `dev-guard`. `dev-guard` gates `git push` and `gh pr create` (and `gh issue create|edit|comment`) as outward-action approvals (`ask`). This hook adds a second enforcement layer — version-bump and test guard — for those same commands. Both hooks fire as independent `PreToolUse` entries; Claude Code evaluates each independently (most-restrictive decision wins). This hook never emits `permissionDecision: allow`, so it cannot convert `dev-guard`'s `ask` into an allow.

### Check 1 — Version-bump guard (fires on `git push`)

If the diff against `origin/main` touches any path under `agents/`, `skills/`, or `hooks/` (distributed plugin assets), then BOTH `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json` `version` values must have changed vs `origin/main`. The rule compares the `version` VALUE (not mere file presence), so a whitespace-only touch that leaves the version byte-identical still triggers the block.

**Generic safety:** when `.claude-plugin/plugin.json` does not exist in the repository root, Check 1 is a no-op. Pushes in non-team-harness repos are never blocked.

**Remedy line:** the deny reason names both files and references CLAUDE.md §6.3.

**Why at push?** The version check is cheap (two local git plumbing calls against an already-fetched `origin/main`) and catches a forgotten bump at the earliest moment commits leave the machine.

### Check 2 — Test guard (fires on `gh pr create`)

Reads the `prepublish_check` key from `~/.claude/.team-harness.json`. If declared and non-empty, runs the command under an internal 90s timeout:

```bash
timeout 90s bash -lc "$prepublish_check"
```

**Recommended value for team-harness:** `python3 tests/test_agent_structure.py` (the structural suite — completes in a few seconds).

**To enable:** add `prepublish_check` to `~/.claude/.team-harness.json`:

```json
{
  "prepublish_check": "python3 tests/test_agent_structure.py"
}
```

**Fail-open completeness:** undeclared/empty key → no-op; config file unparseable → no-op; value containing control characters → no-op (never exec'd); `timeout`/`gtimeout` binary absent → Check 2 skipped entirely (no unbounded exec).

**Why at PR-creation?** The declared test command runs once per `gh pr create`, not on every push. For team-harness the structural suite is a few seconds; cost is bounded by the operator-declared command + the 90s internal timeout.

**Deny reason:** names the (JSON-escaped) command and the exit code — never the captured stdout/stderr of the test command (CWE-209 information-disclosure prevention).

### Timeout budget (SDR-PPG-03)

The hook-entry `timeout` is `120s` in all wiring blocks. The internal test-command timeout is `90s`. Check 1 and Check 2 never run in the same hook invocation (command-routed), so the 30s headroom is reserved entirely for stdin drain + command extraction + process-spawn latency. The internal timeout provably fires before the entry timeout.

### Web-UI PR-creation boundary

A PR opened via the GitHub web UI bypasses Check 2 — no `gh pr create` Bash command is issued, so the hook never fires. A prior `git push` still triggers Check 1 (the version-bump papercut is still caught). This is an accepted, honest boundary: the test check is available only on the `gh pr create` code path.

### Security properties

- The `prepublish_check` value lives in the operator's own `~/.claude/.team-harness.json` and is excluded from the session-override whitelist (no untrusted write path). Executing it is equivalent in privilege to the operator running it in their own terminal.
- The command is exec'd as `timeout 90s bash -lc "$prepublish_check"` with the variable quoted. `eval` appears nowhere.
- The deny reason embeds the command via `python3 json.dumps` escaping, never raw `printf '%s'` interpolation (prevents JSON-structure injection from values containing `"`, `\`, or `}`).
- The `prepublish_check` value is never fed to `grep`/`sed` as a pattern.

## Opt-in: notify when Claude finishes a turn

Covered by the `noisy` preset under **Tuning presets** above. In short: add a `Stop` hook entry pointing to `run-ts-hook.sh notify-stage`. Remove it when you go back to interactive work — it fires dozens of times per hour during active development.

## Stage-end notifications (orchestrator pipeline)

The compiled `hooks/ts/dist/notify-stage.cjs` bundle is invoked by the orchestrator — not by a Claude Code hook event — at the close of each of the four user-facing pipeline stages. It fires regardless of the `autonomous` mode and regardless of the ultra-quiet hook preset: the preset controls which Claude Code events trigger a toast; this bundle is called directly by the orchestrator's own `Bash` tool via `node`.

The orchestrator pipes a JSON payload of the form `{"stage":N,"label":"...","status":"...","feature":"...","summary":"...","cwd":"..."}` to stdin. The entry derives a one-line message (`Pipeline {feature} · Stage N ({label}) {STATUS} — {summary}`) and sends it directly to the detected OS's native notifier — no intermediate payload, no sibling script.

**To silence stage notifications:** remove `~/.claude/hooks/ts/dist/notify-stage.cjs` after install. The orchestrator checks `test -f ~/.claude/hooks/ts/dist/notify-stage.cjs` before calling it; if the file is absent, it logs `stage.notify.skipped` with `reason: wrapper-missing` and continues the pipeline without emitting a toast.

**If a `permission_prompt` fires for the orchestrator's bash call:** add `Bash(node ~/.claude/hooks/ts/dist/notify-stage.cjs:*)` to `permissions.allow` in your `~/.claude/settings.json`. Under the default ultra-quiet preset this is not required, but users who enable a louder preset may encounter one prompt per stage call.

## Adding support for another OS

1. Add a `sendNotification` branch to `hooks/ts/entry/notify-stage.cc.ts` (native command, argv-based via `execFileSync` — never shell-interpolated) and a matching case in `detectOS()`.
2. Rebuild: `npm --prefix hooks/ts run build:notify-stage` (commit the regenerated `dist/notify-stage.cjs`).
3. Document the new OS's runtime requirements in this README (§ Script contract).

## Notes

- `README.md` in this folder is contributor documentation; it is not itself a distributed artifact.
- Hooks must stay **generic and portable**. No personal tokens, private URLs, or OpenClaw-style integrations in this folder — those belong in each developer's local `~/.claude/hooks/`.
