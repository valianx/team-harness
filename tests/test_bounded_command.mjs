#!/usr/bin/env node
/** Behavioral coverage for bounded argv command output (AC12). */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOUNDED_COMMAND_SCHEMA_VERSION,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  MAX_CAPTURE_BYTES_PER_STREAM,
  MAX_RENDERED_TAIL_BYTES_PER_STREAM,
  isBoundedCommandEnvelope,
  runBoundedCommand,
} from "../plugins/team-harness/skills/pipeline/scripts/bounded-command.mjs";

const failures = [];
const node = process.execPath;
const boundedCommandPath = fileURLToPath(
  new URL("../plugins/team-harness/skills/pipeline/scripts/bounded-command.mjs", import.meta.url),
);

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  [FAIL] ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function temporaryRoot(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-bounded-command-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function nodeCommand(source, ...args) {
  return { argv: [node, "-e", source, ...args] };
}

function runCli(...args) {
  const child = spawnSync(node, [boundedCommandPath, ...args], { encoding: "utf8" });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  return JSON.parse(child.stdout);
}

function assertClosedEnvelope(result) {
  assert.equal(isBoundedCommandEnvelope(result), true);
  assert.equal(result.schema_version, BOUNDED_COMMAND_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(result).sort(), [
    "duration_ms",
    "error_code",
    "exit_code",
    "kind",
    "outcome",
    "schema_version",
    "signal",
    "stderr",
    "stdout",
  ]);
  for (const stream of [result.stdout, result.stderr]) {
    assert.deepEqual(Object.keys(stream).sort(), ["bytes", "tail", "truncated"]);
    if (stream.tail !== null) {
      assert.ok(Buffer.byteLength(stream.tail, "utf8") <= MAX_RENDERED_TAIL_BYTES_PER_STREAM);
      assert.equal(/[\x00-\x1f\x7f]/.test(stream.tail), false);
    }
  }
}

console.log("=== Bounded command output (AC12) ===");

await check("the helper remains a bounded executor rather than an exact-command route manifest", async () => {
  const source = await readFile(boundedCommandPath, "utf8");
  assert.match(source, /large, verbose, or\s+\* volume-unknown intermediate output/);
  assert.match(source, /Routine commands with expected small,\s+\* bounded results execute directly/);
  assert.doesNotMatch(source, /DIRECT_COMMAND_MANIFEST|classifyCommandOutputRoute/);
  assert.doesNotMatch(source, /\/usr\/bin\/(?:true|false)/);
});

await check("success counts stdout and stderr independently but exposes no payload", async () => {
  const argvSecret = "COMMAND_ARGV_SECRET_CANARY";
  const result = await runBoundedCommand(
    nodeCommand(
      "process.stdout.write(Buffer.from([0x6f, 0x75, 0x74])); process.stderr.write(Buffer.from([0x65, 0x72, 0x72]));",
      argvSecret,
    ),
  );

  assertClosedEnvelope(result);
  assert.equal(result.outcome, "completed");
  assert.equal(result.error_code, null);
  assert.equal(result.exit_code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.bytes, 3);
  assert.equal(result.stderr.bytes, 3);
  assert.equal(result.stdout.truncated, false);
  assert.equal(result.stderr.truncated, false);
  assert.equal(result.stdout.tail, null);
  assert.equal(result.stderr.tail, null);
  assert.equal(JSON.stringify(result).includes(argvSecret), false);
  assert.equal(JSON.stringify(result).includes(node), false);
});

await check("an explicit success diagnostic exposes only sanitized bounded tails", async () => {
  const marker = "SUCCESS-DIAGNOSTIC-TAIL";
  const result = await runBoundedCommand({
    ...nodeCommand(
      [
        `process.stdout.write(Buffer.alloc(${MAX_CAPTURE_BYTES_PER_STREAM}, 0x58));`,
        `process.stdout.write(${JSON.stringify(marker)});`,
        "process.stderr.write(Buffer.from([0x1b,0x5b,0x33,0x31,0x6d,0x4f,0x4b,0x1b,0x5b,0x30,0x6d]));",
      ].join(" "),
    ),
    includeSuccessDiagnostic: true,
  });

  assertClosedEnvelope(result);
  assert.equal(result.outcome, "completed");
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout.bytes, MAX_CAPTURE_BYTES_PER_STREAM + Buffer.byteLength(marker, "utf8"));
  assert.equal(result.stdout.truncated, true);
  assert.equal(Buffer.byteLength(result.stdout.tail, "utf8"), MAX_RENDERED_TAIL_BYTES_PER_STREAM);
  assert.ok(result.stdout.tail.endsWith(marker));
  assert.equal(result.stderr.bytes, 11);
  assert.equal(result.stderr.truncated, false);
  assert.equal(result.stderr.tail, "OK");
});

await check("tail truncation is reported at the rendered 8 KiB boundary", async () => {
  const result = await runBoundedCommand({
    ...nodeCommand(
      `process.stdout.write(Buffer.alloc(${MAX_RENDERED_TAIL_BYTES_PER_STREAM + 1}, 0x58)); process.exitCode = 1;`,
    ),
    includeSuccessDiagnostic: true,
  });

  assertClosedEnvelope(result);
  assert.equal(result.stdout.bytes, MAX_RENDERED_TAIL_BYTES_PER_STREAM + 1);
  assert.equal(result.stdout.truncated, true);
  assert.equal(Buffer.byteLength(result.stdout.tail, "utf8"), MAX_RENDERED_TAIL_BYTES_PER_STREAM);
});

await check("the success-diagnostic CLI flag must appear before the separator", async () => {
  const success = runCli(
    "--success-diagnostic",
    "--",
    node,
    "-e",
    "process.stdout.write(Buffer.from([0x1b,0x5b,0x33,0x32,0x6d,0x43,0x4c,0x49,0x1b,0x5b,0x30,0x6d]));",
  );
  assertClosedEnvelope(success);
  assert.equal(success.outcome, "completed");
  assert.equal(success.stdout.tail, "CLI");

  const secret = "CLI-ORDER-SECRET-MUST-NOT-LEAK";
  for (const invalidArgs of [
    ["--success-diagnostic", node, "-e", `process.stdout.write(${JSON.stringify(secret)});`],
    ["--", "--success-diagnostic", secret],
    ["--unexpected", "--", node, "-e", `process.stdout.write(${JSON.stringify(secret)});`],
  ]) {
    const invalid = runCli(...invalidArgs);
    assertClosedEnvelope(invalid);
    assert.equal(invalid.outcome, "argument_invalid");
    assert.equal(invalid.error_code, "ARGUMENT_INVALID");
    assert.equal(JSON.stringify(invalid).includes(secret), false);
  }
});

await check("failure tails strip ANSI and safely render binary/control bytes per stream", async () => {
  const result = await runBoundedCommand(
    nodeCommand(
      [
        "process.stdout.write(Buffer.from([0x1b,0x5b,0x33,0x31,0x6d,0x52,0x45,0x44,0x1b,0x5b,0x30,0x6d]));",
        "process.stderr.write(Buffer.from([0x41,0x00,0x0a,0x1b,0x5b,0x33,0x32,0x6d,0x42,0x1b,0x5b,0x30,0x6d]));",
        "process.exitCode = 7;",
      ].join(" "),
    ),
  );

  assertClosedEnvelope(result);
  assert.equal(result.outcome, "completed");
  assert.equal(result.exit_code, 7);
  assert.equal(result.stdout.bytes, 12);
  assert.equal(result.stderr.bytes, 13);
  assert.equal(result.stdout.tail, "RED");
  assert.equal(result.stderr.tail, "A\\x00\\x0AB");
  assert.equal(result.stdout.tail.includes("\u001b"), false);
  assert.equal(result.stderr.tail.includes("\u001b"), false);
});

await check("a giant single line stays bounded, reports every byte, and marks truncation", async () => {
  const marker = "GIANT-LINE-TAIL";
  const giantStdoutBytes = MAX_CAPTURE_BYTES_PER_STREAM + 4096;
  const giantStderrBytes = MAX_CAPTURE_BYTES_PER_STREAM + 1;
  const result = await runBoundedCommand(
    nodeCommand(
      [
        "const out = Number(process.argv[1]);",
        "const err = Number(process.argv[2]);",
        "process.stdout.write(Buffer.alloc(out, 0x58));",
        `process.stdout.write(${JSON.stringify(marker)});`,
        "process.stderr.write(Buffer.alloc(err, 0x59));",
        "process.exitCode = 23;",
      ].join(" "),
      String(giantStdoutBytes),
      String(giantStderrBytes),
    ),
  );

  assertClosedEnvelope(result);
  assert.equal(result.exit_code, 23);
  assert.equal(result.stdout.bytes, giantStdoutBytes + Buffer.byteLength(marker, "utf8"));
  assert.equal(result.stderr.bytes, giantStderrBytes);
  assert.equal(result.stdout.truncated, true);
  assert.equal(result.stderr.truncated, true);
  assert.ok(result.stdout.tail.endsWith(marker));
  assert.equal(Buffer.byteLength(result.stdout.tail, "utf8"), MAX_RENDERED_TAIL_BYTES_PER_STREAM);
  assert.equal(Buffer.byteLength(result.stderr.tail, "utf8"), MAX_RENDERED_TAIL_BYTES_PER_STREAM);
  assert.equal(result.stderr.tail, "Y".repeat(MAX_RENDERED_TAIL_BYTES_PER_STREAM));
});

await check("a nonzero failure emits its bounded tail once and never replays argv", async () => {
  await temporaryRoot(async (root) => {
    const markerPath = path.join(root, "executed-once");
    const argvSecret = "DO-NOT-EMIT-ARGV-SECRET";
    const result = await runBoundedCommand(
      nodeCommand(
        [
          "const fs = require('node:fs');",
          "fs.appendFileSync(process.argv[1], 'x');",
          "process.stdout.write('FAILURE-TAIL');",
          "process.stderr.write('ERROR-TAIL');",
          "process.exitCode = 9;",
        ].join(" "),
        markerPath,
        argvSecret,
      ),
    );

    assertClosedEnvelope(result);
    assert.equal(result.outcome, "completed");
    assert.equal(result.exit_code, 9);
    assert.equal(result.stdout.tail, "FAILURE-TAIL");
    assert.equal(result.stderr.tail, "ERROR-TAIL");
    assert.equal(await readFile(markerPath, "utf8"), "x");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(markerPath), false);
    assert.equal(serialized.includes(argvSecret), false);
  });
});

await check("spawn and argument failures are structured, bounded, and do not leak inputs", async () => {
  const missing = "not-a-real-command-DO-NOT-LEAK";
  const spawnFailure = await runBoundedCommand({ argv: [missing] });
  assertClosedEnvelope(spawnFailure);
  assert.equal(spawnFailure.outcome, "spawn_error");
  assert.equal(spawnFailure.error_code, "SPAWN_FAILED");
  assert.equal(spawnFailure.exit_code, null);
  assert.equal(spawnFailure.signal, null);
  assert.equal(spawnFailure.stdout.bytes, 0);
  assert.equal(spawnFailure.stderr.bytes, 0);
  assert.equal(spawnFailure.stdout.tail, null);
  assert.equal(spawnFailure.stderr.tail, null);
  assert.equal(JSON.stringify(spawnFailure).includes(missing), false);

  const invalid = await runBoundedCommand({ argv: [] });
  assertClosedEnvelope(invalid);
  assert.equal(invalid.outcome, "argument_invalid");
  assert.equal(invalid.error_code, "ARGUMENT_INVALID");
  assert.equal(invalid.duration_ms, 0);
});

await check("the execution deadline terminates a hung child through the signal envelope", async () => {
  assert.equal(DEFAULT_EXECUTION_TIMEOUT_MS, 5 * 60 * 1000);
  const result = await runBoundedCommand({
    ...nodeCommand("setInterval(() => {}, 1_000);"),
    timeoutMs: 25,
  });

  assertClosedEnvelope(result);
  assert.equal(result.outcome, "completed");
  assert.equal(result.exit_code, null);
  assert.equal(result.signal, "SIGKILL");
  assert.equal(result.error_code, null);
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll bounded command checks passed.");
}
