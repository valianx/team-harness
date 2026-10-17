import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Type, clampThinkingLevel } from "@earendil-works/pi-ai";
import { defineTool, getAgentDir, getPackageDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readSettings, setSettings } from "./settings.mjs";
import { getPiModelCatalog, guidePiWorkerModels, resolvePiWorkerSelection } from "./worker-models.mjs";
import { WorkerManager, validateWorkerProfile, workerConfiguration, workerFailureCode } from "./worker.mjs";
import { inspectPiWorkspace } from "./context.mjs";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const workerEntry = "th-pi-worker";
const capabilityEntry = "th-pi-worker-capabilities";

function profileFromArguments() {
  const indexes = process.argv.flatMap((value, index) => value === "--th-worker-config" ? [index] : []);
  if (!indexes.length) return null;
  const raw = process.argv[indexes[0] + 1];
  if (indexes.length !== 1 || typeof raw !== "string" || Buffer.byteLength(raw) > 16_384)
    throw new Error("Worker capability profile is invalid");
  return validateWorkerProfile(JSON.parse(raw));
}

function registerBridge(pi: ExtensionAPI, profile: ReturnType<typeof validateWorkerProfile>) {
  const inspect = (ctx: ExtensionContext) => {
    const all = pi.getAllTools().map(tool => tool.name);
    const active = pi.getActiveTools();
    if (ctx.cwd !== profile.cwd || profile.tools.some(tool => !all.includes(tool))
        || JSON.stringify([...active].sort()) !== JSON.stringify([...profile.tools].sort())
        || active.some(tool => tool.startsWith("th_worker_") || tool.startsWith("mcp__")))
      throw new Error("Worker native tool capabilities do not match its role");
    return { active, all };
  };
  pi.on("session_start", (_event, ctx) => {
    if (profile.tools.some(tool => !pi.getAllTools().some(item => item.name === tool)))
      throw new Error("Worker role tool is unavailable");
    pi.setActiveTools(profile.tools);
    inspect(ctx);
  });
  pi.on("before_agent_start", (_event, ctx) => { inspect(ctx); });
  pi.registerCommand("th-worker-capabilities", {
    description: "Inspect this worker's selected native capabilities without starting an agent run.",
    handler: async (nonce, ctx) => {
      if (!/^[a-zA-Z0-9-]{1,128}$/.test(nonce)) throw new Error("Worker capability nonce is invalid");
      const tools = inspect(ctx);
      pi.appendEntry(capabilityEntry, {
        schema_version: 1, nonce, owner_session_id: profile.owner_session_id, worker_id: profile.worker_id, role: profile.role,
        cwd: ctx.cwd, session_id: ctx.sessionManager.getSessionId(), session_file: ctx.sessionManager.getSessionFile(),
        active_tools: tools.active, all_tools: tools.all,
        model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
        thinking_level: ctx.thinkingLevel ?? "off",
      });
    },
  });
}

/** Register native coordination tools; factories never launch processes or seed preferences. */
export default function extension(pi: ExtensionAPI) {
  pi.registerFlag("th-worker-config", { type: "string", description: "Explicit TH worker capability profile." });
  const profile = profileFromArguments();
  if (profile) { registerBridge(pi, profile); return; }
  let manager: WorkerManager | undefined;
  let initializing: Promise<WorkerManager> | undefined;
  let owner: string | undefined;
  let settings: Record<string, unknown> = {};
  let modelRegistry: ExtensionContext["modelRegistry"];
  let generation = 0;

  const ensure = async (ctx: ExtensionContext) => {
    const current = ctx.sessionManager.getSessionId();
    if (owner && owner !== current) throw new Error("The previous native worker context is stale");
    modelRegistry = ctx.modelRegistry;
    if (manager) {
      manager.updateParentSelection(ctx.model, ctx.thinkingLevel ?? "off");
      return manager;
    }
    if (!initializing) {
      owner = current;
      const selectedGeneration = generation;
      initializing = (async () => {
        const agentDir = getAgentDir();
        settings = await readSettings(agentDir);
        const configuration = workerConfiguration(settings, { sdkRoot: getPackageDir() });
        const catalog = JSON.parse(await fs.readFile(path.join(packageRoot, "runtime/pi/agents.json"), "utf8"));
        const value = new WorkerManager({
          ...configuration, packageRoot, agentDir, catalog,
          parent: { session_id: current, cwd: ctx.cwd, model: ctx.model, thinking_level: ctx.thinkingLevel ?? "off" },
          selectWorkerModel: (role, inherited) => resolvePiWorkerSelection(settings["worker-models"], role, {
            roles: catalog.agents.map(agent => agent.name), registry: modelRegistry, inherited, clampThinkingLevel,
          }),
          parentEntries: () => ctx.sessionManager.getEntries(),
          onReference: reference => {
            if (generation !== selectedGeneration || owner !== current) throw new Error("Native worker context is stale");
            pi.appendEntry(workerEntry, reference);
          },
        });
        const references = new Map();
        for (const entry of ctx.sessionManager.getBranch()) {
          if (entry.type === "custom" && entry.customType === workerEntry && entry.data?.owner_session_id === current)
            references.set(entry.data.worker_id, entry.data);
        }
        await value.restore([...references.values()]);
        if (generation !== selectedGeneration) { await value.shutdown(); throw new Error("Native worker context is stale"); }
        manager = value;
        return value;
      })();
      initializing.catch(() => { initializing = undefined; });
    }
    return initializing;
  };
  const result = (value: any, ctx: ExtensionContext) => {
    const { usage, receipt, ...state } = value;
    const details = { ...state, workspace: inspectPiWorkspace(settings, ctx.sessionManager.getBranch()),
      ...(receipt ? { th_worker_receipt: receipt } : {}) };
    return { content: [{ type: "text" as const, text: JSON.stringify(state) }], details, ...(usage ? { usage } : {}) };
  };
  const refused = (operation: string, error?: unknown) => ({
    isError: true, content: [{ type: "text" as const, text: "Native Pi worker operation is unavailable or invalid." }],
    details: { status: "unavailable", operation, reason_code: workerFailureCode(error),
      ...(error && typeof error === "object" && "code" in error && error.code === "MODEL_SELECTION_MISSING"
        && "selection" in error ? { selected_model: error.selection } : {}) },
  });
  pi.registerCommand("th-worker-models", {
    description: "Choose native models for new TH worker conversations without changing the chat model.",
    handler: async (_args, ctx) => {
      try {
        const agentDir = getAgentDir();
        const current = await readSettings(agentDir);
        const catalog = JSON.parse(await fs.readFile(path.join(packageRoot, "runtime/pi/agents.json"), "utf8"));
        const roles = catalog.agents.map(agent => agent.name);
        const selected = await guidePiWorkerModels(ctx, current["worker-models"], roles);
        if (!selected) return;
        await setSettings(agentDir, { assignments: [`worker-models=${JSON.stringify(selected)}`],
          workerModelCatalog: getPiModelCatalog(ctx.modelRegistry), workerRoles: roles });
        settings = await readSettings(agentDir);
        ctx.ui.notify("TH worker models saved for future conversations. Catalog presence does not verify execution.", "info");
      } catch (error) {
        const gap = error?.code === "MODEL_SELECTION_MISSING" ? ` (${error.selection.provider}/${error.selection.model})` : "";
        ctx.ui.notify(`TH worker model configuration unavailable${gap}. Check the native catalog and retry /th-worker-models.`, "error");
      }
    },
  });
  pi.registerTool(defineTool({
    name: "th_worker_dispatch", label: "TH worker dispatch",
    description: "Delegate a bounded task to an eligible TH specialist using its configured or inherited model and native conversation ownership.",
    parameters: Type.Object({ role: Type.String(), task: Type.String(), cwd: Type.Optional(Type.String()) }, { additionalProperties: false }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const value = await ensure(ctx);
        settings = await readSettings(getAgentDir());
        return result(await value.dispatch(params), ctx);
      } catch (error) { return refused("dispatch", error); }
    },
  }));
  pi.registerTool(defineTool({
    name: "th_worker_control", label: "TH worker control",
    description: "Inspect, follow up, wait for, collect or cancel an owned native TH worker. Collection attributes confirmed native usage.",
    parameters: Type.Object({
      operation: Type.Union(["status", "follow_up", "wait", "collect", "cancel"].map(value => Type.Literal(value))),
      worker_id: Type.Optional(Type.String()), task: Type.Optional(Type.String()),
      timeout_ms: Type.Optional(Type.Integer({ minimum: 1 })),
    }, { additionalProperties: false }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const value = await ensure(ctx);
        if (params.operation === "status" && !params.worker_id) return result({ workers: value.list() }, ctx);
        if (!params.worker_id) return refused(params.operation);
        let state;
        if (params.operation === "status") state = value.status(params.worker_id);
        else if (params.operation === "follow_up") state = await value.followUp(params.worker_id, { task: params.task });
        else if (params.operation === "wait") state = await value.wait(params.worker_id, { timeout_ms: params.timeout_ms, signal });
        else if (params.operation === "collect") state = await value.collect(params.worker_id);
        else state = await value.cancel(params.worker_id);
        try { return result(state, ctx); }
        catch (error) {
          if (state.receipt) value.abandonCollection(params.worker_id, state.receipt.receipt_id);
          throw error;
        }
      } catch (error) { return refused(params.operation, error); }
    },
  }));
  const replaceContext = async () => {
    try { await (manager || await initializing)?.shutdown(); } finally {
      generation++; manager = undefined; initializing = undefined; owner = undefined;
    }
  };
  pi.on("session_start", replaceContext);
  pi.on("session_shutdown", replaceContext);
}
