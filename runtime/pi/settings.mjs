import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { selectWorkspacePreference } from "../../skills/workspace/scripts/workspace-preference.mjs";

const keys = new Set([
  "workspace-mode", "logs-mode", "logs-path", "logs-subfolder",
  "workspace-space-id", "workspace-container-page-id", "language", "english_learning",
  "flow_telemetry.enabled", "clickup.workspace_id", "obsidian_tasks",
]);
const workspaceKeys = new Set([
  "workspace-mode", "logs-mode", "logs-path", "logs-subfolder",
  "workspace-space-id", "workspace-container-page-id",
]);
const idKeys = ["workspace-space-id", "workspace-container-page-id"];
const control = /[\x00-\x1f\x7f]/;
const glob = /[*?\[\]]/;
const opaqueId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/;
const token = /(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-]{20,})/;
const sensitiveKey = /(?:token|secret|password|api[_-]?key|authorization|bearer)/i;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function resolveAgentDir(agentDir) {
  const raw = agentDir === undefined ? process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent") : agentDir;
  if (typeof raw !== "string" || !raw) throw new Error("Pi agent directory is invalid");
  const expanded = raw === "~" ? homedir() : /^~[\\/]/.test(raw) ? join(homedir(), raw.slice(2)) : raw;
  if (!isAbsolute(expanded)) throw new Error("Pi agent directory must be absolute");
  return resolve(expanded);
}

async function regularFile(path) {
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Pi settings must be a regular file, not a symlink");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function readSettings(agentDir) {
  const path = join(resolveAgentDir(agentDir), ".team-harness.json");
  if (!await regularFile(path)) return {};
  let document;
  try {
    document = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Pi settings JSON is invalid");
    throw error;
  }
  if (!record(document)) throw new Error("Pi settings must contain a JSON object");
  return document;
}

function validBase(value) {
  if (typeof value !== "string" || !value || control.test(value) || glob.test(value) || !isAbsolute(value)) return false;
  const root = parse(value).root;
  if (process.platform === "win32" && !/^[A-Za-z]:[\\/]/.test(root) && !root.startsWith("\\\\")) return false;
  if (value.split(sep === "\\" ? /[\\/]/ : "/").includes("..")) return false;
  const normalized = resolve(value);
  return normalized !== parse(normalized).root && relative(homedir(), normalized) !== "";
}

function validSubfolder(value) {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= 1024
    && !isAbsolute(value) && !/^[A-Za-z]:/.test(value) && !/[\\\x00-\x1f\x7f*?\[\]{}]/.test(value)
    && value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function destinationReason(document, preference = selectWorkspacePreference(document)) {
  if (preference.status === "invalid") return preference.reason_code;
  if (preference.mode === "gpt-space") {
    if (idKeys.some(key => !Object.hasOwn(document, key))) return "incomplete_space_destination";
    if (idKeys.some(key => typeof document[key] !== "string" || !opaqueId.test(document[key]))) return "invalid_space_destination";
  }
  if (preference.mode === "obsidian") {
    if (!["logs-path", "logs-subfolder"].every(key => Object.hasOwn(document, key))) return "incomplete_obsidian_destination";
    if (!validBase(document["logs-path"]) || !validSubfolder(document["logs-subfolder"])) return "invalid_obsidian_destination";
  }
  return null;
}

function diagnostics(document) {
  const preference = selectWorkspacePreference(document);
  return [...new Set([preference.reason_code, preference.conflict ? "selector_conflict" : null,
    destinationReason(document, preference)].filter(Boolean))];
}

function redacted(value, key = "") {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (typeof value === "string") return token.test(value) ? "[redacted]" : value;
  if (Array.isArray(value)) return value.map(item => redacted(item));
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redacted(item, name)]));
  return value;
}

export async function showSettings(agentDir) {
  const root = resolveAgentDir(agentDir);
  const path = join(root, ".team-harness.json");
  const document = await readSettings(root);
  return { path, exists: await regularFile(path), config: redacted(document),
    workspace: selectWorkspacePreference(document), workspaceDiagnostics: diagnostics(document) };
}

function validateSetting(key, value) {
  if (!keys.has(key)) throw new Error("Unsupported Pi setting");
  const invalid = () => { throw new Error(`Invalid Pi setting: ${key}`); };
  if (token.test(JSON.stringify(value))) invalid();
  if (key === "workspace-mode" && !["local", "obsidian", "gpt-space"].includes(value)) invalid();
  if (key === "logs-mode" && !["local", "obsidian"].includes(value)) invalid();
  if (idKeys.includes(key) && (typeof value !== "string" || !opaqueId.test(value))) invalid();
  if (key === "logs-path" && !validBase(value)) invalid();
  if (key === "logs-subfolder" && !validSubfolder(value)) invalid();
  if (key === "language" && (typeof value !== "string" || !/^[a-z]{2}$/.test(value))) invalid();
  if (["english_learning", "flow_telemetry.enabled"].includes(key) && typeof value !== "boolean") invalid();
  if (key === "clickup.workspace_id" && typeof value !== "string") invalid();
  if (key === "obsidian_tasks" && (typeof value !== "boolean" && (!record(value)
    || (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean")))) invalid();
}

function assignment(raw) {
  if (typeof raw !== "string" || !raw.includes("=")) throw new Error("Pi setting requires KEY=JSON");
  const index = raw.indexOf("=");
  const key = raw.slice(0, index);
  let value;
  try { value = JSON.parse(raw.slice(index + 1)); } catch { throw new Error("Pi setting requires valid JSON"); }
  validateSetting(key, value);
  return [key, value];
}

function setValue(document, key, value) {
  const [parent, child] = key.split(".");
  if (child) {
    if (!record(document[parent])) document[parent] = {};
    document[parent][child] = value;
  } else if (key === "obsidian_tasks" && typeof value === "boolean") {
    document[key] = { ...(record(document[key]) ? document[key] : {}), enabled: value };
  } else document[key] = value;
}

function removeValue(document, key) {
  if (!keys.has(key)) throw new Error("Unsupported Pi setting");
  const [parent, child] = key.split(".");
  if (!child) delete document[parent];
  else if (record(document[parent])) {
    delete document[parent][child];
    if (Object.keys(document[parent]).length === 0) delete document[parent];
  }
}

function metadata(document, version) {
  if (!Object.hasOwn(document, "format_version")) document.format_version = "1";
  if (version !== undefined) {
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Pi settings version must be a semantic version");
    document.installed_version = version;
  }
  if (!Object.hasOwn(document, "workspace-mode") && !Object.hasOwn(document, "logs-mode")) {
    document["workspace-mode"] = "local";
    document["logs-mode"] = "local";
  }
}

async function publish(root, before, after) {
  const path = join(root, ".team-harness.json");
  if (isDeepStrictEqual(before, after)) return { path, changed: false, workspaceDiagnostics: diagnostics(after) };
  after.updated_at = new Date().toISOString();
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (await regularFile(path)) {
    const backup = `${path}.bak`;
    await regularFile(backup);
    const file = await open(backup, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await file.writeFile(await readFile(path));
      await file.sync();
      await file.chmod(0o600);
    } finally { await file.close(); }
  }
  const temporary = `${path}.tmp-${randomBytes(12).toString("hex")}`;
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(`${JSON.stringify(after, null, 2)}\n`, "utf8");
      await file.chmod(0o600);
      await file.sync();
    } finally { await file.close(); }
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
  if (!isDeepStrictEqual(await readSettings(root), after)) throw new Error("Pi settings publication did not converge");
  return { path, changed: true, workspaceDiagnostics: diagnostics(after) };
}

export async function ensureSettings(agentDir, { version } = {}) {
  const root = resolveAgentDir(agentDir);
  const before = await readSettings(root);
  const after = structuredClone(before);
  metadata(after, version);
  return publish(root, before, after);
}

export async function setSettings(agentDir, { assignments = [], removals = [], version } = {}) {
  const root = resolveAgentDir(agentDir);
  const before = await readSettings(root);
  const after = structuredClone(before);
  const selected = new Map();
  let workspaceChanged = false;
  for (const raw of assignments) {
    const [key, value] = assignment(raw);
    setValue(after, key, value);
    if (["workspace-mode", "logs-mode"].includes(key)) selected.set(key, value);
    workspaceChanged ||= workspaceKeys.has(key);
  }
  for (const key of removals) {
    removeValue(after, key);
    selected.delete(key);
    workspaceChanged ||= workspaceKeys.has(key);
  }
  if (selected.size === 2 && selected.get("workspace-mode") !== selected.get("logs-mode")) throw new Error("Explicit workspace selectors conflict");
  if (selected.size) {
    const mode = selected.get("workspace-mode") ?? selected.get("logs-mode");
    after["workspace-mode"] = mode;
    if (mode === "gpt-space") delete after["logs-mode"];
    else after["logs-mode"] = mode;
  }
  metadata(after, version);
  if (workspaceChanged && destinationReason(after)) throw new Error("Pi workspace destination is invalid");
  return publish(root, before, after);
}

async function main(args) {
  const [command, ...options] = args;
  if (command === "show" && options.length === 0) return showSettings();
  if (!["ensure", "set"].includes(command)) throw new Error("Use Pi settings show, ensure or set");
  const values = { assignments: [], removals: [] };
  for (let index = 0; index < options.length; index += 2) {
    const flag = options[index], value = options[index + 1];
    if (value === undefined) throw new Error("Pi settings option requires a value");
    if (flag === "--version") values.version = value;
    else if (command === "set" && flag === "--set") values.assignments.push(value);
    else if (command === "set" && flag === "--remove") values.removals.push(value);
    else throw new Error("Unsupported Pi settings option");
  }
  if (command === "set" && values.assignments.length + values.removals.length === 0) throw new Error("Pi settings set requires a requested change");
  return command === "ensure" ? ensureSettings(undefined, values) : setSettings(undefined, values);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`Pi settings: ${error.code ? "settings operation failed" : error.message}\n`);
    process.exitCode = 1;
  });
}
