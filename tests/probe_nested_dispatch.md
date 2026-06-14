# Empirical Nesting Probe — M1 Result

**Date:** 2026-06-14
**Probe type:** general-purpose nested foreground subagent `Task` availability
**Branch:** `refactor/general-agent-orchestrator`

## Probe

A nested foreground subagent (dispatched via `Task`) was probed to determine whether its
inner `Agent`/`Task` tool is stripped by the Claude Code harness as an anti-recursion
safety measure.

The subagent attempted to spawn a sub-subagent at depth+1 with a trivial PONG payload.
The inner `Task` call succeeded and the sub-subagent returned PONG to the outer subagent.

## Result

**SUCCESS — inner Task retained and executed successfully.**

A nested foreground subagent **retained** the `Agent`/`Task` tool and successfully spawned
a sub-subagent one level deeper (returned PONG). The premise behind `dispatch_handoff` and
the takeover machinery — that a nested `th:orchestrator` loses `Task` as an anti-recursion
safety measure — is **obsolete on the CC foreground path**.

## D3 Verdict

**D3 = retire-for-CC**: the `dispatch_handoff`/takeover machinery is documented as an
opencode/legacy path only. It is RETAINED in `docs/subagent-orchestration.md` and in
agent contracts (constraint #1 — opencode may need it). The `nested-dispatch-takeover`
managed block is REMOVED from the user `~/.claude/CLAUDE.md` set (the premise no longer
holds on the CC foreground path, so the block is actively misleading for CC operators).

## Caveats

- Single observation on the general-purpose CC foreground path; confirms foreground
  nesting is permitted by the harness.
- Background depth-5 limit (SDK) was not tested — irrelevant to the foreground pipeline.
- The opencode path behavior may differ; the machinery is preserved for that path.
