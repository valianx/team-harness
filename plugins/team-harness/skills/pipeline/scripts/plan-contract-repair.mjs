#!/usr/bin/env node
/** Normalize closed, non-semantic plan-format defects before Gate 1. */

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validatePlanContract } from "./plan-contract.mjs";

export const PLAN_CONTRACT_REPAIR_SCHEMA_VERSION = 2;

const MAX_BYTES = 1024 * 1024;
const MAX_TASKS = 128;
const OPERATIONS = new Set([
  "task-index-columns",
  "manifest-task-routes",
  "architecture-heading-levels",
  "task-heading-levels",
  "acceptance-grammar",
  "technical-constraint-grammar",
]);
const REASONS = new Set([
  "arguments-invalid", "workspace-invalid", "path-invalid", "artifact-invalid", "artifact-escaped",
  "manifest-or-index-missing", "manifest-paths-invalid", "task-index-semantic-or-format-defect",
  "task-index-invalid", "no-eligible-mechanical-repair", "post-repair-validation-unavailable",
  "repair-failed", "contract-already-passes", "mechanical-format-normalized",
  "mechanical-format-normalized-with-residual-findings",
]);
const RESULT_KEYS = [
  "schema_version", "kind", "verdict", "reason", "plan", "before_sha256", "after_sha256",
  "added_paths", "artifact_changes", "contract_verdict", "contract_error_code", "contract_result_sha256",
];
const INDEX_HEADERS = ["Task", "Service", "Status", "AC count", "TC count", "Path"];

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

function renderRow(cells) {
  return `| ${cells.join(" | ")} |`;
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

async function readArtifact(workspace, relative) {
  if (!safeRelative(relative)) throw new RepairError("path-invalid");
  try {
    const requested = path.resolve(workspace, relative);
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("invalid artifact");
    const canonical = await realpath(requested);
    if (!contained(workspace, canonical)) throw new RepairError("artifact-escaped");
    return { path: relative, requested, stat, bytes: await readFile(canonical) };
  } catch (error) {
    if (error instanceof RepairError) throw error;
    throw new RepairError("artifact-invalid");
  }
}

function structure(lines) {
  const manifests = lines.map((line, position) => ({ line, position })).filter((entry) => entry.line === "## Plan Manifest");
  const indexes = lines.map((line, position) => ({ line, position })).filter((entry) => entry.line === "### Task Index");
  if (manifests.length !== 1 || indexes.length !== 1) throw new RepairError("manifest-or-index-missing");
  const manifestStart = manifests[0].position;
  const indexStart = indexes[0].position;
  let manifestEnd = lines.length;
  for (let position = manifestStart + 1; position < lines.length; position += 1) {
    if (/^#{1,2}\s/.test(lines[position])) {
      manifestEnd = position;
      break;
    }
  }
  if (indexStart <= manifestStart || indexStart >= manifestEnd) throw new RepairError("manifest-or-index-missing");
  let indexEnd = manifestEnd;
  for (let position = indexStart + 1; position < manifestEnd; position += 1) {
    if (/^#{1,3}\s/.test(lines[position])) {
      indexEnd = position;
      break;
    }
  }
  return { manifestStart, manifestEnd, indexStart, indexEnd };
}

function normalizeIndex(lines) {
  const bounds = structure(lines);
  const headerPosition = lines.findIndex((line, position) =>
    position > bounds.indexStart && position < bounds.indexEnd &&
    tableCells(line).length === INDEX_HEADERS.length &&
    INDEX_HEADERS.every((header) => tableCells(line).includes(header)));
  if (headerPosition < 0) throw new RepairError("task-index-semantic-or-format-defect");
  const actualHeaders = tableCells(lines[headerPosition]);
  const positions = INDEX_HEADERS.map((header) => actualHeaders.indexOf(header));
  let separatorPosition = headerPosition + 1;
  while (separatorPosition < bounds.indexEnd && lines[separatorPosition].trim() === "") separatorPosition += 1;
  const separators = tableCells(lines[separatorPosition] ?? "");
  if (separators.length !== INDEX_HEADERS.length || separators.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    throw new RepairError("task-index-semantic-or-format-defect");
  }
  const output = [...lines];
  let changed = actualHeaders.some((header, index) => header !== INDEX_HEADERS[index]);
  output[headerPosition] = renderRow(INDEX_HEADERS);
  output[separatorPosition] = renderRow(INDEX_HEADERS.map(() => "------"));
  for (let position = separatorPosition + 1; position < bounds.indexEnd; position += 1) {
    const cells = tableCells(lines[position]);
    if (cells.length === 0) continue;
    const taskCell = cells.find((cell) => /^Task-\d+$/.test(cell));
    if (taskCell === undefined || cells.length !== INDEX_HEADERS.length) {
      throw new RepairError("task-index-semantic-or-format-defect");
    }
    const reordered = positions.map((index) => cells[index]);
    if (reordered.some((cell, index) => cell !== cells[index])) changed = true;
    output[position] = renderRow(reordered);
  }
  return { lines: output, operations: changed ? ["task-index-columns"] : [] };
}

function parsePlan(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = normalizeIndex(text.split(/\r?\n/));
  const lines = normalized.lines;
  const bounds = structure(lines);
  const manifestText = lines.slice(bounds.manifestStart + 1, bounds.indexStart).join("\n");
  const paths = [...manifestText.matchAll(/`(plan\/[A-Za-z0-9._/-]+\.md)`/g)].map((match) => match[1]);
  if (paths.length === 0 || new Set(paths).size !== paths.length) throw new RepairError("manifest-paths-invalid");
  const tasks = [];
  for (const line of lines.slice(bounds.indexStart + 1, bounds.indexEnd)) {
    const cells = tableCells(line);
    if (!/^Task-\d+$/.test(cells[0] ?? "")) continue;
    const [id, , status, acRaw, tcRaw, pathCell] = cells;
    const acCount = Number(acRaw);
    const tcCount = Number(tcRaw);
    const canonicalPath = `plan/tasks/${id}.md`;
    if (status !== "pending" || !Number.isSafeInteger(acCount) || acCount < 1 ||
      !Number.isSafeInteger(tcCount) || tcCount < 0 || (pathCell ?? "").replaceAll("`", "") !== canonicalPath) {
      throw new RepairError("task-index-semantic-or-format-defect");
    }
    tasks.push({ id, path: canonicalPath });
  }
  if (tasks.length === 0 || tasks.length > MAX_TASKS || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new RepairError("task-index-invalid");
  }
  const existing = new Set(paths);
  return { eol, lines, bounds, paths, tasks, missing: tasks.filter((task) => !existing.has(task.path)), operations: normalized.operations };
}

function normalizeNamedHeadings(text, headings, operation) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let changed = false;
  for (const [name, level] of headings) {
    const matches = lines.map((line, position) => ({ line, position }))
      .filter((entry) => /^#{1,6}\s/.test(entry.line) && entry.line.replace(/^#{1,6}\s+/, "") === name);
    if (matches.length !== 1) continue;
    const canonical = `${"#".repeat(level)} ${name}`;
    if (lines[matches[0].position] !== canonical) {
      lines[matches[0].position] = canonical;
      changed = true;
    }
  }
  return { eol, lines, operations: changed ? [operation] : [] };
}

function sectionBounds(lines, name) {
  const heading = `#### ${name}`;
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let position = start + 1; position < lines.length; position += 1) {
    if (/^#{1,4}\s/.test(lines[position])) {
      end = position;
      break;
    }
  }
  return { start, end };
}

function normalizeTask(text) {
  const normalized = normalizeNamedHeadings(text, [
    ["Acceptance Criteria", 4], ["Technical Constraints", 4], ["Verification", 4],
  ], "task-heading-levels");
  const operations = [...normalized.operations];
  const acceptance = sectionBounds(normalized.lines, "Acceptance Criteria");
  const constraints = sectionBounds(normalized.lines, "Technical Constraints");
  if (acceptance !== null) {
    for (let position = acceptance.start + 1; position < acceptance.end; position += 1) {
      const match = /^(\s*)- \[([ x])\] \*\*(AC-\d+)\*\*\s*(?::|—|-)\s*(.+)$/.exec(normalized.lines[position]);
      if (!match || !/^given\s/i.test(match[4])) continue;
      const whenMatches = [...match[4].matchAll(/,\s*when\s+/gi)];
      const thenMatches = [...match[4].matchAll(/,\s*then\s+/gi)];
      if (whenMatches.length !== 1 || thenMatches.length !== 1 || whenMatches[0].index >= thenMatches[0].index) continue;
      const prose = match[4].replace(/^given\s+/i, "Given ").replace(/,\s*when\s+/i, ", When ").replace(/,\s*then\s+/i, ", Then ");
      const canonical = `${match[1]}- [${match[2]}] **${match[3]}**: ${prose}`;
      if (normalized.lines[position] !== canonical) {
        normalized.lines[position] = canonical;
        if (!operations.includes("acceptance-grammar")) operations.push("acceptance-grammar");
      }
    }
  }
  if (constraints !== null) {
    for (let position = constraints.start + 1; position < constraints.end; position += 1) {
      const match = /^(\s*)- (?:\[ \] )?\*\*(TC-\d+)\*\*\s*(?::|—|-)\s*(.+)$/.exec(normalized.lines[position]);
      if (!match) continue;
      const canonical = `${match[1]}- **${match[2]}**: ${match[3]}`;
      if (normalized.lines[position] !== canonical) {
        normalized.lines[position] = canonical;
        if (!operations.includes("technical-constraint-grammar")) operations.push("technical-constraint-grammar");
      }
    }
  }
  return { bytes: Buffer.from(normalized.lines.join(normalized.eol), "utf8"), operations };
}

function normalizeArchitecture(text) {
  const normalized = normalizeNamedHeadings(text, [
    ["Architecture", 1], ["Proposed Approach", 3], ["Patterns to Mirror", 3],
    ["Engineering Risks and Trade-offs", 3], ["Services Touched", 3], ["Work Plan", 3],
  ], "architecture-heading-levels");
  return { bytes: Buffer.from(normalized.lines.join(normalized.eol), "utf8"), operations: normalized.operations };
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

async function applyChanges(changes, useCandidate) {
  const applied = [];
  try {
    for (const change of changes) {
      await atomicReplace(change.requested, useCandidate ? change.candidate : change.bytes, change.stat.mode);
      applied.push(change);
    }
  } catch (error) {
    if (useCandidate) {
      for (const change of applied.reverse()) await atomicReplace(change.requested, change.bytes, change.stat.mode).catch(() => {});
    }
    throw error;
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

function evidenceChanges(changes) {
  return changes.map((change) => ({
    path: change.path,
    before_sha256: sha256(change.bytes),
    after_sha256: sha256(change.candidate),
    operations: change.operations,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

export function isPlanContractRepairResult(value) {
  if (!exactlyKeys(value, RESULT_KEYS) || value.schema_version !== PLAN_CONTRACT_REPAIR_SCHEMA_VERSION ||
    value.kind !== "team_harness_plan_contract_mechanical_repair" ||
    !["not-needed", "repaired", "blocked"].includes(value.verdict) || !REASONS.has(value.reason) ||
    value.plan !== "01-plan.md" || !isDigest(value.before_sha256) || !isDigest(value.after_sha256) ||
    !Array.isArray(value.added_paths) || value.added_paths.length > MAX_TASKS ||
    !value.added_paths.every((entry) => /^plan\/tasks\/Task-\d+\.md$/.test(entry)) ||
    new Set(value.added_paths).size !== value.added_paths.length || !Array.isArray(value.artifact_changes) ||
    value.artifact_changes.length > MAX_TASKS + 2 || !value.artifact_changes.every((entry) =>
      exactlyKeys(entry, ["path", "before_sha256", "after_sha256", "operations"]) && safeRelative(entry.path) &&
      isDigest(entry.before_sha256) && isDigest(entry.after_sha256) && entry.before_sha256 !== entry.after_sha256 &&
      Array.isArray(entry.operations) && entry.operations.length > 0 &&
      entry.operations.every((operation) => OPERATIONS.has(operation)) && new Set(entry.operations).size === entry.operations.length) ||
    !["pass", "fail"].includes(value.contract_verdict) ||
    !(value.contract_error_code === null || /^[A-Z_]+$/.test(value.contract_error_code)) ||
    !isDigest(value.contract_result_sha256)) return false;
  if (value.verdict === "repaired") {
    if (value.artifact_changes.length === 0 || !value.reason.startsWith("mechanical-format-normalized")) return false;
  } else if (value.added_paths.length !== 0 || value.artifact_changes.length !== 0 || value.before_sha256 !== value.after_sha256) return false;
  return value.verdict !== "not-needed" || (value.reason === "contract-already-passes" && value.contract_verdict === "pass");
}

function result({ verdict, reason, before, after, addedPaths, changes, contract }) {
  return {
    schema_version: PLAN_CONTRACT_REPAIR_SCHEMA_VERSION,
    kind: "team_harness_plan_contract_mechanical_repair",
    verdict, reason, plan: "01-plan.md", before_sha256: sha256(before), after_sha256: sha256(after),
    added_paths: addedPaths, artifact_changes: evidenceChanges(changes), contract_verdict: contract.verdict,
    contract_error_code: contract.error_code, contract_result_sha256: contractDigest(contract),
  };
}

export async function repairPlanContract(options) {
  let before = Buffer.alloc(0);
  let contract = await validatePlanContract(options);
  let changes = [];
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).length !== 2 || options.plan !== "01-plan.md") {
      return result({ verdict: "blocked", reason: "arguments-invalid", before, after: before, addedPaths: [], changes, contract });
    }
    const workspace = await resolveWorkspace(options.workspace);
    const plan = await readArtifact(workspace, options.plan);
    before = plan.bytes;
    contract = await validatePlanContract(options);
    if (contract.verdict === "pass") {
      return result({ verdict: "not-needed", reason: "contract-already-passes", before, after: before, addedPaths: [], changes, contract });
    }

    const parsed = parsePlan(before.toString("utf8"));
    for (const task of parsed.tasks) await readArtifact(workspace, task.path);
    let insertionIndex = parsed.bounds.indexStart;
    while (insertionIndex > 0 && parsed.lines[insertionIndex - 1] === "") insertionIndex -= 1;
    if (parsed.missing.length > 0) {
      const rows = parsed.missing.map((task) => `| task | ${task.id} | \`${task.path}\` | AC/TC/verification |`);
      parsed.lines.splice(insertionIndex, 0, ...rows, "");
      parsed.operations.push("manifest-task-routes");
    }
    const planCandidate = Buffer.from(parsed.lines.join(parsed.eol), "utf8");
    if (!planCandidate.equals(plan.bytes)) changes.push({ ...plan, candidate: planCandidate, operations: parsed.operations });

    const artifactPaths = new Set(parsed.tasks.map((task) => task.path));
    if (parsed.paths.includes("plan/architecture.md")) artifactPaths.add("plan/architecture.md");
    for (const relative of [...artifactPaths].sort()) {
      const artifact = await readArtifact(workspace, relative);
      const normalized = relative === "plan/architecture.md"
        ? normalizeArchitecture(artifact.bytes.toString("utf8"))
        : normalizeTask(artifact.bytes.toString("utf8"));
      if (!normalized.bytes.equals(artifact.bytes)) changes.push({ ...artifact, candidate: normalized.bytes, operations: normalized.operations });
    }
    if (changes.length === 0) {
      return result({ verdict: "blocked", reason: "no-eligible-mechanical-repair", before, after: before, addedPaths: [], changes, contract });
    }

    await applyChanges(changes, true);
    const postContract = await validatePlanContract(options);
    if (["INTERNAL_ERROR", "ARGUMENT_INVALID"].includes(postContract.error_code)) {
      await applyChanges(changes, false);
      changes = [];
      return result({ verdict: "blocked", reason: "post-repair-validation-unavailable", before, after: before, addedPaths: [], changes, contract });
    }
    const finalPlan = changes.find((change) => change.path === "01-plan.md")?.candidate ?? before;
    return result({
      verdict: "repaired",
      reason: postContract.verdict === "pass" ? "mechanical-format-normalized" : "mechanical-format-normalized-with-residual-findings",
      before, after: finalPlan, addedPaths: parsed.missing.map((task) => task.path), changes, contract: postContract,
    });
  } catch (error) {
    return result({
      verdict: "blocked",
      reason: error instanceof RepairError && REASONS.has(error.code) ? error.code : "repair-failed",
      before, after: before, addedPaths: [], changes: [], contract,
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
