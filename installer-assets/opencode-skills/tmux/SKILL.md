---
name: tmux
description: Orchestrate multiple explicitly requested opencode sessions in tmux with bounded scopes and recoverable names.
---

# tmux orchestration in opencode

Require tmux and the `opencode` executable. Use deterministic session names,
separate repository working directories, and one bounded task per pane. Never
launch Claude Code or Codex. Preserve opencode's native permission prompts and
do not auto-answer gates in a child session. Show the exact layout and commands
before creating sessions when the request would start more than one process.
