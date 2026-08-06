#!/usr/bin/env node
/** Behavioral coverage for the deterministic cleaner/CRAP transition. */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLEANER_ALLOWLIST_SCHEMA_VERSION,
  CLEANER_TRANSITION_SCHEMA_VERSION,
  isCleanerTransitionResult,
  runCleanerTransition,
} from "../plugins/team-harness/skills/pipeline/scripts/cleaner-transition.mjs";

const node = process.execPath;
const failures = [];
const runnerPath = fileURLToPath(
  new URL("../plugins/team-harness/skills/pipeline/scripts/cleaner-transition.mjs", import.meta.url),
);

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  [FAIL] ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true }).trim();
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function command(source, ...args) {
  return {
    argv: [node, "-e", source, ...args],
    working_directory: ".",
    timeout_ms: 10_000,
    version_argv: [node, "--version"],
  };
}

function manifest() {
  const readSource = "require('node:fs').readFileSync('src/feature.js', 'utf8')";
  const crapSource = [
    "const fs = require('node:fs');",
    "const source = fs.readFileSync('src/feature.js', 'utf8');",
    "const functions = source.includes('omit-metric') ? [] : [{",
    "path: 'src/feature.js', symbol: 'feature', status: 'new',",
    "complexity: source.includes('simple') ? 5 : 10,",
    "coverage_percent: source.includes('well-covered') ? 100 : 50",
    "}];",
    "fs.writeFileSync(process.argv[1], JSON.stringify({schema_version: 1, functions}));",
  ].join(" ");
  return {
    schema_version: 1,
    commands: {
      test: command(`const source = ${readSource}; process.exit(source.includes('behavior-ok') ? 0 : 1);`),
      format_check: command(`const source = ${readSource}; process.exit(source.includes('needs-format') ? 1 : 0);`),
      lint: command(`const source = ${readSource}; process.exit(source.includes('lint-bad') ? 1 : 0);`),
      crap: command(crapSource, "${TH_QUALITY_REPORT}"),
    },
    crap: { new_function_max: 8, changed_function_may_worsen: false },
    test_contract: { path_rules: [{ type: "prefix", value: "tests/" }] },
  };
}

async function commitFiles(repo, message, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(repo, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents, "utf8");
  }
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

async function repository(callback, { allowlistPaths = ["src/feature.js"], candidateFiles = {} } = {}) {
  const repo = await mkdtemp(path.join(tmpdir(), "th-cleaner-transition-"));
  try {
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "cleaner-transition@example.invalid");
    git(repo, "config", "user.name", "Cleaner Transition");
    await writeJson(path.join(repo, ".team-harness", "quality.json"), manifest());
    await writeFile(path.join(repo, "README.md"), "baseline\n", "utf8");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "baseline");
    const base = git(repo, "rev-parse", "HEAD");
    await commitFiles(repo, "implementation and tests", {
      "src/feature.js": "behavior-ok needs-format complex\n",
      "tests/feature.test.js": "frozen behavior test\n",
      ...candidateFiles,
    });
    const allowlist = path.join(repo, ".git", "cleaner-allowlist.json");
    await writeJson(allowlist, { schema_version: CLEANER_ALLOWLIST_SCHEMA_VERSION, paths: allowlistPaths });
    await callback({ repo, base, allowlist });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

function preOptions(context) {
  return {
    transition: "pre",
    repo: context.repo,
    manifest: ".team-harness/quality.json",
    base: context.base,
    candidate: "HEAD",
    allowlist: context.allowlist,
  };
}

async function persistBaseline(context, result) {
  const baseline = path.join(context.repo, ".git", "cleaner-baseline.json");
  await writeFile(baseline, `${JSON.stringify(result)}\n`, "utf8");
  return {
    baseline,
    baselineSha256: await fileSha256(baseline),
    allowlistSha256: await fileSha256(context.allowlist),
  };
}

function postOptions(context, evidence) {
  return {
    ...preOptions(context),
    transition: "post",
    ...evidence,
  };
}

function assertClosedResult(result) {
  assert.equal(isCleanerTransitionResult(result), true);
  assert.equal(result.schema_version, CLEANER_TRANSITION_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(result).sort(), [
    "allowlist",
    "baseline",
    "duration_ms",
    "error_code",
    "kind",
    "quality",
    "schema_version",
    "transition",
    "verdict",
  ]);
}

console.log("=== Deterministic cleaner and CRAP transition ===");

await check("a bounded cleanup preserves behavior and improves CRAP before Freeze", async () => {
  await repository(async (context) => {
    const pre = await runCleanerTransition(preOptions(context));
    assertClosedResult(pre);
    assert.equal(pre.verdict, "pass");
    assert.equal(pre.quality.crap.functions[0].crap, 22.5);
    const evidence = await persistBaseline(context, pre);
    await commitFiles(context.repo, "clean changed source", {
      "src/feature.js": "behavior-ok simple well-covered\n",
    });
    const post = await runCleanerTransition(postOptions(context, evidence));
    assertClosedResult(post);
    assert.equal(post.verdict, "pass");
    assert.equal(post.quality.crap.verdict, "pass");
    assert.equal(post.quality.crap.functions[0].crap, 5);
    assert.equal(post.quality.crap.functions[0].delta, -17.5);
  });
});

await check("the CLI returns closed pre-cleaner evidence", async () => {
  await repository(async (context) => {
    const cli = spawnSync(
      node,
      [
        runnerPath,
        "--transition",
        "pre",
        "--repo",
        context.repo,
        "--manifest",
        ".team-harness/quality.json",
        "--base",
        context.base,
        "--candidate",
        "HEAD",
        "--allowlist",
        context.allowlist,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assertClosedResult(JSON.parse(cli.stdout));
  });
});

await check("the pre-check rejects test paths in the cleaner allowlist", async () => {
  await repository(
    async (context) => {
      const result = await runCleanerTransition(preOptions(context));
      assertClosedResult(result);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "ALLOWLIST_INVALID");
    },
    { allowlistPaths: ["tests/feature.test.js"] },
  );
});

await check("post-check rejects added, deleted, or out-of-allowlist paths", async () => {
  await repository(async (context) => {
    const pre = await runCleanerTransition(preOptions(context));
    const evidence = await persistBaseline(context, pre);
    await commitFiles(context.repo, "escape cleaner scope", {
      "src/feature.js": "behavior-ok simple well-covered\n",
      "src/unplanned.js": "new abstraction\n",
    });
    const post = await runCleanerTransition(postOptions(context, evidence));
    assertClosedResult(post);
    assert.equal(post.verdict, "fail");
    assert.equal(post.error_code, "CLEANER_SCOPE_INVALID");
  });
});

await check("post-check rejects frozen test changes even when the suite stays green", async () => {
  await repository(async (context) => {
    const pre = await runCleanerTransition(preOptions(context));
    const evidence = await persistBaseline(context, pre);
    await commitFiles(context.repo, "weaken test during cleanup", {
      "src/feature.js": "behavior-ok simple well-covered\n",
      "tests/feature.test.js": "weakened\n",
    });
    const post = await runCleanerTransition(postOptions(context, evidence));
    assert.equal(post.verdict, "fail");
    assert.equal(post.error_code, "CLEANER_SCOPE_INVALID");
  });
});

await check("post-check rejects worse or omitted CRAP measurements", async () => {
  await repository(async (context) => {
    const pre = await runCleanerTransition(preOptions(context));
    const evidence = await persistBaseline(context, pre);
    await commitFiles(context.repo, "hide metric", {
      "src/feature.js": "behavior-ok omit-metric\n",
    });
    const post = await runCleanerTransition(postOptions(context, evidence));
    assertClosedResult(post);
    assert.equal(post.verdict, "fail");
    assert.equal(post.error_code, "QUALITY_FAILED");
    assert.equal(post.quality.error_code, "CRAP_REPORT_INCOMPLETE");
  });
});

await check("post-check requires the exact hashed allowlist and baseline", async () => {
  await repository(async (context) => {
    const pre = await runCleanerTransition(preOptions(context));
    const evidence = await persistBaseline(context, pre);
    await commitFiles(context.repo, "clean source", {
      "src/feature.js": "behavior-ok simple well-covered\n",
    });
    const wrongBaseline = await runCleanerTransition(
      postOptions(context, { ...evidence, baselineSha256: "0".repeat(64) }),
    );
    assert.equal(wrongBaseline.error_code, "BASELINE_INVALID");
    const wrongAllowlist = await runCleanerTransition(
      postOptions(context, { ...evidence, allowlistSha256: "0".repeat(64) }),
    );
    assert.equal(wrongAllowlist.error_code, "ALLOWLIST_INVALID");
  });
});

if (failures.length > 0) {
  console.error(`\n${failures.length} cleaner transition check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nAll deterministic cleaner transition checks passed.");
