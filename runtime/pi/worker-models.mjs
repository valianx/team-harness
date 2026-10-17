import { ROLE_PROFILES, WORKER_PROFILES, resolveWorkerSelection, validateWorkerModels } from "../../skills/setup/scripts/worker-models.mjs";

const inherit = () => ({ mode: "inherit" });
const failure = (code, message, selection) => Object.assign(new Error(message), { code, ...(selection ? { selection } : {}) });
const unavailable = () => failure("MODEL_CATALOG_UNAVAILABLE", "Native model catalog is unavailable. Check Pi provider configuration and retry /th-worker-models.");
const missing = selection => failure("MODEL_SELECTION_MISSING", "Selected worker model is absent from the available native catalog. Reconfigure /th-worker-models.",
  { provider: selection.provider, model: selection.model });
const label = selection => selection.mode === "inherit" ? "inherit primary model" : `${selection.provider}/${selection.model}`;

function checkedCatalog(catalog) {
  if (!Array.isArray(catalog)) throw unavailable();
  try {
    return catalog.map(model => {
      validateWorkerModels({ schema_version: 1, profiles: { reasoning: inherit(), mechanical: inherit(),
        general: { mode: "model", provider: model?.provider, model: model?.id } } });
      return { ...model, ...(model.thinkingLevelMap ? { thinkingLevelMap: { ...model.thinkingLevelMap } } : {}) };
    });
  } catch { throw unavailable(); }
}

/** Read the synchronous native snapshot without refreshing, authenticating or making a model request. */
export function getPiModelCatalog(registry) {
  try { return checkedCatalog(registry.getAvailable()); }
  catch { throw unavailable(); }
}

/** Validate every explicit choice against native metadata before publication; presence is not an execution test. */
export function validatePiWorkerModels(value, { catalog, roles } = {}) {
  const normalized = validateWorkerModels(value, roles === undefined ? {} : { roles });
  const models = checkedCatalog(catalog);
  for (const selection of [...Object.values(normalized.profiles), ...Object.values(normalized.role_overrides)]) {
    if (selection.mode === "model" && !models.some(model => model.provider === selection.provider && model.id === selection.model))
      throw missing(selection);
  }
  return normalized;
}

/** Bind a new conversation synchronously; inherited selections bypass capability changes and catalog validation. */
export function resolvePiWorkerSelection(value, role, { roles, registry, inherited, clampThinkingLevel } = {}) {
  let resolved;
  try { resolved = resolveWorkerSelection(value, role, roles === undefined ? {} : { roles }); }
  catch { throw failure("CONFIG_INVALID", "Pi worker model preferences are invalid. Reconfigure /th-worker-models."); }
  if (resolved.selection.mode === "inherit") return { model: inherited.model, thinking: inherited.thinking };
  const model = getPiModelCatalog(registry).find(model => model.provider === resolved.selection.provider && model.id === resolved.selection.model);
  if (!model) throw missing(resolved.selection);
  if (typeof clampThinkingLevel !== "function" || typeof model.reasoning !== "boolean") throw unavailable();
  let thinking;
  try { thinking = clampThinkingLevel(model, inherited.thinking); } catch { throw unavailable(); }
  if (!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking)) throw unavailable();
  return { model: { provider: model.provider, id: model.id }, thinking };
}

async function chooseSelection(ui, catalog, title) {
  const providers = [...new Set(catalog.map(model => model.provider))].sort();
  const provider = await ui.select(title, ["Inherit primary model", ...providers.map(value => `Provider: ${value}`)]);
  if (provider === undefined) return undefined;
  if (provider === "Inherit primary model") return inherit();
  const selectedProvider = providers.find(value => provider === `Provider: ${value}`);
  if (selectedProvider === undefined) throw unavailable();
  const models = catalog.filter(model => model.provider === selectedProvider).sort((a, b) => a.id.localeCompare(b.id));
  const chosen = await ui.select("Choose worker model", models.map(model => `Model: ${model.id}`));
  if (chosen === undefined) return undefined;
  const selected = models.find(model => chosen === `Model: ${model.id}`);
  if (!selected) throw unavailable();
  return { mode: "model", provider: selected.provider, model: selected.id };
}

function preview(value, roles) {
  const rows = WORKER_PROFILES.map(profile => `${profile}: ${label(value.profiles[profile])}\n  Roles: ${roles
    .filter(role => (ROLE_PROFILES[role] ?? "general") === profile).join(", ") || "none"}`);
  for (const [role, choice] of Object.entries(value.role_overrides)) {
    rows.push(`${role}: ${choice.profile ? `profile ${choice.profile} (${label(value.profiles[choice.profile])})` : label(choice)}`);
  }
  return [...rows, "Only new worker conversations use these choices. The chat model and existing worker sessions stay unchanged.",
    "Catalog metadata does not verify authentication or successful execution."].join("\n\n");
}

async function chooseRoleOverride(ui, catalog, value, roles) {
  const selected = await ui.select("Choose worker role", roles.map(role => `${role} → ${ROLE_PROFILES[role] ?? "general"}`));
  if (selected === undefined) return false;
  const role = roles.find(role => selected === `${role} → ${ROLE_PROFILES[role] ?? "general"}`);
  if (!role) throw failure("CONFIG_INVALID", "Pi worker role is invalid.");
  const action = await ui.select(`Override ${role}`, ["Use assigned profile", ...WORKER_PROFILES.map(profile => `Use profile: ${profile}`),
    "Inherit primary model", "Choose provider/model"]);
  if (action === undefined) return false;
  if (action === "Use assigned profile") delete value.role_overrides[role];
  else if (action === "Inherit primary model") value.role_overrides[role] = inherit();
  else if (WORKER_PROFILES.some(profile => action === `Use profile: ${profile}`)) value.role_overrides[role] = { profile: action.slice("Use profile: ".length) };
  else if (action === "Choose provider/model") {
    const selection = await chooseSelection(ui, catalog, `Model for ${role}`);
    if (!selection) return false;
    value.role_overrides[role] = selection;
  } else throw failure("CONFIG_INVALID", "Pi worker role selection is invalid.");
  return true;
}

/** Collect a complete confirmed native draft without writing preferences or changing the active model. */
export async function guidePiWorkerModels(ctx, preference, roles) {
  if (!ctx.hasUI) throw failure("MODEL_UI_UNAVAILABLE", "Run /th-worker-models in Pi with native dialog support.");
  const catalog = getPiModelCatalog(ctx.modelRegistry);
  const draft = validateWorkerModels(preference, { roles });
  for (;;) {
    const chosen = await ctx.ui.select("TH worker models", [...WORKER_PROFILES.map(profile => `${profile}: ${label(draft.profiles[profile])}`),
      "Role overrides", "Preview and save", "Cancel"]);
    if (chosen === undefined || chosen === "Cancel") return undefined;
    if (chosen === "Preview and save") {
      const checked = validatePiWorkerModels(draft, { catalog, roles });
      return await ctx.ui.confirm("Save TH worker models?", preview(checked, roles)) ? checked : undefined;
    }
    if (chosen === "Role overrides") {
      if (!await chooseRoleOverride(ctx.ui, catalog, draft, roles)) return undefined;
      continue;
    }
    const profile = WORKER_PROFILES.find(profile => chosen === `${profile}: ${label(draft.profiles[profile])}`);
    if (!profile) throw failure("CONFIG_INVALID", "Pi worker profile is invalid.");
    const selection = await chooseSelection(ctx.ui, catalog, `Model for ${profile}`);
    if (!selection) return undefined;
    draft.profiles[profile] = selection;
  }
}
