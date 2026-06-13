# Cost and Caching — Operator Reference

> Claude Code applies prompt caching automatically. The harness never calls the Anthropic Messages API and never sets `cache_control` — it ships agent prompts, skills, and hooks that run inside Claude Code, which owns all caching decisions. This page explains the caching behavior that affects operator cost, the subagent isolation model used by the pipeline, and the operator-machine environment variables that control caching per session.

## How Claude Code caches

Caching is automatic, on by default, and requires no harness-side configuration. The cache key is built from the exact bytes of the rendered prompt up to each implicit `cache_control` breakpoint; a single byte change anywhere in the prefix computes a cold miss for everything after it. Claude Code builds the prefix in this order: tools (including tool definitions from MCP servers) → system prompt → project context → conversation.

**Invalidation events.** The following actions bust the relevant cache layer:

- `/model` or `/effort` command: full cache miss (key is per-model, per-effort)
- Working-directory change: full cache miss (the system prompt embeds the working directory, platform, and shell)
- Tool-set change (MCP server connect or disconnect, permission denial of a whole tool): system-prompt layer miss
- `/clear` or `/compact`: project-context layer miss (CLAUDE.md and auto-memory reload)
- Claude Code upgrade: system-prompt layer miss

**CLAUDE.md mid-session:** editing CLAUDE.md during a session has no effect — Claude Code loaded the version at session start into the cached project-context layer. The edit neither applies nor invalidates the cache. New content loads on `/clear`, `/compact`, or restart.

**Three cache layers:**

| Layer | Content | Stable or volatile |
|---|---|---|
| System prompt | Core instructions, tool definitions | Stable per session; busted by model/effort/tool-set change |
| Project context | CLAUDE.md (project + user), auto-memory | Stable per session; busted by `/clear`, `/compact`, restart |
| Conversation | Messages, responses, tool results, hook `additionalContext` | Volatile — changes every turn |

The `session-start.sh` hook injects config-driven text (dev-mode banner, language directive, workspace-mode directive) via `additionalContext`, which lands in the conversation layer and does not bust the stable layers above it.

## Subagents and cost

Each agent the pipeline dispatches via the Task tool starts its own isolated conversation — separate system prompt, separate tool set, separate cache. The parent session's cache is unaffected.

**Implications for a pipeline run:**

- **Cold start per agent.** On the first turn of each dispatched agent (architect, implementer, tester, qa, security, delivery), there are no cache hits. The agent warms its own cache across its own subsequent turns.
- **5-minute TTL for subagents.** Subagents use the 5-minute cache write TTL even when the operator is on a subscription plan (subscription's automatic 1-hour TTL applies only to the main conversation).
- **Model tiering means separate caches by design.** Opus (architect, gcp-infra) → sonnet (implementer, tester, qa, delivery) → haiku (researcher, init, acceptance-checker, translator) each have independent per-model caches. This is expected and not a defect; model tiering reduces absolute cost because cheaper models have lower base input prices.
- **Re-dispatch reuse window.** Re-dispatching the same agent type within 5 minutes reuses that agent's warm cache (the prefix bytes are identical). Iteration loops, patch-mode selective re-runs, and parallel same-agent lanes all benefit when they stay inside this window.
- **The operator's top-level session.** In developer mode, the orchestrator runs at the top level. Its session gets the 1-hour TTL on a subscription, so the system prompt and CLAUDE.md stay cached across the full pipeline run.

## Operator cost controls

These are environment variables set on the operator's machine before starting Claude Code. The harness documents them; it never sets them in any distributed file.

| Variable | Effect | Recommended for |
|---|---|---|
| `ENABLE_PROMPT_CACHING_1H=1` | Opt into 1-hour cache write TTL | API-key, Bedrock, Vertex, and Foundry operators (subscription operators get 1-hour automatically) |
| `DISABLE_PROMPT_CACHING` | Disable caching for all models | Debugging and cost measurement baselines only |
| `DISABLE_PROMPT_CACHING_HAIKU` | Disable caching for haiku models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_SONNET` | Disable caching for sonnet models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_OPUS` | Disable caching for opus models only | Per-model debugging |
| `DISABLE_PROMPT_CACHING_FABLE` | Disable caching for Fable models only | Per-model debugging |
| `FORCE_PROMPT_CACHING_5M` | Force the cheaper 5-minute write TTL | Bursty or short-lived workloads where 1-hour write cost exceeds expected read savings |
| `/cost` (slash command) | Display current session token usage including `cache_read_input_tokens` | Observing cache hit rate at any point during a session |

To measure hit rate: run `/cost` partway through a session. The `cache_read_input_tokens` field in the usage block shows how many tokens were served from cache rather than re-processed. A ratio of `cache_read / total_input` above ~60% indicates the stable prefix is being reused effectively.

## Pricing reference

Multipliers are relative to the base input token price for the same model. Verify current values at https://platform.claude.com/docs/en/about-claude/pricing before cost planning.

| Operation | Multiplier vs base input |
|---|---|
| 5-minute cache write | 1.25× |
| 1-hour cache write | 2.0× |
| Cache read (hit) | 0.10× |

Minimum cacheable prefix (prompts below this threshold are not cached): Opus 4.8, Sonnet 4.6, and Haiku 4.5 require 1,024 tokens; Opus 4.7 requires 2,048 tokens; Opus 4.6 and 4.5 require 4,096 tokens. Fable 5 requires 512 tokens.

The team-harness pipeline's agent prompts comfortably exceed the 1,024-token minimum for Opus 4.8, Sonnet 4.6, and Haiku 4.5.

## Known issue — TTL regression

A documented Claude Code regression caused the default cache TTL to silently drop from 1 hour to 5 minutes on affected machines, producing approximately 17% higher cost on subscription plans. The issue is tracked at https://github.com/anthropics/claude-code/issues/46829. Check the `/cost` output periodically to confirm the `cache_read_input_tokens` ratio is consistent with expected behavior; a sudden drop in hit rate may indicate this regression.

## Sources

- Claude Code prompt caching: https://code.claude.com/docs/en/prompt-caching.md
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code memory (CLAUDE.md load order): https://code.claude.com/docs/en/memory.md
- Agent SDK cost tracking: https://code.claude.com/docs/en/agent-sdk/cost-tracking
- Anthropic prompt caching (mechanics, minimums): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic pricing (multipliers): https://platform.claude.com/docs/en/about-claude/pricing
- TTL regression report: https://github.com/anthropics/claude-code/issues/46829
