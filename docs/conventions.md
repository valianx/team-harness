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

Beyond the root-tier docs (`00-state.md`, `01-plan.md`, `02-implementation.md`, `03-testing.md`, etc.), a workspace groups related artifacts under subfolders created implicitly on first `Write`: `plan/` for architecture, delivery, conditional invariants, and per-task shards; `sketches/` for plan-stage sketches; `research/` for research-family artifacts; and `reviews/` for review-family reports. Basenames never change merely because of grouping except where `docs/plan-shards.md` defines the plan layout.

## Document classification

Workspace context notes use Markdown (`.md`) in local and Obsidian mode, following
the shared workspace skill. Their audience may be **operator-facing** or **agentic**;
this changes detail and language, not the common note format. No universal template
or extra frontmatter is required solely by the workspace mode. Preserve metadata
and anchors consumed by the active flow. Machine-consumed state, events, helper
artifacts and deliverables retain their required formats; notes link to them.

| Doc | Tier | Format contract | Writer |
|-----|------|-----------------|--------|
| `01-plan.md` | operator-facing | `sharded-v1` operator summary and manifest; no copied architecture or AC prose | architect (content); see `docs/plan-shards.md` |
| `plan/architecture.md`, `plan/delivery.md`, `plan/invariants.md`, `plan/tasks/*.md` | agentic | Canonical plan shards; one fact in one owning artifact | architect; bounded post-gate writers per consolidation contract |
| `sketches/*` | operator-facing | Required DB model/frontend wireframe before implementation; other previews on demand via `sketch` | Main or explicitly assigned specialist |
| `01-root-cause.md` | operator-facing | Strict root-cause template (unchanged); the bug-fix equivalent of the plan, read at STAGE-GATE-1 | architect |
| `overview.md` (initiative) | operator-facing | `agents/ref-dispatch-machinery.md § "overview.md — you are the sole writer"` (unchanged) | orchestrator (sole writer; derives completion-row coordinates after its own Phase-4 mechanics) |
| `reviews/01-plan-review.md` | agentic | Fixed skeleton of anchored sections; no `## Review Summary`/`## Technical Detail` split; minimal prose, tables and labels | panel (single-writer-per-section) |
| `reviews/04-*.md`, `reviews/01-ux-review.md` | agentic | Each agent's current fixed structure; no two-tier obligation | qa / security / adversary / reviewer / ux-reviewer |
| `02-implementation.md`, `03-testing.md`, `02-regression-test.md`, `02-documentation.md`, `02-gcp-infra.md` | agentic | Each agent's current fixed structure; no two-tier obligation | implementer / tester / documenter / gcp-infra |
| `00-state.md`, `00-execution-events.*`, `00-pipeline-summary.md`, `00-knowledge-context.md`, `failure-brief.md`, verify packets | agentic | Already agentic (unchanged) | orchestrator / verifiers |
| `research/00-research.md`, `research/00-audit.md`, `01-planning.md` | agentic | Each agent's current fixed structure; no two-tier obligation | architect |
| Vault pages produced by `documenter`, `00-teaching-pack-*.md` | operator-deliverable | Own contracts (docs flow / mentor); outside the two-tier mandate | documenter / mentor |

Context notes have no universal `## Review Summary` / `## Technical Detail` split.
Keep sections useful to the task and any structure required by an existing consumer;
agentic notes may use compact tables or structured blocks within Markdown. STOP
blocks, machine records and status-block return protocols keep their own formats.

All tiers also follow the enforceable workspace write and read budgets in
`docs/output-contract-patterns.md § 6` and § 7. “Operator-facing” permits clear prose; it does
not permit an unbounded transcript. “Agentic” means a compact current snapshot with canonical
pointers, not a second copy of source evidence.

### Two-tier language rule

The same operator-facing/agentic split governs body-prose language, not just format:

- **Operator-facing tier** — body prose in `01-plan.md`, `sketches/*`, and `01-root-cause.md` follows the operator's resolved language (session override in `00-state.md` → `language` key in `~/.claude/.team-harness.json` → detection from the operator's first message → `en`). Structural elements (section headers, field names, table keys, AC identifiers, status-block keys) stay English regardless.
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
