import assert from "node:assert/strict";
import test from "node:test";

let workerModels;
try {
  workerModels = await import("../skills/setup/scripts/worker-models.mjs");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const canary = "secret-canary-never-export-this";
const inherit = () => ({ mode: "inherit" });
const selected = (provider, model) => ({ mode: "model", provider, model });
const config = () => ({
  schema_version: 1,
  profiles: { reasoning: inherit(), general: inherit(), mechanical: inherit() },
  role_overrides: {},
});

function api() {
  assert.ok(workerModels, "The shared worker model contract is not implemented");
  return workerModels;
}

function invalid(value, options) {
  const { validateWorkerModels } = api();
  assert.throws(() => validateWorkerModels(value, options), error => {
    assert.ok(error instanceof Error);
    assert.match(error.code, /^worker_models_/);
    assert.ok(!error.message.includes(canary));
    return true;
  });
}

test("absent preferences resolve to inheritance without a provider default", () => {
  const { validateWorkerModels, resolveWorkerSelection } = api();
  assert.deepEqual(validateWorkerModels(undefined), config());
  assert.deepEqual(resolveWorkerSelection(undefined, "architect"), {
    selection: { mode: "inherit" }, profile: "reasoning", source: "inherit",
  });
  assert.deepEqual(resolveWorkerSelection(undefined, "implementer"), {
    selection: { mode: "inherit" }, profile: "general", source: "inherit",
  });
});

test("explicit inheritance remains a configured profile rather than absent legacy state", () => {
  assert.deepEqual(api().resolveWorkerSelection(config(), "implementer"), {
    selection: { mode: "inherit" }, profile: "general", source: "profile",
  });
});

test("architecture, ordinary implementation and bounded cleanup use suggested categories", () => {
  const value = config();
  value.profiles.reasoning = selected("vendor-a", "deliberate");
  value.profiles.general = selected("vendor-b", "ordinary");
  value.profiles.mechanical = selected("vendor-c", "bounded");
  const resolve = api().resolveWorkerSelection;
  assert.deepEqual(resolve(value, "architect"), {
    selection: { mode: "model", provider: "vendor-a", model: "deliberate" },
    profile: "reasoning", source: "profile",
  });
  assert.deepEqual(resolve(value, "implementer"), {
    selection: { mode: "model", provider: "vendor-b", model: "ordinary" },
    profile: "general", source: "profile",
  });
  assert.deepEqual(resolve(value, "cleaner"), {
    selection: { mode: "model", provider: "vendor-c", model: "bounded" },
    profile: "mechanical", source: "profile",
  });
});

test("critical reviewers and delivery use their neutral workload assignments", () => {
  const value = config();
  value.profiles.reasoning = selected("review-provider", "review-model");
  value.profiles.mechanical = selected("delivery-provider", "delivery-model");
  assert.deepEqual(api().resolveWorkerSelection(value, "pr-review-verifier"), {
    selection: { mode: "model", provider: "review-provider", model: "review-model" },
    profile: "reasoning", source: "profile",
  });
  assert.deepEqual(api().resolveWorkerSelection(value, "delivery"), {
    selection: { mode: "model", provider: "delivery-provider", model: "delivery-model" },
    profile: "mechanical", source: "profile",
  });
});

test("direct role choice wins over its assigned category", () => {
  const value = config();
  value.profiles.reasoning = selected("category-provider", "category-model");
  value.role_overrides.architect = selected("role-provider", "role-model");
  assert.deepEqual(api().resolveWorkerSelection(value, "architect"), {
    selection: { mode: "model", provider: "role-provider", model: "role-model" },
    profile: "reasoning", source: "role_override",
  });
});

test("role profile reference changes the category used for that worker", () => {
  const value = config();
  value.profiles.reasoning = selected("category-provider", "category-model");
  value.profiles.mechanical = selected("chosen-provider", "chosen-model");
  value.role_overrides.architect = { profile: "mechanical" };
  assert.deepEqual(api().resolveWorkerSelection(value, "architect"), {
    selection: { mode: "model", provider: "chosen-provider", model: "chosen-model" },
    profile: "mechanical", source: "role_override",
  });
});

test("explicit role inheritance never falls through to its configured category", () => {
  const value = config();
  value.profiles.reasoning = selected("category-provider", "category-model");
  value.role_overrides.architect = inherit();
  assert.deepEqual(api().resolveWorkerSelection(value, "architect"), {
    selection: { mode: "inherit" }, profile: "reasoning", source: "role_override",
  });
});

test("one explicit model may serve all workload categories", () => {
  const value = config();
  value.profiles = {
    reasoning: selected("single-provider", "single-model"),
    general: selected("single-provider", "single-model"),
    mechanical: selected("single-provider", "single-model"),
  };
  for (const role of ["architect", "implementer", "cleaner"]) {
    assert.deepEqual(api().resolveWorkerSelection(value, role).selection,
      { mode: "model", provider: "single-provider", model: "single-model" });
  }
});

test("an unassigned native worker uses the general workload", () => {
  const value = config();
  value.profiles.general = selected("native-provider", "general-model");
  assert.deepEqual(api().resolveWorkerSelection(value, "native_worker"), {
    selection: { mode: "model", provider: "native-provider", model: "general-model" },
    profile: "general", source: "profile",
  });
});

test("native roster replaces default role references and may add legitimate workers", () => {
  const value = config();
  value.role_overrides.native_worker = { profile: "mechanical" };
  const options = { roles: ["native_worker"] };
  assert.deepEqual(api().validateWorkerModels(value, options), value);
  assert.deepEqual(api().resolveWorkerSelection(value, "native_worker", options), {
    selection: { mode: "inherit" }, profile: "mechanical", source: "role_override",
  });
  invalid(value);
  value.role_overrides = { architect: inherit() };
  invalid(value, options);
  invalid(value, { roles: [] });
});

test("primary and coordinator names cannot receive worker overrides or resolution", () => {
  for (const role of ["main", "primary", "coordinator", "orchestrator"]) {
    const value = config();
    value.role_overrides[role] = selected("vendor", "worker");
    invalid(value, { roles: [role] });
    assert.throws(() => api().resolveWorkerSelection(config(), role), /primary_role_excluded/);
    assert.throws(() => api().resolveWorkerSelection(undefined, role), /primary_role_excluded/);
  }
});

test("missing, unknown and nonnumeric schema versions are invalid", () => {
  for (const version of [undefined, 0, 2, "1", null]) {
    const value = config();
    if (version === undefined) delete value.schema_version;
    else value.schema_version = version;
    invalid(value);
  }
  for (const value of [null, [], "inherit", 1]) invalid(value);
});

test("all three profiles must be present and unknown profile names are refused", () => {
  for (const profiles of [undefined, null, [], { general: inherit() },
    { reasoning: inherit(), general: inherit(), mechanical: inherit(), fast: inherit() }]) {
    const value = config();
    value.profiles = profiles;
    invalid(value);
  }
});

test("unknown object fields cannot silently discard requested configuration", () => {
  const rootExtra = config();
  rootExtra[canary] = true;
  invalid(rootExtra);
  for (const selection of [{ mode: "inherit", provider: "vendor" },
    { mode: "model", provider: "vendor", model: "worker", token: canary },
    { mode: "model", provider: "vendor", model: "worker", profile: "general" }]) {
    const value = config();
    value.profiles.general = selection;
    invalid(value);
  }
});

test("closed selection modes and explicit identities are required", () => {
  for (const selection of [null, [], "inherit", {}, { mode: "auto" },
    { mode: "model" }, { mode: "model", provider: "vendor" },
    { mode: "model", model: "worker" }, { mode: "model", provider: 1, model: "worker" }]) {
    const value = config();
    value.profiles.general = selection;
    invalid(value);
  }
});

test("role profile references are closed and cannot mix selection fields", () => {
  for (const override of [{ profile: "fast" }, { profile: null },
    { profile: "general", mode: "inherit" }, { profile: "general", token: canary }]) {
    const value = config();
    value.role_overrides.architect = override;
    invalid(value);
  }
});

test("role override objects and referenced roles are validated completely", () => {
  for (const overrides of [null, [], "architect", { unknown_worker: inherit() },
    { [canary]: inherit() }]) {
    const value = config();
    value.role_overrides = overrides;
    invalid(value);
  }
  for (const roles of [null, "architect", [null], [" "], ["x".repeat(129)]]) {
    invalid(config(), { roles });
  }
});

test("native Unicode and punctuation identities retain their exact value", () => {
  const value = config();
  value.profiles.general = selected("本地 服务@α+β", '账户/部署:1 @rev+β"\\model');
  assert.deepEqual(api().validateWorkerModels(value), value);
  assert.deepEqual(api().resolveWorkerSelection(value, "implementer").selection,
    { mode: "model", provider: "本地 服务@α+β", model: '账户/部署:1 @rev+β"\\model' });
  const decomposed = "e\u0301";
  value.profiles.general.model = decomposed;
  assert.equal(api().validateWorkerModels(value).profiles.general.model, decomposed);
});

test("identity limits count UTF8 bytes at exact provider and model boundaries", () => {
  const value = config();
  value.profiles.general = selected("é".repeat(64), "🧠".repeat(64));
  assert.deepEqual(api().validateWorkerModels(value), value);
  value.profiles.general.provider += "a";
  invalid(value);
  value.profiles.general.provider = "valid-provider";
  value.profiles.general.model += "a";
  invalid(value);
});

test("empty, untrimmed, control and nonprintable identities are refused", () => {
  for (const identity of ["", " leading", "trailing ", "\u00a0p", "p\u3000", "x\u0000y", "x\ny", "x\ry",
    "x\ty", "x\u007fy", "x\u0085y", "x\u200dy", "x\u2028y", "x\u2029y", "\ud800"]) {
    for (const field of ["provider", "model"]) {
      const value = config();
      value.profiles.general = selected("vendor", "worker");
      value.profiles.general[field] = identity;
      invalid(value);
    }
  }
  const value = config();
  value.profiles.general = selected("provider/other", "worker");
  invalid(value);
});

test("invalid configured choices throw instead of silently resolving inheritance", () => {
  const { resolveWorkerSelection } = api();
  const value = config();
  value.profiles.reasoning = { mode: "automatic" };
  assert.throws(() => resolveWorkerSelection(value, "implementer"), /worker-models/);
  value.profiles.reasoning = inherit();
  value.role_overrides.architect = { profile: "missing" };
  assert.throws(() => resolveWorkerSelection(value, "implementer"), /worker-models/);
});

test("validation and resolution preserve frozen caller objects and return independent copies", () => {
  const value = config();
  value.profiles.general = selected("vendor", "worker");
  value.role_overrides.architect = { profile: "general" };
  const before = JSON.stringify(value);
  for (const selection of Object.values(value.profiles)) Object.freeze(selection);
  Object.freeze(value.role_overrides.architect);
  Object.freeze(value.profiles);
  Object.freeze(value.role_overrides);
  Object.freeze(value);
  const normalized = api().validateWorkerModels(value);
  const resolved = api().resolveWorkerSelection(value, "architect");
  normalized.profiles.general.model = "other";
  normalized.role_overrides.architect.profile = "reasoning";
  resolved.selection.model = "changed";
  assert.equal(JSON.stringify(value), before);
  assert.deepEqual(api().resolveWorkerSelection(value, "architect").selection,
    { mode: "model", provider: "vendor", model: "worker" });
});

test("omitted overrides normalize without modifying the input and defaults are independent", () => {
  const value = config();
  delete value.role_overrides;
  assert.deepEqual(api().validateWorkerModels(value), config());
  assert.ok(!Object.hasOwn(value, "role_overrides"));
  const first = api().validateWorkerModels(undefined);
  first.profiles.general = selected("vendor", "worker");
  assert.deepEqual(api().validateWorkerModels(undefined), config());
});

test("exported category data cannot be mutated into a provider default or primary assignment", () => {
  const { WORKER_MODEL_CATEGORIES, WORKER_PROFILES, ROLE_PROFILES, EXCLUDED_ROLES } = api();
  assert.throws(() => { ROLE_PROFILES.architect = "mechanical"; }, TypeError);
  assert.throws(() => { WORKER_PROFILES.push("fast"); }, TypeError);
  assert.throws(() => { EXCLUDED_ROLES.pop(); }, TypeError);
  assert.throws(() => { WORKER_MODEL_CATEGORIES.identity_limits.provider_bytes = 999; }, TypeError);
  assert.equal(api().resolveWorkerSelection(config(), "architect").profile, "reasoning");
  assert.throws(() => api().resolveWorkerSelection(config(), "orchestrator"), /primary_role_excluded/);
});
