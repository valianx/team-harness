---
name: setup
description: Configure Team Harness workflow preferences, skill discovery, voice, and optional integrations in Claude Code.
---

Configure the requested concern from $ARGUMENTS. Read existing values first;
reuse the operator's stated preferences and ask only for missing choices.
A targeted request configures that concern without repeating the full survey.

## Workflow preferences

Store TH preferences in `~/.claude/.team-harness.json`, preserving unrelated
keys and existing values unless the request changes them. The useful options are:

| Concern | Setting |
| --- | --- |
| Workspace location | `logs-mode: local` (project `workspaces/`) or `obsidian`, with `logs-path` and `logs-subfolder` |
| Response language | `language`; absence follows the conversation |
| English corrections | `english_learning`; optional, independent of response language |
| Flow telemetry | `flow_telemetry.enabled`; off unless the operator opts in |
| ClickUp | `clickup.workspace_id` |
| Obsidian tasks | Use the current `todo` skill's setup when requested |
| GitHub accounts | Use `scripts/manage_github_identities.py --runtime claude` to show, configure, or resolve workspace routes |

Keep credentials in the runtime's native credential/configuration facilities.
GitHub routes contain workspace paths, hosts and account names, not tokens.
Read and merge structured settings, write atomically, and verify the requested
delta. Preserve malformed existing files and report the specific problem.

## General agent discovery and voice

Maintain the workflow and voice blocks in `~/.claude/CLAUDE.md` using
[update's managed-guide procedure](../update/SKILL.md#managed-guides).
The current general agent continues to coordinate the work. The guide makes
`spec`, `pipeline`, `review-pr`, and `create-pr` discoverable through the
native skill catalog and `/th:modes`.

Apply [retired-style cleanup](../update/SKILL.md#retired-style-cleanup) for an
existing TH developer-mode installation. A fresh installation needs no output style.

## Optional integrations

Configure Memory, Context7, or another requested MCP through the native Claude
Code MCP commands or configuration. Inspect native help and the integration's
current setup instructions before choosing arguments. Preserve other servers
and settings. Test the selected integration through an available read-only tool;
distinguish configuration on disk from a connection observed in this session.

Dependencies are installed when a selected workflow needs them. The workflow
reports the concrete missing tool and uses the operator's native installation
and approval facilities.

## Completion

Report the preferences or guides changed, integrations verified, and anything
still unavailable. Use the native plugin refresh when relevant; a disk change
alone does not establish that a restart is required.

TH setup owns workflow preferences and its managed guides. Native permissions,
sandbox policy, model defaults, feature flags, and subagent limits remain under
the runtime and operator's configuration.
