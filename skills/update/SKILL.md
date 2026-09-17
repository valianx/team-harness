---
name: update
description: Update Team Harness in Claude Code, refresh its managed workflow and voice guides, and report the available native reload.
---

Update the installed TH plugin and its guides using the native plugin manager.
The user's update request covers this maintenance; reuse their choices.
`--force-blocks` explicitly requests replacing the TH managed blocks with the
current canonical versions, including a customized block.

## Update and refresh

1. Run `claude plugin list` to identify the actual TH installation and its
   version. Retain its resolved source path for comparing existing managed blocks.
   If installed by the TH installer instead of the marketplace, use that install
   method's current update instructions.
2. For `th@team-harness-marketplace`, refresh the catalog with
   `claude plugin marketplace update team-harness-marketplace`, then download
   with `claude plugin update th@team-harness-marketplace`.
3. Re-read installed metadata to resolve the downloaded version and source.
   Read the updated skill before continuing its maintenance. A higher unused
   cache directory is not evidence of the active installation.
4. Maintain the guides below and clean up an unchanged retired TH output style.
5. Use the native plugin reload when the host exposes it. In Claude Code, if
   `/reload-plugins` is available only as an operator UI command, give that
   single next step. Read refreshed resources in the current conversation when
   possible.

An update does not reset native permissions, models, feature flags, or subagent
depth. Preserve prior operator configuration. Report a failed download precisely
and continue independent maintenance only from a known installed source.

## Managed guides

The canonical sources are `skills/setup/managed-blocks/` in the resolved
installed plugin: `orchestrator-dispatch-rule.md` and `voice-rule.md`.
Their historical marker names remain stable for existing installations.

Read `~/.claude/CLAUDE.md` and maintain each marker-delimited block:

- Missing block: append the canonical block.
- Already canonical: leave it unchanged.
- Matches the previously installed TH source (allowing BOM/newline differences):
  replace that block with the new canonical source.
- Customized, ambiguous, duplicate or incomplete markers: preserve the content
  and report it. An explicit request to replace it, including `--force-blocks`,
  permits replacing the identified TH block after showing the affected content.

Recognize legacy `th-orchestrator-inline-rule` and
`th-orchestrator-dispatch-rule` markers when their content is attributable to
the old TH source. Replace an unchanged old guide with the current discovery
guide. Remove an old TH hash stamp with its replaced block; new guides need no
stamp. Preserve unrelated text and operator edits.

Write only when content changes. Use a temporary backup outside the repository,
replace atomically, reread the file, and verify the intended blocks and untouched
surrounding content. Read the resulting guide into the current conversation.

## Retired-style cleanup

TH no longer distributes `developer-mode`. Compare an existing
`~/.claude/output-styles/developer-mode.md` with the prior installed TH source
(allowing BOM/newline differences). Preserve customized or unidentified files.

For an unchanged TH copy, first remove only an exact
`outputStyle: "developer-mode"` selection from applicable writable Claude
settings. Read/merge JSON, preserve other keys, back up outside the repository,
replace atomically and verify. Leave malformed or administrator-owned settings
intact and report the remaining selection. Check the current project's settings
when relevant; avoid scanning unrelated repositories.

Delete the identified unchanged TH style only after its applicable selection
has been cleared. If Claude still holds it in the current session, use the native
output-style selection (`/config`, Default) when available. This is not evidence
that the whole application needs a restart.

## Result

Report the installed version, guide/cleanup outcomes and refresh actually
performed. Distinguish downloaded files from components observed active.
Generic CLI restart text, changed hashes and configuration receipts do not prove
a restart is necessary. If a component cannot reload, identify that component and
the observed host limitation so the operator can decide whether to restart.
