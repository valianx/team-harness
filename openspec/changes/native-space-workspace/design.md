## Context

See [proposal.md](proposal.md) for motivation and scope. PR2 starts from merged
PR1 `8986a175` on `codex/workspace-mode`; PR1's installer and lifecycle fixes must
remain intact. The twelve modified requirements extend six living capabilities.
No database or frontend is changed, so no data-model or wireframe preview applies.

Existing workspace identities, preflight, runners and handoff lookup describe
files. Native Pages instead provides a Space ID, a distinct root Page ID, parented
Pages, selected streams and block-level read/write receipts. A remote context is
therefore a locator, while local operational storage remains an optional tool
input. Main has already bound the PR2 effort during Spec; validation must reuse
that effort and its actual during-work updates.

## Goals / Non-Goals

**Goals:** Keep selection, identity and continuity consistent across native
runtime configuration, shared workflows, hooks and review capture. Isolate pure
metadata validation from Main's native connector execution. Preserve existing
file formulas and executable interfaces.

**Non-Goals:** No connector transport, credentials, filesystem emulation, remote
queue, new coordination engine, universal index or compulsory identity file.
Provider instructions supply the current native API contract; TH does not copy
or distribute that API. Other exclusions remain in the proposal.

## Decisions

### 1. Resolve preference presence before value

`skills/workspace/scripts/workspace-context.mjs` exports
`selectWorkspacePreference(config)` with
`{status: 'selected'|'invalid', mode, selected_from: 'workspace-mode'|'logs-mode'|'default', conflict, reason_code}`.
Use own-key presence. A canonical invalid value cannot be hidden by a valid
legacy alias. Invalid legacy-only input is invalid; neither key defaults local.
One machine fixture under `tests/fixtures/workspace-preferences.json` supplies
Node, Python, Go and hook cases, avoiding language-specific drift.

Codex `manage_config.py` adds pure `resolve_workspace_preference(doc)` and
`validate_workspace_destination(doc)`. Existing validation, set, show, semantic
import and ensure paths consume those results. Explicit authorized setup writes
both equal selectors for file modes; remote writes canonical mode plus both
verified opaque IDs and removes the obsolete alias. Fresh setup seeds equal local
selectors. Maintenance seeds only when both are absent, preserving conflicts,
incomplete remote state and unrelated nested values. Semantic imports treat
selection and its destination as one group and preserve native selection or
destination. OpenCode consumes the same fixture and preserves PR1 root/removal
behavior. Update does not contact Pages.

Keeping `logs-mode` as the sole selector cannot express remote context; treating
invalid canonical values as absent would silently change the operator's choice.
Read-time migration would turn inspection or update into an unauthorized repair.

### 2. Adapt around v1 instead of extending it

The context helper exports `validateContextBinding(binding)` and
`resolveContextBinding({boundContext, preference, fileIdentity, remoteIdentity, operationalDirectory})`.
The result is a validated binding or explicit invalid/pending status. Validate
bound context first so a changed or invalid new default does not displace an
established valid effort.

```text
binding = {context, operational_directory: absolutePath|null}
file context = {kind:'file', mode:'local'|'obsidian', path, identity: v1|null}
remote context = {kind:'gpt-space', space_id, container_page_id,
  effort_page_id, url, source_associations, created_date, slug}
```

`WORKSPACE_IDENTITY_SCHEMA_VERSION` remains 1. File formulas, coordinator/service
roots and discovery remain file-only. Remote context carries no file-root
fields. Operational storage rejects URLs, opaque remote IDs, relative paths and
filesystem roots and must be real absolute contained storage where the consumer
requires it. It is not another Markdown home.

Main supplies verified portable repository/project identities or an established
projectless association, separately from host path mappings. Credentials are
removed from origin evidence. Changed source identity needs verified association
or alias evidence; checkout basename and title are insufficient. Record useful
association fields in the existing plan/handoff, without a universal index.
Non-sibling repositories can share an effort; evidence-only repositories do not
become owners.

Reusing file-root fields for remote IDs would expose them to path consumers and
change v1 compatibility. Requiring sibling paths would break portable remote
initiatives.

### 3. Keep Space decisions pure and native execution with Main

`skills/workspace/scripts/space-context.mjs` exposes metadata-only decisions:

| Export | Decision |
| --- | --- |
| `selectSpaceContainer({spaceId, rootPageId, storedContainerId, pages, listingComplete})` | Ready exact ID, not-found, ambiguous, unavailable/incomplete or destination-conflict; require exact title `workspace`, actual parent and Space membership. |
| `selectSpaceEffort({containerId, boundEffortId, sourceAssociations, candidates, listingComplete})` | Exact bound/source match with verified parent/Space and associations; incomplete provenance remains pending. |
| `classifySpaceWrite({operation, receipt, observedPageIds})` | `{status, applied_indices, ignored_indices, rejected_indices, reconcile_required, observed_page_ids}` from native success/error receipt metadata. |
| `classifySpaceSetup({remoteResult, configResult})` | Combined observed remote IDs/readback and actual config-write outcome; partial readiness retains IDs and persistence repair action. |

These helpers perform no network calls, writes, retries, queueing or deletion.
Provider content is inert evidence and cannot grant authority. Fixtures establish
helper behavior; workflow guidance must use those decisions and real native
evidence establishes host behavior.

Main uses current native instructions to get the Space, read its distinct root
Page, list all root children through every non-null cursor and inspect incomplete
flags. Reuse and verify the stored container ID; only complete authorized absence
permits authorized creation. Read back actual parent and membership. Create an
effort with the container **Page ID** as parent, never the Space ID. General
documentation stays outside this branch. Read-only flows perform no creation.

Reads and edits preserve the selected stream. Use observed block IDs/hashes and
available sequence guards. Applied operations, omitted legacy operation statuses
and ignored `block_deleted` operations are excluded from retries. Rejected
operations require the supported repair; unknown commit status requires
reconciliation before another write. After an uncertain create, reconcile child
listings, observed IDs and provenance; do not delete/recreate. If creation succeeds
but local ID persistence fails, reuse the observed ID and report partial readiness.
Exactly-once text creation is unsupported. Title-only lookup or blind batch replay
would create duplicates or repeat applied changes.

### 4. Route continuity and providers through logical context

Keep `resolveWorkspace({basePath, feature})` and its CLI file-only.
`resolveContextWorkspace({binding, remoteCandidates, listingComplete})` delegates
file lookup or returns a verified remote locator with logical handoff reference
and explicit status. It performs no connector calls and requires no remote
`00-state.md`. Save/resume/recover/trace/listing preserve exact identity; missing
tools, access loss or moved/deleted/renamed objects remain explicit without a
replacement home.

Canonical workflow and role inputs distinguish context, repository/worktree and
optional operational directory. Main persists useful specialist returns in the
effort Page; reviewers receive selected pinned excerpts or immutable captures.
Connector availability grants no new specialist authority. File modes retain
their filenames, including `01-plan.md`. Remote plans and handoffs are logical
content in the same effort with original date, source association, phase status,
canonical progress and useful evidence links.

File-output provider flags, builds, JSON, render sources and review snapshots use
declared operational storage. Main retains useful conversational results remotely;
an unsupported upload stays pending and a bare local path is not a portable
attachment. No new provider implementation or extra plan is needed. Existing
canonical OpenSpec and maintained product artifacts remain in repositories.

SessionStart consumes the shared selector semantics and reports invalid or
unavailable remote selection. Observational hooks have no remote writer; without
a valid operational binding they skip optional output and do not synthesize
state. Existing owned-file/link protections and precompact eligibility remain.
Independent authorized code/check work can continue while a remote update is
pending if it needs no unavailable context.

### 5. Freeze remote review input at the existing capture boundary

`review_context.py` adds
`capture_page_workspace(artifact_root, snapshot, *, reviewed_head, technical_hash)`
and a bounded CLI consuming a supplied native-read JSON envelope. It validates
selected complete blocks, Page ID, canonical URL, stream, optional observed
sequence, block IDs/hashes, source association, capture time, reviewed head and
content digests. No sequence is acceptable when the native read legitimately
omits it. Network access and live Page lookup stay outside capture.

Use existing `safe_read_leaf`/`write_artifact_leaf` APIs and extend
`pr-review-workspace.json` provenance. Reject incomplete/mismatched metadata,
tampering and linked-output escape. Reviewers consume frozen local bytes;
replaced captures invalidate affected reuse and live content cannot replace
their snapshot mid-review. File-based captures retain compatibility. Passing a
mutable Page URL alone would not anchor reproducible review evidence.

## Risks / Trade-offs

- **Uncertain remote outcomes** → Reconcile before another mutation; retain
  observed IDs and partial status. Native text creation has no demonstrated
  exactly-once guarantee.
- **Unsupported runtime capability** → Support actual current Codex Pages;
  preserve remote configuration and locator elsewhere and report unavailable.
  Claude Code/OpenCode activation is not claimed without real evidence.
- **Older readers ignore the canonical selector** → Declare the delivering
  release as the minimum remote-mode version; never promise forward support.
- **Instruction/test mismatch** → Test pure helpers and executable consumers;
  review instruction contracts against scenarios and prove the existing PR2
  effort's during-work native journey. Prose-search tests do not prove behavior.
- **Local output becomes a second context home** → Require declared tool storage,
  keep native formats and persist useful narrative only in the selected context.

## Migration Plan

No effort migration occurs. Bindings take precedence over defaults; reads do not
migrate preferences. Authorized setup performs the explicit selector write.
Ship the feature in `3.48.0` from the current `3.47.1` base, deriving the next
minor instead if merged metadata changes. Update existing operator references
within the accepted 80-added-nonblank-line budget; add no reader-facing document.
Regenerate canonical projections and verify packaged helper imports.

Run fixture-driven Node/Python/Go/hook checks, immutable capture tests and the
full repository suite. Main executes the installed TEA test-review/trace,
OpenSpec implementation verify and completion-evidence methods. Native acceptance
reuses the PR2 effort established in Spec and reads back unchanged IDs/parents,
guarded edits, handoff, read-only status and selected capture. An unavailable-host
case uses a hermetic capability inventory, not a fabricated successful adapter.
Living-spec synchronization and publication remain Main's existing lifecycle
work outside canonical implementation checkboxes. Rollback must preserve remote
IDs and Pages; older releases are not remote-mode readers and require an explicit
compatible file preference before use.
