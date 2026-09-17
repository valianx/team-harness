# Installation

TH uses the native Claude Code and Codex plugin managers and an installer
projection for OpenCode.

## Claude Code

```text
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

Setup configures TH preferences, workflow discovery and voice. Memory and
Context7 are optional integrations for workflows that use them. Native
permissions, models and subagent settings remain unchanged.

Update through `/th:update`; use the native plugin reload when available.
The retired developer-mode style is not required.

## Codex

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Then use `$team-harness:setup` for preferences and native specialist placement.
See [Codex runtime](codex-runtime.md). No TH command hooks are installed.

## OpenCode

Use the runtime-aware Go installer with `--runtime opencode` and the desired
native scope. See [the installer reference](../bin/README.md) for download and
command options. OpenCode receives native skills and agents; its permissions
remain authoritative and TH installs no hook adapters.

Use its TH `update` skill for the checksum-verified updater and `reload` for
available session refresh. A restart is considered only for an observed host
limitation that cannot be handled by refresh.
