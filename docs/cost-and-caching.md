# Cost and Caching — Operator Reference

> Claude Code applies prompt caching automatically. The harness never calls the Anthropic Messages API and never sets `cache_control` — it ships agent prompts, skills, and hooks that run inside Claude Code, which owns all caching decisions. This page explains the caching behavior that affects operator cost, the subagent isolation model used by the pipeline, and the operator-machine environment variables that control caching per session. Every fact here was verified against the Claude Code prompt-caching documentation and the Anthropic API reference; volatile values (pricing multipliers, minimum prefixes) carry a "verify before cost planning" pointer because Anthropic can change them.

## How Claude Code caches

Caching is automatic, on by default, and requires no harness-side configuration. The cache key is built from the exact bytes of the rendered prompt up to each implicit `cache_control` breakpoint; a single byte change anywhere in the prefix produces a cold miss for everything after it. Claude Code builds the prefix in this order: tools (including tool definitions from MCP servers) then system prompt then project context then conversation.

**Invalidation events.** The following actions bust the relevant cache layer:

- `/model` or `/effort` change: full cache miss (the key is per-model, per-effort).
- Working-directory change: full cache miss (the system prompt embeds the working directory, platform, and shell).
- Tool-set change (MCP server connect or disconnect, permission denial of a whole tool): system-prompt layer miss.
- `/clear` or `/compact`: project-context layer miss (CLAUDE.md and auto-memory reload).
- Claude Code upgrade: system-prompt layer miss.

**CLAUDE.md mid-session:** editing CLAUDE.md during a session has no effect — Claude Code loaded the version at session start into the cached project-context layer. The edit neither applies nor invalidates the cache. New content loads on `/clear`, `/compact`, or restart.

**Batching agent edits per release (superseded — history kept for context, not the current model).** each distributed agent file (`agents/*.md`) that changes cold-invalidates that agent's cached prefix for every operator whose Claude Code session loaded it. team-harness previously deferred its own plugin-version bump to a separate release cut (`/th:release`), so feature PRs accumulated changes in `changelog.d/` without bumping the version and operators only paid one batch cache-cold-start per release instead of one per PR. That deferred model is **retired**: team-harness now bumps its own project version once per PR through the coordinator's deterministic publication mechanics (see `CLAUDE.md §6.3` and `agents/_shared/delivery-mechanics.md § 1`). The batching saving was real but modest, and the operator's workflow-cost judgment — the release-cut ceremony (a dedicated tool, a marker/trailer discriminator, a second review pass) cost more in process overhead than the batched cache-cold-start saved in per-session warm-up — is why it was superseded rather than kept as an opt-in.

**team-harness's own version sites (bumped per PR by coordinator mechanics).** Three sites are mandatory and bumped together in the same PR: `.claude-plugin/plugin.json` `"version"` field, `.claude-plugin/marketplace.json` `plugins[0].version` (NOT the schema/top-level `"version"` field, a different field that must never be touched), and `CLAUDE.md §3` `**Current version:**` line. `cmd/install/main.go`'s `var version` literal is a separate `legacy-installer` anchor — updated only on Go-installer releases, not on plugin-asset-only changes. `CHANGELOG.md` receives the `## [X.Y.Z] - YYYY-MM-DD` heading directly in that same PR (`agents/_shared/delivery-mechanics.md § 3`). `changelog.d/` is batch/fallback-only here: use it only when a session intentionally groups changes before one cut, never as team-harness's normal per-PR publication path.

**Three cache layers:**

| Layer | Content | Stable or volatile |
|---|---|---|
| System prompt | Core instructions, tool definitions | Stable per session; busted by model/effort/tool-set change |
| Project context | CLAUDE.md (project + user), auto-memory | Stable per session; busted by `/clear`, `/compact`, restart |
| Conversation | Messages, responses, tool results, hook `additionalContext` | Volatile — changes every turn |

The `session-start.sh` hook injects config-driven text (orchestrator-disposition directive, language directive, workspace-mode directive) via `additionalContext`, which lands in the conversation layer and does not bust the stable layers above it.

## Subagents and cost

Each agent the pipeline dispatches via the Task tool starts its own isolated conversation — separate system prompt, separate tool set, separate cache. The parent session's cache is unaffected.

**Implications for a pipeline run:**

- **Cold start per agent.** On the first turn of each dispatched agent (architect, implementer, tester, qa, security, delivery), there are no cache hits. The agent warms its own cache across its own subsequent turns.
- **5-minute TTL for subagents.** Subagents use the 5-minute cache write TTL even when the operator is on a Claude subscription — the automatic 1-hour TTL applies only to the main conversation.
- **Model tiering means separate caches by design.** opus agents (architect, agent-builder, security, …), sonnet agents (implementer, tester, qa, delivery, …), and haiku agents (researcher, init) each have independent per-model caches. This is expected, not a defect; model tiering reduces absolute cost because cheaper models have lower base input prices.
- **Re-dispatch reuse window.** Re-dispatching the same agent type within 5 minutes reuses that agent's warm cache (the prefix bytes are identical). Iteration loops, patch-mode selective re-runs, and parallel same-agent lanes all benefit when they stay inside this window.
- **The operator's top-level session.** `th:orchestrator` runs at the top level. On a subscription its session gets the 1-hour TTL, so the system prompt and CLAUDE.md stay cached across the full pipeline run.

## Lane cost model — intra-task lane decomposition

There is exactly one coordinator per run, and it never spawns another coordinator — a multi-project initiative runs its projects **serially**, one Stage 1 → Stage 3 pass at a time inside the same agent (`agents/ref-dispatch-machinery.md § Multi-project sequencing`), so there is no N-orchestrator-instance fan-out cost to model any more. The lane concept that survives is narrower: **intra-task lane decomposition**, which parallelizes `implementer` dispatches **within** a single Stage 2 task, never across tasks or projects (`agents/ref-pipeline.md § "Intra-task lane decomposition"`). Each lane is a fully isolated `implementer` subagent conversation with its own system prompt, tool set, and cache; nothing in one lane's cache is visible to another.

### Explicit activation and startup context

The top-level `agents/orchestrator.md` kernel is 881 words. The 20.7K-word gated contract lives in `agents/ref-pipeline.md` and is absent from direct startup context. `/th:pipeline` loads its activation sections, then only the phase reached; `/th:recover` loads state and the current phase. A direct session therefore pays neither pipeline stage prose nor gate/delivery contracts. Once a phase is read, the host conversation retains it until compaction.

**5-minute TTL — a subagent lane, not the top-level session.** Every lane runs as a subagent, so its cache uses the 5-minute write TTL — not the 1-hour TTL the top-level session may hold (`§ Subagents and cost`). Lane dispatch happens entirely inside Stage 2, with no STAGE-GATE pause between fire and consolidation, so the wall-clock exposure that used to matter for a cross-coordinator gate pause does not apply here: lanes fire, run, and are consolidated in one continuous pass.

**N concurrent lanes → N `implementer`-tier cold starts.** `implementer` is `model: sonnet`, so N intra-task lanes are N sonnet cold starts, capped at `LANE_CAP = 5` concurrent lanes (`GLOBAL_ROUND_CONCURRENCY_CAP = 6` across inter-task and intra-task parallelism combined). The re-dispatch warm-reuse window (`§ Subagents and cost` — same agent type within 5 minutes reuses the warm prefix) does not rescue lanes fired in the same round: they start simultaneously, so none has written a cache the others can read yet. Lanes fired together therefore pay N independent cold-start cache-creations, not one cold + (N−1) warm.

**Lane fan-out fires on a declared, mechanical precondition — no operator confirmation gate.** Unlike the retired multi-coordinator fan-out, intra-task lanes fire automatically when a task declares `Lane-decomposable: yes`, its `Files:` count is ≥ 8, and it declares ≥ 2 file-disjoint seams outside `frozen-contracts:` (`agents/ref-pipeline.md § "Intra-task lane decomposition"`). There is no lane-count-plus-cost confirmation step, because the decomposition is scoped to one task's own Stage 2 work and never crosses a STAGE-GATE.

**Ask-class caveat (cost has no bearing on the gate stop).** The outward-action gate that each lane's coordinator publication push/merge passes through is `ask`-class, not `deny`-class — whether it actually stops depends on the session's permission posture, not on any cost setting. Full contract: `docs/dev-mode.md § Ask-class caveat` and `§ STAGE-GATE-3 presentation and the ask-class loosening (SEC-DR-G)`.

## Operator cost controls

These are environment variables set on the operator's machine before starting Claude Code. The harness documents them; it never sets them in any distributed file.

| Variable | Effect | Recommended for |
|---|---|---|
| `ENABLE_PROMPT_CACHING_1H` | Opt into the 1-hour cache write TTL | API-key, Bedrock, and Vertex operators (subscription operators get the 1-hour TTL automatically) |
| `DISABLE_PROMPT_CACHING` | Disable caching for all models | Debugging and cost-measurement baselines only |
| `DISABLE_PROMPT_CACHING_HAIKU` | Disable caching for Haiku models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_SONNET` | Disable caching for Sonnet models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_OPUS` | Disable caching for Opus models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_FABLE` | Disable caching for Fable models only | Per-model debugging |
| `FORCE_PROMPT_CACHING_5M` | Force the cheaper 5-minute write TTL regardless of auth method | Bursty or short-lived workloads where the 1-hour write cost exceeds the expected read savings |

**Observing cache performance.** Claude Code exposes per-session usage — including `cache_read_input_tokens` and `cache_creation_input_tokens` — through the statusline `current_usage` object documented under "Check cache performance" in the Claude Code prompt-caching docs. A statusline script can surface the cache-read ratio live. (The exact output of the `/cost` slash command is not documented; do not rely on it showing cache figures.) A `cache_read / total_input` ratio above roughly 60% indicates the stable prefix is being reused effectively.

## Pricing reference

Multipliers are relative to the base input token price for the same model. These values can change — verify current numbers at https://platform.claude.com/docs/en/about-claude/pricing before cost planning.

| Operation | Multiplier vs base input |
|---|---|
| 5-minute cache write | 1.25x |
| 1-hour cache write | 2.0x |
| Cache read (hit) | 0.10x |

**Break-even.** With the 5-minute TTL, two requests on the same prefix already pay off (1.25x write + 0.1x read = 1.35x, vs 2x uncached). The 1-hour TTL doubles the write cost, so it needs at least three reads to beat paying uncached — use it only when traffic has gaps the 5-minute window would drop.

**Minimum cacheable prefix.** Prompts below a model-dependent token threshold are not cached (no error — `cache_creation_input_tokens` is simply 0). Current minimums:

| Model | Minimum prefix |
|---|---|
| Opus 4.8 / 4.7 / 4.6 / 4.5, Haiku 4.5 | 4,096 tokens |
| Fable 5, Sonnet 4.6, Haiku 3.5 / 3 | 2,048 tokens |
| Sonnet 4.5 / 4.1 / 4 / 3.7 | 1,024 tokens |

The pipeline's larger agent prompts (orchestrator, architect, the verifier agents) are well above the 4,096-token Opus minimum, so they cache; a very small standalone prompt may fall below the threshold and silently not cache.

## Measured reductions — CLAUDE.md density pass

`CLAUDE.md` is re-injected into the project-context cache layer on every dispatch cold start (`§ Three cache layers` above) — the largest per-dispatch multiplier of any single file in the harness, since every other large prompt (`orchestrator.md`, `delivery.md`, `architect.md`) loads once or twice per run while `CLAUDE.md` loads once per dispatch.

| Metric | Before | After | Delta |
|---|---|---|---|
| `CLAUDE.md` size (`wc -c`) | 34,862 bytes (~8.5K tokens) | 34,413 bytes (~8.4K tokens) | −449 bytes (−1.3%) |
| Estimated per-run cost (measured against a ~39-dispatch full-lane run) | ~330K tokens | ~326.5K tokens | ~−3.5K tokens/run |

**Why the delta is small, and why that is the expected — not a diluted — result.** At the time of this measurement a fenced-surface guard snapshotted every control/gate/security-relevant block in the largest agent prompts and in `CLAUDE.md` by SHA-256, and density reduction was scoped to whatever survived outside it. **That guard has since been retired** with the rest of the prose-assertion corpus (README.md § "What gets a test"): a byte-exact snapshot of prose is the clearest case of a check that freezes wording instead of verifying behaviour. The measurement below stands as a historical record; a future density pass has no such guard and must protect control-bearing text by review. The fenced sections of `CLAUDE.md` — §5, §6.2, §6.4, §6.5, §6.6, §10, §15 — carry the highest floor-per-line density in the file and are untouchable without exception; the reducible surface is only what remains (§1-§4, §6.1, §7, §7b-§16 minus the fenced subsections), and most of that surface was already lean from prior slimming rounds (§6.3, §7b, §11, §13 are already one-line pointers; §2-§4 are golden-reference tables/trees a model cannot infer). A small number of genuine, low-risk cuts were found and applied outside the fenced surface; no further cut was forced to hit a target size — `CLAUDE.md` has no byte-count target, only a density standard evaluated per section.

**To reproduce this measurement on a future density pass:** diff `wc -c CLAUDE.md` before and after the cut and run `bash tests/run-all.sh`. There is no longer a mechanical fenced-surface check — read the control-bearing sections yourself before and after, and treat any softened modal verb or shrunk enumeration as a defect in the cut.

## Measured reductions — implementer context budget

The implementer combines a cold agent prompt with task-specific workspace and repository reads. Its density pass preserves the control-bearing scope, commit, constraint, sketch, and status contracts while moving stack-specific facts behind an on-demand reference.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| `agents/implementer.md` size | 43,959 bytes | 14,832 bytes | −29,127 bytes (−66.3%) |
| `agents/implementer.md` words | 6,576 | 2,105 | −4,471 words (−68.0%) |
| Stack guardrails | included on every dispatch | 1,455-byte conditional reference | removed from unrelated stacks |

The larger dynamic saving comes from knowledge loading. `docs/knowledge.md` was previously a mandatory full read (154,506 bytes at measurement time). The implementer now consumes the task-scoped `00-knowledge-context.md` when present or at most three grep-selected entries / 80 lines. Exact token savings vary by task and cache state, so this table reports bytes rather than fabricating a token total.

The behavioral budget is equally important: successful tool work is silent, each input is read once, analogous-code discovery stops at two examples per changed concern, and Context7 is limited to changed third-party API surfaces.

## Known issue — TTL regression

Claude Code issue 46829 (https://github.com/anthropics/claude-code/issues/46829) documents a regression in which the default cache TTL silently dropped from 1 hour to 5 minutes for a period in early 2026, inflating cache-creation cost by roughly 20–32% on subscription plans. The issue was closed as "not planned." Periodically confirm the `cache_read_input_tokens` ratio (via the statusline `current_usage` object) is consistent with expected behavior; a sudden drop in hit rate can indicate a TTL regression of this kind.

## Sources

- Claude Code prompt caching: https://code.claude.com/docs/en/prompt-caching
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code memory (CLAUDE.md load order): https://code.claude.com/docs/en/memory
- Anthropic prompt caching (mechanics, minimum prefixes): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic pricing (multipliers): https://platform.claude.com/docs/en/about-claude/pricing
- TTL regression report: https://github.com/anthropics/claude-code/issues/46829
