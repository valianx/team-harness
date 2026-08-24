#!/usr/bin/env node
/** Validate the minimal Team Harness execution overlay over a pinned OpenSpec snapshot. */

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isOpenSpecSnapshot, normalizeOpenSpecTaskIds, verifySnapshot } from "./openspec-snapshot.mjs";
import { isQualityCommandId } from "./quality-runner.mjs";

export const OPENSPEC_OVERLAY_SCHEMA_VERSION = 1;
export const OPENSPEC_OVERLAY_REBIND_SCHEMA_VERSION = 1;
export const OPENSPEC_PROGRESS_TRANSITION_SCHEMA_VERSION = 2;
export const OPENSPEC_OVERLAY_DERIVATION_SCHEMA_VERSION = 1;
const DERIVATION_OWNER = "architect";
const DERIVATION_PRESERVATION = "Derivation scaffold — the planning pass authors the real cross-runtime preservation statement before Gate 1.";
const DERIVATION_ROLLBACK = "Derivation scaffold — the planning pass authors the real rollback statement before Gate 1.";
const DERIVATION_EXCLUSION_RATIONALE = "Derivation scaffold: this coordinate has no standalone acceptance or execution shape; its child scenario or task items carry the work. The planning pass reclassifies it if that changes.";
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 4096;
const SHA256 = /^[a-f0-9]{64}$/;
const ITEM_ID = /^(?:AC|Task)-[1-9][0-9]*$/;
const ANCHOR_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const CLASSIFICATIONS = new Set(["direct", "split", "merged", "th-extension", "excluded", "ambiguous"]);
const SOURCE_KINDS = new Set(["requirement", "scenario", "design-decision", "task"]);
const FORBIDDEN_NORMATIVE_KEYS = new Set([
  "title", "description", "text", "source_text", "normative_text", "requirement", "scenario", "given", "when", "then",
]);
const SNAPSHOT_PATH = /^(?:inputs\/openspec-snapshot\.json|inputs\/openspec\/[a-z0-9]+(?:-[a-z0-9]+)*\/snapshot\.json)$/;
const TRACEABILITY_PATH = /^(?:plan\/openspec-traceability\.json|plan\/openspec\/[a-z0-9]+(?:-[a-z0-9]+)*\/traceability\.json)$/;
const PLAN_PATH = /^(?:01-plan\.md|services\/[a-z0-9]+(?:-[a-z0-9]+)*\/01-plan\.md)$/;
const SHARD_PATH = /^(?:plan\/tasks|plan\/openspec\/[a-z0-9]+(?:-[a-z0-9]+)*\/tasks)\/Task-[1-9][0-9]*\.md$/;

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function own(value, key) { return Object.hasOwn(value, key); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
}
function safeString(value, maximum = 4096) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") && Buffer.byteLength(value, "utf8") <= maximum;
}
function safeRelative(value) {
  if (!safeString(value, 1024) || path.isAbsolute(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function normalizeWritableRoots(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const roots = values.map(value => typeof value === "string" && path.isAbsolute(value) ? path.resolve(value) : null);
  if (roots.some(value => value === null || value === path.parse(value).root) || new Set(roots).size !== roots.length) return null;
  return roots;
}
function taskExecutionTarget(text, repositoryRoot) {
  const matches = text.replaceAll("\r\n", "\n").split("\n")
    .map(line => /^- \*\*Worktree:\*\*\s+(.+)$/.exec(line))
    .filter(Boolean);
  if (matches.length !== 1) return null;
  const value = matches[0][1].split(" — ", 1)[0].trim();
  if (value === "null") return path.resolve(repositoryRoot);
  return path.isAbsolute(value) && !value.includes("\u0000") ? path.resolve(value) : null;
}
function finding(code, target) { return { code, target }; }
function rationaleValid(classification, rationale) {
  return classification === "direct" ? rationale === null : safeString(rationale, 2048);
}
function parseAnchorList(value, validator) {
  if (typeof value !== "string" || !value.startsWith("[") || !value.endsWith("]")) return null;
  const body = value.slice(1, -1).trim();
  if (body === "") return [];
  const items = body.split(",").map(item => item.trim());
  return items.length <= MAX_ITEMS && new Set(items).size === items.length && items.every(validator) ? items : null;
}
function dispatchAnchors(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const headings = lines.map((line, index) => line === "## Dispatch anchors" ? index : -1).filter(index => index >= 0);
  if (headings.length !== 1) return null;
  const start = headings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) { end = index; break; }
  }
  const fields = new Map();
  for (const line of lines.slice(start, end)) {
    const match = /^(required_invariants|required_evidence_anchors|cross_runtime_preservation):\s*(.*)$/.exec(line);
    if (match) {
      if (fields.has(match[1])) return null;
      fields.set(match[1], match[2]);
    }
  }
  if (fields.size !== 3) return null;
  const requiredInvariants = parseAnchorList(fields.get("required_invariants"), value => ANCHOR_ID.test(value));
  const requiredEvidenceAnchors = parseAnchorList(fields.get("required_evidence_anchors"), safeRelative);
  const preservation = fields.get("cross_runtime_preservation");
  if (requiredInvariants === null || requiredEvidenceAnchors === null || !safeString(preservation, 1024)) return null;
  const effectiveInvariants = requiredInvariants.slice();
  for (const line of lines) {
    const match = /^\s*(?:-\s*)?\*\*Required invariants(?::\*\*|\*\*:)\s*(.+)\s*$/.exec(line);
    if (!match) continue;
    const parsed = match[1].startsWith("[")
      ? parseAnchorList(match[1], value => ANCHOR_ID.test(value))
      : match[1].split(",").map(value => value.trim()).filter(Boolean);
    if (parsed === null || parsed.length === 0 || !parsed.every(value => ANCHOR_ID.test(value))) return null;
    for (const value of parsed) if (!effectiveInvariants.includes(value)) effectiveInvariants.push(value);
  }
  return { required_invariants: effectiveInvariants, required_evidence_anchors: requiredEvidenceAnchors, cross_runtime_preservation: preservation };
}
function hasForbiddenKeys(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKeys);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_NORMATIVE_KEYS.has(key.toLowerCase()) || hasForbiddenKeys(child));
}

async function readRegular(root, relative) {
  if (!safeRelative(relative)) throw new Error("unsafe-path");
  const requested = path.resolve(root, relative);
  if (!contained(root, requested)) throw new Error("unsafe-path");
  const stat = await lstat(requested);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("unsafe-file");
  const canonical = await realpath(requested);
  if (!contained(root, canonical)) throw new Error("unsafe-path");
  const bytes = await readFile(canonical);
  if (bytes.length > MAX_BYTES) throw new Error("unsafe-file");
  return { bytes, canonical };
}

function validMapping(item, expectedPrefix, sourceIds, qualityIds, findings) {
  const baseKeys = expectedPrefix === "AC"
    ? ["id", "sources", "classification", "rationale", "evidence_anchor"]
    : ["id", "sources", "classification", "rationale", "owner", "specialist", "shard_path", "files", "dependencies", "required_invariants", "technical_constraints", "quality_command_ids", "pre_implementation_test", "required_evidence_anchors", "cross_runtime_preservation", "rollback", "delivery_group"];
  if (!exact(item, baseKeys) || !ITEM_ID.test(item.id ?? "") || !item.id.startsWith(`${expectedPrefix}-`)) {
    findings.push(finding("ITEM_SCHEMA_INVALID", item?.id ?? expectedPrefix));
    return;
  }
  if (!Array.isArray(item.sources) || item.sources.length > MAX_ITEMS || new Set(item.sources).size !== item.sources.length
    || !item.sources.every(source => sourceIds.has(source))) findings.push(finding("SOURCE_REFERENCE_INVALID", item.id));
  if (!CLASSIFICATIONS.has(item.classification) || item.classification === "excluded" || item.classification === "ambiguous") {
    findings.push(finding(item.classification === "ambiguous" ? "AMBIGUOUS_MAPPING" : "CLASSIFICATION_INVALID", item.id));
  }
  if (!rationaleValid(item.classification, item.rationale)) findings.push(finding("RATIONALE_REQUIRED", item.id));
  if (item.classification === "direct" && item.sources.length !== 1) findings.push(finding("CLASSIFICATION_INVALID", item.id));
  if (item.classification === "merged" && item.sources.length < 2) findings.push(finding("CLASSIFICATION_INVALID", item.id));
  if (item.classification === "th-extension" && item.sources.length !== 0) findings.push(finding("CLASSIFICATION_INVALID", item.id));
  if (["split"].includes(item.classification) && item.sources.length !== 1) findings.push(finding("CLASSIFICATION_INVALID", item.id));
  if (expectedPrefix === "AC") {
    if (!safeRelative(item.evidence_anchor)) findings.push(finding("EVIDENCE_INVALID", item.id));
    return;
  }
  if (![item.owner, item.specialist, item.rollback, item.delivery_group].every(value => safeString(value, 512))
    || !safeRelative(item.shard_path) || !SHARD_PATH.test(item.shard_path)
    || !Array.isArray(item.files) || item.files.length === 0 || new Set(item.files).size !== item.files.length || !item.files.every(safeRelative)
    || !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length || !item.dependencies.every(id => ITEM_ID.test(id) && id.startsWith("Task-"))
    || !Array.isArray(item.required_invariants) || new Set(item.required_invariants).size !== item.required_invariants.length || !item.required_invariants.every(value => ANCHOR_ID.test(value))
    || !Array.isArray(item.technical_constraints) || !item.technical_constraints.every(value => safeString(value, 1024))
    || !Array.isArray(item.quality_command_ids) || new Set(item.quality_command_ids).size !== item.quality_command_ids.length
    || !item.quality_command_ids.every(id => qualityIds.has(id))
    || !["required", "not-applicable"].includes(item.pre_implementation_test)
    || !Array.isArray(item.required_evidence_anchors) || new Set(item.required_evidence_anchors).size !== item.required_evidence_anchors.length || !item.required_evidence_anchors.every(safeRelative)
    || !safeString(item.cross_runtime_preservation, 1024)) {
    findings.push(finding("EXECUTION_CONTROL_INVALID", item.id));
  }
}

function validateShape(overlay, snapshot, snapshotBytes, expectedSnapshotPath, findings) {
  const keys = ["schema_version", "kind", "plan_format", "snapshot", "repository", "quality_commands", "freeze", "acceptance_items", "execution_items", "source_dispositions", "operator_disclosures"];
  if (!exact(overlay, keys) || overlay.schema_version !== OPENSPEC_OVERLAY_SCHEMA_VERSION
    || overlay.kind !== "team_harness_openspec_execution_overlay" || overlay.plan_format !== "sharded-v1") {
    findings.push(finding("OVERLAY_SCHEMA_INVALID", "overlay"));
    return;
  }
  if (hasForbiddenKeys(overlay)) findings.push(finding("NORMATIVE_TEXT_DUPLICATED", "overlay"));
  if (!exact(overlay.snapshot, ["path", "sha256", "artifact_set_sha256", "change_name"])
    || overlay.snapshot.path !== expectedSnapshotPath
    || overlay.snapshot.sha256 !== hash(snapshotBytes) || overlay.snapshot.artifact_set_sha256 !== snapshot.artifact_set_sha256
    || overlay.snapshot.change_name !== snapshot.change.name) findings.push(finding("SNAPSHOT_STALE", "snapshot"));
  if (!exact(overlay.repository, ["root", "ownership"]) || overlay.repository.root !== snapshot.repository.root
    || !Array.isArray(overlay.repository.ownership) || overlay.repository.ownership.length === 0
    || overlay.repository.ownership.some(entry => !exact(entry, ["path", "owner"]) || !safeRelative(entry.path) || !safeString(entry.owner, 512))) {
    findings.push(finding("OWNERSHIP_INVALID", "repository"));
  }
  if (!Array.isArray(overlay.quality_commands) || overlay.quality_commands.length === 0
    || overlay.quality_commands.some(entry => !exact(entry, ["id"]) || !isQualityCommandId(entry.id))
    || new Set(overlay.quality_commands.map(entry => entry.id)).size !== overlay.quality_commands.length) {
    findings.push(finding("QUALITY_COMMAND_INVALID", "quality_commands"));
  }
  if (!exact(overlay.freeze, ["baseline_sha256", "state_anchor", "evidence_root"])
    || !SHA256.test(overlay.freeze.baseline_sha256) || !safeRelative(overlay.freeze.state_anchor) || !safeRelative(overlay.freeze.evidence_root)) {
    findings.push(finding("FREEZE_CONTROL_INVALID", "freeze"));
  }
}

export async function validateOpenSpecOverlay({ workspace, snapshot = "inputs/openspec-snapshot.json", traceability = "plan/openspec-traceability.json", writableRoots } = {}) {
  const started = process.hrtime.bigint();
  const findings = [];
  let snapshotValue = null;
  let overlay = null;
  let snapshotDigest = null;
  let overlayDigest = null;
  try {
    if (!safeString(workspace) || !SNAPSHOT_PATH.test(snapshot) || !TRACEABILITY_PATH.test(traceability)) throw new Error("arguments");
    const roots = normalizeWritableRoots(writableRoots);
    if (roots === null) throw new Error("arguments");
    const root = await realpath(path.resolve(workspace));
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("arguments");
    const snapshotFile = await readRegular(root, snapshot);
    const overlayFile = await readRegular(root, traceability);
    snapshotValue = JSON.parse(snapshotFile.bytes.toString("utf8"));
    overlay = JSON.parse(overlayFile.bytes.toString("utf8"));
    snapshotDigest = hash(snapshotFile.bytes);
    overlayDigest = hash(overlayFile.bytes);
    if (!isOpenSpecSnapshot(snapshotValue)) findings.push(finding("SNAPSHOT_INVALID", snapshot));
    else {
      validateShape(overlay, snapshotValue, snapshotFile.bytes, snapshot, findings);
      if (object(overlay)) {
        const coordinates = snapshotValue.artifacts.flatMap(artifact => artifact.coordinates)
          .filter(coordinate => SOURCE_KINDS.has(coordinate.kind));
        const sourceIds = new Set(coordinates.map(coordinate => coordinate.id));
        const qualityIds = new Set(Array.isArray(overlay.quality_commands) ? overlay.quality_commands.map(command => command.id) : []);
        const acceptance = Array.isArray(overlay.acceptance_items) ? overlay.acceptance_items : [];
        const execution = Array.isArray(overlay.execution_items) ? overlay.execution_items : [];
        if (acceptance.length + execution.length === 0 || acceptance.length + execution.length > MAX_ITEMS) findings.push(finding("ITEM_SCHEMA_INVALID", "items"));
        for (const item of acceptance) validMapping(item, "AC", sourceIds, qualityIds, findings);
        for (const item of execution) validMapping(item, "Task", sourceIds, qualityIds, findings);
        const allItems = [...acceptance, ...execution];
        const itemIds = allItems.map(item => item?.id);
        if (new Set(itemIds).size !== itemIds.length) findings.push(finding("ITEM_DUPLICATE", "items"));
        const itemById = new Map(allItems.map(item => [item?.id, item]));
        const dispositions = Array.isArray(overlay.source_dispositions) ? overlay.source_dispositions : [];
        if (dispositions.length > MAX_ITEMS || new Set(dispositions.map(entry => entry?.source_id)).size !== dispositions.length) {
          findings.push(finding("SOURCE_DISPOSITION_INVALID", "source_dispositions"));
        }
        const covered = new Set();
        for (const entry of dispositions) {
          if (!exact(entry, ["source_id", "item_ids", "classification", "rationale"]) || !sourceIds.has(entry.source_id)
            || !Array.isArray(entry.item_ids) || new Set(entry.item_ids).size !== entry.item_ids.length
            || !entry.item_ids.every(id => itemById.has(id)) || !CLASSIFICATIONS.has(entry.classification)) {
            findings.push(finding("SOURCE_DISPOSITION_INVALID", entry?.source_id ?? "source"));
            continue;
          }
          covered.add(entry.source_id);
          if (entry.classification === "ambiguous") findings.push(finding("AMBIGUOUS_MAPPING", entry.source_id));
          if (!rationaleValid(entry.classification, entry.rationale)) findings.push(finding("RATIONALE_REQUIRED", entry.source_id));
          if (entry.classification === "excluded" ? entry.item_ids.length !== 0 : entry.item_ids.length === 0) {
            findings.push(finding("SOURCE_DISPOSITION_INVALID", entry.source_id));
          }
          for (const itemId of entry.item_ids) {
            if (!itemById.get(itemId)?.sources?.includes(entry.source_id)) findings.push(finding("REVERSE_MAPPING_INVALID", entry.source_id));
          }
        }
        for (const sourceId of sourceIds) if (!covered.has(sourceId)) findings.push(finding("SOURCE_COVERAGE_INCOMPLETE", sourceId));
        for (const item of allItems) for (const sourceId of item?.sources ?? []) {
          const disposition = dispositions.find(entry => entry.source_id === sourceId);
          if (!disposition?.item_ids?.includes(item.id)) findings.push(finding("REVERSE_MAPPING_INVALID", item.id));
        }
        const disclosures = Array.isArray(overlay.operator_disclosures) ? overlay.operator_disclosures : [];
        const required = allItems.filter(item => item.classification !== "direct")
          .map(item => item.id)
          .concat(dispositions.filter(entry => entry.classification !== "direct").map(entry => entry.source_id));
        if (new Set(disclosures.map(entry => entry?.mapping_id)).size !== disclosures.length
          || disclosures.some(entry => !exact(entry, ["mapping_id", "classification", "rationale"])
            || !required.includes(entry.mapping_id) || entry.classification === "direct" || entry.classification === "ambiguous"
            || !CLASSIFICATIONS.has(entry.classification) || !safeString(entry.rationale, 2048))
          || required.some(id => !disclosures.some(entry => entry.mapping_id === id))) {
          findings.push(finding("DISCLOSURE_INCOMPLETE", "operator_disclosures"));
        }
        for (const item of execution) {
          try {
            const shard = await readRegular(root, item.shard_path);
            const shardText = shard.bytes.toString("utf8");
            const anchors = dispatchAnchors(shardText);
            if (anchors === null) findings.push(finding("DISPATCH_ANCHOR_INVALID", item.id ?? "Task"));
            else if (JSON.stringify(anchors.required_invariants) !== JSON.stringify(item.required_invariants)
              || JSON.stringify(anchors.required_evidence_anchors) !== JSON.stringify(item.required_evidence_anchors)
              || anchors.cross_runtime_preservation !== item.cross_runtime_preservation) {
              findings.push(finding("DISPATCH_ANCHOR_MISMATCH", item.id ?? "Task"));
            }
            const target = taskExecutionTarget(shardText, snapshotValue.repository.root);
            if (target === null || !roots.some(writableRoot => contained(writableRoot, target))) {
              findings.push(finding("EXECUTION_ROOT_NOT_WRITABLE", item.id ?? "Task"));
            }
          } catch { findings.push(finding("SHARD_INVALID", item.id ?? "Task")); }
        }
      }
    }
  } catch (error) {
    findings.push(finding(error.message === "arguments" ? "ARGUMENT_INVALID" : "ARTIFACT_INVALID", "overlay"));
  }
  const bounded = findings.slice(0, 128);
  return {
    schema_version: OPENSPEC_OVERLAY_SCHEMA_VERSION,
    kind: "team_harness_openspec_overlay_validation",
    verdict: bounded.length === 0 ? "pass" : "fail",
    error_code: bounded.length === 0 ? null : bounded[0].code,
    duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    snapshot_sha256: snapshotDigest,
    overlay_sha256: overlayDigest,
    change_name: snapshotValue?.change?.name ?? null,
    findings: bounded,
  };
}

function shardScaffold(item) {
  return `# ${item.id}\n\n- **Worktree:** null — branch null, base null\n\n## Dispatch anchors\n\nrequired_invariants: [${item.required_invariants.join(", ")}]\nrequired_evidence_anchors: [${item.required_evidence_anchors.join(", ")}]\ncross_runtime_preservation: ${item.cross_runtime_preservation}\n`;
}

/** Compact Gate-1 index scaffold: mechanical Plan Manifest and Task Index binding the traceability and shard paths this same derivation writes. Judgment content stays in the pinned OpenSpec coordinates each item's traceability entry sources; nothing is authored here. */
function planScaffold(changeName, traceability, executionItems) {
  const manifestRows = [
    `| traceability | shared | \`${traceability}\` | acceptance items, execution items, dispositions |`,
    ...executionItems.map(item => `| task | ${item.id} | \`${item.shard_path}\` | dispatch anchors |`),
  ].join("\n");
  const indexRows = executionItems
    .map(item => `| ${item.id} | ${DERIVATION_OWNER} | pending | 1 | ${item.technical_constraints.length} | \`${item.shard_path}\` |`)
    .join("\n");
  return `# Plan: ${changeName}\n**Plan format:** sharded-v1\n**Reviews:** pending\n\n## Plan Manifest\n\n| Kind | ID | Path | Anchors |\n|------|----|------|---------|\n${manifestRows}\n\n### Task Index\n\n| Task | Service | Status | AC count | TC count | Path |\n|------|---------|--------|----------|----------|------|\n${indexRows}\n`;
}

function derivationResult(verdict, errorCode, details = {}) {
  return {
    schema_version: OPENSPEC_OVERLAY_DERIVATION_SCHEMA_VERSION,
    kind: "team_harness_openspec_overlay_derivation",
    verdict,
    error_code: errorCode,
    snapshot_sha256: details.snapshot_sha256 ?? null,
    overlay_sha256: details.overlay_sha256 ?? null,
    change_name: details.change_name ?? null,
    acceptance_item_count: details.acceptance_item_count ?? 0,
    execution_item_count: details.execution_item_count ?? 0,
  };
}

function buildDerivationOverlay(snapshotValue, snapshotFile, snapshot, traceability) {
  const coordinates = snapshotValue.artifacts
    .flatMap(artifact => artifact.coordinates.map(coordinate => ({ ...coordinate, artifactPath: artifact.path })))
    .filter(coordinate => SOURCE_KINDS.has(coordinate.kind));
  const scenarioCoordinates = coordinates.filter(coordinate => coordinate.kind === "scenario");
  const taskCoordinates = coordinates.filter(coordinate => coordinate.kind === "task");
  const parentCoordinates = coordinates.filter(coordinate => coordinate.kind === "requirement" || coordinate.kind === "design-decision");
  if (scenarioCoordinates.length === 0 || taskCoordinates.length === 0) return null;

  const acceptanceItems = scenarioCoordinates.map((coordinate, index) => ({
    id: `AC-${index + 1}`, sources: [coordinate.id], classification: "direct", rationale: null,
    evidence_anchor: "plan/architecture.md",
  }));
  const taskRoot = traceability === "plan/openspec-traceability.json"
    ? "plan/tasks"
    : `${path.posix.dirname(traceability)}/tasks`;
  const executionItems = taskCoordinates.map((coordinate, index) => ({
    id: `Task-${index + 1}`, sources: [coordinate.id], classification: "direct", rationale: null,
    owner: DERIVATION_OWNER, specialist: DERIVATION_OWNER, shard_path: `${taskRoot}/Task-${index + 1}.md`,
    files: [coordinate.artifactPath], dependencies: [], required_invariants: [], technical_constraints: [],
    quality_command_ids: [], pre_implementation_test: "not-applicable", required_evidence_anchors: [snapshot],
    cross_runtime_preservation: DERIVATION_PRESERVATION, rollback: DERIVATION_ROLLBACK, delivery_group: "default",
  }));
  const sourceDispositions = [
    ...scenarioCoordinates.map((coordinate, index) => ({ source_id: coordinate.id, item_ids: [acceptanceItems[index].id], classification: "direct", rationale: null })),
    ...taskCoordinates.map((coordinate, index) => ({ source_id: coordinate.id, item_ids: [executionItems[index].id], classification: "direct", rationale: null })),
    ...parentCoordinates.map(coordinate => ({ source_id: coordinate.id, item_ids: [], classification: "excluded", rationale: DERIVATION_EXCLUSION_RATIONALE })),
  ];
  const operatorDisclosures = parentCoordinates.map(coordinate => ({
    mapping_id: coordinate.id, classification: "excluded", rationale: DERIVATION_EXCLUSION_RATIONALE,
  }));
  const overlay = {
    schema_version: OPENSPEC_OVERLAY_SCHEMA_VERSION, kind: "team_harness_openspec_execution_overlay", plan_format: "sharded-v1",
    snapshot: { path: snapshot, sha256: hash(snapshotFile.bytes), artifact_set_sha256: snapshotValue.artifact_set_sha256, change_name: snapshotValue.change.name },
    repository: { root: snapshotValue.repository.root, ownership: [{ path: ".", owner: DERIVATION_OWNER }] },
    quality_commands: [{ id: "verify" }],
    freeze: { baseline_sha256: hash(snapshotFile.bytes), state_anchor: "00-state.md", evidence_root: "reviews" },
    acceptance_items: acceptanceItems, execution_items: executionItems,
    source_dispositions: sourceDispositions, operator_disclosures: operatorDisclosures,
  };
  return { overlay, acceptanceItems, executionItems };
}

/** Write every shard, the Gate-1 index scaffold, and the traceability file; on any write failure, remove every shard and index scaffold already written in this call before rethrowing. */
async function writeDerivationOutputs(root, traceability, plan, planText, overlay, executionItems) {
  const written = [];
  try {
    for (const item of executionItems) {
      const shardPath = path.resolve(root, item.shard_path);
      await mkdir(path.dirname(shardPath), { recursive: true });
      await writeFile(shardPath, shardScaffold(item));
      written.push(shardPath);
    }
    const planPath = path.resolve(root, plan);
    await mkdir(path.dirname(planPath), { recursive: true });
    await writeFile(planPath, planText);
    written.push(planPath);
    const overlayBytes = Buffer.from(`${JSON.stringify(overlay)}\n`);
    await writeFile(path.resolve(root, traceability), overlayBytes);
    return overlayBytes;
  } catch (writeError) {
    await Promise.allSettled(written.map(target => unlink(target)));
    throw writeError;
  }
}

async function resolveDerivationTargets(root, traceability, plan, executionItems, overwrite) {
  const targets = [traceability, plan, ...executionItems.map(item => item.shard_path)];
  const targetPaths = [];
  for (const target of targets) {
    if (!safeRelative(target)) return { ok: false, code: "ARGUMENT_INVALID" };
    const targetPath = path.resolve(root, target);
    if (!contained(root, targetPath)) return { ok: false, code: "ARGUMENT_INVALID" };
    targetPaths.push(targetPath);
  }
  if (overwrite === true) return { ok: true, targetPaths };
  for (const targetPath of targetPaths) {
    try {
      await lstat(targetPath);
      return { ok: false, code: "DERIVATION_TARGET_EXISTS" };
    } catch (error) {
      if (error.code !== "ENOENT") return { ok: false, code: "ARTIFACT_INVALID" };
    }
  }
  return { ok: true, targetPaths };
}

/**
 * Derive the overlay skeleton mechanically from a validated OpenSpec change and its pinned
 * snapshot: every `scenario` coordinate becomes one acceptance item, every `task` coordinate
 * becomes one execution item with a written shard scaffold, and every `requirement` or
 * `design-decision` coordinate — carrying no standalone testable or executable shape — is
 * dispositioned `excluded` with a disclosed rationale. A pure function of the snapshot: no model
 * call, no operator input, and no write outside the overlay, its Gate-1 index scaffold, and the
 * shard scaffolds it emits. The judgment content already authored by the single `openspec-planning`
 * pass stays in the pinned OpenSpec coordinates each item's traceability entry sources, never
 * restated here; the result already satisfies `validateOpenSpecOverlay` by construction.
 * All-or-nothing: refuses and writes nothing unless BOTH the snapshot's own repository root AND
 * the resolved `workspace` write root are each independently contained by a writable root, and
 * the traceability file, the Gate-1 index, and every target shard path either do not yet exist or
 * `overwrite: true` was passed explicitly. If a write fails partway through, every shard and index
 * scaffold already written in this call is removed before the failure result is returned; the
 * traceability file is written last, so its presence is the commit record of a successful
 * derivation.
 */
export async function deriveOpenSpecOverlay({ workspace, snapshot = "inputs/openspec-snapshot.json", traceability = "plan/openspec-traceability.json", plan = "01-plan.md", writableRoots, overwrite = false } = {}) {
  try {
    if (!safeString(workspace) || !SNAPSHOT_PATH.test(snapshot) || !TRACEABILITY_PATH.test(traceability) || !PLAN_PATH.test(plan)) return derivationResult("fail", "ARGUMENT_INVALID");
    const roots = normalizeWritableRoots(writableRoots);
    if (roots === null) return derivationResult("fail", "ARGUMENT_INVALID");
    const root = await realpath(path.resolve(workspace));
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return derivationResult("fail", "ARGUMENT_INVALID");
    const snapshotFile = await readRegular(root, snapshot);
    const snapshotValue = JSON.parse(snapshotFile.bytes.toString("utf8"));
    if (!isOpenSpecSnapshot(snapshotValue)) return derivationResult("fail", "SNAPSHOT_INVALID");
    if (!roots.some(writableRoot => contained(writableRoot, path.resolve(snapshotValue.repository.root)))) return derivationResult("fail", "REPOSITORY_ROOT_NOT_WRITABLE");
    if (!roots.some(writableRoot => contained(writableRoot, root))) return derivationResult("fail", "WORKSPACE_ROOT_NOT_WRITABLE");

    const built = buildDerivationOverlay(snapshotValue, snapshotFile, snapshot, traceability);
    if (built === null) return derivationResult("fail", "SOURCE_COVERAGE_INCOMPLETE");
    const { overlay, acceptanceItems, executionItems } = built;

    const resolved = await resolveDerivationTargets(root, traceability, plan, executionItems, overwrite);
    if (!resolved.ok) return derivationResult("fail", resolved.code);

    const planText = planScaffold(snapshotValue.change.name, traceability, executionItems);
    const overlayBytes = await writeDerivationOutputs(root, traceability, plan, planText, overlay, executionItems);

    return derivationResult("pass", null, {
      snapshot_sha256: hash(snapshotFile.bytes),
      overlay_sha256: hash(overlayBytes),
      change_name: snapshotValue.change.name,
      acceptance_item_count: acceptanceItems.length,
      execution_item_count: executionItems.length,
    });
  } catch (error) {
    return derivationResult("fail", error.message === "arguments" ? "ARGUMENT_INVALID" : "ARTIFACT_INVALID");
  }
}

function rebindResult(verdict, errorCode, details = {}) {
  return {
    schema_version: OPENSPEC_OVERLAY_REBIND_SCHEMA_VERSION,
    kind: "team_harness_openspec_overlay_rebind",
    verdict,
    error_code: errorCode,
    changed: details.changed ?? false,
    previous_snapshot_sha256: details.previous_snapshot_sha256 ?? null,
    snapshot_sha256: details.snapshot_sha256 ?? null,
    overlay_sha256: details.overlay_sha256 ?? null,
  };
}

export async function rebindOpenSpecOverlay({ workspace, snapshot = "inputs/openspec-snapshot.json", traceability = "plan/openspec-traceability.json", writableRoots } = {}) {
  const validation = await validateOpenSpecOverlay({ workspace, snapshot, traceability, writableRoots });
  if (validation.verdict === "pass") {
    return rebindResult("pass", null, {
      snapshot_sha256: validation.snapshot_sha256,
      overlay_sha256: validation.overlay_sha256,
    });
  }
  // Gate-1 snapshot identity is immutable in schema v3. Task completion lives
  // in inputs/openspec-progress.json, so a stale snapshot binding represents
  // semantic drift and is never mechanically rewritten.
  return rebindResult("fail", "REBIND_NOT_MECHANICAL", {
    snapshot_sha256: validation.snapshot_sha256,
    overlay_sha256: validation.overlay_sha256,
  });
}

function progressResult(verdict, errorCode, details = {}) {
  return {
    schema_version: OPENSPEC_PROGRESS_TRANSITION_SCHEMA_VERSION,
    kind: "team_harness_openspec_progress_transition",
    verdict,
    error_code: errorCode,
    changed: details.changed ?? false,
    snapshot_sha256: details.snapshot_sha256 ?? null,
    progress_sha256: details.progress_sha256 ?? null,
    overlay_sha256: details.overlay_sha256 ?? null,
  };
}

/** Verify one authorized monotonic OpenSpec task transition without mutating its immutable Gate-1 binding. */
export async function verifyOpenSpecProgress({
  workspace,
  snapshot = "inputs/openspec-snapshot.json",
  traceability = "plan/openspec-traceability.json",
  writableRoots,
  authorizedTaskIds,
} = {}) {
  const normalizedAuthorizedTaskIds = normalizeOpenSpecTaskIds(authorizedTaskIds);
  if (normalizedAuthorizedTaskIds === null || normalizedAuthorizedTaskIds.length === 0) {
    return progressResult("fail", "ARGUMENT_INVALID");
  }
  const validation = await validateOpenSpecOverlay({ workspace, snapshot, traceability, writableRoots });
  if (validation.verdict !== "pass") {
    return progressResult("fail", "PRECONDITION_INVALID", {
      snapshot_sha256: validation.snapshot_sha256,
      overlay_sha256: validation.overlay_sha256,
    });
  }
  try {
    const root = await realpath(path.resolve(workspace));
    const snapshotFile = await readRegular(root, snapshot);
    const overlayFile = await readRegular(root, traceability);
    const progress = `${path.posix.dirname(snapshot)}/openspec-progress.json`;
    const progressFile = await readRegular(root, progress);
    const verified = await verifySnapshot({
      snapshotPath: snapshotFile.canonical,
      phase: "implementation",
      authorizedTaskIds: normalizedAuthorizedTaskIds,
    });
    if (verified.verdict !== "pass") {
      return progressResult("fail", verified.error_code, {
        snapshot_sha256: verified.snapshot_sha256,
        progress_sha256: hash(progressFile.bytes),
        overlay_sha256: hash(overlayFile.bytes),
      });
    }
    const updatedProgress = await readRegular(root, progress);
    const postValidation = await validateOpenSpecOverlay({ workspace, snapshot, traceability, writableRoots });
    if (postValidation.verdict !== "pass" || verified.snapshot_sha256 !== hash(snapshotFile.bytes)) {
      return progressResult("fail", "PRECONDITION_INVALID", {
        snapshot_sha256: postValidation.snapshot_sha256,
        progress_sha256: hash(updatedProgress.bytes),
        overlay_sha256: postValidation.overlay_sha256,
      });
    }
    return progressResult("pass", null, {
      changed: hash(progressFile.bytes) !== hash(updatedProgress.bytes),
      snapshot_sha256: verified.snapshot_sha256,
      progress_sha256: hash(updatedProgress.bytes),
      overlay_sha256: postValidation.overlay_sha256,
    });
  } catch {
    return progressResult("fail", "ARTIFACT_INVALID", {
      snapshot_sha256: validation.snapshot_sha256,
      overlay_sha256: validation.overlay_sha256,
    });
  }
}

// Compatibility export for callers from 3.14.0; schema v2 never rebinds.
export const verifyAndRebindOpenSpecProgress = verifyOpenSpecProgress;

function parseCli(argv, progress = false) {
  if (argv.length < 4 || argv.length % 2 !== 0) return null;
  const result = { writableRoots: [], ...(progress ? { authorizedTaskIds: [] } : {}) };
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === "--writable-root") {
      result.writableRoots.push(argv[index + 1]);
      continue;
    }
    if (progress && argv[index] === "--authorized-task") {
      result.authorizedTaskIds.push(argv[index + 1]);
      continue;
    }
    if (argv[index] === "--overwrite") {
      if (own(result, "overwrite")) return null;
      result.overwrite = argv[index + 1] === "true";
      continue;
    }
    const key = ({ "--workspace": "workspace", "--snapshot": "snapshot", "--traceability": "traceability", "--plan": "plan" })[argv[index]];
    if (!key || own(result, key)) return null;
    result[key] = argv[index + 1];
  }
  return own(result, "workspace") && result.writableRoots.length > 0
    && (!progress || result.authorizedTaskIds.length > 0) ? result : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const operation = ["rebind", "verify-progress", "verify-and-rebind", "derive"].includes(argv[0]) ? argv[0] : "validate";
  const progressOperation = ["verify-progress", "verify-and-rebind"].includes(operation);
  const parsed = parseCli(operation === "validate" ? argv : argv.slice(1), progressOperation) ?? {};
  const result = operation === "rebind"
    ? await rebindOpenSpecOverlay(parsed)
    : operation === "derive"
      ? await deriveOpenSpecOverlay(parsed)
      : progressOperation
        ? await verifyOpenSpecProgress(parsed)
        : await validateOpenSpecOverlay(parsed);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
