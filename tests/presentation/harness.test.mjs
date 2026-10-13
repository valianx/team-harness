import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { argumentsFor, claimRunDirectory, fingerprint, harnessRoot, physicalDirectory, saveJson } from "./common.mjs";
import { requiredCases, summarize } from "./results.mjs";

const exec = promisify(execFile);

async function temporary(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "th-presentation-harness-"));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("artifact arguments reject repository writes and candidate traversal", () => {
  assert.throws(() => argumentsFor(["--workspace", ".", "--candidate", "head"]), /absolute/);
  assert.throws(() => argumentsFor(["--workspace", path.resolve(harnessRoot, "../.."), "--candidate", "head"]), /outside/);
  assert.throws(() => argumentsFor(["--workspace", os.tmpdir(), "--candidate", "../head"]), /safe run identity/);
});

test("preparation refuses existing evidence without replacing its app", async () => {
  await temporary(async (workspace) => {
    const options = argumentsFor(["--workspace", workspace, "--candidate", "immutable"]);
    await claimRunDirectory(options);
    await mkdir(path.join(options.runDirectory, "app"));
    const sentinel = path.join(options.runDirectory, "app/original");
    await writeFile(sentinel, "prior evidence");
    await assert.rejects(claimRunDirectory(options), /Run already exists/);
    assert.equal(await readFile(sentinel, "utf8"), "prior evidence");
  });
});

test("symlinked workspace or run ancestors are refused before artifact creation", async () => {
  await temporary(async (root) => {
    const physical = path.join(root, "physical");
    await mkdir(physical);
    const linked = path.join(root, "linked");
    await symlink(physical, linked, "dir");
    await assert.rejects(physicalDirectory(linked), /physical directory/);
    await mkdir(path.join(physical, "testing"));
    await symlink(root, path.join(physical, "testing/runs"), "dir");
    await assert.rejects(claimRunDirectory(argumentsFor(["--workspace", physical, "--candidate", "new"])), /physical directory/);
    await assert.rejects(readFile(path.join(root, "new/prepared.json")), { code: "ENOENT" });
  });
});

test("evidence writes never overwrite a previous report", async () => {
  await temporary(async (root) => {
    const filename = path.join(root, "report.json");
    await saveJson(filename, { result: "original" });
    await assert.rejects(saveJson(filename, { result: "replacement" }), { code: "EEXIST" });
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), { result: "original" });
  });
});

test("selected browser runner fails for a missing package and a missing real browser", async () => {
  await temporary(async (root) => {
    const isolated = path.join(root, "repository/tests/presentation");
    const template = path.join(root, "repository/skills/interactive-presentation/references/templates");
    const fixture = path.join(isolated, "fixture");
    await mkdir(template, { recursive: true });
    await mkdir(fixture, { recursive: true });
    await writeFile(path.join(template, "package.json"), "{}\n");
    await writeFile(path.join(fixture, "fixture.tsx"), "// deterministic fixture identity\n");
    for (const file of ["common.mjs", "run.mjs", "results.mjs"]) await cp(path.join(harnessRoot, file), path.join(isolated, file));
    const workspace = path.join(root, "workspace");
    const runDirectory = path.join(workspace, "testing/runs/head");
    await mkdir(path.join(runDirectory, "app/dist"), { recursive: true });
    await saveJson(path.join(runDirectory, "prepared.json"), { sourceFingerprint: await fingerprint(template), fixtureFingerprint: await fingerprint(fixture) });
    const args = [path.join(isolated, "run.mjs"), "--workspace", workspace, "--candidate", "head"];
    await assert.rejects(exec(process.execPath, args), (error) => error.code === 1 && /Required @playwright\/test is missing/.test(error.stderr));
    const require = createRequire(import.meta.url);
    const installedPackage = path.dirname(require.resolve("@playwright/test/package.json"));
    const dependencyRoot = path.resolve(installedPackage, "../..");
    await symlink(dependencyRoot, path.join(isolated, "node_modules"), "dir");
    await assert.rejects(exec(process.execPath, args, { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, "missing-browser") } }), (error) => error.code === 1 && /Required Chromium is missing/.test(error.stderr));
  });
});

test("green native reports with a missing required StrictMode case cannot pass", () => {
  const specs = requiredCases.filter((key) => key !== "strict-mode:T11").map((key) => {
    const [projectName, group] = key.split(":");
    return { title: `${group}: selected behavior`, tests: [{ projectName, status: "expected", expectedStatus: "passed", results: [{ status: "passed" }] }] };
  });
  const report = summarize({ suites: [{ specs }] });
  assert.equal(report.counts.expected, 29);
  assert.equal(report.counts.selected, 29);
  assert.equal(report.counts.collected, 28);
  assert.equal(report.counts.executed, 28);
  assert.equal(report.counts.failed, 0);
  assert.deepEqual(report.missing, ["strict-mode:T11"]);
  assert.equal(report.complete, false);
});
