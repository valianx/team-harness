#!/usr/bin/env node
/** Behavioral coverage for the deterministic quality manifest runner. */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CRAP_REPORT_TOKEN,
  QUALITY_MANIFEST_SCHEMA_VERSION,
  QUALITY_RESULT_SCHEMA_VERSION,
  isQualityResult,
  runQualityChecks,
  validateQualityManifest,
} from "../plugins/team-harness/skills/pipeline/scripts/quality-runner.mjs";

const failures = [];
const node = process.execPath;
const runnerPath = fileURLToPath(
  new URL("../plugins/team-harness/skills/pipeline/scripts/quality-runner.mjs", import.meta.url),
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

function baseManifest(commands, crap = undefined) {
  return {
    schema_version: QUALITY_MANIFEST_SCHEMA_VERSION,
    commands,
    ...(crap === undefined ? {} : { crap }),
  };
}

function command(source = "process.exit(0)", ...args) {
  return {
    argv: [node, "-e", source, ...args],
    working_directory: ".",
    timeout_ms: 10_000,
    version_argv: [node, "--version"],
  };
}

function crapCommand() {
  return command(
    [
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.argv[1], fs.readFileSync('metrics.json'));",
    ].join(" "),
    CRAP_REPORT_TOKEN,
  );
}

function crapReport({ complexity, coverage, status = "new", file = "src/calc.go", symbol = "Calculate" }) {
  return {
    schema_version: 1,
    functions: [
      {
        path: file,
        symbol,
        status,
        complexity,
        coverage_percent: coverage,
      },
    ],
  };
}

async function temporaryRepository({ manifest, candidateFiles = { "src/calc.go": "package calc\n" } }, callback) {
  const repo = await mkdtemp(path.join(tmpdir(), "th-quality-runner-"));
  try {
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "quality-runner@example.invalid");
    git(repo, "config", "user.name", "Quality Runner Test");
    await writeFile(path.join(repo, "README.md"), "baseline\n", "utf8");
    await writeJson(path.join(repo, ".team-harness", "quality.json"), manifest);
    git(repo, "add", "README.md", ".team-harness/quality.json");
    git(repo, "commit", "-q", "-m", "baseline");
    const base = git(repo, "rev-parse", "HEAD");

    for (const [relative, contents] of Object.entries(candidateFiles)) {
      const destination = path.join(repo, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      if (relative.endsWith(".json")) {
        await writeJson(destination, contents);
      } else {
        await writeFile(destination, contents, "utf8");
      }
    }
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "candidate");
    await callback({ repo, base, candidate: git(repo, "rev-parse", "HEAD") });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

function options(repo, base, checks, extra = {}) {
  return {
    repo,
    manifest: ".team-harness/quality.json",
    base,
    candidate: "HEAD",
    checkpoint: "quality-test",
    checks,
    requiredChecks: checks,
    ...extra,
  };
}

function assertClosedResult(result) {
  assert.equal(isQualityResult(result), true);
  assert.equal(result.schema_version, QUALITY_RESULT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(result).sort(), [
    "baseline",
    "checkpoint",
    "commands",
    "crap",
    "duration_ms",
    "error_code",
    "kind",
    "manifest",
    "repository",
    "schema_version",
    "verdict",
  ]);
}

console.log("=== Deterministic quality runner ===");

await check("a clean immutable candidate runs exact argv commands and emits bounded evidence", async () => {
  const secret = "ARGV-SECRET-MUST-NOT-APPEAR";
  const manifest = baseManifest({
    test: command("process.stdout.write('ok')", secret),
    lint: command("process.stderr.write('clean')"),
  });
  await temporaryRepository({ manifest }, async ({ repo, base, candidate }) => {
    const result = await runQualityChecks(options(repo, base, ["test", "lint"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "pass");
    assert.equal(result.error_code, null);
    assert.equal(result.repository.base_commit, base);
    assert.equal(result.repository.candidate_commit, candidate);
    assert.deepEqual(result.repository.changed_paths, ["src/calc.go"]);
    assert.deepEqual(result.commands.map((entry) => entry.id), ["test", "lint"]);
    assert.ok(result.commands.every((entry) => entry.verdict === "pass"));
    assert.ok(result.commands.every((entry) => /^[0-9a-f]{64}$/.test(entry.command_sha256)));
    assert.ok(result.commands.every((entry) => /^[0-9a-f]{64}$/.test(entry.version_fingerprint)));
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(node), false);

    const extraRepositoryField = structuredClone(result);
    extraRepositoryField.repository.untrusted = true;
    assert.equal(isQualityResult(extraRepositoryField), false);
    const extraCommandField = structuredClone(result);
    extraCommandField.commands[0].untrusted = true;
    assert.equal(isQualityResult(extraCommandField), false);
  });
});

await check("the CLI returns the same closed JSON contract and a useful process status", async () => {
  const manifest = baseManifest({ test: command() });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const child = spawnSync(
      node,
      [
        runnerPath,
        "--repo",
        repo,
        "--manifest",
        ".team-harness/quality.json",
        "--base",
        base,
        "--candidate",
        "HEAD",
        "--checkpoint",
        "cli-test",
        "--checks",
        "test",
        "--required-checks",
        "test",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(child.status, 0);
    assert.equal(child.stderr, "");
    const result = JSON.parse(child.stdout);
    assertClosedResult(result);
    assert.equal(result.verdict, "pass");

    const emptyRequired = spawnSync(
      node,
      [
        runnerPath,
        "--repo",
        repo,
        "--manifest",
        ".team-harness/quality.json",
        "--base",
        base,
        "--candidate",
        "HEAD",
        "--checkpoint",
        "cli-empty-required",
        "--checks",
        "test",
        "--required-checks",
        "",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(emptyRequired.status, 0, emptyRequired.stderr);
    const emptyResult = JSON.parse(emptyRequired.stdout);
    assertClosedResult(emptyResult);
    assert.equal(emptyResult.verdict, "pass");
  });
});

await check("invalid manifests and missing selected commands fail closed", async () => {
  const invalid = { schema_version: 1, commands: { arbitrary: command() } };
  await temporaryRepository({ manifest: invalid }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "MANIFEST_INVALID");
  });

  const manifest = baseManifest({ lint: command() });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "REQUIRED_CHECKS_MISSING");
  });

  const invalidTestContract = {
    ...baseManifest({ test: command() }),
    test_contract: { path_rules: [{ type: "glob", value: "tests/**" }] },
  };
  await temporaryRepository({ manifest: invalidTestContract }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "MANIFEST_INVALID");
  });
});

await check("package-manager exec and download shims are rejected before launch", async () => {
  const forbidden = [
    ["npx", "vitest"], ["pnpx", "vitest"], ["bunx", "vitest"],
    ["npm", "exec", "vitest"], ["npm", "x", "vitest"],
    ["pnpm", "dlx", "vitest"],
    ["yarn", "exec", "vitest"], ["yarn", "dlx", "vitest"],
    ["bun", "x", "vitest"], ["corepack", "pnpm", "dlx", "vitest"],
  ];
  for (const argv of forbidden) {
    assert.throws(
      () => validateQualityManifest(baseManifest({ test: { argv } })),
      error => error?.message === "NON_HERMETIC_COMMAND",
      argv.join(" "),
    );
  }
  assert.doesNotThrow(() => validateQualityManifest(baseManifest({ test: { argv: ["pnpm", "run", "test"] } })));
  assert.doesNotThrow(() => validateQualityManifest(baseManifest({ test: { argv: ["node_modules/.bin/vitest", "run"] } })));

  const manifest = baseManifest({ test: { argv: ["pnpm", "dlx", "vitest"] } });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "NON_HERMETIC_COMMAND");
    assert.deepEqual(result.commands, []);
  });
});

await check("pnpm exec resolves only an existing linked local binary without launching pnpm", async () => {
  const manifest = baseManifest({ test: { argv: ["pnpm", "exec", "vitest", "run", "focused"] } });
  await temporaryRepository({
    manifest,
    candidateFiles: { ".gitignore": "node_modules/\n", "src/calc.go": "package calc\n" },
  }, async ({ repo, base }) => {
    const binary = path.join(repo, "node_modules", ".bin", "vitest");
    await mkdir(path.dirname(binary), { recursive: true });
    await writeFile(binary, "#!/usr/bin/env node\nprocess.exit(process.argv.slice(2).join(' ') === 'run focused' ? 0 : 9);\n");
    await chmod(binary, 0o755);
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "pass");
    assert.equal(result.commands[0].execution_resolution, "linked-local-bin");
    assert.match(result.commands[0].execution_argv_sha256, /^[a-f0-9]{64}$/);
  });

  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "PREREQUISITE_UNAVAILABLE");
    assert.deepEqual(result.commands, []);
  });
});

await check("required quality coverage cannot pass with omitted controls", async () => {
  const manifest = baseManifest({ test: command(), build: command(), accessibility: command() });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const incomplete = await runQualityChecks(options(repo, base, ["test"], {
      requiredChecks: ["test", "build", "accessibility"],
    }));
    assert.equal(incomplete.verdict, "fail");
    assert.equal(incomplete.error_code, "REQUIRED_CHECKS_MISSING");
    assert.deepEqual(incomplete.commands, []);

    const complete = await runQualityChecks(options(repo, base, ["test", "build", "accessibility"], {
      requiredChecks: ["test", "build", "accessibility"],
    }));
    assert.equal(complete.verdict, "pass", JSON.stringify(complete));
    assert.deepEqual(complete.commands.map((entry) => entry.id), ["test", "build", "accessibility"]);
  });
});

await check("callers cannot omit the required quality set", async () => {
  const manifest = baseManifest({ test: command() });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const withoutRequiredChecks = options(repo, base, ["test"]);
    delete withoutRequiredChecks.requiredChecks;
    const result = await runQualityChecks(withoutRequiredChecks);
    assertClosedResult(result);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "ARGUMENT_INVALID");
    assert.deepEqual(result.commands, []);
  });
});

await check("missing external prerequisites are unavailable rather than pass", async () => {
  const manifest = baseManifest({
    permissions: { ...command(), required_environment: ["TH_TEST_AUTH0_IDENTIFIER_MISSING"] },
  });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["permissions"], {
      requiredChecks: ["permissions"],
    }));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "PREREQUISITE_UNAVAILABLE");
    assert.equal(JSON.stringify(result).includes("AUTH0"), false);
  });
});

await check("dirty candidates and quality commands that mutate tracked files fail closed", async () => {
  const manifest = baseManifest({ test: command() });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    await writeFile(path.join(repo, "untracked.txt"), "dirty\n", "utf8");
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.error_code, "WORKTREE_DIRTY");
  });

  const mutating = baseManifest({
    test: command("require('node:fs').appendFileSync('src/calc.go', '// mutation\\n')"),
  });
  await temporaryRepository({ manifest: mutating }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "WORKTREE_MUTATED");
  });
});

await check("tool failures and missing executables remain bounded and fail closed", async () => {
  const failing = baseManifest({ test: command("process.stderr.write('expected failure'); process.exit(7)") });
  await temporaryRepository({ manifest: failing }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.error_code, "COMMAND_FAILED");
    assert.equal(result.commands[0].execution.exit_code, 7);
    assert.equal(result.commands[0].execution.stderr.tail, "expected failure");
  });

  const missing = baseManifest({ test: { argv: ["missing-quality-tool-do-not-leak"] } });
  await temporaryRepository({ manifest: missing }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.error_code, "COMMAND_FAILED");
    assert.equal(result.commands[0].execution.outcome, "spawn_error");
    assert.equal(JSON.stringify(result).includes("missing-quality-tool"), false);
  });
});

await check("CRAP is computed from complexity and coverage and improves against an immutable baseline", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 12, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\nfunc Calculate() {}\n",
        "metrics.json": crapReport({ complexity: 10, coverage: 50 }),
      },
    },
    async ({ repo, base, candidate }) => {
      const measured = await runQualityChecks(options(repo, base, ["crap"], { policyMode: "measure" }));
      assert.equal(measured.verdict, "pass");
      assert.equal(measured.crap.verdict, "not_applied");
      assert.equal(measured.crap.functions[0].crap, 22.5);
      const extraMetricField = structuredClone(measured);
      extraMetricField.crap.functions[0].untrusted = true;
      assert.equal(isQualityResult(extraMetricField), false);
      const baselinePath = path.join(repo, ".git", "quality-baseline.json");
      await writeFile(baselinePath, `${JSON.stringify(measured)}\n`, "utf8");
      const baselineSha256 = await fileSha256(baselinePath);

      await writeFile(path.join(repo, "src", "calc.go"), "package calc\nfunc Calculate() { /* simpler */ }\n", "utf8");
      await writeJson(path.join(repo, "metrics.json"), crapReport({ complexity: 8, coverage: 90 }));
      git(repo, "add", "src/calc.go", "metrics.json");
      git(repo, "commit", "-q", "-m", "cleaner");

      const enforced = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: baselinePath,
          baselineSha256,
        }),
      );
      assertClosedResult(enforced);
      assert.equal(enforced.verdict, "pass");
      assert.equal(enforced.baseline.candidate_commit, candidate);
      assert.equal(enforced.crap.verdict, "pass");
      assert.equal(enforced.crap.functions[0].crap, 8.064);
      assert.equal(enforced.crap.functions[0].baseline_crap, 22.5);
      assert.equal(enforced.crap.functions[0].delta, -14.436);
      assert.deepEqual(enforced.crap.functions[0].violations, []);
    },
  );
});

await check("CRAP derives from the same rounded coverage stored in evidence", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 20, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\nfunc Calculate() {}\n",
        "metrics.json": crapReport({ complexity: 5, coverage: 33.333333 }),
      },
    },
    async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["crap"]));
      assertClosedResult(result);
      assert.equal(result.verdict, "pass", JSON.stringify(result));
      const measured = result.crap.functions[0];
      assert.equal(measured.coverage_percent, 33.3333);
      const expected = Number((5 ** 2 * (1 - measured.coverage_percent / 100) ** 3 + 5).toFixed(4));
      assert.equal(measured.crap, expected);
      assert.notEqual(result.error_code, "INTERNAL_ERROR");
    },
  );
});

await check("unsafe changed paths use REPOSITORY_INVALID rather than a size error", async () => {
  const longPath = `${"a".repeat(180)}/${"b".repeat(180)}/${"c".repeat(180)}.go`;
  const manifest = baseManifest({ test: command() });
  await temporaryRepository(
    { manifest, candidateFiles: { [longPath]: "package invalid\n" } },
    async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["test"]));
      assertClosedResult(result);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "REPOSITORY_INVALID");
    },
  );
});

await check("CRAP thresholds and stale baseline manifests cannot be converted into a pass", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 12, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\nfunc Calculate() {}\n",
        "metrics.json": crapReport({ complexity: 6, coverage: 100 }),
      },
    },
    async ({ repo, base }) => {
      const measured = await runQualityChecks(options(repo, base, ["crap"]));
      const baselinePath = path.join(repo, ".git", "quality-baseline.json");
      await writeFile(baselinePath, JSON.stringify(measured), "utf8");
      const baselineSha256 = await fileSha256(baselinePath);

      await writeFile(path.join(repo, "src", "calc.go"), "package calc\nfunc Calculate() { /* worse */ }\n", "utf8");
      await writeJson(path.join(repo, "metrics.json"), crapReport({ complexity: 10, coverage: 0 }));
      git(repo, "add", "src/calc.go", "metrics.json");
      git(repo, "commit", "-q", "-m", "worse cleaner");
      const failed = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: baselinePath,
          baselineSha256,
        }),
      );
      assert.equal(failed.verdict, "fail");
      assert.equal(failed.error_code, "CRAP_POLICY_FAILED");
      assert.deepEqual(failed.crap.functions[0].violations, ["new_function_max", "crap_worsened"]);

      const currentManifest = JSON.parse(await readFile(path.join(repo, ".team-harness", "quality.json"), "utf8"));
      currentManifest.crap.new_function_max = 200;
      await writeJson(path.join(repo, ".team-harness", "quality.json"), currentManifest);
      git(repo, "add", ".team-harness/quality.json");
      git(repo, "commit", "-q", "-m", "change quality policy");
      const stale = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: baselinePath,
          baselineSha256,
        }),
      );
      assert.equal(stale.verdict, "fail");
      assert.equal(stale.error_code, "BASELINE_INVALID");

      await writeFile(baselinePath, `${JSON.stringify(measured)}\n`, "utf8");
      const tampered = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: baselinePath,
          baselineSha256,
        }),
      );
      assert.equal(tampered.verdict, "fail");
      assert.equal(tampered.error_code, "BASELINE_INVALID");
    },
  );
});

await check("CRAP enforcement rejects baseline functions omitted after cleanup", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 12, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\nfunc Calculate() {}\n",
        "metrics.json": crapReport({ complexity: 8, coverage: 80 }),
      },
    },
    async ({ repo, base }) => {
      const measured = await runQualityChecks(options(repo, base, ["crap"]));
      assert.equal(measured.verdict, "pass");
      const baselinePath = path.join(repo, ".git", "quality-baseline.json");
      await writeFile(baselinePath, `${JSON.stringify(measured)}\n`, "utf8");
      const baselineSha256 = await fileSha256(baselinePath);

      await writeFile(path.join(repo, "src", "calc.go"), "package calc\nfunc Calculate() { /* hidden */ }\n", "utf8");
      await writeJson(path.join(repo, "metrics.json"), { schema_version: 1, functions: [] });
      git(repo, "add", "src/calc.go", "metrics.json");
      git(repo, "commit", "-q", "-m", "hide metric");
      const result = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: baselinePath,
          baselineSha256,
        }),
      );
      assertClosedResult(result);
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "CRAP_REPORT_INCOMPLETE");
    },
  );
});

await check("CRAP reports cannot claim unchanged or out-of-scope functions", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 12, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\n",
        "metrics.json": crapReport({ complexity: 2, coverage: 100, file: "src/untouched.go" }),
      },
    },
    async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["crap"]));
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "CRAP_REPORT_INVALID");
    },
  );
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll deterministic quality runner checks passed.");
}
