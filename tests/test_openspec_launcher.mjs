import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { openSpecInvocation } from "../skills/verify/scripts/review-fan.mjs";

const run = promisify(execFile);
const scratch = await mkdtemp(path.join(tmpdir(), "th npx & spaces ' "));
const change = "project-provider-payout-parameters";
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
  // Installed Node may have a real bundled npm; use a fixture node location to
  // select the PATH candidate, then execute the resulting script with real Node.
  const selected = await openSpecInvocation(change, {
    platform: "win32", node: path.join(scratch, "absent-node", "node.exe"), env: { Path: directory },
  });
  const result = await run(process.execPath, selected.args, {
    cwd: scratch, encoding: "utf8", windowsHide: true,
  });
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["--yes", "@fission-ai/openspec@1.9.0", "validate", change, "--strict"], cwd: scratch,
  });
  assert.equal(invocation.command, process.execPath);
  await assert.rejects(openSpecInvocation(change, {
    platform: "win32", node: path.join(scratch, "missing", "node.exe"), env: { Path: "." },
  }), /OPENSPEC_RUNTIME_UNAVAILABLE/);
  await assert.rejects(openSpecInvocation("safe & echo injected", { platform: "win32" }), /ARGUMENT_INVALID/);
  const posix = await openSpecInvocation(change, { platform: "linux" });
  assert.equal(posix.command, "npx");
  assert.deepEqual(posix.args, JSON.parse(result.stdout).args);
  console.log("openspec-launcher: PASS (native argv, spaces/symbols, missing npm, invalid input, POSIX)");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
