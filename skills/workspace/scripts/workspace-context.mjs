import path from "node:path";
import { isWorkspaceIdentity } from "../../pipeline/scripts/workspace-identity.mjs";
import { isFileDirectory, isOpaqueId, isRecord, normalizeSourceAssociations } from "./context-values.mjs";

export { selectWorkspacePreference } from "./workspace-preference.mjs";

const FILE_MODES = ["local", "obsidian"];
const MODES = [...FILE_MODES, "gpt-space"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const outcome = (status, reason_code, binding = null) => ({ status, binding, reason_code });

/** Validate a context locator independently of a file output destination. */
export function validateContextBinding(binding) {
  if (!isRecord(binding) || !isRecord(binding.context)
    || (binding.operational_directory !== null && !isFileDirectory(binding.operational_directory))) {
    return outcome("invalid", "context_binding_invalid");
  }
  const context = binding.context;
  if (context.kind === "file") {
    if (!FILE_MODES.includes(context.mode) || !isFileDirectory(context.path)
      || (context.identity !== null && (!isWorkspaceIdentity(context.identity)
        || context.identity.logs_mode !== context.mode
        || path.resolve(context.identity.coordinator_root) !== path.resolve(context.path)))) {
      return outcome("invalid", "file_context_invalid");
    }
  } else if (context.kind === "gpt-space") {
    if (![context.space_id, context.container_page_id, context.effort_page_id].every(isOpaqueId)
      || new Set([context.space_id, context.container_page_id, context.effort_page_id]).size !== 3
      || !DATE.test(context.created_date ?? "") || !SLUG.test(context.slug ?? "")
      || ["path", "identity", "coordinator_root", "root", "services", "logs_mode", "operational_directory"].some(key => Object.hasOwn(context, key))) {
      return outcome("invalid", "remote_context_invalid");
    }
    try {
      const url = new URL(context.url);
      if (url.protocol !== "https:" || url.hostname !== "chatgpt.com" || url.username || url.password
        || url.port || url.search || url.hash || url.pathname !== `/space/${context.effort_page_id}`) throw new Error("Page URL invalid");
      const sources = normalizeSourceAssociations(context.source_associations);
      return outcome("ready", null, { ...structuredClone(binding), context: { ...structuredClone(context), source_associations: sources } });
    } catch {
      return outcome("invalid", "remote_context_invalid");
    }
  } else {
    return outcome("invalid", "context_kind_invalid");
  }
  return outcome("ready", null, structuredClone(binding));
}

/** Resolve retained context before considering a new workspace preference. */
export function resolveContextBinding({ boundContext = null, preference, fileIdentity = null, remoteIdentity = null,
  operationalDirectory } = {}) {
  const wrapFile = identity => ({ context: { kind: "file", mode: identity.logs_mode,
    path: identity.coordinator_root, identity }, operational_directory: operationalDirectory ?? identity.coordinator_root });
  if (boundContext !== null) {
    return validateContextBinding(isWorkspaceIdentity(boundContext) ? wrapFile(boundContext) : boundContext);
  }
  if (!isRecord(preference) || preference.status !== "selected" || !MODES.includes(preference.mode)) {
    return outcome("invalid", preference?.reason_code ?? "workspace_preference_invalid");
  }
  if (preference.mode === "gpt-space") {
    if (remoteIdentity === null) return outcome("pending", "remote_identity_required");
    return validateContextBinding({ context: remoteIdentity, operational_directory: operationalDirectory ?? null });
  }
  if (fileIdentity === null) return outcome("pending", "file_identity_required");
  const binding = isWorkspaceIdentity(fileIdentity) ? wrapFile(fileIdentity)
    : { context: fileIdentity, operational_directory: operationalDirectory ?? fileIdentity?.path ?? null };
  if (binding.context?.mode !== preference.mode) return outcome("invalid", "file_mode_mismatch");
  return validateContextBinding(binding);
}
