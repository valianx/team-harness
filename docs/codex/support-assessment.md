# Codex Runtime Support Assessment

**Status:** implemented POSIX-only beta
**Date:** 2026-07-31
**Scope:** shipped native Codex support without changing the current Claude Code or opencode runtime contracts

**Parity update (2026-08-02):** the canonical 57-skill catalog is now projected
to Codex and opencode through runtime adapters. Codex installs the seven-agent pipeline
roster plus the four read-only agents required by `review-pr`; the ten-agent set
remains intentionally narrower than the full semantic agent fleet. The
original narrow-beta proposal below is retained as design history.

## Executive summary

Team Harness can support Codex without a full rewrite. Codex already provides the
required primitives: progressively loaded skills, project guidance, MCP servers,
lifecycle hooks, and custom subagents with per-agent model and reasoning-effort
configuration.

The recommended first release is a narrow beta, not full parity. Codex should start
in its native direct mode and load Team Harness coordination only after explicit
pipeline activation. This preserves the lightweight startup behavior introduced in
Team Harness 3.1 and avoids carrying the complete coordinator contract in every
Codex conversation.

Estimated effort:

| Target | Development effort | Result |
|---|---:|---|
| Technical spike | 2–3 days | Validate packaging, activation, one dispatch, hooks, and model/effort selection |
| Narrow beta | 12–15 days | Installable Codex runtime with the core pipeline and specialists |
| Reasonable functional parity | 25–40 days | Most agents, skills, lifecycle operations, and platform coverage |
| Absolute parity | Not recommended initially | All current agents, skills, special flows, and observability surfaces |

## Repository inventory

The current source contains:

| Surface | Current size | Expected reuse |
|---|---:|---:|
| Agent definitions | 32 files, approximately 183,000 words | 60–70% |
| Skills | 54 skills, approximately 79,000 words | 75–85% |
| Claude Code hook entrypoints | 13 | Shared bodies are reusable; Codex adapters are required |
| Files coupled to `Task` or `subagent_type` | 24 | Require dispatch adaptation |
| Agent or skill files containing `.claude` paths | 63 | Require runtime-neutral paths or rendering |

The prose itself is not the primary migration risk. The main coupling points are:

1. Claude Code's `Task` and `subagent_type` dispatch vocabulary.
2. `~/.claude`, `.claude/*`, and `CLAUDE.md` paths.
3. `/th:*` invocation syntax and Claude-specific skill frontmatter.
4. Hook input/output envelopes and runtime event names.
5. Runtime-specific installation, update, activation, and uninstall behavior.

## Recommended Codex behavior

### Lightweight direct mode

Do not install a permanently active, full orchestrator prompt into every Codex
session. Codex should remain the normal direct-working surface until the operator
explicitly activates the Team Harness pipeline.

```text
Codex direct mode
    -> @Team-Harness init (lightweight intake)
    -> explicit @Team-Harness pipeline (full gated workflow)
    -> progressively loaded phase contracts
    -> task-specific custom subagents
```

This is more native to Codex and lighter than emulating the Claude Code top-level
agent identity globally.

### Progressive activation

The lightweight `init` skill should load only the startup kernel and intake
routing into the current Main thread. After explicit full-pipeline activation,
the `pipeline` skill should progressively load:

1. the activation and intake contract;
2. only the current phase;
3. only the references required by that phase; and
4. only the specialist selected for the current dispatch.

The full pipeline reference and unused agents must not become startup context.

### Agent model distribution

Codex custom agents support independent `model` and `model_reasoning_effort`
configuration. The deterministic renderer reads each canonical Claude role's
frontmatter and applies the operator-approved mapping:

| Canonical model/effort | Codex model/effort |
|---|---|
| `opus` + `xhigh` | `gpt-5.6-sol` + `xhigh` |
| other `opus` | `gpt-5.6-sol` + `xhigh` |
| non-`opus` | `gpt-5.6-luna` + `max` |

The generated per-role roster is committed at `.codex/README.md` and checked by
CI; canonical agent prose does not contain Codex-specific model identifiers.

## Packaging and installation

A Codex plugin bundles skills, hooks, MCP configuration, and assets through
`.codex-plugin/plugin.json`. Custom agents are loaded from `~/.codex/agents/` or
project-scoped `.codex/agents/`, so complete Team Harness installation uses two
separate lifecycle surfaces:

- a Codex plugin for skills, hooks, and MCP declarations; and
- a `--runtime codex` installer adapter for custom agent files and managed config.

The existing installer abstraction and opencode transformation work provide a useful
foundation, but Codex should receive its own placer and renderer rather than another
set of conditional replacements inside the opencode path.

## Proposed beta scope

Include:

- `.codex-plugin/plugin.json`;
- a Codex placer and `--runtime codex`;
- install, update, and uninstall ownership tracking;
- explicit pipeline activation;
- progressively loaded coordinator instructions;
- `architect`, `implementer`, `tester`, `cleaner`, `qa`, `security`, and `delivery`;
- Markdown-to-TOML custom-agent rendering;
- deterministic Sol/Luna model and effort projection;
- the minimum pipeline skills;
- Memory and Context7 MCP configuration;
- targeted installation, activation, dispatch, and update smoke tests; and
- beta documentation and known limitations.

Defer from the original beta scope:

- full custom-agent projection beyond the seven pipeline specialists;
- complete observability parity;
- prose-presence or snapshot tests over agent wording;
- process gates removed from the current Claude Code flow; and
- blocking hooks that duplicate Codex sandbox and approval controls.

## Implementation estimate

| Work item | Estimate |
|---|---:|
| Plugin, skill, agent, and hook spike | 2–3 days |
| Codex placer and installer lifecycle | 2–3 days |
| Canonical-agent to Codex TOML renderer | 2 days |
| Runtime-neutral coordinator dispatch contract | 2–3 days |
| Skill invocation and path adaptation | 1–2 days |
| Minimum hook adapters | 1–2 days |
| Smoke tests, update behavior, and documentation | 2–3 days |

Expected beta total: **12–15 development days** for one developer already familiar
with Team Harness.

## Recommended implementation sequence

### PR 1 — Compatibility spike

Validate only:

1. local plugin installation;
2. explicit progressive pipeline activation;
3. one coordinator-to-specialist dispatch;
4. independent model and reasoning effort for that specialist; and
5. one non-blocking or narrow boundary hook.

The spike should not claim supported-runtime status.

### PR 2 — Runtime beta

Add the installer lifecycle, the core specialist set, MCP setup, smoke tests, and
user-facing beta documentation.

### PR 3 — Expansion based on evidence

Port additional custom-agent roles only when real Codex runs show that they are
needed. Skill parity is provided through Main-owned runtime adapters. Measure
activation success, context consumed, dispatch count, elapsed time, and failure
causes before expanding the installed agent surface.

## Long-term source architecture

Avoid three manually maintained prompt variants. Keep one semantic definition and
render runtime-specific artifacts:

```text
Canonical Team Harness role
├── Claude Code renderer -> Markdown agent
├── opencode renderer     -> transformed Markdown agent
└── Codex renderer        -> TOML custom agent + skills
```

Runtime-specific vocabulary belongs in adapters:

| Canonical concept | Claude Code | opencode | Codex |
|---|---|---|---|
| Delegate specialist | `Task` | runtime task dispatch | Codex subagent dispatch |
| Persistent project guidance | `CLAUDE.md` | opencode rules/config | `AGENTS.md` |
| Reusable workflow | skill/command | skill/command | skill |
| Specialist definition | Markdown frontmatter | transformed Markdown | TOML custom agent |
| Lifecycle policy | Claude hooks | opencode plugin hooks | Codex hooks |

## Go/no-go criteria

Proceed from spike to beta only if:

- direct startup remains lightweight;
- pipeline activation is explicit and reliable;
- the parent receives a bounded specialist result;
- model and effort distribution works as configured;
- installation and uninstall leave operator-owned configuration intact; and
- Codex-native permissions make most Team Harness blocking hooks unnecessary.

Do not proceed to broad parity if the runtime requires loading the complete agent
fleet or pipeline contract into every session.

## Open questions for the spike

1. What explicit skill invocation surface is most stable across Codex CLI, IDE, and
   app?
2. Can plugin lifecycle hooks cover the minimum required events without a global
   user hook install?
3. Should core custom agents be installed globally, project-scoped, or offered in
   both scopes?
4. Which existing boundary hooks add protection beyond Codex's sandbox and approval
   model?
5. What concrete model mapping preserves the current cost distribution without
   coupling canonical prompts to a short-lived model catalog?

## Official references

- [Codex customization overview](https://learn.chatgpt.com/docs/customization/overview)
- [Codex subagents and custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex advanced configuration and hooks](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)
