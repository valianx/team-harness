import assert from "node:assert/strict";
import test from "node:test";
import { getPiModelCatalog, guidePiWorkerModels, resolvePiWorkerSelection, validatePiWorkerModels } from "../runtime/pi/worker-models.mjs";

const models = [{ provider: "native-fixture", id: "worker/model", api: "fixture-api", baseUrl: "https://network-disabled.invalid",
  reasoning: false, input: ["text"], contextWindow: 32768, maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }];
const preference = () => ({ schema_version: 1, profiles: { reasoning: { mode: "model", provider: "native-fixture", model: "worker/model" },
  general: { mode: "inherit" }, mechanical: { mode: "inherit" } }, role_overrides: {} });
const inherited = { model: { provider: "primary-fixture", id: "chat-only" }, thinking: "high" };

test("Pi distinguishes failed catalog verification from a selected identity missing in an available snapshot", () => {
  const configured = preference(), before = structuredClone(configured);
  assert.throws(() => resolvePiWorkerSelection(configured, "reviewer", { inherited,
    registry: { getAvailable() { throw new Error("CANARY_PRIVATE_PROVIDER_FAILURE"); } } }), error => {
    assert.equal(error.code, "MODEL_CATALOG_UNAVAILABLE");
    assert.equal(error.message.includes("CANARY"), false);
    assert.equal(error.selection, undefined);
    return true;
  });
  assert.throws(() => resolvePiWorkerSelection(configured, "reviewer", { inherited, registry: { getAvailable: () => [] } }), error => {
    assert.equal(error.code, "MODEL_SELECTION_MISSING");
    assert.deepEqual(error.selection, { provider: "native-fixture", model: "worker/model" });
    return true;
  });
  assert.deepEqual(configured, before);
});

test("Pi explicit inheritance keeps the primary thinking unchanged and needs no catalog or capability fallback", () => {
  const configured = preference();
  configured.role_overrides.reviewer = { mode: "inherit" };
  const result = resolvePiWorkerSelection(configured, "reviewer", { inherited,
    registry: { getAvailable() { throw new Error("Inheritance must not need a catalog"); } },
    clampThinkingLevel() { throw new Error("Inheritance must not change thinking"); } });
  assert.deepEqual(result, inherited);
  assert.deepEqual(inherited, { model: { provider: "primary-fixture", id: "chat-only" }, thinking: "high" });
});

test("Pi rejects invalid preferences without silently inheriting or accepting an unavailable unused profile", () => {
  const invalid = preference();
  invalid.role_overrides.orchestrator = { mode: "inherit" };
  assert.throws(() => resolvePiWorkerSelection(invalid, "reviewer", { inherited }), { code: "CONFIG_INVALID" });
  const configured = preference();
  configured.profiles.mechanical = { mode: "model", provider: "native-fixture", model: "retired" };
  assert.throws(() => validatePiWorkerModels(configured, { catalog: models }), error => {
    assert.equal(error.code, "MODEL_SELECTION_MISSING");
    assert.deepEqual(error.selection, { provider: "native-fixture", model: "retired" });
    return true;
  });
});

test("Pi catalog snapshots are independent and asynchronous or malformed results remain unavailable", () => {
  const available = structuredClone(models);
  const snapshot = getPiModelCatalog({ getAvailable: () => available });
  available[0].id = "later-catalog";
  assert.equal(snapshot[0].id, "worker/model");
  for (const result of [null, {}, Promise.resolve([]), [{ provider: "native-fixture", id: "bad\nidentity" }]]) {
    assert.throws(() => getPiModelCatalog({ getAvailable: () => result }), { code: "MODEL_CATALOG_UNAVAILABLE" });
  }
});

function uiContext(answers, available = models) {
  const remaining = [...answers], dialogs = [];
  return { ctx: { hasUI: true, modelRegistry: { getAvailable: () => available }, ui: {
    async select(title, options) {
      assert.ok(remaining.length, `Unexpected dialog ${title}`);
      const expected = remaining.shift();
      const answer = expected instanceof RegExp ? options.find(option => expected.test(option)) : expected;
      assert.ok(answer === undefined || options.includes(answer));
      dialogs.push({ title, options });
      return answer;
    },
    async confirm(title, message) {
      assert.ok(remaining.length);
      dialogs.push({ title, message });
      return remaining.shift();
    },
  } }, done() { assert.equal(remaining.length, 0); return dialogs; } };
}

test("Pi guided role choices save an independent override and preview the effective category assignments", async () => {
  const configured = preference(), before = structuredClone(configured);
  const ui = uiContext(["Role overrides", /^reviewer /, "Use profile: mechanical", "Preview and save", true]);
  const selected = await guidePiWorkerModels(ui.ctx, configured, ["reviewer", "cleaner"]);
  assert.deepEqual(selected.role_overrides, { reviewer: { profile: "mechanical" } });
  assert.deepEqual(configured, before);
  const preview = ui.done().find(dialog => dialog.message).message;
  assert.match(preview, /reviewer: profile mechanical \(inherit primary model\)/);
  assert.match(preview, /Roles: cleaner/);
});

test("Pi guided explicit role choices retain native IDs and cancellation never changes the caller preference", async () => {
  const configured = preference(), before = structuredClone(configured);
  const ui = uiContext(["Role overrides", /^reviewer /, "Choose provider/model", "Provider: native-fixture", "Model: worker/model", "Preview and save", true]);
  const selected = await guidePiWorkerModels(ui.ctx, configured, ["reviewer"]);
  assert.deepEqual(selected.role_overrides.reviewer, { mode: "model", provider: "native-fixture", model: "worker/model" });
  ui.done();
  for (const answers of [[undefined], [/^reasoning:/, undefined], ["Preview and save", false]]) {
    const cancel = uiContext(answers);
    assert.equal(await guidePiWorkerModels(cancel.ctx, configured, ["reviewer"]), undefined);
    cancel.done();
    assert.deepEqual(configured, before);
  }
});

test("Pi guided unavailable UI or catalog never changes healthy preferences", async () => {
  const configured = preference(), before = structuredClone(configured);
  await assert.rejects(guidePiWorkerModels({ hasUI: false }, configured, ["reviewer"]), { code: "MODEL_UI_UNAVAILABLE" });
  await assert.rejects(guidePiWorkerModels({ hasUI: true, modelRegistry: { getAvailable() { throw new Error("CANARY"); } } }, configured, ["reviewer"]),
    { code: "MODEL_CATALOG_UNAVAILABLE" });
  assert.deepEqual(configured, before);
});
