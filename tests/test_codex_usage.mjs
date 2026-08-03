#!/usr/bin/env node
/** Behavioral coverage for the local Codex rollout usage collector (AC1–AC5). */

import assert from "node:assert/strict";
import {
  appendFile,
  copyFile,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import {
  MAX_LINE_BYTES,
  MAX_TOTAL_BYTES,
  checkpointFromUsage,
  collectCodexUsage,
  compareCheckpoints,
} from "../plugins/team-harness/skills/pipeline/scripts/codex-usage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures", "codex-rollouts");
const script = path.join(here, "..", "plugins", "team-harness", "skills", "pipeline", "scripts", "codex-usage.mjs");
const failures = [];

function components(input, cached, cacheWrite, output, reasoning, total) {
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    uncached_input_tokens: Math.max(0, input - cached),
    cache_write_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: total,
  };
}

function raw(input = 0, cached = 0, cacheWrite = 0, output = 0, reasoning = 0, total = 0) {
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: total,
  };
}

function tokenCount(total, last = raw()) {
  return {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { total_token_usage: total, last_token_usage: last },
    },
  };
}

function rollout(sessionId, parentThreadId, final = raw(1, 0, 0, 1, 0, 1)) {
  const first = raw();
  const metadata = {
    session_id: sessionId,
    id: sessionId,
    source: parentThreadId === null ? "cli" : { subagent: { other: {} } },
  };
  if (parentThreadId !== null) metadata.parent_thread_id = parentThreadId;
  return [
    { type: "session_meta", payload: metadata },
    tokenCount(first, first),
    tokenCount(final, first),
  ]
    .map((record) => JSON.stringify(record))
    .join("\n")
    .concat("\n");
}

async function temporaryRoot(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-codex-usage-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function fixtureRoot(names, callback) {
  return temporaryRoot(async (root) => {
    await Promise.all(names.map((name) => copyFile(path.join(fixtures, name), path.join(root, name))));
    return callback(root);
  });
}

async function snapshotFiles(directory) {
  const names = (await readdir(directory)).sort();
  return Promise.all(
    names.map(async (name) => [name, (await readFile(path.join(directory, name))).toString("base64")]),
  );
}

function assertUnavailable(result, reason) {
  assert.equal(result.usage_status, "unavailable");
  assert.equal(result.reason_code, reason);
  assert.equal(result.components, null);
  if (Object.hasOwn(result, "sessions")) assert.deepEqual(result.sessions, []);
}

function checkpoint(value) {
  return {
    schema_version: 1,
    kind: "codex_usage_checkpoint",
    usage_status: "available",
    reason_code: null,
    components: value,
  };
}

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 240) : "non-Error throw";
    failures.push(`${name}: ${reason}`);
    console.log(`  [FAIL] ${name}: ${reason}`);
  }
}

console.log("=== Codex usage collector (AC1–AC5) ===");

await check("AC1: inherited baseline uses final - first + first.last per component", async () => {
  await fixtureRoot(["baseline-inherited.jsonl"], async (root) => {
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-baseline" });
    assert.equal(result.usage_status, "available");
    assert.deepEqual(result.components, components(75, 25, 10, 37, 10, 112));
    assert.deepEqual(result.sessions, [
      { session: "S1", parent_session: null, role: "root", components: components(75, 25, 10, 37, 10, 112) },
    ]);
    assert.equal(JSON.stringify(result).includes("root-real-id-baseline"), false);
  });
});

await check("AC2: unique thread IDs deduplicate shared session groups and preserve roles", async () => {
  await fixtureRoot(["descendants.jsonl", "descendant-child.jsonl", "other-child.jsonl", "unrelated.jsonl"], async (root) => {
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-graph" });
    assert.equal(result.usage_status, "available");
    assert.equal(result.session_count, 3);
    assert.deepEqual(result.components, components(53, 24, 11, 26, 7, 79));
    assert.deepEqual(result.sessions.map((session) => [session.session, session.parent_session, session.role]), [
      ["S1", null, "root"],
      ["S2", "S1", "implementer"],
      ["S3", "S1", "other"],
    ]);
    assert.equal(JSON.stringify(result).includes("unrelated-real-id"), false);
    assert.equal(JSON.stringify(result).includes("shared-session-group-graph"), false);
  });
});

await check("AC2: identical duplicate sessions contribute once", async () => {
  await temporaryRoot(async (root) => {
    await copyFile(path.join(fixtures, "duplicate-a.jsonl"), path.join(root, "a.jsonl"));
    await copyFile(path.join(fixtures, "duplicate-a.jsonl"), path.join(root, "b.jsonl"));
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "duplicate-real-id" });
    assert.equal(result.usage_status, "available");
    assert.equal(result.session_count, 1);
    assert.deepEqual(result.components, components(1, 0, 0, 1, 0, 1));
  });
});

await check("AC2: a reachable parent cycle fails closed", async () => {
  await fixtureRoot(["cycle-root.jsonl", "cycle-child.jsonl"], async (root) => {
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "cycle-root-real-id" }), "CYCLE_DETECTED");
  });
});

await check("AC2: depth, file-count, and byte caps produce no subtotal", async () => {
  await temporaryRoot(async (root) => {
    for (let index = 0; index <= 65; index += 1) {
      await writeFile(
        path.join(root, `depth-${String(index).padStart(3, "0")}.jsonl`),
        rollout(`depth-${index}`, index === 0 ? null : `depth-${index - 1}`),
      );
    }
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "depth-0" }), "RESOURCE_LIMIT");
  });

  await temporaryRoot(async (root) => {
    await Promise.all(
      Array.from({ length: 513 }, (_, index) => writeFile(path.join(root, `limit-${index}.jsonl`), "")),
    );
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "missing" }), "RESOURCE_LIMIT");
  });

  await temporaryRoot(async (root) => {
    const oversized = path.join(root, "oversized.jsonl");
    await writeFile(oversized, "");
    await truncate(oversized, MAX_TOTAL_BYTES + 1);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "missing" }), "RESOURCE_LIMIT");
  });
});

await check("AC3: native usage drift, unsafe integer, regression, and conflict fail closed", async () => {
  await fixtureRoot(["schema-drift.jsonl"], async (root) => {
    const usage = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "schema-real-id" });
    assertUnavailable(usage, "SCHEMA_INVALID");
    assertUnavailable(checkpointFromUsage(usage), "SCHEMA_INVALID");
  });
  await fixtureRoot(["unsafe-integer.jsonl"], async (root) => {
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "unsafe-real-id" }), "COUNTER_INVALID");
  });
  await fixtureRoot(["regression.jsonl"], async (root) => {
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "regression-real-id" }), "COUNTER_REGRESSION");
  });
  await fixtureRoot(["duplicate-a.jsonl", "duplicate-b-conflict.jsonl"], async (root) => {
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "duplicate-real-id" }), "DUPLICATE_CONFLICT");
  });
  await temporaryRoot(async (root) => {
    const idAbsent = {
      type: "session_meta",
      payload: { session_id: "shared-but-not-a-thread-id", source: "cli" },
    };
    await writeFile(path.join(root, "id-absent.jsonl"), `${JSON.stringify(idAbsent)}\n`);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "missing-thread-id" }), "SCHEMA_INVALID");
  });
  await temporaryRoot(async (root) => {
    const parentConflict = {
      type: "session_meta",
      payload: {
        session_id: "parent-conflict",
        id: "parent-conflict",
        parent_thread_id: "outer-parent",
        source: { subagent: { thread_spawn: { parent_thread_id: "inner-parent" } } },
      },
    };
    await writeFile(path.join(root, "parent-conflict.jsonl"), `${JSON.stringify(parentConflict)}\n`);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "parent-conflict" }), "DUPLICATE_CONFLICT");
  });
  await temporaryRoot(async (root) => {
    const roleConflict = {
      type: "session_meta",
      payload: {
        session_id: "role-conflict",
        id: "role-conflict",
        agent_role: "outer-role",
        source: { subagent: { thread_spawn: { agent_role: "inner-role" } } },
      },
    };
    await writeFile(path.join(root, "role-conflict.jsonl"), `${JSON.stringify(roleConflict)}\n`);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "role-conflict" }), "DUPLICATE_CONFLICT");
  });
  await temporaryRoot(async (root) => {
    const pathConflict = {
      type: "session_meta",
      payload: {
        session_id: "path-conflict",
        id: "path-conflict",
        agent_path: "agents/outer.md",
        source: { subagent: { thread_spawn: { agent_path: "agents/inner.md" } } },
      },
    };
    await writeFile(path.join(root, "path-conflict.jsonl"), `${JSON.stringify(pathConflict)}\n`);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "path-conflict" }), "DUPLICATE_CONFLICT");
  });
  await temporaryRoot(async (root) => {
    const records = [
      {
        schema_version: 99,
        type: "session_meta",
        payload: { session_id: "shared-native-session", id: "native-thread-id", source: "cli" },
      },
      tokenCount(raw(), raw()),
      tokenCount(raw(1, 0, 0, 1, 0, 1), raw()),
    ];
    await writeFile(
      path.join(root, "native-no-version-contract.jsonl"),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "native-thread-id" });
    assert.equal(result.usage_status, "available");
    assert.equal(JSON.stringify(result).includes("shared-native-session"), false);
  });
});

await check("AC3: invalid cached-input counters fail instead of clamping", async () => {
  await temporaryRoot(async (root) => {
    await writeFile(path.join(root, "cached.jsonl"), rollout("cached-real-id", null, raw(5, 8, 0, 5, 0, 5)));
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "cached-real-id" });
    assertUnavailable(result, "COUNTER_INVALID");
  });
});

await check("AC3: malformed usage after valid unrelated metadata is ignored, but reachable drift fails closed", async () => {
  await fixtureRoot(["baseline-inherited.jsonl", "schema-drift.jsonl"], async (root) => {
    const partialMetadata = {
      type: "session_meta",
      payload: { session_id: "unrelated-partial-group", id: "unrelated-partial-thread", source: "cli" },
    };
    await writeFile(
      path.join(root, "unrelated-partial-after-meta.jsonl"),
      `${JSON.stringify(partialMetadata)}\n{"type":"event_msg"`,
    );
    const result = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-baseline" });
    assert.equal(result.usage_status, "available");
    assert.deepEqual(result.components, components(75, 25, 10, 37, 10, 112));
  });

  await fixtureRoot(["baseline-inherited.jsonl"], async (root) => {
    const reachableDrift = [
      {
        type: "session_meta",
        payload: {
          session_id: "shared-with-root-but-not-identity",
          id: "reachable-drift-thread",
          parent_thread_id: "root-real-id-baseline",
          source: { subagent: { other: {} } },
        },
      },
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { ...raw(1, 0, 0, 1, 0, 1), historical_unknown_counter: 1 },
            last_token_usage: raw(),
          },
        },
      },
    ];
    await writeFile(
      path.join(root, "reachable-schema-drift.jsonl"),
      `${reachableDrift.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    assertUnavailable(
      await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-baseline" }),
      "SCHEMA_INVALID",
    );
  });
});

await check("AC4: checkpoints report only end - start and reject checkpoint regression", async () => {
  const start = checkpoint(components(10, 3, 1, 4, 1, 14));
  const end = checkpoint(components(22, 10, 4, 9, 3, 31));
  const delta = compareCheckpoints(start, end);
  assert.deepEqual(delta, {
    schema_version: 1,
    kind: "codex_usage_delta",
    usage_status: "available",
    reason_code: null,
    components: components(12, 7, 3, 5, 2, 17),
  });
  assertUnavailable(compareCheckpoints(end, start), "CHECKPOINT_REGRESSION");
});

await check("AC4: malformed/partial JSONL and an oversized line fail closed", async () => {
  await fixtureRoot(["partial.jsonl"], async (root) => {
    const partial = path.join(root, "partial.jsonl");
    await truncate(partial, (await stat(partial)).size - 1);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "partial-real-id" }), "JSONL_PARTIAL");
  });
  await temporaryRoot(async (root) => {
    const oversizedLine = Buffer.alloc(MAX_LINE_BYTES + 2, 0x20);
    oversizedLine[oversizedLine.length - 1] = 0x0a;
    await writeFile(path.join(root, "long.jsonl"), oversizedLine);
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "missing" }), "LINE_TOO_LONG");
  });
});

await check("AC4: pre-read and post-read identity/size/mtime changes fail closed", async () => {
  await fixtureRoot(["baseline-inherited.jsonl"], async (root) => {
    const target = path.join(root, "baseline-inherited.jsonl");
    let changed = false;
    const result = await collectCodexUsage({
      rolloutsRoot: root,
      rootThreadId: "root-real-id-baseline",
      testHooks: {
        async beforeRead() {
          if (!changed) {
            changed = true;
            await appendFile(target, " ");
          }
        },
      },
    });
    assertUnavailable(result, "FILE_MUTATED");
  });

  await fixtureRoot(["baseline-inherited.jsonl"], async (root) => {
    const target = path.join(root, "baseline-inherited.jsonl");
    const replacement = path.join(root, "replacement.tmp");
    let changed = false;
    const result = await collectCodexUsage({
      rolloutsRoot: root,
      rootThreadId: "root-real-id-baseline",
      testHooks: {
        async afterRead() {
          if (!changed) {
            changed = true;
            await copyFile(target, replacement);
            await rename(replacement, target);
          }
        },
      },
    });
    assertUnavailable(result, "FILE_MUTATED");
  });
});

await check("AC5: symlink escape is rejected before reading", async () => {
  await temporaryRoot(async (root) => {
    const outside = await mkdtemp(path.join(tmpdir(), "th-codex-usage-outside-"));
    try {
      const target = path.join(outside, "outside.jsonl");
      await copyFile(path.join(fixtures, "baseline-inherited.jsonl"), target);
      await symlink(target, path.join(root, "escape.jsonl"));
      assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-baseline" }), "FS_UNSAFE");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

await check("AC5: a rollout candidate must be a regular, non-symlink file", async () => {
  await temporaryRoot(async (root) => {
    await mkdir(path.join(root, "not-a-file.jsonl"));
    assertUnavailable(await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "missing" }), "FS_UNSAFE");
  });
});

await check("AC5: CLI output/errors contain only allowlisted data and pseudonyms", async () => {
  await fixtureRoot(["baseline-inherited.jsonl", "sensitive-canary.jsonl"], async (root) => {
    const invocation = spawnSync(
      process.execPath,
      [script, "--rollouts-root", root, "--root-thread-id", "root-real-id-baseline"],
      { encoding: "utf8" },
    );
    assert.equal(invocation.status, 0);
    const combined = `${invocation.stdout}${invocation.stderr}`;
    for (const forbidden of [
      root,
      "REAL-ID-CANARY-SECRET-123",
      "PROMPT-CANARY-DO-NOT-LEAK",
      "COMMAND-CANARY-DO-NOT-LEAK",
      "SECRET-CANARY-DO-NOT-LEAK",
      "ROLE-CANARY-DO-NOT-LEAK",
      "PATH-CANARY-DO-NOT-LEAK",
    ]) {
      assert.equal(combined.includes(forbidden), false);
    }
    const result = JSON.parse(invocation.stdout);
    assert.equal(result.usage_status, "available");
    assert.equal(result.sessions.at(-1).role, "other");
  });
});

await check("comparison CLI accepts only serialized checkpoints and does not write state", async () => {
  await fixtureRoot(["baseline-inherited.jsonl"], async (root) => {
    const usage = await collectCodexUsage({ rolloutsRoot: root, rootThreadId: "root-real-id-baseline" });
    const start = checkpoint(components(0, 0, 0, 0, 0, 0));
    const end = checkpointFromUsage(usage);
    const startPath = path.join(root, "start.json");
    const endPath = path.join(root, "end.json");
    await writeFile(startPath, JSON.stringify(start));
    await writeFile(endPath, JSON.stringify(end));
    const beforeFiles = await snapshotFiles(root);
    const invocation = spawnSync(process.execPath, [script, "--compare-start", startPath, "--compare-end", endPath], {
      encoding: "utf8",
    });
    assert.equal(invocation.status, 0);
    const result = JSON.parse(invocation.stdout);
    assert.equal(result.usage_status, "available");
    assert.deepEqual(result.components, components(75, 25, 10, 37, 10, 112));
    assert.deepEqual(await snapshotFiles(root), beforeFiles);
  });
});

await check("CLI failures preserve the selected checkpoint or comparison schema", async () => {
  const checkpointFailure = spawnSync(process.execPath, [script, "--checkpoint"], { encoding: "utf8" });
  assert.equal(checkpointFailure.status, 0);
  assert.deepEqual(JSON.parse(checkpointFailure.stdout), {
    schema_version: 1,
    kind: "codex_usage_checkpoint",
    usage_status: "unavailable",
    reason_code: "ARGUMENT_INVALID",
    components: null,
  });

  const comparisonFailure = spawnSync(process.execPath, [script, "--compare-start", "missing", "--compare-end", "missing"], {
    encoding: "utf8",
  });
  assert.equal(comparisonFailure.status, 0);
  assert.deepEqual(JSON.parse(comparisonFailure.stdout), {
    schema_version: 1,
    kind: "codex_usage_delta",
    usage_status: "unavailable",
    reason_code: "CHECKPOINT_INVALID",
    components: null,
  });
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll Codex usage collector checks passed.");
}
