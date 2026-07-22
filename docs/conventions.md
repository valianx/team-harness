# Architectural Conventions — Extended Reference

> Extracted from CLAUDE.md §5 to keep the main file under its size cap. The one-liner rules and pointers stay in CLAUDE.md §5. This file holds the extended detail for conventions that do not have a dedicated `docs/` file of their own.

---

## Workspaces as the shared board

A workspace is the shared working directory for a single pipeline session. Each pipeline run creates its own isolated workspace at `workspaces/{feature-name}/`. Agents communicate through files — each reads prior agents' output and writes its own. The operator uses the workspace as a review surface. Values are never passed through return values. `workspaces/` is always git-ignored and never committed.

Beyond the root-tier docs (`00-state.md`, `01-plan.md`, `02-implementation.md`, `03-testing.md`, etc.), a workspace groups related artifacts under subfolders created implicitly on first `Write` (no orchestrator `mkdir` step): `sketches/` for plan-stage sketches, `research/` for research-family artifacts (`00-research.md`, `00-audit.md`, `research-findings-*.md`, `code-findings-*.md`), and `reviews/` for review-family reports (`04-validation.md`, `04-security.md`, `01-ux-review.md`, `04-ux-validation.md`, `04-adversary.md`, `04-review.md`, `04-internal-review.md`). Basenames never change across this grouping — only the directory prefix distinguishes tiers.

## Document classification

Every workspace doc is either **operator-facing** or **agentic**. The operator's own directive: the plan and the sketches are made for the operator; everything else can use an agentic, low-cost, or non-human-readable format.

| Doc | Tier | Format contract | Writer |
|-----|------|-----------------|--------|
| `01-plan.md` | operator-facing | Intrinsic plan schema (`## Review Summary` first, `## Architecture`, `## Task List`); consolidated, ordered, final state before implementation (`## Review Summary` is the plan's own operator summary — not reviewer output) | architect (content); see write-scope table in `agents/_shared/plan-consolidation.md` |
| `sketches/*` | operator-facing | `docs/plan-sketches.md` manifest (unchanged) | architect |
| `01-root-cause.md` | operator-facing | Strict root-cause template (unchanged); the bug-fix equivalent of the plan, read at STAGE-GATE-1 | architect |
| `overview.md` (initiative) | operator-facing | `leader.md § overview.md Template` (unchanged) | leader (sole writer; `delivery` only RETURNS per-project completion-row data, the leader reconciles and writes it) |
| `reviews/01-plan-review.md` | agentic | Fixed skeleton of anchored sections; no `## Review Summary`/`## Technical Detail` split; minimal prose, tables and labels | panel (single-writer-per-section) |
| `reviews/04-*.md`, `reviews/01-ux-review.md` | agentic | Each agent's current fixed structure; no two-tier obligation | qa / security / adversary / reviewer / ux-reviewer |
| `02-implementation.md`, `03-testing.md`, `02-regression-test.md`, `02-documentation.md`, `02-gcp-infra.md` | agentic | Each agent's current fixed structure; no two-tier obligation | implementer / tester / documenter / gcp-infra |
| `00-state.md`, `00-execution-events.*`, `00-pipeline-summary.md`, `00-knowledge-context.md`, `failure-brief.md`, verify packets | agentic | Already agentic (unchanged) | orchestrator / verifiers |
| `research/00-research.md`, `research/00-audit.md`, `01-planning.md`, `00-acceptance-criteria.md` | agentic | Each agent's current fixed structure; no two-tier obligation | architect / qa-plan |
| Vault pages produced by `documenter`, `00-teaching-pack-*.md` | operator-deliverable | Own contracts (docs flow / mentor); outside the two-tier mandate | documenter / mentor |

Consequence: the old universal mandate ("every workspace doc gets `## Review Summary` then `## Technical Detail`") is rescoped. Operator-facing docs keep their intrinsic templates (which already carry a `## Review Summary`-equivalent where it matters). Agentic docs use whatever compact, structured format their own agent already defines — no two-tier obligation. STOP blocks and the status-block return protocol are unaffected — they are already agentic/operator-facing by design.

### Two-tier language rule

The same operator-facing/agentic split governs body-prose language, not just format:

- **Operator-facing tier** — body prose in `01-plan.md`, `sketches/*`, and `01-root-cause.md` follows the operator's resolved language (session override in `00-state.md` → `language` key in `~/.claude/.team-harness.json` → detection from the operator's first message → `en`). Structural elements (section headers, field names, table keys, AC identifiers, status-block keys) stay English regardless.
- **Agentic tier** — body prose in every other workspace doc, including `reviews/01-plan-review.md` and every `reviews/04-*.md` report body, is English. Every versioned/committed artefact is English with no exception.

This rule is mirrored in `docs/voice-guide.md § Operator-Supplied Content Boundary` and operationalized as a dispatch instruction in `agents/orchestrator.md § Communication Protocol → Language propagation`. The only surfaces outside this rule that still render in the operator's resolved language are `agents/leader.md` live chat and its Step 6 intent-detection routing table — both documented as exceptions in `docs/voice-guide.md § Documented exceptions`, never as a hardcoded language.

## Dual-mode workspaces

Two output modes are available, controlled by `logs-mode` in `~/.claude/.team-harness.json`:

- **local** (default) — writes to `./workspaces/{feature-name}/` in the repo working tree.
- **obsidian** — writes to the configured Obsidian vault at `{logs-path}/{logs-subfolder}/{repo-name}/{date}_{feature}/`. The leader resolves configuration and the base path once, then passes `docs_root` to each orchestrator, which forwards it to every subagent it dispatches. Obsidian mode adds YAML frontmatter (repo, feature, pipeline, date, agent) to every workspace Markdown doc.

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

- **D2** — renders via the `d2` CLI to SVG; the SVG file is written into the vault workspace folder and an `![[…]]` embed appended to `05-diagram.md`.
- **LikeC4** — renders via `npx likec4 export png` to PNG; same embed pattern.
- When the CLI is absent, the diagram source is written and a `render: skipped` marker appended — the file is not left empty.
- Local mode and the Excalidraw path are unchanged by this convention.
