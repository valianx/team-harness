# Retired developer mode

Developer mode no longer replaces the native general agent. TH provides skills
for written intent, implementation, review and delivery; the host supplies
permissions, sandboxing, approvals and sessions.

Useful collaboration guidance remains: discover the current skills, use spec
when intent and tasks help, select pipeline when broader coordination is wanted,
keep shared local/Obsidian workspace context, and respect language/voice preferences.
Reviewers contribute evidence and recommendations; Main judges them.

The former TH marker, output style, policy hooks and gate/lease authority are
retired. Historical traces do not grant permission or require a fresh security
lens. Current execution guidance is in the selected skill and
`agents/ref-pipeline.md`.

## Installation

`/th:setup` and `/th:update` synchronize the managed general-agent and voice
guides. They do not install or recreate a replacement output style. Existing
selections follow [the bounded migration](#retire-an-existing-developer-mode-selection).
The update flow removes retired `dev-mode`, `nested-dispatch-takeover` and
`dev-mode-entry` managed blocks. No activation marker is written; native host
permissions and approvals remain outside this migration.

## Retire an existing developer-mode selection

Team Harness no longer distributes a replacement output style. Its useful guidance
lives in the workflow skills, the managed general-agent guide and voice rule, and
the session's language and workspace context. Execution guards are independent of
the retired style and remain unchanged by this migration.

Use this procedure from Claude setup or update when an older installation exists.
It is a bounded migration, not a scan or rewrite of every project on the machine.

1. Inspect the effective `outputStyle` and its source using the host's settings
   controls. Account for user, current project/local and managed overrides; a
   user setting alone does not prove the active selection. Respect a configured
   Claude config directory. Do not print unrelated settings or credentials.
2. If the selected style is TH's retired `developer-mode` (including a host-qualified
   identifier), resolve the actual style file, including a
   project style shadowing the user copy. Compare its complete content with the
   same file from a known previous TH release/cache. A filename or frontmatter
   alone does not establish ownership. If the file is customized, missing or
   unverifiable, preserve it and report the selection and specific migration
   decision that remains; do not claim deactivation.
3. For a verified stock TH selection, use the available native style picker to
   select **Default**. If the host exposes no picker, change only the `outputStyle`
   property whose current value is the verified retired-style identifier in its
   identified, authorized settings file to the host's native default, preserving
   all other keys. Never rewrite malformed JSON,
   managed policy or a file outside the authorized setup/update scope. In
   particular, update does not silently modify repository settings: report the
   native selection action for that scope instead.
4. Verify the effective style after the switch. Only then remove the verified
   unmodified user-level TH style file, using its exact path. Preserve custom,
   project and managed files. An unselected stock user copy can also be removed
   after verifying that it is not the active resolved style. Do not search other
   repositories for selections; report this scope limit when it matters.
5. Report whether the style was already absent, migrated, or preserved pending
   a specific action. Distinguish disk cleanup from the running session's active
   style. Use supported refreshes and identify a demonstrated host limitation
   before recommending a new session or restart.

Claude's [output-style documentation](https://code.claude.com/docs/en/output-styles)
describes the native selector, the `outputStyle` setting and version-dependent
activation behavior. Its [settings documentation](https://code.claude.com/docs/en/settings)
describes precedence. Consult the current host capabilities instead of assuming
that changing a file always refreshes a running session.
