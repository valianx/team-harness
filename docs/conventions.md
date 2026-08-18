# Architectural Conventions — Extended Reference

> Extracted from CLAUDE.md §5 to keep the main file under its size cap. The one-liner rules and pointers stay in CLAUDE.md §5. This file holds the extended detail for conventions that do not have a dedicated `docs/` file of their own.

---

## Workspaces as the shared board

A workspace is the shared working directory for a single pipeline session. Each pipeline run creates its own isolated workspace at `workspaces/{feature-name}/`. Agents communicate through files — each reads prior agents' output and writes its own. The operator uses the workspace as a review surface. Values are never passed through return values. `workspaces/` is always git-ignored and never committed.

Beyond the root-tier docs (`00-state.md`, `01-plan.md`, `02-implementation.md`, `03-testing.md`, etc.), a workspace groups related artifacts under subfolders created implicitly on first `Write`: `plan/` for architecture, delivery, conditional invariants, and per-task shards; `sketches/` for plan-stage sketches; `research/` for research-family artifacts; and `reviews/` for review-family reports. Basenames never change merely because of grouping except where `docs/plan-shards.md` defines the plan layout.

## Document classification

Every workspace doc is either **operator-facing** or **agentic**. The operator's own directive: the plan and the sketches are made for the operator; everything else can use an agentic, low-cost, or non-human-readable format.

| Doc | Tier | Format contract | Writer |
|-----|------|-----------------|--------|
| `01-plan.md` | operator-facing | `sharded-v1` operator summary and manifest; no copied architecture or AC prose | architect (content); see `docs/plan-shards.md` |
| `plan/architecture.md`, `plan/delivery.md`, `plan/invariants.md`, `plan/tasks/*.md` | agentic | Canonical plan shards; one fact in one owning artifact | architect; bounded post-gate writers per consolidation contract |
| `sketches/*` | operator-facing | `docs/plan-sketches.md` manifest (unchanged) | architect |
| `01-root-cause.md` | operator-facing | Strict root-cause template (unchanged); the bug-fix equivalent of the plan, read at STAGE-GATE-1 | architect |
| `overview.md` (initiative) | operator-facing | `agents/ref-dispatch-machinery.md § "overview.md — you are the sole writer"` (unchanged) | orchestrator (sole writer; derives completion-row coordinates after its own Phase-4 mechanics) |
| `reviews/01-plan-review.md` | agentic | Fixed skeleton of anchored sections; no `## Review Summary`/`## Technical Detail` split; minimal prose, tables and labels | panel (single-writer-per-section) |
| `reviews/04-*.md`, `reviews/01-ux-review.md` | agentic | Each agent's current fixed structure; no two-tier obligation | qa / security / adversary / reviewer / ux-reviewer |
| `02-implementation.md`, `03-testing.md`, `02-regression-test.md`, `02-documentation.md`, `02-gcp-infra.md` | agentic | Each agent's current fixed structure; no two-tier obligation | implementer / tester / documenter / gcp-infra |
| `00-state.md`, `00-execution-events.*`, `00-pipeline-summary.md`, `00-knowledge-context.md`, `failure-brief.md`, verify packets | agentic | Already agentic (unchanged) | orchestrator / verifiers |
| `research/00-research.md`, `research/00-audit.md`, `01-planning.md`, `00-acceptance-criteria.md` | agentic | Each agent's current fixed structure; no two-tier obligation | architect / qa-plan |
| Vault pages produced by `documenter`, `00-teaching-pack-*.md` | operator-deliverable | Own contracts (docs flow / mentor); outside the two-tier mandate | documenter / mentor |

Consequence: the old universal mandate ("every workspace doc gets `## Review Summary` then `## Technical Detail`") is rescoped. Operator-facing docs keep their intrinsic templates (which already carry a `## Review Summary`-equivalent where it matters). Agentic docs use whatever compact, structured format their own agent already defines — no two-tier obligation. STOP blocks and the status-block return protocol are unaffected — they are already agentic/operator-facing by design.

All tiers also follow the enforceable workspace write and read budgets in
`docs/output-contract-patterns.md § 6` and § 7. “Operator-facing” permits clear prose; it does
not permit an unbounded transcript. “Agentic” means a compact current snapshot with canonical
pointers, not a second copy of source evidence.

### Two-tier language rule

The same operator-facing/agentic split governs body-prose language, not just format:

- **Operator-facing tier** — body prose in `01-plan.md`, `sketches/*`, and `01-root-cause.md` follows the operator's resolved language (session override in `00-state.md` → `language` key in `~/.claude/.team-harness.json` → detection from the operator's first message → `en`). Structural elements (section headers, field names, table keys, AC identifiers, status-block keys) stay English regardless.
- **Agentic tier** — body prose in every other workspace doc, including `reviews/01-plan-review.md` and every `reviews/04-*.md` report body, is English. Every versioned/committed artefact is English with no exception.

This rule is mirrored in `docs/voice-guide.md § Operator-Supplied Content Boundary` and operationalized per-artifact: each specialist agent declares its own artifact's language in its own `## Return Protocol § Language` clause (`agents/architect.md`, `agents/qa.md`, `agents/tester.md`, `agents/delivery.md`, and ten others — 14 in total), rather than as a single centralized dispatch instruction. `agents/_shared/dispatch-contract.md` deliberately does not mention language on any line — the standard's own convention is that this rule lives in each agent's own output contract, never in the dispatcher's prompt. The only surface outside this rule that still renders in the operator's resolved language is `agents/orchestrator.md` live chat, documented as an exception in `docs/voice-guide.md § Documented exceptions`, never as a hardcoded language.

## Repository-local workspaces with one-way Obsidian export

The canonical workspace is always `./workspaces/{feature-name}/` in the repo
working tree, on every runtime and regardless of `logs-mode` in
`~/.claude/.team-harness.json`. The coordinator resolves `docs_root` once and
forwards it to every subagent it dispatches; recovery reads only this
repository workspace.

- **local** (default) — no export.
- **obsidian** — arms a one-way export: at draft-PR creation and at terminal
  close or pause, the workspace is copied atomically to
  `{logs-path}/{logs-subfolder}/{repo-name}/{date}_{feature}/`. The vault copy
  is a non-authoritative view — never read for recovery, never synced back. A
  failed export records `obsidian_sync: pending` without blocking the run.
  Export-armed runs add YAML frontmatter (repo, feature, pipeline, date,
  agent) to every workspace Markdown doc before export.
- **obsidian-direct** (advanced opt-in) — a live-in-vault workspace selected
  only by an explicit live operator request and gated behind the deterministic
  write probe; probe failure falls back to the repository workspace with the
  recorded reason.

The operator switches modes via `/th:setup` or a session override in `00-state.md`.

## Installer file overwrite behavior

Agents, skills, and hooks in `~/.claude/` are canonical bytes from this repo. Direct edits to those files are not a supported customization path — they are replaced on every install. The installer:

- Skips files whose hash matches the embedded source (unchanged files are not re-written).
- Backs up `~/.claude.json` before every merge.
- Presents a Keep/Change preservation menu for operator-specific identity (`mcpServers.memory` URL/bearer, context7 API key) — these are never silently clobbered.

## Single config file — `~/.claude/.team-harness.json`

All Team Harness settings live in one file: `logs-mode`, `logs-path`, `logs-subfolder`, installer manifest, version metadata, and skill-specific keys (e.g., ClickUp under `clickup`).

Rules for contributors:
- Skills MUST NOT create their own config files in `~/.claude/` — use namespaced keys inside `.team-harness.json`.
- Every write is a merge: read the full document, replace only the owned key, write the whole document back. Never write a partial payload.
- Exception: `~/.claude/settings.json` is Claude Code's own file and is managed separately by the harness.

## Obsidian-mode diagram embedding

In `logs-mode: obsidian`, diagram generation works as follows:

- **D2** — renders via the `d2` CLI to SVG; the SVG file is written into the workspace folder (reaching the vault via the one-way export) and an `![[…]]` embed appended to `05-diagram.md`.
- **LikeC4** — renders via `npx likec4 export png` to PNG; same embed pattern.
- When the CLI is absent, the diagram source is written and a `render: skipped` marker appended — the file is not left empty.
- Local mode and the Excalidraw path are unchanged by this convention.
