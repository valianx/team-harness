# OpenSpec integration

For TH coordinators and contributors: use OpenSpec for written product intent,
implementation verification and archive, while the native host owns execution
and permissions. Spec and pipeline use the same repository artifacts.

The [shared four-phase method](../skills/spec/references/development-phases.md)
places OpenSpec's intent and tasks in Spec, implementation evidence in
Implementation, verification, selected provider assessments and completed archive
in Validation, and the authorized delivery action in Publication. OpenSpec remains the
canonical source; the workspace plan only presents progress and evidence.

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

1. In **Spec**, author or reuse canonical OpenSpec intent through the installed upstream skill.
   Run strict structural validation and TEA test-design; maintain the existing workspace
   plan with the testing strategy and selected later checks.
2. In **Implementation**, continue authorized work under native coordination. Execute
   selected TEA implementation methods and focused project checks according to that strategy.
3. In **Validation**, run the agreed project checks and the declared
   [upstream stages](../skills/spec/references/upstream-tools.md): TEA test-review and trace,
   Superpowers completion verification, and the installed OpenSpec implementation-verification
   workflow. OpenSpec checks correspondence with intent; actual project tests remain separate.
   A declined optional TH review or deferred archive does not waive verify. Evaluate findings,
   resolve real completion defects, then synchronize and archive completed intent on the same
   branch. Strictly validate the archive and affected living specs before selected independent
   review of the final candidate; judge findings and verify any corrections.
4. In **Publication**, use the shared create-pr flow to prepare every completed
   repository-file change, even when no PR was initially requested. Reuse
   applicable evidence and include code, living specs and archive in one PR.
   Publication follows native permissions and honors an explicit operator stop
   or decline; neither waives candidate preparation. Read-only work and outputs
   kept outside the repository have no candidate to prepare.

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
