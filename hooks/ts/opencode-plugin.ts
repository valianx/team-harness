// hooks/ts/opencode-plugin.ts
// OpenCode context integration. Permission and process-enforcement hooks are
// intentionally absent; OpenCode's native permission model remains the
// execution boundary. The session event preserves configured language,
// English-learning, workflow, and workspace context.

import { sessionEnforcementPlugin } from "./entry/session-enforcement.opencode.js";

interface PluginContext {
  client: {
    session: {
      prompt(args: {
        path: { id: string };
        body: { noReply: true; parts: Array<{ type: "text"; text: string }> };
      }): Promise<unknown>;
    };
  };
}

export interface OpenCodePlugin {
  hooks: {
    event?: (args: { event: unknown }) => Promise<void>;
  };
}

export function teamHarnessPlugins(client: PluginContext["client"]): OpenCodePlugin[] {
  return [sessionEnforcementPlugin(client)];
}

export default async function allPlugins(ctx: PluginContext): Promise<{
  hooks: Record<string, unknown>;
}> {
  const eventHandlers = teamHarnessPlugins(ctx.client)
    .map(plugin => plugin.hooks.event)
    .filter((handler): handler is NonNullable<OpenCodePlugin["hooks"]["event"]> => Boolean(handler));

  return {
    hooks: eventHandlers.length === 0
      ? {}
      : {
          event: async (args: { event: unknown }): Promise<void> => {
            for (const handler of eventHandlers) await handler(args);
          },
        },
  };
}
