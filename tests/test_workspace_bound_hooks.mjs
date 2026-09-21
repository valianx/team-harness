// Functional coverage for the explicit workspace binding used by the
// SubagentStop trace and PreCompact snapshot hooks.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const traceHook = join(repoRoot, "hooks", "ts", "dist", "subagent-trace.cjs");
const snapshotHook = join(repoRoot, "hooks", "ts", "dist", "precompact-snapshot.cjs");

assert.ok(existsSync(traceHook), `missing compiled hook: ${traceHook}`);
assert.ok(existsSync(snapshotHook), `missing compiled hook: ${snapshotHook}`);

const root = mkdtempSync(join(tmpdir(), "th-workspace-bound-"));
try {
  const cwd = join(root, "cwd");
  const discovered = join(cwd, "workspaces", "mtime-candidate");
  const bound = join(root, "bound-workspace");
  mkdirSync(discovered, { recursive: true });
  mkdirSync(bound, { recursive: true });
  writeFileSync(join(discovered, "00-state.md"), "discovered\n", "utf8");
  writeFileSync(join(bound, "00-state.md"), "bound\n", "utf8");

  const stopPayload = JSON.stringify({
    tool_name: "SubagentStop",
    tool_input: {
      agent_type: "th:tester",
      agent_id: "workspace-binding-test",
      stop_reason: "complete",
    },
  });
  const compactPayload = JSON.stringify({ tool_name: "PreCompact", tool_input: {} });

  function run(hook, input, binding) {
    const env = { ...process.env };
    if (binding === undefined) delete env.TH_WORKSPACE;
    else env.TH_WORKSPACE = binding;
    const result = spawnSync(process.execPath, [hook], {
      cwd,
      env,
      input,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${hook} exited ${result.status}: ${result.stderr}`);
    assert.equal(result.stdout, "", `${hook} must never emit stdout`);
  }

  const discoveredTrace = join(discovered, "00-subagent-trace.jsonl");
  const discoveredSnapshot = join(discovered, "00-state.precompact-snapshot.md");
  const discoveredBreadcrumb = join(discovered, "00-precompact.jsonl");

  // A workspace directory under cwd is not an implicit binding. Both hooks
  // must skip it instead of selecting a candidate by modification time.
  run(traceHook, stopPayload, undefined);
  run(snapshotHook, compactPayload, undefined);
  assert.equal(existsSync(discoveredTrace), false, "trace must skip without TH_WORKSPACE");
  assert.equal(existsSync(discoveredSnapshot), false, "snapshot must skip without TH_WORKSPACE");
  assert.equal(existsSync(discoveredBreadcrumb), false, "breadcrumb must skip without TH_WORKSPACE");

  // An explicit absolute binding selects the requested workspace even when
  // another candidate is discoverable from cwd.
  run(traceHook, stopPayload, bound);
  run(snapshotHook, compactPayload, bound);
  const boundTrace = join(bound, "00-subagent-trace.jsonl");
  const boundSnapshot = join(bound, "00-state.precompact-snapshot.md");
  const boundBreadcrumb = join(bound, "00-precompact.jsonl");
  assert.equal(JSON.parse(readFileSync(boundTrace, "utf8").trim()).workspace, bound);
  assert.equal(readFileSync(boundSnapshot, "utf8"), "bound\n");
  assert.equal(JSON.parse(readFileSync(boundBreadcrumb, "utf8").trim()).workspace, bound);

  // Relative bindings are rejected; callers must bind an absolute path.
  rmSync(boundTrace);
  rmSync(boundSnapshot);
  rmSync(boundBreadcrumb);
  run(traceHook, stopPayload, relative(cwd, bound));
  run(snapshotHook, compactPayload, relative(cwd, bound));
  assert.equal(existsSync(boundTrace), false, "relative TH_WORKSPACE must skip trace");
  assert.equal(existsSync(boundSnapshot), false, "relative TH_WORKSPACE must skip snapshot");
  assert.equal(existsSync(boundBreadcrumb), false, "relative TH_WORKSPACE must skip breadcrumb");

  console.log("workspace-bound-hooks: PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
