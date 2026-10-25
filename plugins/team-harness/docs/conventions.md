# Architectural Conventions — Extended Reference

> Contributor reference for workspace and configuration conventions. Repository
> instructions live in [`AGENTS.md`](../AGENTS.md#working-here); this file holds
> details that do not have a dedicated guide.

---

## Workspaces as the shared board

A workspace is the shared context home for an effort, including substantive direct
work. Use the [workspace skill](../skills/workspace/SKILL.md) across flows; pipeline
identity and state apply only to pipeline work. Agents share useful artifacts and
the operator uses the workspace as a review surface. Local
`workspaces/` is always git-ignored; Obsidian and remote modes create no local
context duplicate. Remote narrative examples below are logical sections in the
bound effort Page, persisted by Main; file-only outputs use separate local storage.

Create only the context the selected flow needs. File workspaces may group
sketches, research and reviews under their method's existing paths; remote
workspaces retain the same logical content in the bound Page. OpenSpec owns
canonical intent and implementation tasks. Its files remain in the repository
and are linked from the workspace rather than copied into task packets.

## Document classification

Workspace context notes use Markdown (`.md`) in local and Obsidian mode, following
the shared workspace skill. Their audience may be **operator-facing** or **agentic**;
this changes detail and language, not the common note format. No universal template
or extra frontmatter is required solely by the workspace mode. Preserve metadata
and anchors consumed by the active flow. Machine-consumed state, events, helper
artifacts and deliverables retain their required formats; notes link to them.

| Doc | Tier | Format contract | Writer |
|-----|------|-----------------|--------|
| `01-plan.md` or its logical Page section | operator-facing | Objective, phase progress, source references and next action | Main; bounded specialist input |
| OpenSpec proposal, design, requirements and tasks | product intent | Upstream schema in the owning repository; no workspace copy | Main or explicitly assigned author |
| `sketches/*` | operator-facing | Required DB model/frontend wireframe before implementation; other previews on demand via `sketch` | Main or explicitly assigned specialist |
| Root-cause or implementation evidence | agentic | Relevant method's current contract and observed results | Assigned investigator or implementer; Main consolidates |
| Review reports and native returns | agentic | Immutable target, findings, coverage and limits from the selected method | Selected reviewers; Main owns dispositions |
| Test reports and machine evidence | agentic or machine | Actual command, candidate, results and omissions; tool-owned formats | Main or assigned tester |
| Pipeline state and events | machine | Current pipeline-owned formats; absent from direct/spec work | Current coordinator |
| `research/00-research.md`, `research/00-audit.md`, `01-planning.md` | agentic | Relevant research method's report contract | Main or assigned specialist |
| Vault pages produced by `documenter`, `00-teaching-pack-*.md` | operator-deliverable | Own contracts (docs flow / mentor); outside the two-tier mandate | documenter / mentor |

Context notes have no universal `## Review Summary` / `## Technical Detail` split.
Keep sections useful to the task and any structure required by an existing consumer;
agentic notes may use compact tables or structured blocks within Markdown. STOP
blocks, machine records and status-block return protocols keep their own formats.

[Historical sharded plans](plan-shards.md) remain readable compatibility records.
Their task shards, preflight packets and gate nonces do not govern new work.

All tiers also follow the enforceable workspace write and read budgets in
`docs/output-contract-patterns.md § 6` and § 7. “Operator-facing” permits clear prose; it does
not permit an unbounded transcript. “Agentic” means a compact current snapshot with canonical
pointers, not a second copy of source evidence.

### Two-tier language rule

The same operator-facing/agentic split governs body-prose language, not just format:

- **Operator-facing tier** — body prose follows the operator's resolved language
  from the live request, bound context and selected runtime settings. Resolve
  those settings through the current native adapter. Structural elements
  (section headers, field names, table keys, AC identifiers, status-block keys)
  stay English regardless.
- **Agentic tier** — body prose in every other workspace doc, including `reviews/01-plan-review.md` and every `reviews/04-*.md` report body, is English. Every versioned/committed artefact is English with no exception.

This rule is mirrored in `docs/voice-guide.md § Operator-Supplied Content Boundary` and operationalized per-artifact: each specialist agent declares its own artifact's language in its own `## Return Protocol § Language` clause (`agents/architect.md`, `agents/qa.md`, `agents/tester.md`, `agents/delivery.md`, and ten others — 14 in total), rather than as a single centralized dispatch instruction. `agents/_shared/dispatch-contract.md` deliberately does not mention language on any line — the standard's own convention is that this rule lives in each agent's own output contract, never in the dispatcher's prompt. The only surface outside this rule that still renders in the operator's resolved language is `agents/orchestrator.md` live chat, documented as an exception in `docs/voice-guide.md § Documented exceptions`, never as a hardcoded language.

## Workspace selection

`workspace-mode` selects `local`, `obsidian` or `gpt-space`; valid legacy
`logs-mode` is read only when the canonical key is absent. Existing bindings win.
Dispatch separates context locator, checkout and optional operational directory.
Recovery reuses the exact identity without copying or reconciling roots.

- **local**, single repo — `{repo-root}/workspaces/{YYYY-MM-DD}_{feature}`.
- **obsidian**, single repo — `{logs-path}/{logs-subfolder}/{repo-name}/{YYYY-MM-DD}_{feature}`.
- **local**, initiative — `{common-repository-parent}/{YYYY-MM-DD}_{initiative}`.
- **obsidian**, initiative — `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}`.
- **gpt-space** — one verified source-bound effort Page beneath the selected
  Space's `workspace` container. Main maintains context during work and at handoff;
  no sibling-repository path is required and no local Markdown mirror is created.

Initiatives have one coordinator root and one `00-state.md`; service artifacts
live below it. Writable product files and editable service-owned OpenSpec remain
inside their repositories. Evidence-only repositories never become writable or
spec owners by path inference.

There is no separate `obsidian-direct` mode and no one-way export for new
runs. Legacy state that already records `obsidian_sync: armed|pending|exported`
remains recoverable without migration.

Setup explicitly changes defaults; an existing effort is not migrated by that change.

## Installer file overwrite behavior

Agents, skills, and hooks in `~/.claude/` are canonical bytes from this repo. Direct edits to those files are not a supported customization path — they are replaced on every install. The installer:

- Skips files whose hash matches the embedded source (unchanged files are not re-written).
- Backs up `~/.claude.json` before every merge.
- Presents a Keep/Change preservation menu for operator-specific identity (`mcpServers.memory` URL/bearer, context7 API key) — these are never silently clobbered.

## Native runtime settings

Use the active runtime's `.team-harness.json`: Claude's `~/.claude`, Codex's
`${CODEX_HOME:-$HOME/.codex}`, or OpenCode's selected native config root. Preserve
`logs-path`/`logs-subfolder` for Obsidian. Remote setup persists only non-secret
`workspace-space-id` and `workspace-container-page-id` after native verification.

Rules for contributors:
- Skills MUST NOT create competing settings files — use the active native document.
- Every write is a merge: read the full document, replace only the owned key, write the whole document back. Never write a partial payload.
- Exception: `~/.claude/settings.json` is Claude Code's own file and is managed separately by the harness.

## Obsidian-mode diagram embedding

In `workspace-mode: obsidian` (or its legacy alias), diagram generation works as follows:

- **D2** — renders via the `d2` CLI to SVG; the SVG file is written into the canonical workspace folder and an `![[…]]` embed appended to `05-diagram.md`.
- **LikeC4** — renders via `npx likec4 export png` to PNG; same embed pattern.
- When the CLI is absent, the diagram source is written and a `render: skipped` marker appended — the file is not left empty.
- Local mode and the Excalidraw path are unchanged by this convention.
