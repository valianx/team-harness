# Codex configuration resolution

Resolve Team Harness configuration before any direct-mode intake or work.
This is read-only: never create, repair, migrate, or update configuration from
a direct mode.

1. Read only `${CODEX_HOME:-$HOME/.codex}/.team-harness.json`.
2. If the native file is absent, report that setup has not converged, use safe
   defaults for this operation, and recommend `$team-harness:setup`. Never read
   Claude Code or opencode configuration as a fallback.
3. If the native file is malformed, report a concise warning and use safe
   defaults. Do not hide corruption by consulting another runtime's file.
4. Accept only correctly typed values. Ignore an invalid individual key and
   name it in one warning:
   - `logs-mode`: `local` or `obsidian`.
   - `logs-path`: a non-empty absolute path whose canonical target is
     accessible and is neither a filesystem root nor the user home.
   - `logs-subfolder`: a normalized, non-empty relative path without `.`, `..`,
     glob, or empty segments. Canonicalize the combined external target and
     require it to remain strictly contained below the validated `logs-path`;
     otherwise reject the external workspace and use safe defaults.
   - `language`: two lowercase letters.
   - `english_learning`, `obsidian_tasks`, and `flow_telemetry.enabled`:
     booleans.
   - `lane_autoselect`: `announce-and-proceed-on-trivial` or `always-stop`.
   - `clickup.workspace_id`: a string.
5. Apply `language` to responses and operator-facing workspace prose.
   `english_learning: true` adds the configured brief correction signal only
   when the operator writes in English; it never changes the response language.
   Other keys apply only when the requested direct operation uses that surface.
6. Reading workspace settings does not authorize creating a workspace. Direct
   mode remains workspace-free unless the operator's actual bounded task asks
   for a file output. Pipeline activation independently revalidates the same
   configuration before choosing its workspace.

Cross-runtime values may be copied only by an explicit `$team-harness:setup`
import. Direct modes never inspect compatibility sources.
