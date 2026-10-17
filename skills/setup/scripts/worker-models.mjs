import { readFileSync } from "node:fs";

function immutable(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/** Neutral workload suggestions; no host, provider or model defaults are encoded here. */
export const WORKER_MODEL_CATEGORIES = immutable(JSON.parse(readFileSync(
  new URL("./worker-model-profiles.json", import.meta.url), "utf8",
)));
/** The three accepted profile names in configuration and guided previews. */
export const WORKER_PROFILES = WORKER_MODEL_CATEGORIES.profiles;
/** Suggested profiles for canonical specialists; other eligible workers use the general profile. */
export const ROLE_PROFILES = WORKER_MODEL_CATEGORIES.role_profiles;
/** Reserved coordinator identities; consumers also exclude primary agents by native type. */
export const EXCLUDED_ROLES = WORKER_MODEL_CATEGORIES.excluded_roles;

const profiles = new Set(WORKER_PROFILES);
const excluded = new Set(EXCLUDED_ROLES);
const graphic = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
const limits = WORKER_MODEL_CATEGORIES.identity_limits;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function invalid(reason) {
  const error = new Error(`Invalid worker-models configuration: ${reason}`);
  error.code = `worker_models_${reason}`;
  throw error;
}

function fields(value, required, optional = []) {
  if (!record(value) || required.some(name => !Object.hasOwn(value, name))
      || Object.keys(value).some(name => !required.includes(name) && !optional.includes(name))) {
    invalid("invalid_structure");
  }
}

function identity(value, kind) {
  if (typeof value !== "string" || !value || value.trim() !== value || !graphic.test(value)
      || Buffer.byteLength(value, "utf8") > limits[`${kind}_bytes`]
      || (kind === "provider" && value.includes("/"))) {
    invalid("invalid_identity");
  }
  return value;
}

function selection(value) {
  if (!record(value) || !Object.hasOwn(value, "mode")) invalid("invalid_selection");
  if (value.mode === "inherit") {
    fields(value, ["mode"]);
    return { mode: "inherit" };
  }
  if (value.mode !== "model") invalid("invalid_mode");
  fields(value, ["mode", "provider", "model"]);
  return { mode: "model", provider: identity(value.provider, "provider"), model: identity(value.model, "model") };
}

function allowedRoles(options) {
  if (!record(options)) invalid("invalid_role_roster");
  if (!Object.hasOwn(options, "roles")) return new Set(Object.keys(ROLE_PROFILES));
  if (!Array.isArray(options.roles)) invalid("invalid_role_roster");
  return new Set(options.roles.map(role => identity(role, "role")).filter(role => !excluded.has(role)));
}

/**
 * Validate the complete worker-models value and return an independent normalized copy.
 * Undefined means all profiles inherit; a present object requires all three profiles.
 * options.roles replaces the canonical override roster. Identities retain exact Unicode,
 * use UTF-8 byte limits, and admit printable categories L/M/N/P/S/Zs without edge whitespace.
 * Validation errors contain static codes, never the submitted identities or unknown fields.
 */
export function validateWorkerModels(value, options = {}) {
  const roles = allowedRoles(options);
  if (value === undefined) {
    return {
      schema_version: 1,
      profiles: Object.fromEntries(WORKER_PROFILES.map(name => [name, { mode: "inherit" }])),
      role_overrides: {},
    };
  }
  fields(value, ["schema_version", "profiles"], ["role_overrides"]);
  if (value.schema_version !== 1) invalid("invalid_schema_version");
  fields(value.profiles, WORKER_PROFILES);
  const normalized = {
    schema_version: 1,
    profiles: Object.fromEntries(WORKER_PROFILES.map(name => [name, selection(value.profiles[name])])),
    role_overrides: {},
  };
  const overrides = Object.hasOwn(value, "role_overrides") ? value.role_overrides : {};
  if (!record(overrides)) invalid("invalid_role_overrides");
  normalized.role_overrides = Object.fromEntries(Object.entries(overrides).map(([role, choice]) => {
    identity(role, "role");
    if (excluded.has(role)) invalid("primary_role_excluded");
    if (!roles.has(role)) invalid("unknown_role");
    if (record(choice) && Object.hasOwn(choice, "profile")) {
      fields(choice, ["profile"]);
      if (!profiles.has(choice.profile)) invalid("invalid_profile_reference");
      return [role, { profile: choice.profile }];
    }
    return [role, selection(choice)];
  }));
  return normalized;
}

/**
 * Resolve role override, suggested profile, then inheritance without changing caller objects.
 * source distinguishes absent preferences from explicitly configured inheritance. Reserved
 * primary roles and invalid configuration throw; neither silently receives a worker default.
 */
export function resolveWorkerSelection(value, role, options = {}) {
  const normalized = validateWorkerModels(value, options);
  identity(role, "role");
  if (excluded.has(role)) invalid("primary_role_excluded");
  let profile = Object.hasOwn(ROLE_PROFILES, role) ? ROLE_PROFILES[role] : WORKER_MODEL_CATEGORIES.default_profile;
  if (Object.hasOwn(normalized.role_overrides, role)) {
    const override = normalized.role_overrides[role];
    if (Object.hasOwn(override, "profile")) profile = override.profile;
    return {
      selection: { ...(Object.hasOwn(override, "profile") ? normalized.profiles[profile] : override) },
      profile, source: "role_override",
    };
  }
  return { selection: { ...normalized.profiles[profile] }, profile, source: value === undefined ? "inherit" : "profile" };
}
