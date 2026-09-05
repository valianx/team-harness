"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// entry/codex-launcher.ts
var codex_launcher_exports = {};
__export(codex_launcher_exports, {
  run: () => run
});
module.exports = __toCommonJS(codex_launcher_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_child_process = require("node:child_process");
var allowed = /* @__PURE__ */ new Set(["policy-block", "gcp-guard", "gate-guard"]);
function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `Blocked by team-harness Codex hook adapter: ${reason}`
  } }) + "\n");
}
function run(names) {
  const selected = names.filter((name) => allowed.has(name));
  if (!selected.length) return;
  let input;
  try {
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const buffer = Buffer.alloc(65536);
      const count = (0, import_node_fs.readSync)(0, buffer, 0, buffer.length, null);
      if (!count) break;
      total += count;
      if (total > 1024 * 1024) throw new Error();
      chunks.push(buffer.subarray(0, count));
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch {
    deny("invalid hook input");
    return;
  }
  const deadline = Date.now() + 8e3;
  for (const name of selected) {
    const artifact = (0, import_node_path.join)(__dirname, `${name}.cjs`);
    try {
      const stat = (0, import_node_fs.lstatSync)(artifact);
      if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error();
    } catch {
      deny("hook artifact missing or empty");
      return;
    }
    let value = input;
    if (name === "policy-block" && input.tool_name === "apply_patch") {
      const toolInput = input.tool_input;
      value = { ...input, tool_name: "Write", tool_input: {
        file_path: "(apply_patch)",
        content: typeof toolInput?.command === "string" ? toolInput.command : ""
      } };
    }
    const timeout = deadline - Date.now();
    if (timeout <= 0) {
      deny("hook execution failed");
      return;
    }
    const result = (0, import_node_child_process.spawnSync)(process.execPath, [artifact], {
      input: JSON.stringify(value),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      env: { ...process.env, TEAM_HARNESS_CODEX_HOOK: "1" },
      timeout,
      maxBuffer: 256 * 1024
    });
    if (result.error || result.status !== 0) {
      deny("hook execution failed");
      return;
    }
    if (!result.stdout.trim()) continue;
    try {
      const output = JSON.parse(result.stdout);
      const decision = output?.hookSpecificOutput?.permissionDecision;
      if (decision === "deny") {
        process.stdout.write(JSON.stringify(output) + "\n");
        return;
      }
      if (decision !== "allow" && decision !== "ask") {
        deny("hook produced an invalid decision");
        return;
      }
    } catch {
      deny("hook produced invalid JSON");
      return;
    }
  }
}
if (require.main === module) run(process.argv.slice(2));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  run
});
