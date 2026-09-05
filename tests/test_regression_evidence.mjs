import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureRegression, validateRegression, classifyComparison } from "../skills/review-pr/scripts/regression-evidence.mjs";

const root = await mkdtemp(path.join(tmpdir(), "th-regression-test-"));
const repository = path.join(root, "source");
const token = "a".repeat(32);
const run = path.join(root, `run-${token}`);
const requestPath = path.join(run, "request.json");
const probePath = path.join(run, "probe.mjs");
const contextPath = path.join(run, "pr-review-context.json");
const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const json = (file, value) => writeFile(file, `${JSON.stringify(value)}\n`);
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
let checks = 0;
async function check(name, action) {
  await action();
  checks += 1;
  process.stdout.write(`PASS ${name}\n`);
}

try {
  await mkdir(repository);
  await mkdir(run);
  git("init");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  await writeFile(path.join(repository, "setting.txt"), "preserved");
  git("add", "setting.txt");
  git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  await writeFile(path.join(repository, "setting.txt"), "deleted");
  git("commit", "-am", "head");
  const head = git("rev-parse", "HEAD");
  git("clone", "--bare", "--no-hardlinks", repository, path.join(run, "pr-review-snapshot.git"));
  const context = { head_oid: head, base_oid: base, merge_base_oid: base, technical_hash: "b".repeat(64) };
  await json(contextPath, context);
  await json(path.join(run, ".team-harness-review-owner.json"), {
    schema_version: 1, kind: "team_harness_pr_review_run_owner", pr: 1, owner_token: token,
  });
  const request = {
    schema_version: 1, context: contextPath, probe: probePath, assertion_id: "preserve-config",
    invariant: "Updating preserves settings", consumer: "Existing installations", argv: [process.execPath, "{probe}"],
    timeout_ms: 1000, environment: "Same runtime; no dependencies", comparable: true, unavailable_reason: null,
  };
  const probe = `import { readFileSync } from 'node:fs';
const passed = readFileSync('setting.txt', 'utf8') === 'preserved';
process.stdout.write('TH_ASSERT:preserve-config:' + (passed ? 'PASS' : 'FAIL'));
process.exitCode = passed ? 0 : 1;
`;
  async function capture(source = probe, overrides = {}) {
    await writeFile(probePath, source);
    await json(requestPath, { ...request, ...overrides });
    const receipt = await captureRegression(requestPath);
    const record = await validateRegression(requestPath, receipt.evidence, receipt.sha256);
    return { receipt, record };
  }
  let initial;
  await check("real preserved-setting regression with unchanged operator checkout", async () => {
    initial = await capture();
    assert.equal(initial.record.classification, "regression-candidate");
    assert.equal(initial.record.base.assertion, "pass");
    assert.equal(initial.record.head.assertion, "fail");
    assert.equal(initial.record.identity.merge_base_oid, base);
    assert.equal(initial.record.identity.head_oid, head);
    assert.equal(await readFile(path.join(repository, "setting.txt"), "utf8"), "deleted");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(git("rev-parse", "HEAD"), head);
  });
  await check("head and comparison-base changes reject reuse", async () => {
    for (const field of ["head_oid", "base_oid", "merge_base_oid"]) {
      await json(contextPath, { ...context, [field]: "c".repeat(40) });
      await assert.rejects(validateRegression(requestPath, initial.receipt.evidence, initial.receipt.sha256), /identity/);
    }
    await json(contextPath, context);
  });
  await check("changed command and original probe reject reuse", async () => {
    await json(requestPath, { ...request, argv: [process.execPath, "--no-warnings", "{probe}"] });
    await assert.rejects(validateRegression(requestPath, initial.receipt.evidence, initial.receipt.sha256), /identity/);
    await json(requestPath, request);
    await writeFile(probePath, `${probe}\n`);
    await assert.rejects(validateRegression(requestPath, initial.receipt.evidence, initial.receipt.sha256), /identity/);
    await writeFile(probePath, probe);
  });
  await check("modified evidence and copied probe reject reuse", async () => {
    const bytes = await readFile(initial.receipt.evidence);
    await writeFile(initial.receipt.evidence, `${bytes} `);
    await assert.rejects(validateRegression(requestPath, initial.receipt.evidence, initial.receipt.sha256), /digest/);
    await writeFile(initial.receipt.evidence, bytes);
    const copy = path.join(path.dirname(initial.receipt.evidence), initial.record.probe);
    await rm(copy);
    await writeFile(copy, "different");
    await assert.rejects(validateRegression(requestPath, initial.receipt.evidence, initial.receipt.sha256), /probe digest/);
  });
  await check("preexisting failure is not an introduced defect", async () => {
    const { record } = await capture("process.stdout.write('TH_ASSERT:preserve-config:FAIL\\n'); process.exitCode = 1;");
    assert.equal(record.classification, "preexisting-failure");
  });
  await check("head success covers only the named assertion", async () => {
    const { record } = await capture(probe.replace("=== 'preserved'", "=== 'deleted'"));
    assert.equal(record.classification, "no-failure-observed");
    assert.equal(record.base.assertion, "fail");
  });
  await check("intentional behavior difference has no automatic verdict", async () => {
    const { record } = await capture();
    assert.equal(record.classification, "regression-candidate");
    assert.equal(Object.hasOwn(record, "verdict"), false);
    assert.equal(Object.hasOwn(record, "severity"), false);
    assert.equal(Object.hasOwn(record, "confirmed"), false);
  });
  await check("unavailable boundary and incomparable environments execute no code", async () => {
    for (const overrides of [{ unavailable_reason: "Native boundary unavailable" }, { comparable: false }]) {
      const { record } = await capture("throw new Error('must not run');", overrides);
      assert.equal(record.classification, "inconclusive");
      assert.equal(record.base, null);
      assert.equal(record.head, null);
      assert.ok(record.reason);
    }
  });
  await check("missing executable and ambiguous assertion output remain inconclusive", async () => {
    for (const [source, overrides] of [
      ["", { argv: [path.join(root, "missing-executable"), "{probe}"] }],
      ["process.exitCode = 1;", {}],
      ["process.stdout.write('TH_ASSERT:preserve-config:FAIL'); process.exitCode = 2;", {}],
      ["process.stdout.write('TH_ASSERT:other:PASS');", {}],
      ["", {}],
    ]) {
      const { record } = await capture(source, overrides);
      assert.equal(record.classification, "inconclusive");
      assert.ok(record.reason);
    }
  });
  await check("timeout is recorded and execution is bounded", async () => {
    const { record } = await capture("setInterval(() => {}, 1000);", { timeout_ms: 150 });
    assert.equal(record.classification, "inconclusive");
    assert.equal(record.head.execution.outcome, "timed_out");
  });
  await check("diagnostic output is bounded and terminal safe", async () => {
    const { record } = await capture("process.stderr.write('x'.repeat(100000) + '\\x1b[31m'); process.stdout.write('TH_ASSERT:preserve-config:PASS');");
    assert.equal(record.classification, "no-failure-observed");
    assert.ok(record.head.execution.stderr.truncated);
    assert.ok(record.head.execution.stderr.tail.length <= 8192);
    assert.ok(!record.head.execution.stderr.tail.includes("\x1b"));
  });
  await check("symlink evidence cannot nominate an outside file", async () => {
    const { receipt } = await capture();
    const outside = path.join(root, "outside.json");
    await writeFile(outside, await readFile(receipt.evidence));
    await rm(receipt.evidence);
    await symlink(outside, receipt.evidence);
    await assert.rejects(validateRegression(requestPath, receipt.evidence, receipt.sha256), /symlink/);
  });
  await check("unsupported source entries disclose unavailable preparation", async () => {
    git("update-index", "--add", "--cacheinfo", `120000,${git("rev-parse", "HEAD:setting.txt")},link`);
    git("commit", "-m", "symlink fixture");
    const next = git("rev-parse", "HEAD");
    execFileSync("git", ["--git-dir", path.join(run, "pr-review-snapshot.git"), "fetch", repository, next], { stdio: "pipe" });
    await json(contextPath, { ...context, head_oid: next });
    const { record } = await capture();
    assert.equal(record.classification, "inconclusive");
    assert.match(record.reason, /symlink or submodule/);
    assert.equal(record.base, null);
    await json(contextPath, context);
  });
  await check("classification rejects malformed and incomparable states", async () => {
    for (const outcome of [undefined, "unknown", "failed", null]) {
      assert.equal(classifyComparison(outcome, "pass", true), "inconclusive");
      assert.equal(classifyComparison("pass", outcome, true), "inconclusive");
    }
    assert.equal(classifyComparison("pass", "fail", false), "inconclusive");
  });
  await check("Windows-normalized paths never materialize outside the execution copy", async () => {
    for (const filename of [".. /escape.txt", "trailing./setting.txt", "NUL.txt", "setting.txt "]) {
      git("read-tree", base);
      git("-c", "core.protectNTFS=false", "update-index", "--add", "--cacheinfo", `100644,${git("rev-parse", base + ":setting.txt")},${filename}`);
      const tree = git("write-tree");
      const revision = git("commit-tree", tree, "-p", base, "-m", "Windows path fixture");
      execFileSync("git", ["--git-dir", path.join(run, "pr-review-snapshot.git"), "fetch", repository, revision], { stdio: "pipe" });
      await json(contextPath, { ...context, head_oid: revision });
      const { record } = await capture();
      assert.equal(record.classification, "inconclusive");
      assert.match(record.reason, /unsupported execution copy path/);
      assert.equal(record.head, null);
    }
    await json(contextPath, context);
  });
  await check("oversized input is refused before probe execution", async () => {
    await json(requestPath, request);
    await writeFile(probePath, "x".repeat(1024 * 1024 + 1));
    await assert.rejects(captureRegression(requestPath), /bounded regular file/);
  });
  await check("CLI captures and validates the same bounded evidence", async () => {
    await json(requestPath, request);
    await writeFile(probePath, probe);
    const helper = fileURLToPath(new URL("../skills/review-pr/scripts/regression-evidence.mjs", import.meta.url));
    const receipt = JSON.parse(execFileSync(process.execPath, [helper, "run", requestPath], { encoding: "utf8" }));
    const record = JSON.parse(execFileSync(process.execPath, [helper, "validate", requestPath, receipt.evidence, receipt.sha256], { encoding: "utf8" }));
    assert.equal(record.classification, "regression-candidate");
    assert.equal(checksum(await readFile(receipt.evidence)), receipt.sha256);
  });
  process.stdout.write(`regression-evidence: ${checks} behavioral checks passed\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
