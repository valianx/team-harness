#!/usr/bin/env node
/** Behavioral coverage for deterministic pre-implementation test transitions. */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_CONTRACT_SCHEMA_VERSION,
  TEST_CONTRACT_VALIDATION_SCHEMA_VERSION,
  TEST_TRANSITION_SCHEMA_VERSION,
  isTestTransitionResult,
  runTestTransition,
  validateTestContractFile,
} from "../plugins/team-harness/skills/pipeline/scripts/test-transition.mjs";

const failures = [];
const node = process.execPath;
const runnerPath = fileURLToPath(
  new URL("../plugins/team-harness/skills/pipeline/scripts/test-transition.mjs", import.meta.url),
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

function qualityManifest(sourceOverride = null) {
  const source = sourceOverride ?? [
    "const fs = require('node:fs');",
    "const hasTest = fs.existsSync('tests/feature.test.js');",
    "const implemented = fs.readFileSync('feature.txt', 'utf8').trim() === 'implemented';",
    "process.exit(hasTest && implemented ? 0 : 1);",
  ].join(" ");
  return {
    schema_version: 1,
    commands: {
      test: {
        argv: [node, "-e", source],
        working_directory: ".",
        timeout_ms: 10_000,
        version_argv: [node, "--version"],
      },
    },
    test_contract: {
      path_rules: [
        { type: "prefix", value: "tests/" },
        { type: "suffix", value: ".test.js" },
      ],
    },
  };
}

function contract(testPaths = ["tests/feature.test.js"]) {
  return {
    schema_version: TEST_CONTRACT_SCHEMA_VERSION,
    requirements: ["TASK-1-AC-1"],
    test_identifiers: ["feature is implemented"],
    test_paths: testPaths,
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

async function repository(callback, { initialFeature = "missing\n", redFiles, manifest = qualityManifest() } = {}) {
  const repo = await mkdtemp(path.join(tmpdir(), "th-test-transition-"));
  try {
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "test-transition@example.invalid");
    git(repo, "config", "user.name", "Test Transition");
    await writeJson(path.join(repo, ".team-harness", "quality.json"), manifest);
    await writeFile(path.join(repo, "feature.txt"), initialFeature, "utf8");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "baseline");
    const base = git(repo, "rev-parse", "HEAD");
    await commitFiles(repo, "tests first", redFiles ?? { "tests/feature.test.js": "feature contract\n" });
    const contractPath = path.join(repo, ".git", "th-test-contract.json");
    await writeJson(contractPath, contract(Object.keys(redFiles ?? { "tests/feature.test.js": "" })));
    await callback({ repo, base, contractPath });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

function redOptions(repo, base, contractPath) {
  return {
    transition: "red",
    repo,
    manifest: ".team-harness/quality.json",
    base,
    candidate: "HEAD",
    contract: contractPath,
  };
}

async function persistRed(repo, result) {
  const redEvidence = path.join(repo, ".git", "th-test-red.json");
  await writeFile(redEvidence, `${JSON.stringify(result)}\n`, "utf8");
  return { redEvidence, redEvidenceSha256: await fileSha256(redEvidence) };
}

function greenOptions(context, evidence, contractSha256) {
  return {
    ...redOptions(context.repo, context.base, context.contractPath),
    transition: "green",
    contractSha256,
    redEvidence: evidence.redEvidence,
    redEvidenceSha256: evidence.redEvidenceSha256,
  };
}

function assertClosedResult(result) {
  assert.equal(isTestTransitionResult(result), true);
  assert.equal(result.schema_version, TEST_TRANSITION_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(result).sort(), [
    "contract",
    "diagnostic",
    "duration_ms",
    "error_code",
    "kind",
    "quality",
    "red_evidence",
    "schema_version",
    "transition",
    "verdict",
  ]);
}

console.log("=== Deterministic red-to-green test transition ===");

await check("tester contract self-validation uses the transition's exact closed schema", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "th-test-contract-validation-"));
  try {
    const validPath = path.join(root, "valid.json");
    const invalidPath = path.join(root, "invalid.json");
    await writeJson(validPath, contract());
    await writeJson(invalidPath, { ...contract(), requirements: [{ id: "TASK-1-AC-1", test_identifiers: ["feature is implemented"] }] });
    const valid = await validateTestContractFile(validPath);
    assert.equal(valid.schema_version, TEST_CONTRACT_VALIDATION_SCHEMA_VERSION);
    assert.equal(valid.kind, "team_harness_test_contract_validation");
    assert.equal(valid.verdict, "pass");
    assert.match(valid.contract_sha256, /^[0-9a-f]{64}$/);
    const invalid = await validateTestContractFile(invalidPath);
    assert.equal(invalid.verdict, "fail");
    assert.equal(invalid.error_code, "CONTRACT_INVALID");

    const cli = spawnSync(node, [runnerPath, "--validate-contract", invalidPath], { encoding: "utf8", windowsHide: true });
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stdout).error_code, "CONTRACT_INVALID");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await check("tester contract self-validation checks the candidate diff and manifest path rules", async () => {
  await repository(async (context) => {
    const validationContext = {
      repo: context.repo,
      manifest: ".team-harness/quality.json",
      base: context.base,
      candidate: "HEAD",
    };
    const valid = await validateTestContractFile(context.contractPath, validationContext);
    assert.equal(valid.verdict, "pass");

    await writeJson(context.contractPath, contract([
      "tests/feature.test.js",
      "tests/unchanged.test.js",
    ]));
    const unchanged = await validateTestContractFile(context.contractPath, validationContext);
    assert.equal(unchanged.verdict, "fail");
    assert.equal(unchanged.error_code, "TEST_SCOPE_INVALID");

    const cli = spawnSync(
      node,
      [
        runnerPath,
        "--validate-contract",
        context.contractPath,
        "--repo",
        context.repo,
        "--manifest",
        ".team-harness/quality.json",
        "--base",
        context.base,
        "--candidate",
        "HEAD",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stdout).error_code, "TEST_SCOPE_INVALID");
  });

  await repository(
    async (context) => {
      const invalidFixture = await validateTestContractFile(context.contractPath, {
        repo: context.repo,
        manifest: ".team-harness/quality.json",
        base: context.base,
        candidate: "HEAD",
      });
      assert.equal(invalidFixture.verdict, "fail");
      assert.equal(invalidFixture.error_code, "TEST_SCOPE_INVALID");
    },
    {
      redFiles: {
        "tests/feature.test.js": "feature contract\n",
        "scripts/feature/__fixtures__/feature.js": "fixture\n",
      },
    },
  );
});

await check("a test-only failing commit becomes green with identical test blobs and command", async () => {
  await repository(async (context) => {
    const red = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
    assertClosedResult(red);
    assert.equal(red.verdict, "pass");
    assert.equal(red.transition, "red");
    assert.equal(red.quality.verdict, "fail");
    const evidence = await persistRed(context.repo, red);
    const contractSha256 = await fileSha256(context.contractPath);
    await commitFiles(context.repo, "implement feature", { "feature.txt": "implemented\n" });
    const green = await runTestTransition(greenOptions(context, evidence, contractSha256));
    assertClosedResult(green);
    assert.equal(green.verdict, "pass");
    assert.equal(green.transition, "green");
    assert.equal(green.quality.verdict, "pass");
    assert.equal(green.contract.test_inputs[0].blob_sha, red.contract.test_inputs[0].blob_sha);

    const forgedRed = {
      ...green,
      transition: "red",
      red_evidence: null,
    };
    assert.equal(isTestTransitionResult(forgedRed), false);
  });
});

await check("the CLI emits the same closed evidence contract and process status", async () => {
  await repository(async (context) => {
    const cli = spawnSync(
      node,
      [
        runnerPath,
        "--transition",
        "red",
        "--repo",
        context.repo,
        "--manifest",
        ".team-harness/quality.json",
        "--base",
        context.base,
        "--candidate",
        "HEAD",
        "--contract",
        context.contractPath,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const result = JSON.parse(cli.stdout);
    assertClosedResult(result);
    assert.equal(result.verdict, "pass");
  });
});

await check("the CLI persists full evidence atomically and emits a bounded receipt", async () => {
  await repository(async (context) => {
    const output = path.join(context.repo, ".git", "th-red-result.json");
    const cli = spawnSync(
      node,
      [
        runnerPath,
        "--transition", "red",
        "--repo", context.repo,
        "--manifest", ".team-harness/quality.json",
        "--base", context.base,
        "--candidate", "HEAD",
        "--contract", context.contractPath,
        "--output", output,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const receipt = JSON.parse(cli.stdout);
    assert.equal(receipt.kind, "team_harness_test_transition_receipt");
    assert.equal(receipt.verdict, "pass");
    assert.equal(receipt.diagnostic, null);
    assert.equal(receipt.result_path, output);
    const bytes = await readFile(output);
    assert.equal(receipt.result_bytes, bytes.length);
    assert.equal(receipt.result_sha256, createHash("sha256").update(bytes).digest("hex"));
    assertClosedResult(JSON.parse(bytes.toString("utf8")));
    assert.ok(Buffer.byteLength(cli.stdout) < 1024);
  });
});

await check("the CLI also accepts the OpenSpec-style operation plus JSON object", async () => {
  await repository(async (context) => {
    const options = redOptions(context.repo, context.base, context.contractPath);
    delete options.transition;
    const cli = spawnSync(node, [runnerPath, "red", JSON.stringify(options)], { encoding: "utf8", windowsHide: true });
    assert.equal(cli.status, 0, cli.stderr);
    const result = JSON.parse(cli.stdout);
    assertClosedResult(result);
    assert.equal(result.verdict, "pass");
  });
});

await check("an unknown JSON CLI shape fails before command execution", async () => {
  const cli = spawnSync(node, [runnerPath, "red", JSON.stringify({ requirements: [] })], { encoding: "utf8", windowsHide: true });
  assert.equal(cli.status, 1);
  const result = JSON.parse(cli.stdout);
  assert.equal(result.error_code, "ARGUMENT_INVALID");
  assert.equal(result.quality, null);
});

await check("an already-green test does not count as pre-implementation red", async () => {
  await repository(
    async (context) => {
      const result = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
      assertClosedResult(result);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "RED_NOT_OBSERVED");
    },
    { initialFeature: "implemented\n" },
  );
});

await check("red evidence rejects production changes and paths outside declared test rules", async () => {
  await repository(
    async (context) => {
      const result = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
      assertClosedResult(result);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "TEST_SCOPE_INVALID");
    },
    {
      redFiles: {
        "tests/feature.test.js": "feature contract\n",
        "feature.txt": "still missing\n",
      },
    },
  );
});

await check("green fails closed when test content changes after red", async () => {
  await repository(async (context) => {
    const red = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
    assert.equal(red.verdict, "pass");
    const evidence = await persistRed(context.repo, red);
    const contractSha256 = await fileSha256(context.contractPath);
    await commitFiles(context.repo, "rewrite test and implement", {
      "feature.txt": "implemented\n",
      "tests/feature.test.js": "weakened contract\n",
    });
    const green = await runTestTransition(greenOptions(context, evidence, contractSha256));
    assertClosedResult(green);
    assert.equal(green.verdict, "fail");
    assert.equal(green.error_code, "TEST_INPUT_CHANGED");
  });
});

await check("green fails closed when the manifest or exact test command changes", async () => {
  await repository(async (context) => {
    const red = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
    assert.equal(red.verdict, "pass");
    const evidence = await persistRed(context.repo, red);
    const contractSha256 = await fileSha256(context.contractPath);
    const changedManifest = qualityManifest();
    changedManifest.test_contract.path_rules.push({ type: "segment", value: "test" });
    await writeJson(path.join(context.repo, ".team-harness", "quality.json"), changedManifest);
    await writeFile(path.join(context.repo, "feature.txt"), "implemented\n", "utf8");
    git(context.repo, "add", ".");
    git(context.repo, "commit", "-q", "-m", "change manifest and implement");
    const green = await runTestTransition(greenOptions(context, evidence, contractSha256));
    assertClosedResult(green);
    assert.equal(green.verdict, "fail");
    assert.equal(green.error_code, "TEST_INPUT_CHANGED");
  });
});

await check("green requires hashed red evidence and a green test result", async () => {
  await repository(async (context) => {
    const red = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
    assert.equal(red.verdict, "pass");
    const evidence = await persistRed(context.repo, red);
    const contractSha256 = await fileSha256(context.contractPath);

    const wrongHash = greenOptions(context, { ...evidence, redEvidenceSha256: "0".repeat(64) }, contractSha256);
    const invalidEvidence = await runTestTransition(wrongHash);
    assert.equal(invalidEvidence.error_code, "RED_EVIDENCE_INVALID");

    const stillRed = await runTestTransition(greenOptions(context, evidence, contractSha256));
    assertClosedResult(stillRed);
    assert.equal(stillRed.verdict, "fail");
    assert.equal(stillRed.error_code, "GREEN_NOT_OBSERVED");
    assert.equal(stillRed.diagnostic.stage, "test-command");
    assert.equal(stillRed.diagnostic.quality_error_code, "COMMAND_FAILED");
    assert.equal(stillRed.diagnostic.command_id, "test");
    assert.equal(stillRed.diagnostic.command_verdict, "fail");

    const output = path.join(context.repo, ".git", "th-green-failure.json");
    const cli = spawnSync(
      node,
      [runnerPath, JSON.stringify({ ...greenOptions(context, evidence, contractSha256), output })],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 1);
    const receipt = JSON.parse(cli.stdout);
    assert.equal(receipt.error_code, "GREEN_NOT_OBSERVED");
    assert.equal(receipt.diagnostic.stage, "test-command");
    assert.equal(receipt.diagnostic.quality_error_code, "COMMAND_FAILED");
    assert.equal(receipt.diagnostic.command_id, "test");
    assert.ok(Buffer.byteLength(cli.stdout) < 1024);
  });
});

await check("green distinguishes a quality postcondition failure and retains bounded test diagnostics", async () => {
  const source = [
    "const fs = require('node:fs');",
    "const implemented = fs.readFileSync('feature.txt', 'utf8').trim() === 'implemented';",
    "if (!implemented) process.exit(1);",
    "process.stdout.write('global suite passed');",
    "fs.appendFileSync('feature.txt', ' mutation');",
  ].join(" ");
  await repository(async (context) => {
    const red = await runTestTransition(redOptions(context.repo, context.base, context.contractPath));
    assert.equal(red.verdict, "pass");
    const evidence = await persistRed(context.repo, red);
    const contractSha256 = await fileSha256(context.contractPath);
    await commitFiles(context.repo, "implement feature", { "feature.txt": "implemented\n" });
    const green = await runTestTransition(greenOptions(context, evidence, contractSha256));
    assertClosedResult(green);
    assert.equal(green.verdict, "fail");
    assert.equal(green.error_code, "QUALITY_RUNNER_FAILED");
    assert.equal(green.quality.error_code, "WORKTREE_MUTATED");
    assert.equal(green.diagnostic.stage, "quality-postcondition");
    assert.equal(green.diagnostic.quality_error_code, "WORKTREE_MUTATED");
    assert.equal(green.diagnostic.command_verdict, "pass");
    assert.equal(green.diagnostic.stdout_tail_available, true);
    assert.equal(green.quality.commands[0].execution.stdout.tail, "global suite passed");
  }, { manifest: qualityManifest(source) });
});

if (failures.length > 0) {
  console.error(`\n${failures.length} test transition check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nAll deterministic test transition checks passed.");
