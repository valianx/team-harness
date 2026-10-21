import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skill = new URL("../skills/test-dashboard/", import.meta.url);
const script = new URL("scripts/validate-batch.mjs", skill);
const validate = async value => (await import(script)).validateBatch(value);
const api = () => ({
  schemaVersion: 1, id: "login", name: "Login checks", cases: [{
    id: "api-login", name: "Valid login", flow: "Login", service: "auth", type: "api",
    request: { method: "POST", path: "/auth/login", body: { email: "${TEST_EMAIL}" } },
    expect: { status: 200, present: ["/accessToken"] },
  }],
});
const frontend = () => ({
  id: "ui-login", name: "Login page", flow: "Login", service: "web", type: "frontend",
  runner: "web-e2e", test: "login-valid", dependsOn: ["api-login"],
});

test("accepts API assertions and frontend cases in a dependency graph", async () => {
  const batch = api();
  batch.cases.unshift(frontend());
  batch.cases[1].request.headers = { Authorization: "Bearer ${API_TOKEN}" };
  batch.cases[1].expect.json = { "/user/active": true, "/roles": ["reader"], "": { active: true } };
  assert.deepEqual(await validate(batch), []);
});

test("accepts each shipped authoring example", async () => {
  for (const name of await readdir(new URL("examples/", skill))) {
    const batch = JSON.parse(await readFile(new URL(`examples/${name}`, skill), "utf8"));
    assert.deepEqual(await validate(batch), [], name);
  }
});

test("rejects malformed roots and unsupported versions", async () => {
  for (const value of [null, [], {}, { ...api(), schemaVersion: 2 }, { ...api(), cases: [] }]) {
    assert.ok((await validate(value)).length > 0);
  }
});

test("requires case identity, label, flow, service and supported type", async () => {
  for (const field of ["id", "name", "flow", "service", "type"]) {
    const batch = api();
    delete batch.cases[0][field];
    assert.ok((await validate(batch)).some(error => error.includes(field)), field);
  }
  const batch = api();
  batch.cases[0].type = "shell";
  assert.ok((await validate(batch)).length > 0);
});

test("rejects duplicate case identities", async () => {
  const batch = api();
  batch.cases.push(structuredClone(batch.cases[0]));
  assert.ok((await validate(batch)).some(error => error.includes("duplicate")));
});

test("identifiers reject whitespace, uppercase and excess length", async () => {
  for (const value of ["login\n", " login", "Login", "a".repeat(65)]) {
    const batch = api();
    batch.id = value;
    assert.ok((await validate(batch)).some(error => error.startsWith("batch.id:")));
  }
});

test("request validation rejects GET bodies and malformed assertion containers", async () => {
  const batch = api();
  batch.cases[0].request.method = "GET";
  assert.ok((await validate(batch)).some(error => error.includes("body")));
  delete batch.cases[0].request.body;
  for (const expect of [{ status: 200, json: [] }, { status: 200, present: "/id" }]) {
    batch.cases[0].expect = expect;
    assert.ok((await validate(batch)).length > 0);
  }
});

test("rejects unknown fields instead of accepting batch-supplied commands", async () => {
  for (const target of ["root", "case", "request", "expect"]) {
    const batch = api();
    const record = { root: batch, case: batch.cases[0], request: batch.cases[0].request, expect: batch.cases[0].expect }[target];
    record.command = "echo secret";
    assert.ok((await validate(batch)).some(error => error.includes("command")), target);
  }
});

test("validates API method, service-relative path and response status", async () => {
  for (const path of ["https://other.example/", "//other.example/", "/\\other.example/", "/api\nheader", "/#fragment"]) {
    const batch = api();
    batch.cases[0].request.path = path;
    assert.ok((await validate(batch)).some(error => error.includes("path")));
  }
  for (const status of ["200", 99, 600, 200.1]) {
    const batch = api();
    batch.cases[0].expect.status = status;
    assert.ok((await validate(batch)).some(error => error.includes("status")));
  }
  const batch = api();
  batch.cases[0].request.method = "FETCH";
  assert.ok((await validate(batch)).some(error => error.includes("method")));
});

test("requires explicit API expectations and correctly typed headers", async () => {
  const batch = api();
  delete batch.cases[0].expect;
  assert.ok((await validate(batch)).some(error => error.includes("expect")));
  batch.cases[0].expect = { status: 200 };
  batch.cases[0].request.headers = { Authorization: 42 };
  assert.ok((await validate(batch)).some(error => error.includes("headers")));
});

test("validates JSON pointers while accepting escaped keys and root pointers", async () => {
  const batch = api();
  batch.cases[0].expect.json = { "/a~1b/~0key": false, "": null };
  assert.deepEqual(await validate(batch), []);
  for (const pointer of ["user.name", "/bad~2escape", "/bad~"]) {
    batch.cases[0].expect.present = [pointer];
    assert.ok((await validate(batch)).some(error => error.includes("pointer")));
  }
});

test("frontend references require registered runner and existing test selectors", async () => {
  for (const field of ["runner", "test"]) {
    const batch = api();
    const item = frontend();
    delete item[field];
    batch.cases.push(item);
    assert.ok((await validate(batch)).some(error => error.includes(field)));
  }
  const batch = api();
  const item = frontend();
  item.request = { method: "GET", path: "/" };
  batch.cases.push(item);
  assert.ok((await validate(batch)).some(error => error.includes("request")));
});

test("rejects missing, self and repeated dependencies", async () => {
  for (const dependsOn of [["missing"], ["api-login"], ["other", "other"], "other"]) {
    const batch = api();
    batch.cases[0].dependsOn = dependsOn;
    assert.ok((await validate(batch)).some(error => error.includes("dependsOn")));
  }
});

test("rejects dependency cycles", async () => {
  const batch = api();
  batch.cases.push(frontend());
  batch.cases[0].dependsOn = ["ui-login"];
  assert.ok((await validate(batch)).some(error => error.includes("cycle")));
});

test("rejects invalid timeout bounds and preserves the input", async () => {
  for (const timeoutMs of [0, -1, 1.5, "30000"]) {
    const batch = api();
    batch.cases[0].timeoutMs = timeoutMs;
    const before = structuredClone(batch);
    assert.ok((await validate(batch)).some(error => error.includes("timeoutMs")));
    assert.deepEqual(batch, before);
  }
});

test("CLI validates offline, reports paths and does not echo supplied secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "th-batch-"));
  try {
    const file = join(directory, "batch with spaces.json");
    await writeFile(file, JSON.stringify(api()));
    const run = () => spawnSync(process.execPath, [fileURLToPath(script), file], { encoding: "utf8" });
    assert.equal(run().status, 0);
    const batch = api();
    batch.cases[0].request.headers = { Authorization: 123456789 };
    await writeFile(file, JSON.stringify(batch));
    const invalid = run();
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /headers/);
    assert.doesNotMatch(invalid.stderr, /123456789/);
    const unknownField = api();
    unknownField["unexpected\n\u001b[2J"] = true;
    await writeFile(file, JSON.stringify(unknownField));
    const escaped = run();
    assert.equal(escaped.status, 1);
    assert.doesNotMatch(escaped.stderr, /\u001b/);
    assert.equal(escaped.stderr.trimEnd().split("\n").length, 1);
    await writeFile(file, "{secret-malformed-json");
    const malformed = run();
    assert.equal(malformed.status, 1);
    assert.doesNotMatch(malformed.stderr, /secret-malformed/);
    await rm(file);
    assert.equal(run().status, 1);
    assert.equal(spawnSync(process.execPath, [fileURLToPath(script)], { encoding: "utf8" }).status, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
