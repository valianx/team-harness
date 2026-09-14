import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { openSpecInvocation, validateOpenSpec } from "../skills/verify/scripts/review-fan.mjs";

const run = promisify(execFile);
const scratch = await mkdtemp(path.join(tmpdir(), "th npx & spaces ' "));
const change = "project-provider-payout-parameters";
const archivedChange = "archive/2026-09-14-project-provider-payout-parameters";
try {
  const directory = path.join(scratch, "node installation");
  const cli = path.join(directory, "node_modules/npm/bin/npx-cli.js");
  await mkdir(path.dirname(cli), { recursive: true });
  // An executable fixture observes the actual argv and cwd across the OS boundary.
  await writeFile(cli, "console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\n");
  await writeFile(path.join(scratch, "npx.cmd"), "@echo WORKSPACE_SHIM_MUST_NOT_RUN\r\n");
  const invocation = await openSpecInvocation(change, {
    platform: "win32", node: process.execPath, env: { Path: directory },
  });
  const result = await run(invocation.command, invocation.args, {
    cwd: scratch, encoding: "utf8", windowsHide: true,
  });
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["--yes", "@fission-ai/openspec@1.9.0", "validate", change, "--type", "change", "--strict"], cwd: scratch,
  });
  assert.equal(invocation.command, process.execPath);
  const archivedInvocation = await openSpecInvocation(archivedChange, {
    platform: "win32", node: process.execPath, env: { Path: directory },
  });
  const archivedResult = await run(archivedInvocation.command, archivedInvocation.args, {
    cwd: scratch, encoding: "utf8", windowsHide: true,
  });
  assert.deepEqual(JSON.parse(archivedResult.stdout), {
    args: ["--yes", "@fission-ai/openspec@1.9.0", "validate", archivedChange, "--type", "change", "--strict"], cwd: scratch,
  });
  await validateOpenSpec(scratch, change, { platform: "win32", env: { Path: directory } });
  await writeFile(cli, "process.exit(2);\n");
  await assert.rejects(validateOpenSpec(scratch, change, {
    platform: "win32", env: { Path: directory },
  }), /CHANGE_NOT_VALIDATED/);
  await assert.rejects(openSpecInvocation(change, {
    platform: "win32", node: path.join(scratch, "missing", "node.exe"), env: { Path: "." },
  }), /OPENSPEC_RUNTIME_UNAVAILABLE/);
  for (const invalid of [
    "safe & echo injected",
    "archive/../demo",
    "archive\\2026-09-14-demo",
    "/absolute/change",
  ]) {
    await assert.rejects(openSpecInvocation(invalid, { platform: "win32" }), /ARGUMENT_INVALID/);
  }
  const posix = await openSpecInvocation(change, { platform: "linux" });
  assert.equal(posix.command, "npx");
  assert.deepEqual(posix.args, JSON.parse(result.stdout).args);
  console.log("openspec-launcher: PASS (native execution, validation failure, spaces/symbols, missing npm, invalid input, POSIX)");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
