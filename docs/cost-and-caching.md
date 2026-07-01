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

**Batching agent edits per release (cache-invalidation hygiene — an internal distribution rule of the team-harness repository, not a shipped delivery default; see `CLAUDE.md §6.3` and `agents/delivery.md § Step 9`):** each distributed agent file (`agents/*.md`) that changes cold-invalidates that agent's cached prefix for every operator whose Claude Code session loaded it. Under team-harness's own release-time version-bump model (`/th:release`), feature PRs accumulate changes in `changelog.d/` without bumping the version — operators do not receive the updated files until a release is cut. This defers the cold-invalidation event to release cadence, which means operators experience one batch cache-cold-start per release rather than one per PR. For a team cutting frequent releases, this reduces per-session warm-up cost across the operator fleet. A repository consuming the shipped pipeline defaults to a per-PR project-version bump instead — this batching rationale applies only to team-harness's own plugin-distribution model.

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
- **Model tiering means separate caches by design.** opus agents (architect, agent-builder, security, …), sonnet agents (implementer, tester, qa, delivery, …), and haiku agents (researcher, init, acceptance-checker, translator) each have independent per-model caches. This is expected, not a defect; model tiering reduces absolute cost because cheaper models have lower base input prices.
- **Re-dispatch reuse window.** Re-dispatching the same agent type within 5 minutes reuses that agent's warm cache (the prefix bytes are identical). Iteration loops, patch-mode selective re-runs, and parallel same-agent lanes all benefit when they stay inside this window.
- **The operator's top-level session.** The orchestrator runs at the top level. On a subscription its session gets the 1-hour TTL, so the system prompt and CLAUDE.md stay cached across the full pipeline run.

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

## Known issue — TTL regression

Claude Code issue 46829 (https://github.com/anthropics/claude-code/issues/46829) documents a regression in which the default cache TTL silently dropped from 1 hour to 5 minutes for a period in early 2026, inflating cache-creation cost by roughly 20–32% on subscription plans. The issue was closed as "not planned." Periodically confirm the `cache_read_input_tokens` ratio (via the statusline `current_usage` object) is consistent with expected behavior; a sudden drop in hit rate can indicate a TTL regression of this kind.

## Sources

- Claude Code prompt caching: https://code.claude.com/docs/en/prompt-caching
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code memory (CLAUDE.md load order): https://code.claude.com/docs/en/memory
- Anthropic prompt caching (mechanics, minimum prefixes): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic pricing (multipliers): https://platform.claude.com/docs/en/about-claude/pricing
- TTL regression report: https://github.com/anthropics/claude-code/issues/46829
