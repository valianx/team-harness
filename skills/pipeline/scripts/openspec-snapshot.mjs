#!/usr/bin/env node
/** Capture and verify the canonical OpenSpec planning snapshot. */

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runBoundedCommand } from "./bounded-command.mjs";
import { isOpenSpecAdapterResult } from "./openspec-adapter.mjs";

export const OPENSPEC_SNAPSHOT_SCHEMA_VERSION = 3;
export const OPENSPEC_PROGRESS_SCHEMA_VERSION = 1;
export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 1024 * 1024;
export const MAX_ARTIFACTS = 128;
export const MAX_COORDINATES = 4096;
export const MAX_PROGRESS_EVENTS = 512;

const CHANGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ACTION_ERRORS = new Set([
  null, "ARGUMENT_INVALID", "TOOLCHAIN_NOT_READY", "STATUS_FAILED", "VALIDATION_FAILED",
  "BINDING_INVALID", "ARTIFACT_INVALID", "COORDINATE_INVALID", "SNAPSHOT_INVALID",
  "SOURCE_CHANGED", "TASK_INTENT_CHANGED", "TASK_PROGRESS_INVALID", "PROGRESS_INVALID", "ATOMIC_TRANSITION_REQUIRED",
  "INTERNAL_ERROR",
]);
const CANONICAL_TASK_ID = /^task:\d+\.\d+$/;
const VISIBLE_TASK_ID = /^\d+\.\d+$/;

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function exactlyKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function safeString(value, maximum = 4096) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0")
    && Buffer.byteLength(value, "utf8") <= maximum;
}

function safeRelative(value) {
  if (!safeString(value, 1024) || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

/** Accept OpenSpec's visible `N.N` IDs and the snapshot's canonical `task:N.N` IDs. */
export function normalizeOpenSpecTaskIds(values) {
  if (!Array.isArray(values)) return null;
  const normalized = values.map(value => {
    if (typeof value !== "string") return null;
    if (CANONICAL_TASK_ID.test(value)) return value;
    return VISIBLE_TASK_ID.test(value) ? `task:${value}` : null;
  });
  return normalized.includes(null) || new Set(normalized).size !== normalized.length ? null : normalized;
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function action(operation, verdict, errorCode = null, details = {}) {
  return {
    schema_version: 1,
    kind: "team_harness_openspec_snapshot_action",
    operation,
    verdict,
    error_code: errorCode,
    snapshot_path: details.snapshot_path ?? null,
    snapshot_sha256: details.snapshot_sha256 ?? null,
    changed: details.changed ?? [],
  };
}

export function isSnapshotAction(value) {
  return exactlyKeys(value, ["schema_version", "kind", "operation", "verdict", "error_code", "snapshot_path", "snapshot_sha256", "changed"])
    && value.schema_version === 1 && value.kind === "team_harness_openspec_snapshot_action"
    && ["capture", "verify"].includes(value.operation) && ["pass", "fail"].includes(value.verdict)
    && ACTION_ERRORS.has(value.error_code)
    && (value.snapshot_path === null || safeString(value.snapshot_path))
    && (value.snapshot_sha256 === null || SHA256.test(value.snapshot_sha256))
    && Array.isArray(value.changed) && value.changed.length <= MAX_ARTIFACTS
    && value.changed.every(item => safeRelative(item));
}

async function canonicalDirectory(input) {
  if (!safeString(input)) throw new Error("invalid directory");
  const canonical = await realpath(input);
  const stat = await lstat(canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid directory");
  return canonical;
}

async function regularFile(root, absolutePath) {
  if (!safeString(absolutePath) || !path.isAbsolute(absolutePath) || !contained(root, absolutePath)) throw new Error("unsafe file");
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) throw new Error("unsafe file");
  const canonical = await realpath(absolutePath);
  if (!contained(root, canonical)) throw new Error("unsafe file");
  const bytes = await readFile(canonical);
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error("unsafe file");
  return { canonical, bytes };
}

function slug(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function coordinate(kind, id, title, line) { return { kind, id, title, line }; }

function extractCoordinates(relativePath, text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const coordinates = [];
  if (relativePath.endsWith("/proposal.md")) {
    lines.forEach((line, index) => {
      const match = /^## (.+)$/.exec(line);
      if (match) coordinates.push(coordinate("proposal-section", `proposal:${slug(match[1])}`, match[1], index + 1));
    });
  } else if (relativePath.includes("/specs/") && relativePath.endsWith("/spec.md")) {
    const capability = relativePath.split("/specs/")[1].replace(/\/spec\.md$/, "");
    let requirement = null;
    lines.forEach((line, index) => {
      const requirementMatch = /^### Requirement: (.+)$/.exec(line);
      if (requirementMatch) {
        requirement = slug(requirementMatch[1]);
        coordinates.push(coordinate("requirement", `requirement:${capability}:${requirement}`, requirementMatch[1], index + 1));
        return;
      }
      const scenarioMatch = /^#### Scenario: (.+)$/.exec(line);
      if (scenarioMatch && requirement) {
        coordinates.push(coordinate("scenario", `scenario:${capability}:${requirement}:${slug(scenarioMatch[1])}`, scenarioMatch[1], index + 1));
      }
    });
  } else if (relativePath.endsWith("/design.md")) {
    lines.forEach((line, index) => {
      const match = /^### (.+)$/.exec(line);
      if (match) coordinates.push(coordinate("design-decision", `design:${slug(match[1])}`, match[1], index + 1));
    });
  } else if (relativePath.endsWith("/tasks.md")) {
    lines.forEach((line, index) => {
      const match = /^- \[([ xX])\] (\d+\.\d+) (.+)$/.exec(line);
      if (match) coordinates.push({ ...coordinate("task", `task:${match[2]}`, match[3], index + 1), complete: match[1].toLowerCase() === "x" });
    });
  }
  const ids = coordinates.map(item => item.id);
  if (ids.length > MAX_COORDINATES || new Set(ids).size !== ids.length) throw new Error("duplicate coordinate");
  if (relativePath.includes("/specs/") && (!coordinates.some(item => item.kind === "requirement")
    || !coordinates.some(item => item.kind === "scenario"))) throw new Error("missing spec coordinates");
  if (relativePath.endsWith("/tasks.md") && !coordinates.some(item => item.kind === "task")) throw new Error("missing task coordinates");
  return coordinates;
}

function normalizedTaskIntent(text) {
  return text.replaceAll("\r\n", "\n").replace(/^- \[[ xX]\] (\d+\.\d+) /gm, "- [ ] $1 ");
}

function taskState(coordinates) {
  return coordinates.filter(item => item.kind === "task").map(item => ({ id: item.id, title: item.title, complete: item.complete }));
}

function snapshotBytes(snapshot) { return Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8"); }
function progressBytes(progress) { return Buffer.from(`${JSON.stringify(progress, null, 2)}\n`, "utf8"); }
function progressPath(snapshotPath) { return path.join(path.dirname(snapshotPath), "openspec-progress.json"); }

export function isOpenSpecProgress(value, snapshot) {
  if (!exactlyKeys(value, ["schema_version", "kind", "change_name", "task_intent_sha256", "completed", "events"])
    || value.schema_version !== OPENSPEC_PROGRESS_SCHEMA_VERSION || value.kind !== "team_harness_openspec_progress"
    || value.change_name !== snapshot?.change?.name) return false;
  const taskArtifact = snapshot.artifacts?.find(item => item.artifact_id === "tasks");
  if (!taskArtifact || value.task_intent_sha256 !== taskArtifact.intent_sha256
    || !Array.isArray(value.completed) || new Set(value.completed).size !== value.completed.length
    || !Array.isArray(value.events) || value.events.length > MAX_PROGRESS_EVENTS) return false;
  const taskIds = new Set(taskArtifact.coordinates.filter(item => item.kind === "task").map(item => item.id));
  return value.completed.every(id => taskIds.has(id))
    && value.events.every(event => exactlyKeys(event, ["recorded_at", "task_ids", "previous_progress_sha256", "task_content_sha256"])
      && !Number.isNaN(Date.parse(event.recorded_at)) && Array.isArray(event.task_ids) && event.task_ids.length > 0
      && event.task_ids.every(id => taskIds.has(id)) && SHA256.test(event.previous_progress_sha256)
      && SHA256.test(event.task_content_sha256));
}

async function atomicWrite(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  let stat;
  try { stat = await lstat(target); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error("unsafe snapshot target");
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Run one fixed argv command and parse a bounded JSON document without exposing its raw output. */
export function runBoundedJson({ argv, cwd, timeoutMs = 30_000 } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every(item => safeString(item, 8192))
    || !safeString(cwd) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    return Promise.resolve({ ok: false, error_code: "ARGUMENT_INVALID" });
  }
  return new Promise(resolve => {
    let settled = false;
    let bytes = 0;
    const chunks = [];
    let child;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    try { child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "ignore"] }); }
    catch { resolve({ ok: false, error_code: "COMMAND_FAILED" }); return; }
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ ok: false, error_code: "COMMAND_FAILED" }); }, timeoutMs);
    child.stdout.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > MAX_JSON_BYTES) { child.kill("SIGKILL"); finish({ ok: false, error_code: "OUTPUT_LIMIT" }); return; }
      chunks.push(chunk);
    });
    child.on("error", () => finish({ ok: false, error_code: "COMMAND_FAILED" }));
    child.on("close", code => {
      if (settled) return;
      if (code !== 0) { finish({ ok: false, error_code: "COMMAND_FAILED" }); return; }
      try { finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
      catch { finish({ ok: false, error_code: "JSON_INVALID" }); }
    });
  });
}

function validateStatus(status, projectRoot, changeName) {
  if (status === null || typeof status !== "object" || status.changeName !== changeName
    || !safeString(status.schemaName, 128) || status.isPlanningComplete !== true
    || path.resolve(status.planningHome?.root ?? "") !== projectRoot
    || !contained(projectRoot, path.resolve(status.changeRoot ?? ""))
    || path.basename(status.changeRoot ?? "") !== changeName
    || status.actionContext?.mode !== "repo-local"
    || !status.artifactPaths || typeof status.artifactPaths !== "object") throw new Error("binding");
  const statuses = new Map((status.artifacts ?? []).map(item => [item.id, item.status]));
  const files = [{ artifact_id: "metadata", absolute: path.join(status.changeRoot, ".openspec.yaml") }];
  for (const [artifactId, descriptor] of Object.entries(status.artifactPaths)) {
    if (statuses.get(artifactId) !== "done" || !Array.isArray(descriptor.existingOutputPaths)
      || descriptor.existingOutputPaths.length === 0) throw new Error("incomplete");
    for (const absolute of descriptor.existingOutputPaths) files.push({ artifact_id: artifactId, absolute });
  }
  if (files.length > MAX_ARTIFACTS || new Set(files.map(item => path.resolve(item.absolute))).size !== files.length) throw new Error("artifact");
  return { schema: status.schemaName, changeRoot: path.resolve(status.changeRoot), files };
}

function validationPass(validation, changeName) {
  const matches = validation?.items?.filter(item => item.id === changeName && item.type === "change") ?? [];
  return matches.length === 1 && matches[0].valid === true && validation?.summary?.totals?.failed === 0;
}

async function gitHead(projectRoot, commandRunner) {
  const runner = commandRunner ?? (options => runBoundedCommand({ ...options, includeSuccessDiagnostic: true, timeoutMs: 30_000 }));
  const output = await runner({ argv: ["git", "-C", projectRoot, "rev-parse", "HEAD"] });
  const match = /\b[0-9a-f]{40,64}\b/.exec(`${output?.stdout?.tail ?? ""} ${output?.stderr?.tail ?? ""}`);
  if (output?.outcome !== "completed" || output.exit_code !== 0 || !match) throw new Error("git identity");
  return match[0];
}

export function isOpenSpecSnapshot(value) {
  if (!exactlyKeys(value, ["schema_version", "kind", "captured_at", "repository", "workspace", "toolchain", "change", "artifacts", "artifact_set_sha256"])) return false;
  if (value.schema_version !== OPENSPEC_SNAPSHOT_SCHEMA_VERSION || value.kind !== "team_harness_openspec_snapshot"
    || Number.isNaN(Date.parse(value.captured_at))) return false;
  if (!exactlyKeys(value.repository, ["root", "head_sha"]) || !safeString(value.repository.root)
    || !/^[a-f0-9]{40,64}$/.test(value.repository.head_sha)) return false;
  if (!exactlyKeys(value.workspace, ["root", "mode", "navigation_kind"]) || !safeString(value.workspace.root)
    || !["local", "obsidian"].includes(value.workspace.mode)
    || value.workspace.navigation_kind !== "repository-relative-coordinates") return false;
  if (!exactlyKeys(value.toolchain, ["runtime", "node_version", "npm_version", "openspec_version", "generated_targets"])
    || !safeString(value.toolchain.runtime, 32)
    || ![value.toolchain.node_version, value.toolchain.npm_version, value.toolchain.openspec_version].every(item => safeString(item, 128))
    || !Array.isArray(value.toolchain.generated_targets)
    || !value.toolchain.generated_targets.every(item => exactlyKeys(item, ["path", "sha256"])
      && safeRelative(item.path) && SHA256.test(item.sha256))) return false;
  if (!exactlyKeys(value.change, ["name", "schema", "root"]) || !CHANGE_NAME.test(value.change.name)
    || !safeString(value.change.schema, 128) || !safeString(value.change.root)) return false;
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0 || value.artifacts.length > MAX_ARTIFACTS) return false;
  if (!value.artifacts.every(item => exactlyKeys(item, ["artifact_id", "path", "content_sha256", "intent_sha256", "coordinates"])
    && safeString(item.artifact_id, 128) && safeRelative(item.path) && SHA256.test(item.content_sha256)
    && (item.intent_sha256 === null || SHA256.test(item.intent_sha256)) && Array.isArray(item.coordinates)
    && item.coordinates.length <= MAX_COORDINATES
    && item.coordinates.every(entry => {
      const keys = entry.kind === "task" ? ["kind", "id", "title", "line", "complete"] : ["kind", "id", "title", "line"];
      return exactlyKeys(entry, keys) && safeString(entry.kind, 64) && safeString(entry.id, 512)
        && safeString(entry.title, 1024) && Number.isSafeInteger(entry.line) && entry.line > 0
        && (entry.kind !== "task" || typeof entry.complete === "boolean");
    }))) return false;
  const paths = value.artifacts.map(item => item.path);
  const coordinateIds = value.artifacts.flatMap(item => item.coordinates.map(entry => entry.id));
  if (new Set(paths).size !== paths.length || new Set(coordinateIds).size !== coordinateIds.length
    || value.artifacts.filter(item => item.artifact_id === "tasks").length !== 1
    || value.artifacts.some(item => item.artifact_id === "tasks" ? item.intent_sha256 === null : item.intent_sha256 !== null)) return false;
  const expectedSetHash = hash(Buffer.from(value.artifacts.map(item => `${item.path}\0${item.content_sha256}`).join("\n")));
  if (!SHA256.test(value.artifact_set_sha256) || value.artifact_set_sha256 !== expectedSetHash) return false;
  return true;
}

export async function captureSnapshot({
  projectRoot, workspaceRoot, workspaceMode = "local", changeName, toolchain,
  snapshotPath = "inputs/openspec-snapshot.json", jsonRunner = runBoundedJson, commandRunner,
} = {}) {
  if (!(snapshotPath === "inputs/openspec-snapshot.json" || /^inputs\/openspec\/[a-z0-9]+(?:-[a-z0-9]+)*\/snapshot\.json$/.test(snapshotPath))) {
    return action("capture", "fail", "ARGUMENT_INVALID");
  }
  if (!CHANGE_NAME.test(changeName ?? "") || !["local", "obsidian"].includes(workspaceMode)
    || !isOpenSpecAdapterResult(toolchain) || toolchain.outcome !== "ready") {
    return action("capture", "fail", "TOOLCHAIN_NOT_READY");
  }
  let repository;
  let workspace;
  try { repository = await canonicalDirectory(projectRoot); workspace = await canonicalDirectory(workspaceRoot); }
  catch { return action("capture", "fail", "ARGUMENT_INVALID"); }
  if (path.resolve(toolchain.evidence.project_root ?? "") !== repository || !safeString(toolchain.evidence.executable)) {
    return action("capture", "fail", "TOOLCHAIN_NOT_READY");
  }
  const executable = toolchain.evidence.executable;
  const statusResult = await jsonRunner({ argv: [executable, "status", "--change", changeName, "--json"], cwd: repository });
  if (!statusResult?.ok) return action("capture", "fail", "STATUS_FAILED");
  const validationResult = await jsonRunner({ argv: [executable, "validate", changeName, "--strict", "--json", "--no-interactive"], cwd: repository });
  if (!validationResult?.ok || !validationPass(validationResult.value, changeName)) return action("capture", "fail", "VALIDATION_FAILED");
  let binding;
  try { binding = validateStatus(statusResult.value, repository, changeName); }
  catch (error) { return action("capture", "fail", error.message === "binding" ? "BINDING_INVALID" : "ARTIFACT_INVALID"); }
  const artifacts = [];
  try {
    for (const descriptor of binding.files) {
      const file = await regularFile(binding.changeRoot, path.resolve(descriptor.absolute));
      const relative = path.relative(repository, file.canonical).replaceAll("\\", "/");
      const text = file.bytes.toString("utf8");
      const coordinates = descriptor.artifact_id === "metadata" ? [] : extractCoordinates(relative, text);
      artifacts.push({
        artifact_id: descriptor.artifact_id,
        path: relative,
        content_sha256: hash(file.bytes),
        intent_sha256: descriptor.artifact_id === "tasks" ? hash(Buffer.from(normalizedTaskIntent(text))) : null,
        coordinates,
      });
    }
  } catch (error) {
    return action("capture", "fail", error.message.includes("coordinate") ? "COORDINATE_INVALID" : "ARTIFACT_INVALID");
  }
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  const allCoordinates = artifacts.flatMap(item => item.coordinates.map(entry => entry.id));
  if (new Set(allCoordinates).size !== allCoordinates.length) return action("capture", "fail", "COORDINATE_INVALID");
  let headSha;
  try { headSha = await gitHead(repository, commandRunner); } catch { return action("capture", "fail", "BINDING_INVALID"); }
  const taskArtifact = artifacts.find(item => item.artifact_id === "tasks");
  const snapshot = {
    schema_version: OPENSPEC_SNAPSHOT_SCHEMA_VERSION,
    kind: "team_harness_openspec_snapshot",
    captured_at: new Date().toISOString(),
    repository: { root: repository, head_sha: headSha },
    workspace: { root: workspace, mode: workspaceMode, navigation_kind: "repository-relative-coordinates" },
    toolchain: {
      runtime: toolchain.evidence.runtime,
      node_version: toolchain.evidence.node_version,
      npm_version: toolchain.evidence.npm_version,
      openspec_version: toolchain.evidence.openspec_version,
      generated_targets: toolchain.evidence.targets,
    },
    change: { name: changeName, schema: binding.schema, root: binding.changeRoot },
    artifacts,
    artifact_set_sha256: hash(Buffer.from(artifacts.map(item => `${item.path}\0${item.content_sha256}`).join("\n"))),
  };
  if (!isOpenSpecSnapshot(snapshot)) return action("capture", "fail", "SNAPSHOT_INVALID");
  const target = path.resolve(workspace, snapshotPath);
  if (!contained(workspace, target)) return action("capture", "fail", "ARGUMENT_INVALID");
  const progressTarget = progressPath(target);
  const progress = {
    schema_version: OPENSPEC_PROGRESS_SCHEMA_VERSION,
    kind: "team_harness_openspec_progress",
    change_name: changeName,
    task_intent_sha256: taskArtifact?.intent_sha256 ?? null,
    completed: taskArtifact ? taskState(taskArtifact.coordinates).filter(item => item.complete).map(item => item.id) : [],
    events: [],
  };
  if (!isOpenSpecProgress(progress, snapshot)) return action("capture", "fail", "SNAPSHOT_INVALID");
  const bytes = snapshotBytes(snapshot);
  try {
    await atomicWrite(progressTarget, progressBytes(progress));
    await atomicWrite(target, bytes);
  } catch { return action("capture", "fail", "SNAPSHOT_INVALID"); }
  return action("capture", "pass", null, { snapshot_path: target, snapshot_sha256: hash(bytes) });
}

export async function verifySnapshot({ snapshotPath, phase = "pre-gate1", authorizedTaskIds = [] } = {}) {
  const normalizedAuthorizedTaskIds = normalizeOpenSpecTaskIds(authorizedTaskIds);
  if (!safeString(snapshotPath) || !["pre-gate1", "implementation"].includes(phase)
    || normalizedAuthorizedTaskIds === null) {
    return action("verify", "fail", "ARGUMENT_INVALID");
  }
  let snapshot;
  let originalBytes;
  let progress;
  let originalProgressBytes;
  try {
    const stat = await lstat(snapshotPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) throw new Error("unsafe snapshot");
    originalBytes = await readFile(snapshotPath);
    snapshot = JSON.parse(originalBytes.toString("utf8"));
    const progressStat = await lstat(progressPath(snapshotPath));
    if (!progressStat.isFile() || progressStat.isSymbolicLink() || progressStat.size > MAX_JSON_BYTES) {
      throw new Error("unsafe progress");
    }
    originalProgressBytes = await readFile(progressPath(snapshotPath));
    progress = JSON.parse(originalProgressBytes.toString("utf8"));
  }
  catch { return action("verify", "fail", "SNAPSHOT_INVALID"); }
  if (!isOpenSpecSnapshot(snapshot)) return action("verify", "fail", "SNAPSHOT_INVALID");
  if (!isOpenSpecProgress(progress, snapshot)) return action("verify", "fail", "PROGRESS_INVALID");
  const changed = [];
  let currentTask = null;
  try {
    for (const artifact of snapshot.artifacts) {
      const file = await regularFile(snapshot.repository.root, path.join(snapshot.repository.root, artifact.path));
      const currentHash = hash(file.bytes);
      if (currentHash === artifact.content_sha256) continue;
      changed.push(artifact.path);
      if (artifact.artifact_id !== "tasks") return action("verify", "fail", "SOURCE_CHANGED", { snapshot_path: snapshotPath, changed });
      const text = file.bytes.toString("utf8");
      const coordinates = extractCoordinates(artifact.path, text);
      const intent = hash(Buffer.from(normalizedTaskIntent(text)));
      if (intent !== artifact.intent_sha256) return action("verify", "fail", "TASK_INTENT_CHANGED", { snapshot_path: snapshotPath, changed });
      currentTask = { artifact, currentHash, coordinates };
    }
  } catch { return action("verify", "fail", "ARTIFACT_INVALID", { snapshot_path: snapshotPath, changed }); }
  if (changed.length === 0) {
    if (phase !== "implementation") {
      return action("verify", "pass", null, { snapshot_path: snapshotPath, snapshot_sha256: hash(originalBytes) });
    }
    const latest = progress.events.at(-1);
    const repeated = latest && JSON.stringify(latest.task_ids.slice().sort())
      === JSON.stringify(normalizedAuthorizedTaskIds.slice().sort());
    return repeated
      ? action("verify", "pass", null, { snapshot_path: snapshotPath, snapshot_sha256: hash(originalBytes) })
      : action("verify", "fail", "TASK_PROGRESS_INVALID", { snapshot_path: snapshotPath });
  }
  if (phase !== "implementation" || !currentTask) return action("verify", "fail", "SOURCE_CHANGED", { snapshot_path: snapshotPath, changed });
  const previous = new Set(progress.completed);
  const current = new Set(taskState(currentTask.coordinates).filter(item => item.complete).map(item => item.id));
  if ([...previous].some(id => !current.has(id))) return action("verify", "fail", "TASK_PROGRESS_INVALID", { snapshot_path: snapshotPath, changed });
  const advanced = [...current].filter(id => !previous.has(id));
  const authorized = new Set(normalizedAuthorizedTaskIds);
  if (advanced.length === 0) {
    const latest = progress.events.at(-1);
    const repeated = latest && JSON.stringify(latest.task_ids.slice().sort())
      === JSON.stringify(normalizedAuthorizedTaskIds.slice().sort());
    return repeated
      ? action("verify", "pass", null, { snapshot_path: snapshotPath, snapshot_sha256: hash(originalBytes), changed })
      : action("verify", "fail", "TASK_PROGRESS_INVALID", { snapshot_path: snapshotPath, changed });
  }
  if (advanced.some(id => !authorized.has(id)) || normalizedAuthorizedTaskIds.some(id => !advanced.includes(id))) {
    return action("verify", "fail", "TASK_PROGRESS_INVALID", { snapshot_path: snapshotPath, changed });
  }
  progress.completed = [...current].sort();
  progress.events.push({
    recorded_at: new Date().toISOString(),
    task_ids: advanced.sort(),
    previous_progress_sha256: hash(originalProgressBytes),
    task_content_sha256: currentTask.currentHash,
  });
  if (!isOpenSpecProgress(progress, snapshot)) return action("verify", "fail", "PROGRESS_INVALID", { snapshot_path: snapshotPath, changed });
  try { await atomicWrite(progressPath(snapshotPath), progressBytes(progress)); }
  catch { return action("verify", "fail", "PROGRESS_INVALID", { snapshot_path: snapshotPath, changed }); }
  return action("verify", "pass", null, { snapshot_path: snapshotPath, snapshot_sha256: hash(originalBytes), changed });
}

async function runCli() {
  const [operation, raw] = process.argv.slice(2);
  let options;
  try { options = raw ? JSON.parse(raw) : {}; } catch { return action(operation === "verify" ? "verify" : "capture", "fail", "ARGUMENT_INVALID"); }
  if (operation === "verify" && options.phase === "implementation") {
    return action("verify", "fail", "ATOMIC_TRANSITION_REQUIRED");
  }
  return operation === "verify" ? verifySnapshot(options) : captureSnapshot(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const output = await runCli().catch(() => action("capture", "fail", "INTERNAL_ERROR"));
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!isSnapshotAction(output) || output.verdict !== "pass") process.exitCode = 1;
}
