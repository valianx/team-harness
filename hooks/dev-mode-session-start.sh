#!/usr/bin/env bash
# dev-mode-session-start.sh — Team Harness SessionStart hook.
#
# When the dev-mode marker is present, this hook does two things, both fast and
# both at session start (before the first prompt):
#   1. systemMessage  — a one-line mode banner rendered by Claude Code itself
#      (NOT by the model), so it is instant (no token render) and visible before
#      the operator types. This replaces the slow model-rendered ASCII banner.
#   2. additionalContext — the orchestrator disposition, injected SILENTLY. The
#      model adopts it without printing any banner and without narrating it.
#
# Hard runtime limit: the model still has no turn before the first user message,
# but systemMessage is app-rendered, so the mode indicator shows regardless.
#
# Inert in normal mode (marker absent). Cross-platform: Git Bash on Windows,
# native bash on macOS/Linux.

set -euo pipefail

MARKER="${HOME}/.claude/.dev-mode-active"

# Drain the SessionStart payload on stdin so the producer never sees SIGPIPE.
cat >/dev/null 2>&1 || true

# Not in developer mode -> inject nothing.
[ -f "$MARKER" ] || exit 0
grep -q 'dev_mode: true' "$MARKER" 2>/dev/null || exit 0

# One-line, app-rendered mode banner (no double quotes / backslashes -> embeds in
# JSON without an escaping pass).
BANNER='TEAM HARNESS | DEVELOPER MODE ACTIVE | pipeline on | outward actions require operator approval | stop: /dev-mode off'

# Silent disposition. The dev-mode determination is FINAL at session start and
# SILENT — the agent never re-verifies the marker and never narrates it.
CONTEXT='Team Harness developer mode is active for this session. This determination is FINAL at session start and SILENT - do NOT re-verify the marker ~/.claude/.dev-mode-active (the deterministic hooks read it, you do not) and do NOT narrate dev mode, the marker, or the routing rationale. A one-line mode banner is already shown to the operator by the app (systemMessage); do NOT print any banner or ASCII art yourself. Silently adopt the orchestrator disposition: route development tasks (features, fixes, refactors, enhancements, hotfixes, issue work, review) through the full pipeline (architect -> implementer -> tester + qa + security -> delivery), dispatch leaf agents directly via Task, apply the fail-closed triage invariant (ANY ambiguity about whether a task needs the pipeline -> enter the pipeline or ask the operator; NEVER handle a development task inline without gates), and treat security floors as non-waivable. Do NOT read agents/orchestrator.md or any docs/ contract at session start - pre-loading them is a 20s+ wait; defer all contract loading until a development task enters the pipeline, then read only the needed sections from the plugin cache ~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) are intercepted by hooks/dev-guard.sh and require explicit operator approval; you cannot auto-approve them. Serve the operator first message: if it is already a concrete request or question, address it directly (answer simple non-development queries yourself; route development tasks through the pipeline); only if there is no actionable request, reply with one short line asking what to work on. Do NOT run unprompted git, filesystem exploration, Memory/KG, or environment statistics.'

printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$BANNER" "$CONTEXT"

exit 0
