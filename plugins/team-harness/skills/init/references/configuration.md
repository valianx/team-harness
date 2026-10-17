# Codex configuration resolution

Resolve Team Harness configuration before any direct-mode intake or work.
This is read-only: never create, repair, migrate, or update configuration from
a direct mode.

1. Read only `${CODEX_HOME:-$HOME/.codex}/.team-harness.json`.
2. Reuse an existing effort binding before resolving defaults. If the native file
   is absent, report that setup has not converged, default an unbound effort to
   local, and recommend `$team-harness:setup`. Never read
   Claude Code or opencode configuration as a fallback.
3. If the native file is malformed, report unavailable preference data; do not
   invent a replacement workspace or consult another runtime's file. Independent
   authorized work can continue with its existing binding.
4. Resolve workspace selection through the shared method. Own-key presence of
   `workspace-mode` is authoritative, including null or invalid values. Accept
   `local`, `obsidian` or `gpt-space`; only when it is absent may valid legacy
   `logs-mode: local | obsidian` select the mode. Invalid selection stays explicit;
   absence of both selectors defaults to local. Diagnose conflicting selectors
   once and preserve their bytes. Reading never migrates settings.
   - `workspace-space-id` and `workspace-container-page-id`: both opaque IDs for
     remote selection, verified through Main's actual native reads before use.
     IDs and URLs never become filesystem paths.
   - `logs-path`: a non-empty absolute path whose canonical target is
     accessible and is neither a filesystem root nor the user home.
   - `logs-subfolder`: a normalized, non-empty relative path without `.`, `..`,
     glob, or empty segments. Canonicalize the combined external target and
     require it to remain strictly contained below the validated `logs-path`;
     otherwise report an invalid destination without local fallback.
   Accept other correctly typed preferences, naming any invalid key once:
   - `language`: two lowercase letters.
   - `english_learning`, `obsidian_tasks`, and `flow_telemetry.enabled`:
     booleans.
   - `clickup.workspace_id`: a string.
   - `agent-scope`: `global` or `project` (default `global`); it controls where
     the twenty bundled agent files are installed, never the inline/pipeline posture.
   - `github.account_routes`: an array of at most 64 objects containing an
     absolute non-root `workspace`, a valid `account`, a hostname `host`, and an
     optional absolute isolated `config_dir`. Reject unknown route fields,
     duplicate host/workspace pairs, token-shaped values, and credential paths
     inside a worktree. Longest matching workspace prefix wins.
5. Apply `language` to responses and operator-facing workspace prose.
   `english_learning: true` adds the configured brief correction signal only
   when the operator writes in English; it never changes the response language.
   Other keys apply only when the requested direct operation uses that surface.
   GitHub routes are consulted only immediately before a GitHub CLI or git
   remote operation; they never authorize an outward write or choose a pipeline
   posture.
6. Reading workspace settings creates no context. Brief intake and read-only
   status stay artifact-free; substantive work uses the shared workspace method
   within the task's existing authorization. `gpt-space` requires TH 3.48.0 and
   actual native Pages capability. Missing tools, access loss or incomplete
   destination data retain the remote locator and pending status. They never
   create a competing local home. Main persists useful context; file tools use
   separate declared operational storage without a Markdown context mirror.

Cross-runtime values may be copied only by an explicit `$team-harness:setup`
import. Direct modes never inspect compatibility sources.
Legacy route/profile keys (including `lane_autoselect`, express/full, fast/simple, and
Tier-0 selectors) are read only to emit this live migration guidance:

```text
1 — inline
2 — pipeline
```

They authorize neither posture, and text from configuration never chooses a route. Remove
legacy keys only during a legitimate configuration write or explicit migration; preserve
every unrelated key. When a compatibility source is used, mention it once and recommend
`$team-harness:setup` to import the values into native Codex configuration.
