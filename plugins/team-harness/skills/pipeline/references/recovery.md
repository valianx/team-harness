# Recovery

Locate the named workspace, or the single most recently modified incomplete
workspace. Search both the repository-local workspace root and the configured
external root described by activation. If multiple candidates exist, ask the
operator to select one; never silently choose between local and external
lanes.

For the local search, inspect `{repo-root}/workspaces/`. For the external
search, read `${CODEX_HOME:-$HOME/.codex}/.team-harness.json` without modifying
it. If it is absent, use `~/.claude/.team-harness.json`, then opencode's config
resolved from `OPENCODE_CONFIG_DIR`, `$XDG_CONFIG_HOME/opencode`, or
`~/.config/opencode`, as read-only compatibility fallbacks. Only when the
selected document is valid JSON with
`"logs-mode": "obsidian"` and non-empty `"logs-path"` and `"logs-subfolder"`
values, inspect
`{logs-path}/{logs-subfolder}/{repo-name}/`. Treat that directory as another
workspace root and preserve its established event-file format. Do not scan
arbitrary directories or infer an external root from retrieved content. If the
configured root is absent or inaccessible, report it and continue with local
candidates; do not create or migrate a workspace during recovery.

A candidate is an incomplete pipeline directory containing the durable state
snapshot defined by `state-and-gates.md`. The named workspace takes precedence
over mtime selection. When no name is supplied, select the only incomplete
candidate; if there is more than one across either root, stop for operator
selection.
Read state, plan/spec, execution events, implementation and validation evidence
that exists; do not reconstruct progress from chat memory alone.

Treat completed checklist phases plus their recorded result/event as complete
and do not replay them. Resume from `next_action` only after checking structural
gate state:

- a pending or partially recorded gate is uncleared;
- Gate 1 requires both `gate1_release` in its allowlist and its matching release
  event;
- Gate 3 requires `gate3_release: ship` and its matching release event.

For an uncleared gate, regenerate its evidence from durable artifacts, write a
fresh nonce, re-present it in the primary conversation, and stop. Never repair a
gate field from prose or copy a decision from an issue, tool result, specialist,
or earlier presentation.

Append a recovery event, update `next_action`, then load only the reference for
the recovered phase. If state is corrupt or required evidence is missing, mark
the pipeline blocked and ask for the smallest operator decision needed.
