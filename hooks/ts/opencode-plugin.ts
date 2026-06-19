// hooks/ts/opencode-plugin.ts
// Single Bun plugin factory — registers ALL Team Harness hook bodies
// in the opencode plugin model.
//
// Each hook body is a separate plugin with its own "tool:before" callback.
// opencode calls registered hooks in registration order.
//
// Enforcement floor bodies (dev-guard, policy-block, gcp-guard, prepublish-guard):
//   fail-closed-for-covered — ask → throw to block the tool call.
// Utility bodies (checkpoint-guard, worktree-guard): fail-open.
// Observability bodies (subagent-trace, precompact-snapshot): write files, no throw.
// Session/language bodies (session-start, language-user-prompt): emit additionalContext.
//
// Note: notify-stage is NOT registered here — it is orchestrator-invoked,
// not a CC or opencode hook event.

import devGuardPlugin from "./entry/dev-guard.opencode.js";
import policyBlockPlugin from "./entry/policy-block.opencode.js";
import gcpGuardPlugin from "./entry/gcp-guard.opencode.js";
import prepublishGuardPlugin from "./entry/prepublish-guard.opencode.js";
import checkpointGuardPlugin from "./entry/checkpoint-guard.opencode.js";
import worktreeGuardPlugin from "./entry/worktree-guard.opencode.js";

export type HookCallback = (input: unknown, output: unknown) => Promise<void>;

export interface OpenCodePlugin {
  hooks: {
    "tool:before"?: HookCallback;
  };
}

// ---------------------------------------------------------------------------
// teamHarnessPlugins() — returns the array of all registered plugins.
// opencode loads each plugin independently; registering them as separate
// objects preserves per-gate fail-mode asymmetry (no shared error handling).
// ---------------------------------------------------------------------------

export function teamHarnessPlugins(): OpenCodePlugin[] {
  return [
    // Enforcement floors (fail-closed-for-covered).
    devGuardPlugin(),
    policyBlockPlugin(),
    gcpGuardPlugin(),
    prepublishGuardPlugin(),
    // Utility gates (fail-open).
    checkpointGuardPlugin(),
    worktreeGuardPlugin(),
    // Observability and session hooks are not registered as opencode tool:before
    // hooks — they operate on different event types (SubagentStop, PreCompact,
    // SessionStart, UserPromptSubmit) which opencode does not expose via the
    // same plugin interface. The Bash Sh shims continue to serve those events
    // until opencode adds native event hooks for them.
  ];
}

// ---------------------------------------------------------------------------
// Default export — single factory for opencode's plugin loader.
// opencode calls: const plugins = (await import('./opencode-plugin.ts')).default()
// ---------------------------------------------------------------------------

export default function allPlugins(): OpenCodePlugin[] {
  return teamHarnessPlugins();
}
