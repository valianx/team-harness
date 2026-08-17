// hooks/ts/opencode-plugin.ts
// Single Bun plugin factory — registers ALL Team Harness hook bodies
// in the opencode plugin model.
//
// Each hook body is a separate plugin with its own "tool:before" callback.
// opencode loads registered hooks in registration order.
//
// Enforcement floor bodies (dev-guard, policy-block, gcp-guard, prepublish-guard):
//   fail-closed-for-covered — ask → throw to block the tool call.
// Utility bodies (checkpoint-guard, worktree-guard): fail-open.
// Observability bodies (subagent-trace, precompact-snapshot): write files, no throw.
// Session/language bodies (session-start, language-user-prompt): emit additionalContext.
//
// Session enforcement body (session-enforcement): fires on session.created via
// the event hook; injects orchestrator-disposition + language + english-learning
// directive once per session via client.session.prompt(noReply:true).
// This is the opencode-native equivalent of CC's SessionStart additionalContext.
//
// Note: notify-stage is NOT registered here — it is orchestrator-invoked,
// not a CC or opencode hook event.
//
// Plugin loader wiring (S-1):
//   opencode calls the default export as: const plugin = await import('./team-harness.ts')
//   and then calls each named export (or the default export) as a Plugin factory
//   receiving: async ({ client, project, directory, $ }) => { return { hooks } }
//   The default export below matches this contract: it is an async function that
//   receives the plugin context (including client) and returns a merged hooks object.

import devGuardPlugin from "./entry/dev-guard.opencode.js";
import policyBlockPlugin from "./entry/policy-block.opencode.js";
import gcpGuardPlugin from "./entry/gcp-guard.opencode.js";
import prepublishGuardPlugin from "./entry/prepublish-guard.opencode.js";
import checkpointGuardPlugin from "./entry/checkpoint-guard.opencode.js";
import worktreeGuardPlugin from "./entry/worktree-guard.opencode.js";
import { sessionEnforcementPlugin } from "./entry/session-enforcement.opencode.js";

// ---------------------------------------------------------------------------
// Minimal opencode plugin context type — the fields consumed by this factory.
// The full @opencode-ai/plugin Plugin type has more fields; we declare only
// what we use so the file compiles without a full SDK dependency.
// ---------------------------------------------------------------------------

interface PluginContext {
  client: {
    session: {
      prompt(args: {
        path: { id: string };
        body: { noReply: true; parts: Array<{ type: "text"; text: string }> };
      }): Promise<unknown>;
    };
  };
  project?: unknown;
  directory?: string;
  $?: unknown;
}

export type HookCallback = (input: unknown, output: unknown) => Promise<void>;

export interface OpenCodePlugin {
  hooks: {
    "tool:before"?: HookCallback;
    event?: (args: { event: unknown }) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// teamHarnessPlugins(client) — returns the array of all registered plugins.
// opencode loads each plugin independently; registering them as separate
// objects preserves per-gate fail-mode asymmetry (no shared error handling).
//
// client is required by sessionEnforcementPlugin (S-1: must be threaded from
// the loader context — not a captured closure or a require-time import).
// The six tool:before plugins do not consume client; they remain zero-arg.
// ---------------------------------------------------------------------------

export function teamHarnessPlugins(client: PluginContext["client"]): OpenCodePlugin[] {
  return [
    // Enforcement floors (fail-closed-for-covered).
    devGuardPlugin(),
    policyBlockPlugin(),
    gcpGuardPlugin(),
    prepublishGuardPlugin(),
    // Utility gates (fail-open).
    checkpointGuardPlugin(),
    worktreeGuardPlugin(),
    // Session enforcement: injects orchestrator/language/english-learning
    // directive on session.created via client.session.prompt(noReply:true).
    // Fail-silent — no session is ever blocked or disrupted.
    sessionEnforcementPlugin(client),
  ];
}

// ---------------------------------------------------------------------------
// Default export — opencode Plugin factory.
//
// opencode calls the default export as an async function receiving the plugin
// context: async ({ client, project, directory, $ }) => { return hooks }.
// The factory merges all registered plugin hook objects into a single hooks
// map so opencode registers them in one call.
//
// Backward-compat note: previously this was `export default function allPlugins()`
// (zero-arg, returned OpenCodePlugin[]). The current loader contract per
// opencode docs (context7 /anomalyco/opencode, 2026-06-20) is a factory
// function receiving the plugin context. The new shape is correct; the old
// zero-arg shape was the stale assumption corrected by this PR (S-1 fold).
// ---------------------------------------------------------------------------

export default async function allPlugins(ctx: PluginContext): Promise<{
  hooks: Record<string, unknown>;
}> {
  const plugins = teamHarnessPlugins(ctx.client);

  // Merge all plugin hook objects into a single hooks map.
  // tool:before hooks: wrap multiple handlers into a single sequential handler
  // so each gate runs independently (fail-mode asymmetry preserved).
  // event hooks: same sequential pattern.
  const toolBeforeHandlers: HookCallback[] = [];
  const eventHandlers: Array<(args: { event: unknown }) => Promise<void>> = [];

  for (const plugin of plugins) {
    if (plugin.hooks["tool:before"]) {
      toolBeforeHandlers.push(plugin.hooks["tool:before"]);
    }
    if (plugin.hooks["event"]) {
      eventHandlers.push(plugin.hooks["event"]);
    }
  }

  const mergedHooks: Record<string, unknown> = {};

  if (toolBeforeHandlers.length > 0) {
    mergedHooks["tool:before"] = async (input: unknown, output: unknown): Promise<void> => {
      for (const handler of toolBeforeHandlers) {
        await handler(input, output);
      }
    };
  }

  if (eventHandlers.length > 0) {
    mergedHooks["event"] = async (args: { event: unknown }): Promise<void> => {
      for (const handler of eventHandlers) {
        await handler(args);
      }
    };
  }

  return { hooks: mergedHooks };
}
