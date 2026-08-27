#!/usr/bin/env node
/** Behavioral coverage for the deterministic quality manifest runner. */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CRAP_REPORT_TOKEN,
  QUALITY_MANIFEST_SCHEMA_VERSION,
  QUALITY_RESULT_SCHEMA_VERSION,
  isQualityResult,
  resolveLinkedLocalBinary,
  runQualityChecks,
  validateQualityManifest,
} from "../plugins/team-harness/skills/pipeline/scripts/quality-runner.mjs";
import { resolveGitTimeoutMs } from "../plugins/team-harness/skills/pipeline/scripts/quality-lib.mjs";

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
  const workspace = await mkdtemp(path.join(tmpdir(), "th-quality-runner-"));
  const repo = path.join(workspace, "repository");
  const manifestPath = path.join(workspace, ".team-harness", "quality.json");
  try {
    await mkdir(repo);
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "quality-runner@example.invalid");
    git(repo, "config", "user.name", "Quality Runner Test");
    await writeFile(path.join(repo, "README.md"), "baseline\n", "utf8");
    await writeJson(manifestPath, manifest);
    git(repo, "add", "README.md");
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
    await callback({ workspace, repo, manifestPath, base, candidate: git(repo, "rev-parse", "HEAD") });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function options(repo, base, checks, extra = {}) {
  return {
    repo,
    workspace: path.dirname(repo),
    manifest: path.join(path.dirname(repo), ".team-harness", "quality.json"),
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
    "detail",
    "duration_ms",
    "error_code",
    "error_context",
    "kind",
    "manifest",
    "repository",
    "schema_version",
    "verdict",
  ]);
  if (result.verdict === "fail" && result.detail !== null) {
    assert.equal(typeof result.detail, "string");
    assert.ok(result.detail.length <= 200);
    assert.doesNotMatch(result.detail, /[\r\n]/);
  }
}

console.log("=== Deterministic quality runner ===");

await check("the internal git timeout is env-configurable within a clamped range", async () => {
  assert.equal(resolveGitTimeoutMs({}), 30_000);
  assert.equal(resolveGitTimeoutMs({ TH_GIT_TIMEOUT_MS: "not-a-number" }), 30_000);
  assert.equal(resolveGitTimeoutMs({ TH_GIT_TIMEOUT_MS: "-1" }), 30_000);
  assert.equal(resolveGitTimeoutMs({ TH_GIT_TIMEOUT_MS: "1" }), 5_000);
  assert.equal(resolveGitTimeoutMs({ TH_GIT_TIMEOUT_MS: "45000" }), 45_000);
  assert.equal(resolveGitTimeoutMs({ TH_GIT_TIMEOUT_MS: "9999999" }), 600_000);
});

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
    assert.equal(result.manifest.path, ".team-harness/quality.json");
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
  await temporaryRepository({ manifest }, async ({ workspace, repo, manifestPath, base }) => {
    const child = spawnSync(
      node,
      [
        runnerPath,
        "--repo",
        repo,
        "--workspace",
        workspace,
        "--manifest",
        manifestPath,
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
        "--workspace",
        workspace,
        "--manifest",
        manifestPath,
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
  const invalid = { schema_version: 1, commands: { "Not-A-Valid-Id": command() } };
  await temporaryRepository({ manifest: invalid }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "MANIFEST_INVALID");
    assert.match(result.detail, /command id/);
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

await check("unselected command runtimes stay isolated while selected failures name their field", async () => {
  const manifest = baseManifest({
    format_check: command(),
    database: {
      argv: ["pnpm", "permissions:check"],
      version_argv: ["pnpm", "--version"],
    },
  });
  assert.throws(
    () => validateQualityManifest(manifest),
    error => error?.message === "NON_HERMETIC_COMMAND",
  );
  assert.doesNotThrow(() => validateQualityManifest(manifest, { selectedChecks: ["format_check"] }));

  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const isolated = await runQualityChecks(options(repo, base, ["format_check"]));
    assertClosedResult(isolated);
    assert.equal(isolated.verdict, "pass", JSON.stringify(isolated));
    assert.equal(isolated.error_context, null);
    assert.deepEqual(isolated.commands.map((entry) => entry.id), ["format_check"]);

    const selected = await runQualityChecks(options(repo, base, ["database"]));
    assertClosedResult(selected);
    assert.equal(selected.verdict, "fail");
    assert.equal(selected.error_code, "NON_HERMETIC_COMMAND");
    assert.deepEqual(selected.error_context, { command_id: "database", field: "version_argv" });
    assert.deepEqual(selected.commands, []);
  });
});

await check("package-manager exec and download shims are rejected before launch", async () => {
  const forbidden = [
    ["npx", "vitest"], ["pnpx", "vitest"], ["bunx", "vitest"],
    ["npx.bat", "vitest"], ["pnpx.ps1", "vitest"],
    ["npm", "exec", "vitest"], ["npm", "x", "vitest"],
    ["npm", "--prefix", ".", "exec", "vitest"],
    ["pnpm", "dlx", "vitest"],
    ["pnpm.ps1", "--config.verify-deps-before-run=false", "dlx", "vitest"],
    ["yarn", "exec", "vitest"], ["yarn", "dlx", "vitest"],
    ["bun", "x", "vitest"], ["corepack", "pnpm", "dlx", "vitest"],
    ["corepack", "--install-directory", ".", "pnpm.cmd", "--offline", "dlx", "vitest"],
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
    candidateFiles: { ".gitignore": "node_modules\n", "src/calc.go": "package calc\n" },
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

await check("direct node_modules binaries must resolve inside the current repository", async () => {
  const manifest = baseManifest({ test: { argv: ["./node_modules/.bin/storybook", "build"] } });
  await temporaryRepository({
    manifest,
    candidateFiles: { ".gitignore": "node_modules/\n", "src/calc.go": "package calc\n" },
  }, async ({ repo, base }) => {
    const binary = path.join(repo, "node_modules", ".bin", "storybook");
    await mkdir(path.dirname(binary), { recursive: true });
    await writeFile(binary, "#!/usr/bin/env node\nprocess.exit(process.argv[2] === 'build' ? 0 : 9);\n");
    await chmod(binary, 0o755);
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "pass", JSON.stringify(result));
    assert.equal(result.commands[0].execution_resolution, "repository-local-bin");
  });

  const sharedDependencies = await mkdtemp(path.join(tmpdir(), "th-quality-shared-deps-"));
  try {
    const externalBinary = path.join(sharedDependencies, ".bin", "storybook");
    await mkdir(path.dirname(externalBinary), { recursive: true });
    await writeFile(externalBinary, "#!/usr/bin/env node\nprocess.exit(0);\n");
    await chmod(externalBinary, 0o755);
    await temporaryRepository({
      manifest,
      candidateFiles: { ".gitignore": "node_modules\n", "src/calc.go": "package calc\n" },
    }, async ({ repo, base }) => {
      await symlink(sharedDependencies, path.join(repo, "node_modules"), "dir");
      const result = await runQualityChecks(options(repo, base, ["test"]));
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "PREREQUISITE_UNAVAILABLE");
      assert.deepEqual(result.commands, []);
    });
  } finally {
    await rm(sharedDependencies, { recursive: true, force: true });
  }
});

await check("pnpm package scripts resolve to existing local binaries without launching pnpm", async () => {
  for (const argv of [
    ["pnpm", "test", "--", "--runInBand"],
    ["pnpm", "run", "storybook", "--", "--no-open"],
  ]) {
    const script = argv.includes("storybook") ? "storybook" : "test";
    const tool = script === "storybook" ? "storybook" : "vitest";
    const expected = script === "storybook" ? "dev --no-open" : "run --runInBand";
    const manifest = baseManifest({ test: { argv } });
    await temporaryRepository({
      manifest,
      candidateFiles: {
        ".gitignore": "node_modules/\n",
        "package.json": { scripts: { test: "vitest run", storybook: "storybook dev" } },
        "src/calc.go": "package calc\n",
      },
    }, async ({ repo, base }) => {
      const binary = path.join(repo, "node_modules", ".bin", tool);
      await mkdir(path.dirname(binary), { recursive: true });
      await writeFile(binary, `#!/usr/bin/env node\nprocess.exit(process.argv.slice(2).join(' ') === ${JSON.stringify(expected)} ? 0 : 9);\n`);
      await chmod(binary, 0o755);
      const result = await runQualityChecks(options(repo, base, ["test"]));
      assert.equal(result.verdict, "pass", JSON.stringify(result));
      assert.equal(result.commands[0].execution_resolution, "linked-local-script");
    });
  }

  for (const script of ["vitest run && echo unsafe", "vitest run | tee result.log"]) {
    const manifest = baseManifest({ test: { argv: ["pnpm", "test"] } });
    await temporaryRepository({
      manifest,
      candidateFiles: { "package.json": { scripts: { test: script } } },
    }, async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["test"]));
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "NON_HERMETIC_COMMAND");
      assert.deepEqual(result.commands, []);
    });
  }

  const missingManifest = baseManifest({ test: { argv: ["pnpm", "missing-script"] } });
  await temporaryRepository({
    manifest: missingManifest,
    candidateFiles: { "package.json": { scripts: {} } },
  }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "PREREQUISITE_UNAVAILABLE");
  });
});

await check("pnpm package scripts unwrap repository-local node scripts without touching the package-manager store", async () => {
  const manifest = baseManifest({ permissions: { argv: ["pnpm", "--config.verify-deps-before-run=false", "permissions:matrix"] } });
  await temporaryRepository({
    manifest,
    candidateFiles: {
      "package.json": { scripts: { "permissions:matrix": "node scripts/generate-permissions-matrix.mjs --check" } },
      "scripts/generate-permissions-matrix.mjs": "process.exit(process.argv[2] === '--check' ? 0 : 9);\n",
    },
  }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["permissions"]));
    assert.equal(result.verdict, "pass", JSON.stringify(result));
    assert.equal(result.commands[0].execution_resolution, "repository-local-node-script");
    assert.match(result.commands[0].execution_argv_sha256, /^[a-f0-9]{64}$/);
  });

  for (const scriptValue of [
    "node ../outside.mjs --check",
    "node --eval process.exit(0)",
    "node scripts/check.mjs && echo unsafe",
  ]) {
    const invalidManifest = baseManifest({ permissions: { argv: ["pnpm", "permissions:matrix"] } });
    await temporaryRepository({
      manifest: invalidManifest,
      candidateFiles: { "package.json": { scripts: { "permissions:matrix": scriptValue } } },
    }, async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["permissions"]));
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "NON_HERMETIC_COMMAND");
    });
  }
});

await check("Windows linked-local shims use an explicit PowerShell interpreter without shell mode", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "th-quality-windows-shim-"));
  try {
    const shim = path.join(repo, "node_modules", ".bin", "vitest.ps1");
    await mkdir(path.dirname(shim), { recursive: true });
    await writeFile(shim, "exit 0\n", "utf8");
    const resolved = await resolveLinkedLocalBinary("vitest.cmd", ["run"], repo, repo, "linked-local-bin", "win32");
    assert.deepEqual(resolved.argv.slice(0, 7), [
      "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    ]);
    assert.equal(resolved.argv[7], shim);
    assert.equal(resolved.argv[8], "run");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
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
    await writeFile(path.join(repo, "README.md"), "modified tracked content\n", "utf8");
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

await check("untracked command byproducts are not worktree evidence", async () => {
  const manifest = baseManifest({
    test: command("require('node:fs').mkdirSync('.test-cache', { recursive: true }); require('node:fs').writeFileSync('.test-cache/state.json', '{}')"),
  });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    await writeFile(path.join(repo, "preexisting-untracked.log"), "scratch\n", "utf8");
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "pass", JSON.stringify(result));
    assert.equal(result.error_code, null);
  });
});

await check("tool failures, spawn failures, and timeouts carry distinct causes", async () => {
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
    assertClosedResult(result);
    assert.equal(result.error_code, "SPAWN_FAILED");
    assert.equal(result.commands[0].execution.outcome, "spawn_error");
    assert.equal(JSON.stringify(result).includes("missing-quality-tool"), false);
  });

  const hanging = baseManifest({
    test: { argv: [node, "-e", "setInterval(() => {}, 1000);"], timeout_ms: 250 },
  });
  await temporaryRepository({ manifest: hanging }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "TIMEOUT");
    assert.equal(result.commands[0].execution.outcome, "timed_out");
    assert.match(result.detail, /timed out after 250ms/);
  });
});

await check("a missing manifest is absent rather than invalid", async () => {
  const manifest = baseManifest({ test: command() });
  await temporaryRepository({ manifest }, async ({ workspace, repo, base }) => {
    const absent = await runQualityChecks({
      ...options(repo, base, ["test"]),
      manifest: path.join(workspace, ".team-harness", "no-such-manifest.json"),
    });
    assertClosedResult(absent);
    assert.equal(absent.verdict, "fail");
    assert.equal(absent.error_code, "MANIFEST_ABSENT");
    assert.match(absent.detail, /manifest not found/);

    const malformed = path.join(workspace, ".team-harness", "malformed.json");
    await writeFile(malformed, "{ not json", "utf8");
    const invalid = await runQualityChecks({
      ...options(repo, base, ["test"]),
      manifest: malformed,
    });
    assert.equal(invalid.error_code, "MANIFEST_INVALID");
  });
});

await check("quality manifests stay workspace-bound and outside the product diff", async () => {
  const manifest = baseManifest({ test: command() });
  await temporaryRepository({ manifest }, async ({ workspace, repo, base }) => {
    const repoLocalManifest = path.join(repo, ".team-harness", "quality.json");
    await writeJson(repoLocalManifest, manifest);

    const repoLocal = await runQualityChecks({
      ...options(repo, base, ["test"]),
      manifest: repoLocalManifest,
    });
    assert.equal(repoLocal.error_code, "MANIFEST_INVALID");

    const nestedWorkspace = path.join(repo, "workspaces", "feature");
    const nestedManifest = path.join(nestedWorkspace, ".team-harness", "quality.json");
    await writeFile(path.join(repo, ".git", "info", "exclude"), "/workspaces/\n", "utf8");
    await writeJson(nestedManifest, manifest);
    const ignoredNested = await runQualityChecks({
      ...options(repo, base, ["test"]),
      workspace: nestedWorkspace,
      manifest: nestedManifest,
    });
    assert.equal(ignoredNested.verdict, "pass", JSON.stringify(ignoredNested));
    assert.equal(git(repo, "ls-files", "--", "workspaces/feature/.team-harness/quality.json"), "");

    const relative = await runQualityChecks({
      ...options(repo, base, ["test"]),
      manifest: ".team-harness/quality.json",
    });
    assert.equal(relative.error_code, "ARGUMENT_INVALID");

    const repositoryAsWorkspace = await runQualityChecks({
      ...options(repo, base, ["test"]),
      workspace: repo,
      manifest: repoLocalManifest,
    });
    assert.equal(repositoryAsWorkspace.error_code, "ARGUMENT_INVALID");

    const disjointWorkspace = await mkdtemp(path.join(tmpdir(), "th-quality-disjoint-"));
    try {
      const disjointManifest = path.join(disjointWorkspace, ".team-harness", "quality.json");
      await writeJson(disjointManifest, manifest);
      const disjoint = await runQualityChecks({
        ...options(repo, base, ["test"]),
        workspace: disjointWorkspace,
        manifest: disjointManifest,
      });
      assert.equal(disjoint.verdict, "pass", JSON.stringify(disjoint));
    } finally {
      await rm(disjointWorkspace, { recursive: true, force: true });
    }

    const outsideWorkspace = await mkdtemp(path.join(tmpdir(), "th-quality-outside-"));
    try {
      const outsideManifest = path.join(outsideWorkspace, "quality.json");
      await writeJson(outsideManifest, manifest);
      const escaped = await runQualityChecks({
        ...options(repo, base, ["test"]),
        manifest: outsideManifest,
      });
      assert.equal(escaped.error_code, "MANIFEST_INVALID");
    } finally {
      await rm(outsideWorkspace, { recursive: true, force: true });
    }

    if (process.platform !== "win32") {
      const linkedManifest = path.join(workspace, ".team-harness", "linked-quality.json");
      await symlink(path.join(workspace, ".team-harness", "quality.json"), linkedManifest);
      const symlinked = await runQualityChecks({
        ...options(repo, base, ["test"]),
        manifest: linkedManifest,
      });
      assert.equal(symlinked.error_code, "MANIFEST_INVALID");
    }
  });
});

await check("open command ids are accepted and severity tiers gate the verdict", async () => {
  const manifest = baseManifest({
    test: command(),
    e2e: command(),
    style_scan: { ...command("process.exit(4)"), severity: "advisory" },
  });
  await temporaryRepository({ manifest }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test", "e2e", "style_scan"]));
    assertClosedResult(result);
    assert.equal(result.verdict, "pass", JSON.stringify(result));
    assert.equal(result.error_code, null);
    const advisory = result.commands.find((entry) => entry.id === "style_scan");
    assert.equal(advisory.severity, "advisory");
    assert.equal(advisory.verdict, "fail");
    assert.ok(result.commands.filter((entry) => entry.severity === "blocking").every((entry) => entry.verdict === "pass"));
  });

  const blockingFailure = baseManifest({
    test: command(),
    style_scan: command("process.exit(4)"),
  });
  await temporaryRepository({ manifest: blockingFailure }, async ({ repo, base }) => {
    const result = await runQualityChecks(options(repo, base, ["test", "style_scan"]));
    assert.equal(result.verdict, "fail");
    assert.equal(result.error_code, "COMMAND_FAILED");
  });

  for (const id of ["test", "crap"]) {
    const declaration = id === "crap"
      ? { ...crapCommand(), severity: "advisory" }
      : { ...command(), severity: "advisory" };
    const commands = id === "crap" ? { test: command(), crap: declaration } : { [id]: declaration };
    const floor = baseManifest(commands, id === "crap" ? { new_function_max: 12, changed_function_may_worsen: false } : undefined);
    await temporaryRepository({ manifest: floor }, async ({ repo, base }) => {
      const result = await runQualityChecks(options(repo, base, ["test"]));
      assert.equal(result.verdict, "fail");
      assert.equal(result.error_code, "MANIFEST_INVALID");
      assert.match(result.detail, /acceptance-critical/);
    });
  }
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

await check("a reformatted manifest and a pipeline amend keep baseline evidence valid", async () => {
  const manifest = baseManifest(
    { crap: crapCommand() },
    { new_function_max: 200, changed_function_may_worsen: false },
  );
  await temporaryRepository(
    {
      manifest,
      candidateFiles: {
        "src/calc.go": "package calc\nfunc Calculate() {}\n",
        "metrics.json": crapReport({ complexity: 10, coverage: 50 }),
      },
    },
    async ({ repo, manifestPath, base }) => {
      const measured = await runQualityChecks(options(repo, base, ["crap"]));
      assert.equal(measured.verdict, "pass", JSON.stringify(measured));
      const baselinePath = path.join(repo, ".git", "quality-baseline.json");
      await writeFile(baselinePath, `${JSON.stringify(measured)}\n`, "utf8");
      const baselineSha256 = await fileSha256(baselinePath);

      const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
      const reordered = Object.fromEntries(Object.keys(parsed).sort().reverse().map((key) => [key, parsed[key]]));
      await writeFile(manifestPath, JSON.stringify(reordered), "utf8");

      const reformatted = await runQualityChecks(
        options(repo, base, ["crap"], { policyMode: "enforce", baseline: baselinePath, baselineSha256 }),
      );
      assertClosedResult(reformatted);
      assert.equal(reformatted.verdict, "pass", JSON.stringify(reformatted));
      assert.notEqual(reformatted.manifest.sha256, measured.manifest.sha256);
      assert.equal(reformatted.manifest.canonical_sha256, measured.manifest.canonical_sha256);

      const amendBaselinePath = path.join(repo, ".git", "quality-baseline-amend.json");
      await writeFile(amendBaselinePath, `${JSON.stringify(reformatted)}\n`, "utf8");
      const amendBaselineSha256 = await fileSha256(amendBaselinePath);
      git(repo, "commit", "-q", "--amend", "-m", "re-anchored by assembly");
      const afterAmend = await runQualityChecks(
        options(repo, base, ["crap"], {
          policyMode: "enforce",
          baseline: amendBaselinePath,
          baselineSha256: amendBaselineSha256,
        }),
      );
      assertClosedResult(afterAmend);
      assert.equal(afterAmend.verdict, "pass", JSON.stringify(afterAmend));
      assert.notEqual(afterAmend.repository.candidate_commit, reformatted.repository.candidate_commit);
      assert.equal(afterAmend.repository.candidate_tree, reformatted.repository.candidate_tree);
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
    async ({ repo, manifestPath, base }) => {
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
    async ({ repo, manifestPath, base }) => {
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

      const currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
      currentManifest.crap.new_function_max = 200;
      await writeJson(manifestPath, currentManifest);
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

await check("CLI output persists complete quality evidence and emits only a bounded receipt", async () => {
  const manifest = baseManifest({ test: command("process.stdout.write('ok')") });
  await temporaryRepository({ manifest }, async ({ workspace, repo, manifestPath, base }) => {
    const output = path.join(repo, ".git", "quality-result.json");
    const bridgedScripts = path.join(workspace, "bridged-helper-scripts");
    await symlink(path.dirname(runnerPath), bridgedScripts, process.platform === "win32" ? "junction" : "dir");
    const processResult = spawnSync(node, [
      path.join(bridgedScripts, "quality-runner.mjs"),
      "--repo", repo,
      "--workspace", workspace,
      "--manifest", manifestPath,
      "--base", base,
      "--candidate", "HEAD",
      "--checkpoint", "quality-test",
      "--checks", "test",
      "--required-checks", "test",
      "--output", output,
    ], { cwd: repo, encoding: "utf8", windowsHide: true });
    assert.equal(processResult.status, 0, processResult.stderr || processResult.stdout);
    const receipt = JSON.parse(processResult.stdout);
    const resultBytes = await readFile(output);
    const result = JSON.parse(resultBytes);
    assert.equal(receipt.kind, "team_harness_quality_receipt");
    assert.equal(receipt.verdict, "pass");
    assert.equal(receipt.result_path, output);
    assert.equal(receipt.result_bytes, resultBytes.length);
    assert.equal(receipt.result_sha256, createHash("sha256").update(resultBytes).digest("hex"));
    assert.equal(isQualityResult(result), true);
    assert.equal(result.verdict, "pass");
  });
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll deterministic quality runner checks passed.");
}
