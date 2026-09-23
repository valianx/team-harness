#!/usr/bin/env node
/** Exercise real hook processes against aliased outputs, without touching user configuration. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const registration = JSON.parse(await readFile(path.join(root, ".claude-plugin/hooks.json"), "utf8"));
const startMatcher = new RegExp(registration.hooks.PreToolUse.find(entry => entry.hooks.some(hook => hook.command.includes("subagent-start"))).matcher);
assert.ok(startMatcher.test("Agent") && startMatcher.test("Task"));
assert.equal(startMatcher.test("AgentTeam"), false);
const temporary = await mkdtemp(path.join(tmpdir(), "th-hook-outputs-"));
const cases = [
  ["precompact-snapshot", "00-state.precompact-snapshot.md", { hook_event_name: "PreCompact" }],
  ["precompact-snapshot", "00-precompact.jsonl", { hook_event_name: "PreCompact" }],
  ["subagent-start", "00-subagent-trace.jsonl", { hook_event_name: "PreToolUse", tool_name: "Task", tool_input: { subagent_type: "th:tester", prompt: "test" } }],
  ["subagent-start", "00-subagent-trace.jsonl", { hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "th:tester", prompt: "test" } }],
  ["subagent-trace", "00-subagent-trace.jsonl", { hook_event_name: "SubagentStop", agent_type: "th:tester", agent_id: "native-agent", stop_reason: "done" }],
];
const failures = [];
try {
  for (const kind of ["regular", "hardlink", "symlink"]) {
    for (const [index, [hook, filename, event]] of cases.entries()) {
      const workspace = path.join(temporary, `${kind}-${index}-${hook}`);
      const sibling = `${workspace}-outside`;
      await mkdir(workspace);
      await mkdir(sibling);
      await writeFile(path.join(workspace, "00-state.md"), "state-content\n");
      const target = path.join(sibling, "sentinel");
      await writeFile(target, "external-sentinel\n");
      const output = path.join(workspace, filename);
      try {
        if (kind === "hardlink") await link(target, output);
        if (kind === "symlink") await symlink(target, output);
      } catch (error) {
        if (kind === "symlink" && process.platform === "win32" && error.code === "EPERM") {
          console.log(`SKIP Windows symlink privilege: ${hook}/${filename}`);
          continue;
        }
        throw error;
      }
      const result = spawnSync(process.execPath, [path.join(root, "hooks/ts/dist", `${hook}.cjs`)], {
        cwd: workspace, input: JSON.stringify({ session_id: "fixture", cwd: workspace, ...event }),
        encoding: "utf8", windowsHide: true, timeout: 10000,
        env: { ...process.env, TH_WORKSPACE: workspace, TH_HOOK_PROFILE: "full" },
      });
      try {
        if (result.error) throw result.error;
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "");
        assert.equal(await readFile(target, "utf8"), "external-sentinel\n", `${kind}: ${hook}/${filename} changed external file`);
        if (kind === "regular") {
          const content = await readFile(output, "utf8");
          if (filename.endsWith(".md")) assert.equal(content, "state-content\n");
          else {
            const record = JSON.parse(content.trim());
            assert.equal(record.event, hook === "precompact-snapshot" ? "precompact.snapshot" : hook === "subagent-start" ? "subagent.start" : "subagent.stop");
            if (hook === "subagent-trace") {
              assert.equal(record.agent_type, "th:tester");
              assert.equal(record.agent_id, "native-agent");
              assert.equal(record.stop_reason, "done");
            }
          }
        }
      } catch (error) {
        failures.push(error.message);
      }
    }
  }
  const configHome = path.join(temporary, "config");
  await mkdir(path.join(configHome, ".claude"), { recursive: true });
  for (const subfolder of ["../outside", "/absolute", "bad\\path", "bad\ninstruction", "nested//empty", "nested/*"]) {
    await writeFile(path.join(configHome, ".claude/.team-harness.json"), JSON.stringify({
      "logs-mode": "obsidian", "logs-path": "/vault", "logs-subfolder": subfolder,
    }));
    const result = spawnSync(process.execPath, [path.join(root, "hooks/ts/dist/session-start.cjs")], {
      input: "{}", encoding: "utf8", windowsHide: true,
      env: { ...process.env, HOME: configHome, USERPROFILE: configHome },
    });
    if (result.error) throw result.error;
    try {
      assert.equal(result.status, 0);
      assert.doesNotMatch(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /workspace mode: obsidian/);
    } catch (error) { failures.push(`invalid subfolder ${JSON.stringify(subfolder)}: ${error.message}`); }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
assert.deepEqual(failures, []);
console.log("hook output ownership: PASS");
