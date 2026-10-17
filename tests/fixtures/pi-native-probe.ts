import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const generation = randomUUID();
  pi.registerCommand("th-native-probe", {
    description: "Record public capabilities without a model request.",
    handler: async () => {
      pi.appendEntry("th-native-probe", {
        generation,
        activeTools: pi.getActiveTools(),
        allTools: pi.getAllTools().map((tool) => tool.name),
      });
    },
  });
  pi.registerCommand("th-native-reload", {
    description: "Reload the native extension runtime without a model request.",
    handler: async (_args, ctx) => { await ctx.reload(); },
  });
}
