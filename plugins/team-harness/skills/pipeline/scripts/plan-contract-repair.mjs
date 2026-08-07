#!/usr/bin/env node
/** Repair closed, non-semantic plan-manifest omissions before Gate 1. */

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validatePlanContract } from "./plan-contract.mjs";

export const PLAN_CONTRACT_REPAIR_SCHEMA_VERSION = 1;

const MAX_PLAN_BYTES = 1024 * 1024;
const MAX_TASKS = 128;
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "verdict",
  "reason",
  "plan",
  "before_sha256",
  "after_sha256",
  "added_paths",
  "contract_verdict",
  "contract_error_code",
  "contract_result_sha256",
];
const REASONS = new Set([
  "arguments-invalid",
  "workspace-invalid",
  "path-invalid",
  "artifact-invalid",
  "artifact-escaped",
  "manifest-or-index-missing",
  "manifest-paths-invalid",
  "task-index-semantic-or-format-defect",
  "task-index-invalid",
  "no-eligible-manifest-omission",
  "post-repair-validation-unavailable",
  "repair-failed",
  "contract-already-passes",
  "manifest-task-routes-added",
  "manifest-task-routes-added-with-residual-findings",
]);

class RepairError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\u0000")) return false;
  const normalized = value.replaceAll("\\", "/");
  return Buffer.byteLength(normalized, "utf8") <= 512 &&
    !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const inner = trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed.slice(1);
  return inner.split("|").map((cell) => cell.trim());
}

async function resolveWorkspace(input) {
  if (typeof input !== "string" || input.length === 0) throw new RepairError("workspace-invalid");
  try {
    const workspace = await realpath(path.resolve(input));
    const stat = await lstat(workspace);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid workspace");
    return workspace;
  } catch {
    throw new RepairError("workspace-invalid");
  }
}

async function readRegularContained(workspace, relative, maxBytes = MAX_PLAN_BYTES) {
  if (!safeRelative(relative)) throw new RepairError("path-invalid");
  try {
    const requested = path.resolve(workspace, relative);
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error("invalid artifact");
    const canonical = await realpath(requested);
    if (!contained(workspace, canonical)) throw new RepairError("artifact-escaped");
    return { requested, stat, bytes: await readFile(canonical) };
  } catch (error) {
    if (error instanceof RepairError) throw error;
    throw new RepairError("artifact-invalid");
  }
}

function parseRepairCandidate(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const manifestStart = lines.indexOf("## Plan Manifest");
  const taskIndexStart = lines.indexOf("### Task Index", manifestStart + 1);
  if (manifestStart < 0 || taskIndexStart < 0) throw new RepairError("manifest-or-index-missing");

  let taskIndexEnd = lines.length;
  for (let index = taskIndexStart + 1; index < lines.length; index += 1) {
    const heading = /^(#{1,3})\s/.exec(lines[index]);
    if (heading) {
      taskIndexEnd = index;
      break;
    }
  }

  const manifestText = lines.slice(manifestStart + 1, taskIndexStart).join("\n");
  const manifestPaths = [...manifestText.matchAll(/`(plan\/[A-Za-z0-9._/-]+\.md)`/g)].map((match) => match[1]);
  if (manifestPaths.length === 0 || new Set(manifestPaths).size !== manifestPaths.length) {
    throw new RepairError("manifest-paths-invalid");
  }

  const taskRows = [];
  for (const line of lines.slice(taskIndexStart + 1, taskIndexEnd)) {
    const cells = tableCells(line);
    if (!/^Task-\d+$/.test(cells[0] ?? "")) continue;
    const [id, , status, acCountRaw, tcCountRaw, pathCell] = cells;
    const acCount = Number(acCountRaw);
    const tcCount = Number(tcCountRaw);
    const declaredPath = (pathCell ?? "").replaceAll("`", "");
    const canonicalPath = `plan/tasks/${id}.md`;
    if (status !== "pending" || !Number.isSafeInteger(acCount) || acCount < 1 ||
      !Number.isSafeInteger(tcCount) || tcCount < 0 || declaredPath !== canonicalPath) {
      throw new RepairError("task-index-semantic-or-format-defect");
    }
    taskRows.push({ id, path: canonicalPath });
  }
  if (taskRows.length === 0 || taskRows.length > MAX_TASKS ||
    new Set(taskRows.map((task) => task.id)).size !== taskRows.length) {
    throw new RepairError("task-index-invalid");
  }

  const existing = new Set(manifestPaths);
  const missing = taskRows.filter((task) => !existing.has(task.path));
  return { eol, lines, taskIndexStart, missing };
}

async function atomicReplace(target, bytes, mode) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: mode & 0o777 });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

function contractDigest(contract) {
  return sha256(Buffer.from(`${JSON.stringify(contract)}\n`, "utf8"));
}

function exactlyKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isPlanContractRepairResult(value) {
  if (!exactlyKeys(value, RESULT_KEYS) || value.schema_version !== PLAN_CONTRACT_REPAIR_SCHEMA_VERSION ||
    value.kind !== "team_harness_plan_contract_mechanical_repair" ||
    !["not-needed", "repaired", "blocked"].includes(value.verdict) || !REASONS.has(value.reason) ||
    value.plan !== "01-plan.md" || !isDigest(value.before_sha256) || !isDigest(value.after_sha256) ||
    !Array.isArray(value.added_paths) || value.added_paths.length > MAX_TASKS ||
    !value.added_paths.every((entry) => /^plan\/tasks\/Task-\d+\.md$/.test(entry)) ||
    new Set(value.added_paths).size !== value.added_paths.length ||
    !["pass", "fail"].includes(value.contract_verdict) ||
    !(value.contract_error_code === null || /^[A-Z_]+$/.test(value.contract_error_code)) ||
    !isDigest(value.contract_result_sha256)) return false;
  if (value.verdict === "repaired") {
    if (value.added_paths.length === 0 || value.before_sha256 === value.after_sha256 ||
      !value.reason.startsWith("manifest-task-routes-added")) return false;
  } else if (value.added_paths.length !== 0 || value.before_sha256 !== value.after_sha256) return false;
  if (value.verdict === "not-needed" &&
    (value.reason !== "contract-already-passes" || value.contract_verdict !== "pass")) return false;
  return true;
}

function result({ verdict, reason, before, after, addedPaths, contract }) {
  return {
    schema_version: PLAN_CONTRACT_REPAIR_SCHEMA_VERSION,
    kind: "team_harness_plan_contract_mechanical_repair",
    verdict,
    reason,
    plan: "01-plan.md",
    before_sha256: sha256(before),
    after_sha256: sha256(after),
    added_paths: addedPaths,
    contract_verdict: contract.verdict,
    contract_error_code: contract.error_code,
    contract_result_sha256: contractDigest(contract),
  };
}

export async function repairPlanContract(options) {
  let before = Buffer.alloc(0);
  let contract = await validatePlanContract(options);
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).length !== 2 || options.plan !== "01-plan.md") {
      return result({ verdict: "blocked", reason: "arguments-invalid", before, after: before, addedPaths: [], contract });
    }
    const workspace = await resolveWorkspace(options.workspace);
    const plan = await readRegularContained(workspace, options.plan);
    before = plan.bytes;
    contract = await validatePlanContract(options);
    if (contract.verdict === "pass") {
      return result({ verdict: "not-needed", reason: "contract-already-passes", before, after: before, addedPaths: [], contract });
    }

    const parsed = parseRepairCandidate(before.toString("utf8"));
    if (parsed.missing.length === 0) {
      return result({ verdict: "blocked", reason: "no-eligible-manifest-omission", before, after: before, addedPaths: [], contract });
    }
    for (const task of parsed.missing) await readRegularContained(workspace, task.path);

    let insertionIndex = parsed.taskIndexStart;
    while (insertionIndex > 0 && parsed.lines[insertionIndex - 1] === "") insertionIndex -= 1;
    const rows = parsed.missing.map((task) => `| task | ${task.id} | \`${task.path}\` | AC/TC/verification |`);
    const candidateLines = [...parsed.lines];
    candidateLines.splice(insertionIndex, 0, ...rows, "");
    const candidate = Buffer.from(candidateLines.join(parsed.eol), "utf8");
    await atomicReplace(plan.requested, candidate, plan.stat.mode);
    const postContract = await validatePlanContract(options);
    if (postContract.error_code === "INTERNAL_ERROR" || postContract.error_code === "ARGUMENT_INVALID") {
      await atomicReplace(plan.requested, before, plan.stat.mode);
      return result({ verdict: "blocked", reason: "post-repair-validation-unavailable", before, after: before, addedPaths: [], contract });
    }
    return result({
      verdict: "repaired",
      reason: postContract.verdict === "pass" ? "manifest-task-routes-added" : "manifest-task-routes-added-with-residual-findings",
      before,
      after: candidate,
      addedPaths: parsed.missing.map((task) => task.path),
      contract: postContract,
    });
  } catch (error) {
    return result({
      verdict: "blocked",
      reason: error instanceof RepairError && REASONS.has(error.code) ? error.code : "repair-failed",
      before,
      after: before,
      addedPaths: [],
      contract,
    });
  }
}

function parseCli(argv) {
  if (argv.length !== 4) return null;
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index] === "--workspace" ? "workspace" : argv[index] === "--plan" ? "plan" : null;
    if (key === null || Object.hasOwn(values, key)) return null;
    values[key] = argv[index + 1];
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await repairPlanContract(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.verdict === "blocked") process.exitCode = 1;
}
