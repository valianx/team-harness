# OpenSpec integration

For TH coordinators and contributors: use OpenSpec for written product intent,
implementation verification and archive, while the native host owns execution
and permissions. Spec and pipeline use the same repository artifacts.

## Canonical artifacts and workspace

OpenSpec owns proposal, requirements, design and tasks under
`openspec/changes/<change>/`, living specs under `openspec/specs/`, and completed
history under `openspec/changes/archive/`. Worktree use does not relocate them.
A change describes product behavior; routine installation or delivery work does
not need an artificial change. Follow the repository's OpenSpec configuration.

Use the shared workspace skill for the existing local or Obsidian effort.
The plan links to canonical intent and records progress. Working test designs,
coverage analysis and verification/review reports stay in that workspace as
Markdown; required operational formats retain their format. Obsidian mode has
no local mirror. Product code and maintained tests stay in the repository.

## Toolchain and upstream ownership

The [compatibility policy](../skills/pipeline/openspec-policy.json) identifies
the tested CLI, prerequisites, host targets and required workflows. Resolve the
actual installation and read its current generated instructions. For installation
and update, follow the [shared upstream-tool reference](../skills/spec/references/upstream-tools.md).

At spec entry or resumption, check the policy's OpenSpec, TEA and Superpowers
capabilities for the active host. When authorized, repair missing capabilities
through the setup skill's official upstream routes; reuse healthy providers without
updates. Preparation does not configure inactive hosts or execute later stages.
Report installed capability separately from active-session readiness, and validate
version differences against provider prerequisites instead of forcing unavailable
marketplace versions.

A CLI binary alone is insufficient: verify must be present in the upstream-generated
host integration. Use official profile/init/update mechanisms to include required
workflows while preserving existing selections and other host targets. Reuse
healthy installations and existing scoped authorization. A missing prerequisite
is recoverable work in the same effort; it does not require starting a pipeline
again or issuing an exact approval phrase.

OpenSpec is the writer of generated skills and commands. TH does not vendor,
rewrite or redistribute them. Packaging uses the declared TH roots in
`runtime/package-ownership.json` and excludes generated project integrations,
including flat OpenCode opsx commands. Consumer installations remain intact.

## Work through the existing flow

1. Author or reuse canonical OpenSpec intent through the installed upstream skill.
   Run strict structural validation and maintain the existing workspace plan.
2. Continue authorized implementation under native coordination. In spec,
   [upstream stages](../skills/spec/references/upstream-tools.md) execute TEA
   test-design, test-review and trace, then Superpowers completion verification.
   Their findings and evidence are shared with the next stage.
3. Execute the installed OpenSpec implementation-verification workflow against
   the active change before declaring completion or preparing its completed archive.
   It checks correspondence with intent; actual project tests remain separate.
   A declined optional TH review or deferred archive does not waive verify.
4. Evaluate findings, resolve real completion defects, and prepare authorized
   archive on the same branch. Include code, living specs and archive in one PR.
5. Strictly validate the archive and affected living specs. Continue selected
   independent review and the shared create-pr flow, reusing applicable evidence.

Claude's researched entry is `/opsx:verify`, Codex's is
`$openspec-verify-change`, and OpenCode's is `/opsx-verify`; resolve the entry
from the installed version. These are agent workflows, not a terminal command
called `openspec verify`. Structural `openspec validate` is not implementation
verification.

Main judges findings using the whole context. Missing or failed verification is
pending, not a pass; independent authorized work may continue. Scores and review
verdicts do not create a separate permission or publication token.

## Resume, corrections and close

Use [the shared lifecycle](../skills/spec/references/lifecycle.md) for archive
readiness, corrections, retirement and read-only status. A location-only archive
preserves implementation evidence after links and structural checks are refreshed.
A changed implementation renews the affected verification, without automatically
repeating every tool or the whole independent review.

Do not invent an upstream reopen command or pass an archived path to an active-only
workflow. Preserve history and use a demonstrated supported context for a correction;
a durable amendment is for changed intent, not merely a prerequisite to invoke a
tool. Report any unavailable recovery honestly.

Planning-only work does not claim implementation completion. Approved cancellation
uses retirement without falsely completing tasks or applying discarded deltas.
Historical v5 logs and helpers remain available for old records; their leases,
gate nonces and journals are not part of this current workflow.
