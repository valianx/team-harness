import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type Model,
  type SimpleStreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const zero = () => ({
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) throw new Error("The scripted provider requires text input");
  return content.filter(part => part.type === "text").map(part => part.text).join("");
}

export default function (pi: ExtensionAPI) {
  if (process.env.TH_PI_SCRIPTED_FIXTURE !== "1") {
    throw new Error("The synthetic provider is only available in its isolated integration fixture");
  }
  // Reload retains one process-wide guard. Even an accidental fallback provider cannot connect.
  const guardKey = Symbol.for("team-harness.pi-scripted-provider.network-guard");
  let guard = Object.getOwnPropertyDescriptor(globalThis, guardKey)?.value as { attempts: number } | undefined;
  if (!guard) {
    guard = { attempts: 0 };
    Object.defineProperty(globalThis, guardKey, { value: guard });
    const blocked = () => {
      guard!.attempts += 1;
      throw new Error("Synthetic Pi fixture forbids every real provider/network request");
    };
    globalThis.fetch = async () => blocked();
    Object.defineProperty(Socket.prototype, "connect", { configurable: true, writable: true, value: blocked });
  }
  const generation = randomUUID();
  let invocations = 0;
  let context: ExtensionContext | undefined;
  pi.on("before_agent_start", (_event, ctx) => { context = ctx; });

  function snapshot() {
    return {
      fixture: "synthetic-no-inference",
      external_requests: guard!.attempts,
      synthetic_provider_invocations: invocations,
      model: context?.model ? { provider: context.model.provider, id: context.model.id } : undefined,
      thinking_level: pi.getThinkingLevel(),
      active_tools: pi.getActiveTools(),
      all_tools: pi.getAllTools().map(tool => tool.name),
      cwd: context?.cwd,
    };
  }

  pi.registerCommand("th-scripted-fixture-probe", {
    description: "Inspect synthetic fixture counters without starting a provider turn.",
    handler: async (_args, ctx) => {
      context = ctx;
      pi.appendEntry("th-scripted-fixture-probe", { generation, ...snapshot() });
    },
  });
  pi.registerCommand("th-scripted-fixture-reload", {
    description: "Replace the native extension context in the isolated fixture.",
    handler: async (_args, ctx) => { await ctx.reload(); },
  });

  pi.registerProvider("th-scripted-fixture", {
    baseUrl: "https://network-disabled.invalid",
    apiKey: "synthetic-not-a-credential",
    api: "th-scripted-fixture-api",
    models: [{
      id: "synthetic-native-v1", name: "Synthetic fixture; no inference",
      reasoning: true, input: ["text"], contextWindow: 131072, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    streamSimple(model: Model<Api>, transcript: TranscriptContext, options?: SimpleStreamOptions) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", api: model.api, provider: model.provider, model: model.id,
        content: [], usage: zero(), stopReason: "pending", timestamp: Date.now(),
      };
      queueMicrotask(() => {
        try {
          if (model.provider !== "th-scripted-fixture" || model.id !== "synthetic-native-v1" || guard!.attempts) {
            throw new Error("The native fixture selected a real provider or attempted network access");
          }
          if (options?.signal?.aborted) throw new Error("Synthetic request aborted");
          invocations += 1;
          const lastUser = transcript.messages.findLastIndex(item => item.role === "user");
          if (lastUser < 0) throw new Error("The scripted provider requires an explicit fixture input");
          const input = text(transcript.messages[lastUser].content);
          const parentDirective = input.startsWith("TH_PI_NATIVE_TOOL ");
          const hasResult = transcript.messages.slice(lastUser + 1).some(item => item.role === "toolResult");
          stream.push({ type: "start", partial: message });
          if (parentDirective && !hasResult) {
            const directive = JSON.parse(input.slice("TH_PI_NATIVE_TOOL ".length));
            if (!/^[a-z0-9-]+$/i.test(directive.id) || !["th_worker_dispatch", "th_worker_control"].includes(directive.name)
              || !directive.arguments || typeof directive.arguments !== "object" || Array.isArray(directive.arguments)) {
              throw new Error("Invalid synthetic TH tool directive");
            }
            const toolCall = { type: "toolCall" as const, id: directive.id, name: directive.name, arguments: {} };
            message.content.push(toolCall);
            stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
            toolCall.arguments = directive.arguments;
            stream.push({ type: "toolcall_delta", contentIndex: 0, delta: JSON.stringify(directive.arguments), partial: message });
            stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: message });
            message.stopReason = "toolUse";
            stream.push({ type: "done", reason: "toolUse", message });
          } else {
            const output = parentDirective ? "Synthetic parent tool turn complete" : JSON.stringify({ ...snapshot(), task: input });
            const content = { type: "text" as const, text: "" };
            message.content.push(content);
            stream.push({ type: "text_start", contentIndex: 0, partial: message });
            content.text = output;
            stream.push({ type: "text_delta", contentIndex: 0, delta: output, partial: message });
            stream.push({ type: "text_end", contentIndex: 0, content: output, partial: message });
            if (!parentDirective) {
              message.usage = { ...zero(), input: 11, output: 7, cacheRead: 5, cacheWrite: 3,
                cacheWrite1h: 1, reasoning: 2, totalTokens: 26 };
            }
            message.stopReason = "stop";
            stream.push({ type: "done", reason: "stop", message });
          }
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? "aborted" : "error";
          message.errorMessage = error instanceof Error ? error.message : String(error);
          stream.push({ type: "error", reason: message.stopReason, error: message });
        } finally { stream.end(); }
      });
      return stream;
    },
  });
}
