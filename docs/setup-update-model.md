# Setup, update and reload

Setup configures TH preferences and optional integrations. Update installs the
current TH release and maintains its managed guides and specialist files.
Reload reads current instructions and uses refresh capabilities exposed by the
active runtime.

These operations preserve native permission policy, sandbox settings, model
defaults, feature flags and subagent limits. They do not repair operator choices
into a TH profile.

## Discovery and voice

Claude Code maintains workflow and voice blocks in `~/.claude/CLAUDE.md`.
Codex maintains its
[general-agent guide](../plugins/team-harness/skills/setup/references/general-agent-guide.md)
in effective native global instructions. OpenCode uses its native installed skill
catalog and TH preferences.

The general agent can discover `spec`, `pipeline`, `review-pr` and
`create-pr` without taking on a replacement identity. Guides use the installed
skill as the current source and preserve operator edits.

## Installation boundaries

The native plugin manager owns plugin installation. TH helpers can maintain TH
preferences, install selected native specialist files, and configure requested
integrations. Existing credentials and unrelated settings remain in place.

Claude's retired developer-mode style is removed only when it is an unchanged
TH copy and its applicable selection has been cleared. Customized styles remain
untouched. Update carries this cleanup; setup is not required again.

## Activation

A successful download establishes files on disk. A supported reload may activate
them in the current conversation. Read current skills and use only host refresh
controls actually available.

A changed digest, convergence receipt or generic CLI restart message is not
proof that a restart is necessary. If a component cannot refresh, report the
specific observed limitation and let the operator decide whether restarting is
worthwhile. Keep the same conversation whenever the host supports it.
