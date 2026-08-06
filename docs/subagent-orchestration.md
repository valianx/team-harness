# Subagent Orchestration — Full Reference

> Extracted from CLAUDE.md §14 to keep the main file under 40 KB. The routing table and escalation rules remain inline in CLAUDE.md.

## CC Top-Level Orchestration — the only path

`th:orchestrator` IS the top-level Claude Code session agent — not a subagent spawned by anything.
There is no second coordinator to hand off to and no `dispatch_handoff` round-trip on this path:
the top-level agent has `Task` from the start of the session and dispatches leaf agents
(`architect`, `implementer`, `tester`, `cleaner`, `qa`, `security`, `adversary`, `plan-reviewer`, `delivery`,
`ux-reviewer`, `diagrammer`, `gcp-cost-analyzer`, `gcp-infra`) directly. Full contract:
`docs/dev-mode.md`. The optional `developer-mode` output style (`/config` → Output style →
`developer-mode`) provides a strong base-replacement floor (`keep-coding-instructions: false`).

## Nested-context dispatch — RETIRED protocol, retained provisioning

**The nested-handoff/takeover protocol below (dispatch_handoff schema, auto-takeover on
`blocked-no-dispatch`, the Takeover Protocol) is RETIRED.** It existed to backstop one specific
spawn: a top-level `leader` dispatching a second coordinator, `th:orchestrator`, as a nested
subagent, and handling the case where that nested subagent lost its `Task` tool. The coordinator
fusion removes that spawn entirely — `agents/ref-pipeline.md`'s Dispatch invariant #2 forbids
dispatching any coordinator, including another copy of itself, with no exception clause — so the
scenario this protocol existed to detect and recover from no longer has a producer. Nothing
replaces it; the retirement is a genuine loss of subject, not a transfer.

**What is retained, and why it is harmless.** Claude Code's subagent-nesting depth setting
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` in `~/.claude/settings.json`, provisioned to `"2"` by
`/th:setup`/`/th:update` — `docs/setup-update-model.md § "Architecture prerequisite: subagent
nesting depth"`) stays provisioned. It is depth headroom, not a mechanism bound to the retired
spawn: it costs nothing when unused, and it still matters for the orthogonal case of a specialist
leaf agent itself being invoked from a context one level deep (a skill wrapper, an `@`-mention
inside an ongoing session) — that specialist still needs to reach the tools its own contract
grants. Historical note: from Claude Code v2.1.172 through v2.1.216, nesting worked by default up
to five layers deep with no configuration option — the M1 probe (2026-06-14) observed that window
and does not describe the current default.

**If a coordinator-dispatch case is ever observed again** (Claude Code's native agent-selector
bypassing this file's own routing, or a future runtime change), that is a defect in the contract's
own terms — `status: blocked`, per Dispatch invariant #2 — not a signal to resurrect the retired
handoff apparatus. The full retired schema and protocol are preserved in git history at this
file's pre-fusion revision for anyone reconstructing the mechanism's prior shape.

## Session-Scoped Config Override Protocol

`th:orchestrator` supports per-session overrides of a closed whitelist of config keys. The operator states the override in chat; the coordinator applies it for that pipeline run only.

### Step order (load-bearing)

Runs inside boot Step 2, before `base_path` resolution:

1. Parse override intent from the operator's chat message.
2. Read the persistent config `~/.claude/.team-harness.json`.
3. Apply precedence: `override > persistent > default` for each overridable key.
4. Resolve `base_path`, `logs_mode`, `events_file`, and `docs_root` from the merged result.

This order ensures `docs_root = {base_path}/{YYYY-MM-DD}_{feature-name}` is computed from the already-overridden `base_path` — not from the raw persistent value.

### Whitelist (authority: CLAUDE.md §5)

Overridable keys: `logs-mode`, `logs-path`, `logs-subfolder`, `clickup.workspace_id`.

Excluded from override (→ `/th:setup` only): MCP URL, API keys (context7 / bearer), agent `model`, agent `effort`. Attempts to override excluded keys are ignored with a one-line WARN; the pipeline continues with the persistent value.

### Persistence

The resolved config is stored in `00-state.md` § Current State. No new file is created. The override flow is read-only on `~/.claude/.team-harness.json` — it is never written by the override path.

### Output Discipline

Follows `agents/_shared/output-template.md`: silent on success (events file only), one-line WARN + fallback on invalid override, non-blocking. No operator-facing chatter on a clean override.

### `/recover` behavior

On recovery, the resolved config is re-read from `00-state.md` § Current State — the chat is not re-parsed. The coordinator logs `operation.success` with detail `override re-applied from 00-state.md`. If the operator re-states an override during recovery, it is treated as a new session override for the resumed run.

### Collision guarantee

`base_path` is resolved (with override applied) before `docs_root` is composed. The `{YYYY-MM-DD}_{feature-name}` prefix ensures each run gets a unique workspace directory. Two runs with different overrides do not share or overwrite each other's workspace.

## Routing Table and Escalation Rules

| Intent | Subagent | Output |
|---|---|---|
| Add/modify an agent, add/modify a skill, refactor the pipeline | `architect` + `agent-builder` | Design doc + updated `.md` files |
| Installer changes, hooks refactor, cross-platform fixes | `architect` → `implementer` | Architecture note + code changes |
| Tests (if/when introduced) | `tester` | Test plan + tests with factory mocks |
| Acceptance criteria + validation against AC | `qa` | AC list / validation report |
| Required product/API docs | `implementer` or `documenter`, before Freeze | Reviewed tracked docs |
| Publication prose | `delivery` | Acceptance matrix + PR-body draft |
| Version/changelog + final candidate commit | coordinator mechanics in implementation | Complete branch before Freeze |
| Validated identity check + push + PR | coordinator mechanics in delivery | Exact validated commit published |
| PR review | `reviewer` | Inline review, approve/request-changes |
| Security review of hooks, installer, or MCP (elevated privileges on user's machine) | `security` | OWASP/CWE-aligned report |
| Visualize agent flow | `diagrammer` / `likec4-diagrammer` / `d2-diagrammer` | Diagram file + preview |
| Documentation (`type: docs`) | orchestrator → `architect` (research mode) → `documenter` → `diagrammer` (conditional) → `qa` | `research/00-research.md` + Obsidian vault pages + `02-documentation.md` manifest + `reviews/04-validation.md` |
| Frontend-scope tasks (`frontend_scope: true`) | Standard pipeline + `ux-reviewer` (enrich after architect in Stage 1, validate in parallel in Stage 3) | `reviews/01-ux-review.md` + `reviews/04-ux-validation.md` |
| Bug fix (`type: fix`) | orchestrator → `architect` (root-cause mode) → `tester` (pre-implementation regression test) → `implementer` (scope-discipline) → eligible `cleaner` → Freeze → `tester` + `qa` + mandatory security validation → `delivery` | `01-root-cause.md` + `02-regression-test.md` + full feature backbone + mandatory post-Freeze security review + `### Fixed` CHANGELOG + `fix(area):` PR title |
| Hotfix (`type: hotfix`) | same as bug fix, Phase 1 skipped (no `01-root-cause.md`); orchestrator emits 1-sentence prose plan at STAGE-GATE-1 | full feature backbone minus `01-root-cause.md`; PR title appends `(hotfix)` suffix |

**Escalation rules.**
- Touching `bin/install.sh`, `bin/install.ps1`, or any file under `cmd/install/` → route to `architect` first (installer contract with `~/.claude/` and `~/.claude.json` is load-bearing).
- Adding/removing an agent → route to `architect` + `agent-builder`; also update `README.md` agent roster and the system diagram.
- Hook changes or MCP server changes → flag for `security` review (both execute with the user's privileges).
- Changing the coordinator's pipeline → architecture review mandatory; update `agents/ref-pipeline.md` + affected shared/direct references atomically. Activation-boundary changes also update `agents/orchestrator.md`.

## `blocked-manual-push` Handling

When the coordinator's deterministic mechanics return `status: blocked-manual-push`, `th:orchestrator` emits a STOP block with the compare URL and `workspaces/{feature}/inputs/pr-body-draft.md` path. The operator opens the PR manually, then replies `pr opened #N`. `th:orchestrator` records the PR number in `00-state.md` and continues to Phase 5 — a manual-action pause, not a delivery-agent failure. See `agents/_shared/gh-fallback.md` § "`status: blocked-manual-push`" for the full protocol.
