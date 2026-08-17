#!/usr/bin/env node
/** Validate the deterministic structure of a functional-first sharded plan. */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateOpenSpecOverlay } from "./openspec-overlay.mjs";

export const PLAN_CONTRACT_SCHEMA_VERSION = 1;

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_ARTIFACTS = 128;
const MAX_FINDINGS = 64;
const RESULT_KEYS = [
  "schema_version",
  "kind",
  "verdict",
  "error_code",
  "duration_ms",
  "plan",
  "artifact_set_sha256",
  "artifacts",
  "functional",
  "tasks",
  "findings",
];
const ERROR_CODES = new Set([
  null,
  "ARGUMENT_INVALID",
  "PLAN_INVALID",
  "FUNCTIONAL_CONTRACT_INVALID",
  "MANIFEST_INVALID",
  "TASK_INDEX_INVALID",
  "TASK_INVALID",
  "INTERNAL_ERROR",
]);
const FINDING_CODES = new Set([
  "FORMAT_MISSING",
  "FUNCTIONAL_ORDER",
  "FUNCTIONAL_EMPTY",
  "FUNCTIONAL_LABEL_MISSING",
  "FUNCTIONAL_TECHNICAL_LEAKAGE",
  "DECISION_INVALID",
  "MANIFEST_PATH_INVALID",
  "MANIFEST_REQUIRED_ARTIFACT_MISSING",
  "TASK_INDEX_INVALID",
  "TASK_SECTION_MISSING",
  "TASK_ACCEPTANCE_INVALID",
  "TASK_TECHNICAL_CONSTRAINT_INVALID",
  "TASK_VERIFICATION_INVALID",
  "TASK_COUNT_MISMATCH",
  "ARCHITECTURE_SECTION_MISSING",
]);
const FUNCTIONAL_SECTIONS = [
  "Problem and Observable Outcome",
  "Actors and Flows",
  "Business Rules and Examples",
  "Alternate and Error Behavior",
  "Unchanged Behavior",
  "Non-Goals",
  "Decisions for human review",
];

class ContractError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactlyKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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

async function resolveWorkspace(input) {
  if (typeof input !== "string" || input.length === 0) throw new ContractError("ARGUMENT_INVALID");
  try {
    const workspace = await realpath(path.resolve(input));
    const stat = await lstat(workspace);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid workspace");
    return workspace;
  } catch {
    throw new ContractError("ARGUMENT_INVALID");
  }
}

async function readArtifact(workspace, relative) {
  if (!safeRelative(relative)) throw new ContractError("MANIFEST_INVALID");
  try {
    const requested = path.resolve(workspace, relative);
    const stat = await lstat(requested);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) throw new Error("invalid artifact");
    const canonical = await realpath(requested);
    if (!contained(workspace, canonical)) throw new Error("artifact escaped workspace");
    const bytes = await readFile(canonical);
    if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error("artifact too large");
    return { path: relative.replaceAll("\\", "/"), bytes, text: bytes.toString("utf8").replaceAll("\r\n", "\n") };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError("MANIFEST_INVALID");
  }
}

function sectionLines(lines, heading, level) {
  const marker = `${"#".repeat(level)} ${heading}`;
  const start = lines.findIndex((line) => line === marker);
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s/.exec(lines[index]);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return { start, end, lines: lines.slice(start + 1, end) };
}

function subsectionBody(reviewLines, name, nextNames) {
  const marker = `### ${name}`;
  const start = reviewLines.findIndex((line) => line === marker);
  if (start < 0) return null;
  let end = reviewLines.length;
  for (let index = start + 1; index < reviewLines.length; index += 1) {
    if (nextNames.includes(reviewLines[index])) {
      end = index;
      break;
    }
  }
  return reviewLines.slice(start + 1, end).filter((line) => line.trim().length > 0);
}

function finding(code, artifact, section) {
  return { code, artifact, section };
}

function inspectFunctional(lines, findings) {
  const review = sectionLines(lines, "Review Summary", 2);
  const firstH2 = lines.find((line) => /^##\s/.test(line));
  if (review === null || firstH2 !== "## Review Summary") {
    findings.push(finding("FUNCTIONAL_ORDER", "01-plan.md", "Review Summary"));
    return null;
  }
  const headings = review.lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.startsWith("### "));
  const positions = FUNCTIONAL_SECTIONS.map((name) => headings.find((entry) => entry.line === `### ${name}`)?.index ?? -1);
  if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    findings.push(finding("FUNCTIONAL_ORDER", "01-plan.md", "Review Summary"));
  }

  const renderedHeadings = headings.map((entry) => entry.line);
  const sections = [];
  for (const name of FUNCTIONAL_SECTIONS) {
    const body = subsectionBody(review.lines, name, renderedHeadings);
    if (body === null || body.length === 0) findings.push(finding("FUNCTIONAL_EMPTY", "01-plan.md", name));
    sections.push({ name, nonempty_lines: body?.length ?? 0 });
    if (name === "Problem and Observable Outcome" &&
      (!body?.some((line) => line.startsWith("- Problem:")) || !body.some((line) => line.startsWith("- Observable outcome:")))) {
      findings.push(finding("FUNCTIONAL_LABEL_MISSING", "01-plan.md", name));
    }
    const declaredNone = body?.length === 1 && /^- None — .+/.test(body[0]);
    if (name === "Actors and Flows" && !declaredNone && !body?.some((line) => line.startsWith("- Actor:"))) {
      findings.push(finding("FUNCTIONAL_LABEL_MISSING", "01-plan.md", name));
    }
    if (name === "Business Rules and Examples" && !declaredNone &&
      (!body?.some((line) => line.startsWith("- Rule:")) || !body.some((line) => line.startsWith("- Example:")))) {
      findings.push(finding("FUNCTIONAL_LABEL_MISSING", "01-plan.md", name));
    }
    if (["Alternate and Error Behavior", "Unchanged Behavior", "Non-Goals"].includes(name) &&
      !body?.some((line) => line.startsWith("- "))) {
      findings.push(finding("FUNCTIONAL_LABEL_MISSING", "01-plan.md", name));
    }
  }

  const decisions = subsectionBody(review.lines, "Decisions for human review", renderedHeadings) ?? [];
  const decisionBullets = decisions.filter((line) => line.startsWith("- "));
  if (decisionBullets.length < 1 || decisionBullets.length > 7 ||
    decisionBullets.some((line) => !line.includes("→ decided") && !line.includes("→ open question"))) {
    findings.push(finding("DECISION_INVALID", "01-plan.md", "Decisions for human review"));
  }

  const reviewText = review.lines.join("\n");
  if (
    reviewText.includes("```") ||
    /`[^`\n]*:\d+`/.test(reviewText) ||
    /^### (?:Proposed Approach|Patterns to Mirror|Engineering Risks and Trade-offs|Work Plan)$/m.test(reviewText)
  ) {
    findings.push(finding("FUNCTIONAL_TECHNICAL_LEAKAGE", "01-plan.md", "Review Summary"));
  }
  return { sections, decision_count: decisionBullets.length };
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const inner = trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed.slice(1);
  return inner.split("|").map((cell) => cell.trim());
}

function inspectIndex(lines, findings) {
  const manifestHeadings = lines
    .map((line, position) => ({ line, position }))
    .filter((entry) => entry.line === "## Plan Manifest");
  const indexHeadings = lines
    .map((line, position) => ({ line, position }))
    .filter((entry) => entry.line === "### Task Index");
  const manifest = manifestHeadings.length === 1 ? sectionLines(lines, "Plan Manifest", 2) : null;
  const index = indexHeadings.length === 1 ? sectionLines(lines, "Task Index", 3) : null;
  if (manifest === null || index === null || index.start <= manifest.start || index.start >= manifest.end) {
    findings.push(finding("TASK_INDEX_INVALID", "01-plan.md", "Plan Manifest/Task Index"));
    return { paths: [], tasks: [] };
  }
  const taskIndexOffset = manifest.lines.findIndex((line) => line === "### Task Index");
  const manifestOnly = taskIndexOffset >= 0 ? manifest.lines.slice(0, taskIndexOffset) : manifest.lines;
  const paths = [...manifestOnly.join("\n").matchAll(/`(plan\/[A-Za-z0-9._/-]+\.md)`/g)].map((match) => match[1]);
  if (paths.length === 0 || paths.length > MAX_ARTIFACTS || new Set(paths).size !== paths.length || paths.some((entry) => !safeRelative(entry))) {
    findings.push(finding("MANIFEST_PATH_INVALID", "01-plan.md", "Plan Manifest"));
  }
  for (const required of ["plan/architecture.md", "plan/delivery.md"]) {
    if (!paths.includes(required)) findings.push(finding("MANIFEST_REQUIRED_ARTIFACT_MISSING", "01-plan.md", required));
  }
  const tasks = [];
  for (const line of index.lines) {
    const cells = tableCells(line);
    if (!/^Task-\d+$/.test(cells[0] ?? "")) continue;
    const id = cells[0];
    const status = cells[2];
    const acCount = Number(cells[3]);
    const tcCount = Number(cells[4]);
    const declaredPath = (cells[5] ?? "").replaceAll("`", "");
    const canonicalPath = `plan/tasks/${id}.md`;
    if (status !== "pending" || !Number.isSafeInteger(acCount) || acCount < 1 ||
      !Number.isSafeInteger(tcCount) || tcCount < 0 || declaredPath !== canonicalPath ||
      !paths.includes(canonicalPath)) {
      findings.push(finding("TASK_INDEX_INVALID", "01-plan.md", id));
      continue;
    }
    tasks.push({ id, status, ac_count: acCount, tc_count: tcCount, path: canonicalPath });
  }
  if (tasks.length === 0 || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    findings.push(finding("TASK_INDEX_INVALID", "01-plan.md", "Task Index"));
  }
  const manifestTaskPaths = paths.filter((entry) => /^plan\/tasks\/Task-\d+\.md$/.test(entry)).sort();
  const indexedTaskPaths = tasks.map((task) => task.path).sort();
  if (manifestTaskPaths.length !== indexedTaskPaths.length ||
    manifestTaskPaths.some((entry, index) => entry !== indexedTaskPaths[index])) {
    findings.push(finding("TASK_INDEX_INVALID", "01-plan.md", "Task Index coverage"));
  }
  return { paths, tasks };
}

function inspectArchitecture(text, findings) {
  for (const heading of ["# Architecture", "### Proposed Approach", "### Patterns to Mirror", "### Engineering Risks and Trade-offs", "### Services Touched", "### Work Plan"]) {
    if (!text.split("\n").includes(heading)) findings.push(finding("ARCHITECTURE_SECTION_MISSING", "plan/architecture.md", heading));
  }
}

function inspectTask(task, text, findings) {
  const lines = text.split("\n");
  const acceptance = sectionLines(lines, "Acceptance Criteria", 4);
  const constraints = sectionLines(lines, "Technical Constraints", 4);
  const verification = sectionLines(lines, "Verification", 4);
  if ([acceptance, constraints, verification].some((section) => section === null)) {
    findings.push(finding("TASK_SECTION_MISSING", task.path, task.id));
    return { ...task, actual_ac_count: 0, actual_tc_count: 0, pre_implementation_test: null, required_quality_checks: [] };
  }
  const acLines = acceptance.lines.filter((line) => /^- \[[ x]\] \*\*AC-\d+\*\*:/.test(line));
  const tcLines = constraints.lines.filter((line) => /^- \*\*TC-\d+\*\*:/.test(line));
  const acIds = acLines.map((line) => /\*\*(AC-\d+)\*\*/.exec(line)?.[1]);
  const tcIds = tcLines.map((line) => /\*\*(TC-\d+)\*\*/.exec(line)?.[1]);
  if (acLines.length === 0 || new Set(acIds).size !== acIds.length ||
    acLines.some((line) => !/: Given .+, When .+, Then .+\.?$/.test(line) || line.includes("VERIFY:"))) {
    findings.push(finding("TASK_ACCEPTANCE_INVALID", task.path, "Acceptance Criteria"));
  }
  if (new Set(tcIds).size !== tcIds.length) findings.push(finding("TASK_TECHNICAL_CONSTRAINT_INVALID", task.path, "Technical Constraints"));
  const pretest = verification.lines.filter((line) => /^- \*\*Pre-implementation test:\*\* (?:required|not-applicable — .+)$/.test(line));
  const quality = verification.lines.filter((line) => /^- \*\*Required quality checks:\*\* (?:none — .+|[a-z][a-z0-9_]*(?:, [a-z][a-z0-9_]*)*)$/.test(line));
  const parsedQuality = quality.length === 1 && !quality[0].includes("none —")
    ? quality[0].replace("- **Required quality checks:** ", "").split(", ")
    : [];
  const duplicateQuality = new Set(parsedQuality).size !== parsedQuality.length;
  if (pretest.length !== 1 || quality.length !== 1 || duplicateQuality) {
    findings.push(finding("TASK_VERIFICATION_INVALID", task.path, "Verification"));
  }
  if (acLines.length !== task.ac_count || tcLines.length !== task.tc_count) {
    findings.push(finding("TASK_COUNT_MISMATCH", task.path, task.id));
  }
  return {
    ...task,
    actual_ac_count: acLines.length,
    actual_tc_count: tcLines.length,
    pre_implementation_test: pretest[0]?.includes("not-applicable") ? "not-applicable" : pretest.length === 1 ? "required" : null,
    required_quality_checks: duplicateQuality ? [] : parsedQuality,
  };
}

function isFinding(value) {
  return exactlyKeys(value, ["code", "artifact", "section"]) && FINDING_CODES.has(value.code) &&
    safeRelative(value.artifact) && typeof value.section === "string" && value.section.length > 0;
}

function isDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isPlan(value) {
  return exactlyKeys(value, ["sha256", "bytes"]) && isDigest(value.sha256) &&
    Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= MAX_ARTIFACT_BYTES;
}

function isArtifact(value) {
  return exactlyKeys(value, ["path", "sha256", "bytes"]) && safeRelative(value.path) &&
    isDigest(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes >= 0 &&
    value.bytes <= MAX_ARTIFACT_BYTES;
}

function isFunctional(value) {
  return exactlyKeys(value, ["sections", "decision_count"]) && Array.isArray(value.sections) &&
    value.sections.length === FUNCTIONAL_SECTIONS.length &&
    value.sections.every((section, index) => exactlyKeys(section, ["name", "nonempty_lines"]) &&
      section.name === FUNCTIONAL_SECTIONS[index] && Number.isSafeInteger(section.nonempty_lines) &&
      section.nonempty_lines >= 0) && Number.isSafeInteger(value.decision_count) &&
    value.decision_count >= 0 && value.decision_count <= 7;
}

function isTask(value) {
  return exactlyKeys(value, [
    "id", "status", "ac_count", "tc_count", "path", "actual_ac_count",
    "actual_tc_count", "pre_implementation_test", "required_quality_checks",
  ]) && /^Task-\d+$/.test(value.id) && typeof value.status === "string" &&
    Number.isSafeInteger(value.ac_count) && value.ac_count >= 0 &&
    Number.isSafeInteger(value.tc_count) && value.tc_count >= 0 &&
    value.path === `plan/tasks/${value.id}.md` &&
    Number.isSafeInteger(value.actual_ac_count) && value.actual_ac_count >= 0 &&
    Number.isSafeInteger(value.actual_tc_count) && value.actual_tc_count >= 0 &&
    [null, "required", "not-applicable"].includes(value.pre_implementation_test) &&
    Array.isArray(value.required_quality_checks) &&
    value.required_quality_checks.every((entry) => typeof entry === "string" && /^[a-z][a-z0-9_]*$/.test(entry)) &&
    new Set(value.required_quality_checks).size === value.required_quality_checks.length;
}

export function isPlanContractResult(value) {
  if (!exactlyKeys(value, RESULT_KEYS) || value.schema_version !== PLAN_CONTRACT_SCHEMA_VERSION ||
    value.kind !== "team_harness_functional_plan_contract" || !["pass", "fail"].includes(value.verdict) ||
    !ERROR_CODES.has(value.error_code) || !Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0 ||
    !Array.isArray(value.artifacts) || !Array.isArray(value.tasks) || !Array.isArray(value.findings) ||
    value.artifacts.length > MAX_ARTIFACTS + 1 || !value.artifacts.every(isArtifact) ||
    new Set(value.artifacts.map((artifact) => artifact.path)).size !== value.artifacts.length ||
    value.tasks.length > MAX_ARTIFACTS || !value.tasks.every(isTask) ||
    value.findings.length > MAX_FINDINGS || !value.findings.every(isFinding) ||
    (value.plan !== null && !isPlan(value.plan)) ||
    (value.functional !== null && !isFunctional(value.functional)) ||
    (value.artifact_set_sha256 !== null && !isDigest(value.artifact_set_sha256))) return false;
  if (value.verdict === "pass" && (value.error_code !== null || value.plan === null || value.functional === null ||
    !isDigest(value.artifact_set_sha256) || value.findings.length !== 0)) return false;
  if (value.verdict === "fail" && value.error_code === null) return false;
  return true;
}

function result(state, started) {
  const value = {
    schema_version: PLAN_CONTRACT_SCHEMA_VERSION,
    kind: "team_harness_functional_plan_contract",
    verdict: state.error_code === null ? "pass" : "fail",
    error_code: state.error_code,
    duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    plan: state.plan,
    artifact_set_sha256: state.artifact_set_sha256,
    artifacts: state.artifacts,
    functional: state.functional,
    tasks: state.tasks,
    findings: state.findings.slice(0, MAX_FINDINGS),
  };
  if (isPlanContractResult(value)) return value;
  return {
    schema_version: PLAN_CONTRACT_SCHEMA_VERSION,
    kind: "team_harness_functional_plan_contract",
    verdict: "fail",
    error_code: "INTERNAL_ERROR",
    duration_ms: 0,
    plan: null,
    artifact_set_sha256: null,
    artifacts: [],
    functional: null,
    tasks: [],
    findings: [],
  };
}

export async function validatePlanContract(options) {
  if (exactlyKeys(options, ["workspace", "plan", "snapshot", "traceability", "writableRoots"]) && options.plan === "01-plan.md") {
    return validateOpenSpecOverlay({ workspace: options.workspace, snapshot: options.snapshot, traceability: options.traceability, writableRoots: options.writableRoots });
  }
  const started = process.hrtime.bigint();
  const state = { error_code: null, plan: null, artifact_set_sha256: null, artifacts: [], functional: null, tasks: [], findings: [] };
  try {
    if (!exactlyKeys(options, ["workspace", "plan"]) || options.plan !== "01-plan.md") throw new ContractError("ARGUMENT_INVALID");
    const workspace = await resolveWorkspace(options.workspace);
    const plan = await readArtifact(workspace, options.plan);
    state.plan = { sha256: sha256(plan.bytes), bytes: plan.bytes.length };
    const lines = plan.text.split("\n");
    if (!lines.includes("**Plan format:** sharded-v1")) state.findings.push(finding("FORMAT_MISSING", "01-plan.md", "Plan format"));
    state.functional = inspectFunctional(lines, state.findings);
    const index = inspectIndex(lines, state.findings);
    const uniquePaths = [...new Set(index.paths)].sort();
    if (uniquePaths.length > MAX_ARTIFACTS) throw new ContractError("MANIFEST_INVALID");
    const loaded = new Map();
    for (const relative of uniquePaths) loaded.set(relative, await readArtifact(workspace, relative));
    if (loaded.has("plan/architecture.md")) inspectArchitecture(loaded.get("plan/architecture.md").text, state.findings);
    state.tasks = index.tasks.map((task) => {
      const artifact = loaded.get(task.path);
      if (artifact === undefined) {
        state.findings.push(finding("MANIFEST_REQUIRED_ARTIFACT_MISSING", "01-plan.md", task.path));
        return {
          ...task,
          actual_ac_count: 0,
          actual_tc_count: 0,
          pre_implementation_test: null,
          required_quality_checks: [],
        };
      }
      return inspectTask(task, artifact.text, state.findings);
    });
    state.artifacts = [plan, ...loaded.values()]
      .map((artifact) => ({ path: artifact.path, sha256: sha256(artifact.bytes), bytes: artifact.bytes.length }))
      .sort((left, right) => left.path.localeCompare(right.path));
    state.artifact_set_sha256 = sha256(Buffer.from(state.artifacts.map((artifact) => `${artifact.path}\u0000${artifact.sha256}\n`).join(""), "utf8"));
    if (state.findings.length > 0) {
      const codes = new Set(state.findings.map((entry) => entry.code));
      state.error_code = [...codes].some((code) => code.startsWith("FUNCTIONAL_") || code === "DECISION_INVALID")
        ? "FUNCTIONAL_CONTRACT_INVALID"
        : codes.has("TASK_INDEX_INVALID") ? "TASK_INDEX_INVALID"
        : [...codes].some((code) => code.startsWith("TASK_")) ? "TASK_INVALID" : "MANIFEST_INVALID";
    }
  } catch (error) {
    state.error_code = error instanceof ContractError && ERROR_CODES.has(error.code) ? error.code : "INTERNAL_ERROR";
  }
  return result(state, started);
}

function parseCli(argv) {
  if (argv.length < 4 || argv.length % 2 !== 0) return null;
  const values = { writableRoots: [] };
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === "--writable-root") {
      values.writableRoots.push(argv[index + 1]);
      continue;
    }
    const key = ({ "--workspace": "workspace", "--plan": "plan", "--snapshot": "snapshot", "--traceability": "traceability" })[argv[index]] ?? null;
    if (key === null || Object.hasOwn(values, key)) return null;
    values[key] = argv[index + 1];
  }
  if (!Object.hasOwn(values, "snapshot") && !Object.hasOwn(values, "traceability")) delete values.writableRoots;
  else if (values.writableRoots.length === 0) return null;
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await validatePlanContract(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.verdict !== "pass") process.exitCode = 1;
}
