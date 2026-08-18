#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectWorktreeDependencies,
  provisionWorktreeDependencies,
} from "../plugins/team-harness/skills/pipeline/scripts/worktree-dependencies.mjs";

const helper = fileURLToPath(new URL("../plugins/team-harness/skills/pipeline/scripts/worktree-dependencies.mjs", import.meta.url));
const failures = [];

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  [FAIL] ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", windowsHide: true }).trim();
}

async function fixture(callback, { lockfiles = ["pnpm-lock.yaml"] } = {}) {
  const repository = await mkdtemp(path.join(tmpdir(), "th-worktree-dependencies-"));
  try {
    git(repository, "init", "-q");
    git(repository, "config", "user.email", "worktree-dependencies@example.invalid");
    git(repository, "config", "user.name", "Worktree Dependencies");
    await writeFile(path.join(repository, "package.json"), '{"name":"fixture","private":true}\n', "utf8");
    await writeFile(path.join(repository, ".gitignore"), "node_modules/\n", "utf8");
    for (const lockfile of lockfiles) await writeFile(path.join(repository, lockfile), "lockfileVersion: '9.0'\n", "utf8");
    git(repository, "add", ".");
    git(repository, "commit", "-q", "-m", "fixture");
    await callback(repository);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

function success() {
  return {
    ok: true,
    exit_code: 0,
    signal: null,
    error_code: null,
    duration_ms: 1,
    stdout_bytes: 0,
    stderr_bytes: 0,
    stdout_sha256: null,
    stderr_sha256: null,
  };
}

console.log("=== Worktree dependency provisioning ===");

await check("inspect derives the exact frozen-lockfile action", async () => {
  await fixture(async (repository) => {
    const inspected = await inspectWorktreeDependencies({ repository });
    assert.equal(inspected.outcome, "provision-required");
    assert.equal(inspected.node_modules_state, "absent");
    assert.equal(inspected.required_action.cwd, repository);
    assert.equal(inspected.required_action.argv[0], process.execPath);
    assert.match(inspected.required_action.argv[1], /worktree-dependencies\.mjs$/);
    assert.deepEqual(inspected.required_action.argv.slice(2), ["provision", "--repository", repository]);

    const cli = spawnSync(process.execPath, [helper, "inspect", "--repository", repository], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(cli.status, 2);
    assert.equal(cli.stderr, "");
    assert.deepEqual(JSON.parse(cli.stdout).required_action.argv.slice(2), ["provision", "--repository", repository]);
  });
});

await check("provision is automatic, frozen, verified, and idempotent", async () => {
  await fixture(async (repository) => {
    const commands = [];
    const executor = async (argv, cwd) => {
      commands.push({ argv, cwd });
      if (argv[1] === "install") await mkdir(path.join(repository, "node_modules"));
      return success();
    };
    const provisioned = await provisionWorktreeDependencies({ repository, executor });
    assert.equal(provisioned.outcome, "provisioned");
    assert.equal(provisioned.node_modules_state, "local-directory");
    assert.deepEqual(commands.map(entry => entry.argv), [
      ["pnpm", "--version"],
      ["pnpm", "install", "--frozen-lockfile"],
    ]);
    const repeated = await provisionWorktreeDependencies({ repository, executor: async () => { throw new Error("must not execute"); } });
    assert.equal(repeated.outcome, "ready");
  });
});

if (process.platform !== "win32") {
  await check("provision replaces only an untracked cross-checkout symlink", async () => {
    await fixture(async (repository) => {
      const external = await mkdtemp(path.join(tmpdir(), "th-shared-node-modules-"));
      try {
        await writeFile(path.join(external, "sentinel"), "preserved\n", "utf8");
        await symlink(external, path.join(repository, "node_modules"), "dir");
        const provisioned = await provisionWorktreeDependencies({
          repository,
          executor: async (argv) => {
            if (argv[1] === "install") await mkdir(path.join(repository, "node_modules"));
            return success();
          },
        });
        assert.equal(provisioned.outcome, "provisioned");
        assert.equal((await lstat(path.join(repository, "node_modules"))).isSymbolicLink(), false);
        assert.equal(await readFile(path.join(external, "sentinel"), "utf8"), "preserved\n");
      } finally {
        await rm(external, { recursive: true, force: true });
      }
    });
  });

  await check("provision never removes a tracked node_modules symlink", async () => {
    await fixture(async (repository) => {
      const external = await mkdtemp(path.join(tmpdir(), "th-tracked-node-modules-"));
      try {
        await symlink(external, path.join(repository, "node_modules"), "dir");
        git(repository, "add", "-f", "node_modules");
        git(repository, "commit", "-q", "-m", "track dependency link");
        const unavailable = await provisionWorktreeDependencies({
          repository,
          executor: async () => success(),
        });
        assert.equal(unavailable.outcome, "unavailable");
        assert.equal(unavailable.error_code, "TRACKED_NODE_MODULES");
        assert.equal((await lstat(path.join(repository, "node_modules"))).isSymbolicLink(), true);
      } finally {
        await rm(external, { recursive: true, force: true });
      }
    });
  });
}

await check("unavailable provisioning returns the exact recovery action", async () => {
  await fixture(async (repository) => {
    const unavailable = await provisionWorktreeDependencies({
      repository,
      executor: async () => ({ ...success(), ok: false, exit_code: null, error_code: "ENOENT" }),
    });
    assert.equal(unavailable.outcome, "unavailable");
    assert.equal(unavailable.error_code, "PACKAGE_MANAGER_UNAVAILABLE");
    assert.deepEqual(unavailable.required_action.argv.slice(2), ["provision", "--repository", repository]);
    assert.match(unavailable.diagnostic, /Make pnpm available/);
  });
});

await check("missing or ambiguous lockfiles fail closed without mutable resolution", async () => {
  await fixture(async (repository) => {
    const missing = await inspectWorktreeDependencies({ repository });
    assert.equal(missing.outcome, "unavailable");
    assert.equal(missing.error_code, "LOCKFILE_UNAVAILABLE");
  }, { lockfiles: [] });
  await fixture(async (repository) => {
    const ambiguous = await inspectWorktreeDependencies({ repository });
    assert.equal(ambiguous.outcome, "unavailable");
    assert.equal(ambiguous.error_code, "LOCKFILE_AMBIGUOUS");
  }, { lockfiles: ["pnpm-lock.yaml", "yarn.lock"] });
});

if (failures.length > 0) {
  console.error(`\n${failures.length} worktree dependency check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll worktree dependency checks passed.");
}
