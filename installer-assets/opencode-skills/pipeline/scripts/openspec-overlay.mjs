#!/usr/bin/env node
/** Derive and validate an implementable Team Harness execution overlay over a pinned OpenSpec snapshot. */

import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isOpenSpecSnapshot, normalizeOpenSpecTaskIds, verifySnapshot } from "./openspec-snapshot.mjs";
import { isQualityCommandId, validateQualityManifest } from "./quality-runner.mjs";

export const OPENSPEC_OVERLAY_SCHEMA_VERSION = 2;
export const OPENSPEC_OVERLAY_REBIND_SCHEMA_VERSION = 1;
export const OPENSPEC_PROGRESS_TRANSITION_SCHEMA_VERSION = 2;
export const OPENSPEC_OVERLAY_DERIVATION_SCHEMA_VERSION = 2;
export const OPENSPEC_EXECUTION_CONTRACT_SCHEMA_VERSION = 1;
export const OPENSPEC_DERIVED_REPAIR_SCHEMA_VERSION = 1;
const EXECUTION_CONTRACT_HEADING = "## Team Harness Execution Contract";
const DERIVATION_EXCLUSION_RATIONALE = "The child scenario or task coordinates carry the independently testable or executable work.";
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 4096;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ITEM_ID = /^(?:AC|Task)-[1-9][0-9]*$/;
const ANCHOR_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const PLACEHOLDER = /(?:derivation scaffold|planning pass authors|\b(?:todo|tbd)\b|\{[^}\n]+\}|<[^>\n]+>)/i;
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
function safeArray(value, validator, { nonempty = false } = {}) {
  return Array.isArray(value) && (!nonempty || value.length > 0) && value.length <= MAX_ITEMS
    && new Set(value.map(item => JSON.stringify(item))).size === value.length && value.every(validator);
}
function substantive(value, maximum = 1024) {
  return safeString(value, maximum) && !PLACEHOLDER.test(value);
}
function validDiscoveryScope(value) {
  return exact(value, ["directories", "globs"])
    && safeArray(value.directories, safeRelative, { nonempty: true })
    && safeArray(value.globs, item => safeRelative(item) && /[*?[]/.test(item), { nonempty: true });
}
function validRequiredSeam(value) {
  return exact(value, ["path", "anchor"]) && safeRelative(value.path)
    && (value.anchor === null || substantive(value.anchor, 512));
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

export function extractExecutionContract(text) {
  const normalized = text.replaceAll("\r\n", "\n");
  const headings = normalized.split("\n").filter(line => line === EXECUTION_CONTRACT_HEADING);
  if (headings.length !== 1) return null;
  const start = normalized.indexOf(`${EXECUTION_CONTRACT_HEADING}\n`);
  const tail = normalized.slice(start + EXECUTION_CONTRACT_HEADING.length + 1);
  const nextHeading = tail.search(/^##\s/m);
  const section = nextHeading < 0 ? tail : tail.slice(0, nextHeading);
  const matches = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)];
  if (matches.length !== 1) return null;
  try { return JSON.parse(matches[0][1]); } catch { return null; }
}

export function validateExecutionContract(contract, snapshot, taskCoordinates, roots) {
  if (!exact(contract, ["schema_version", "kind", "worktree", "quality_manifest", "tasks"])
    || contract.schema_version !== OPENSPEC_EXECUTION_CONTRACT_SCHEMA_VERSION
    || contract.kind !== "team_harness_openspec_execution_contract"
    || !exact(contract.worktree, ["path", "branch", "base_sha"])
    || !safeString(contract.worktree.path) || !path.isAbsolute(contract.worktree.path)
    || !BRANCH.test(contract.worktree.branch ?? "") || !GIT_SHA.test(contract.worktree.base_sha ?? "")
    || contract.worktree.base_sha !== snapshot.repository.head_sha
    || !roots.some(root => contained(root, path.resolve(contract.worktree.path)))
    || !Array.isArray(contract.tasks) || contract.tasks.length !== taskCoordinates.length) return null;
  let qualityManifest;
  try { qualityManifest = validateQualityManifest(contract.quality_manifest); } catch { return null; }
  const qualityIds = new Set(Object.keys(qualityManifest.commands));
  const taskIds = new Set(taskCoordinates.map(item => item.id));
  if (new Set(contract.tasks.map(item => item?.source_id)).size !== taskCoordinates.length) return null;
  for (const task of contract.tasks) {
    if (!exact(task, ["source_id", "owner", "specialist", "files", "dependencies", "required_invariants", "technical_constraints", "quality_command_ids", "observable_runtime_behavior", "pre_implementation_test", "required_evidence_anchors", "cross_runtime_preservation", "rollback", "delivery_group", "discovery_scope", "required_seams"])
      || !taskIds.has(task.source_id) || !substantive(task.owner, 512) || !substantive(task.specialist, 512)
      || !safeArray(task.files, value => safeRelative(value) && !value.startsWith("openspec/"), { nonempty: true })
      || !safeArray(task.dependencies, value => taskIds.has(value) && value !== task.source_id)
      || !safeArray(task.required_invariants, value => ANCHOR_ID.test(value))
      || !safeArray(task.technical_constraints, value => substantive(value), { nonempty: true })
      || !safeArray(task.quality_command_ids, value => qualityIds.has(value), { nonempty: true })
      || typeof task.observable_runtime_behavior !== "boolean"
      || !["required", "not-applicable"].includes(task.pre_implementation_test)
      || !safeArray(task.required_evidence_anchors, safeRelative, { nonempty: true })
      || !substantive(task.cross_runtime_preservation) || !substantive(task.rollback)
      || !substantive(task.delivery_group, 512) || !validDiscoveryScope(task.discovery_scope)
      || !safeArray(task.required_seams, validRequiredSeam)) return null;
    const testRequired = task.observable_runtime_behavior
      && Object.hasOwn(qualityManifest.commands, "test") && qualityManifest.test_contract !== null;
    if ((task.pre_implementation_test === "required") !== testRequired) return null;
  }
  return { contract, qualityManifest };
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

function validMapping(item, expectedPrefix, expectedShardRoot, sourceIds, qualityIds, findings) {
  const baseKeys = expectedPrefix === "AC"
    ? ["id", "sources", "classification", "rationale", "evidence_anchor"]
    : ["id", "sources", "classification", "rationale", "owner", "specialist", "shard_path", "files", "dependencies", "required_invariants", "technical_constraints", "quality_command_ids", "observable_runtime_behavior", "pre_implementation_test", "required_evidence_anchors", "cross_runtime_preservation", "rollback", "delivery_group", "discovery_scope", "required_seams"];
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
    || !item.shard_path.startsWith(`${expectedShardRoot}/`)
    || !Array.isArray(item.files) || item.files.length === 0 || new Set(item.files).size !== item.files.length
    || !item.files.every(value => safeRelative(value) && !value.startsWith("openspec/"))
    || !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length || !item.dependencies.every(id => ITEM_ID.test(id) && id.startsWith("Task-"))
    || !Array.isArray(item.required_invariants) || new Set(item.required_invariants).size !== item.required_invariants.length || !item.required_invariants.every(value => ANCHOR_ID.test(value))
    || !Array.isArray(item.technical_constraints) || !item.technical_constraints.every(value => safeString(value, 1024))
    || !Array.isArray(item.quality_command_ids) || item.quality_command_ids.length === 0 || new Set(item.quality_command_ids).size !== item.quality_command_ids.length
    || !item.quality_command_ids.every(id => qualityIds.has(id))
    || typeof item.observable_runtime_behavior !== "boolean"
    || !["required", "not-applicable"].includes(item.pre_implementation_test)
    || !Array.isArray(item.required_evidence_anchors) || item.required_evidence_anchors.length === 0
    || new Set(item.required_evidence_anchors).size !== item.required_evidence_anchors.length || !item.required_evidence_anchors.every(safeRelative)
    || !substantive(item.cross_runtime_preservation, 1024) || !substantive(item.rollback, 512)
    || !validDiscoveryScope(item.discovery_scope) || !safeArray(item.required_seams, validRequiredSeam)) {
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
  if (!exact(overlay.repository, ["root", "ownership", "worktree"]) || overlay.repository.root !== snapshot.repository.root
    || !Array.isArray(overlay.repository.ownership) || overlay.repository.ownership.length === 0
    || overlay.repository.ownership.some(entry => !exact(entry, ["path", "owner"]) || !safeRelative(entry.path) || !substantive(entry.owner, 512))
    || !exact(overlay.repository.worktree, ["path", "branch", "base_sha"])
    || !safeString(overlay.repository.worktree.path) || !path.isAbsolute(overlay.repository.worktree.path)
    || !BRANCH.test(overlay.repository.worktree.branch ?? "") || overlay.repository.worktree.base_sha !== snapshot.repository.head_sha) {
    findings.push(finding("OWNERSHIP_INVALID", "repository"));
  }
  if (!Array.isArray(overlay.quality_commands) || overlay.quality_commands.length === 0
    || overlay.quality_commands.some(entry => !exact(entry, ["id"]) || !isQualityCommandId(entry.id))
    || new Set(overlay.quality_commands.map(entry => entry.id)).size !== overlay.quality_commands.length) {
    findings.push(finding("QUALITY_COMMAND_INVALID", "quality_commands"));
  }
  if (!exact(overlay.freeze, ["baseline_sha256", "state_anchor", "evidence_root", "quality_manifest_path", "quality_manifest_sha256"])
    || !SHA256.test(overlay.freeze.baseline_sha256) || !safeRelative(overlay.freeze.state_anchor) || !safeRelative(overlay.freeze.evidence_root)
    || overlay.freeze.quality_manifest_path !== ".team-harness/quality.json" || !SHA256.test(overlay.freeze.quality_manifest_sha256 ?? "")) {
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
        let qualityManifest = null;
        try {
          const manifestFile = await readRegular(root, overlay.freeze?.quality_manifest_path);
          if (hash(manifestFile.bytes) !== overlay.freeze?.quality_manifest_sha256) throw new Error("stale");
          qualityManifest = validateQualityManifest(JSON.parse(manifestFile.bytes.toString("utf8")));
          const declared = Array.isArray(overlay.quality_commands) ? overlay.quality_commands.map(item => item?.id).sort() : [];
          const actual = Object.keys(qualityManifest.commands).sort();
          if (JSON.stringify(declared) !== JSON.stringify(actual)) throw new Error("mismatch");
        } catch { findings.push(finding("QUALITY_MANIFEST_INVALID", ".team-harness/quality.json")); }
        const worktree = path.resolve(overlay.repository?.worktree?.path ?? path.parse(root).root);
        if (!roots.some(writableRoot => contained(writableRoot, worktree))) {
          findings.push(finding("EXECUTION_ROOT_NOT_WRITABLE", "repository"));
        }
        const coordinates = snapshotValue.artifacts.flatMap(artifact => artifact.coordinates)
          .filter(coordinate => SOURCE_KINDS.has(coordinate.kind));
        const sourceIds = new Set(coordinates.map(coordinate => coordinate.id));
        const qualityIds = new Set(Array.isArray(overlay.quality_commands) ? overlay.quality_commands.map(command => command.id) : []);
        const acceptance = Array.isArray(overlay.acceptance_items) ? overlay.acceptance_items : [];
        const execution = Array.isArray(overlay.execution_items) ? overlay.execution_items : [];
        const expectedShardRoot = traceability === "plan/openspec-traceability.json"
          ? "plan/tasks"
          : `${path.posix.dirname(traceability)}/tasks`;
        if (acceptance.length + execution.length === 0 || acceptance.length + execution.length > MAX_ITEMS) findings.push(finding("ITEM_SCHEMA_INVALID", "items"));
        for (const item of acceptance) validMapping(item, "AC", expectedShardRoot, sourceIds, qualityIds, findings);
        for (const item of execution) validMapping(item, "Task", expectedShardRoot, sourceIds, qualityIds, findings);
        if (qualityManifest !== null) for (const item of execution) {
          const testRequired = item.observable_runtime_behavior === true
            && Object.hasOwn(qualityManifest.commands, "test") && qualityManifest.test_contract !== null;
          if ((item.pre_implementation_test === "required") !== testRequired) {
            findings.push(finding("PRE_IMPLEMENTATION_TEST_INVALID", item.id ?? "Task"));
          }
        }
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
            if (target === null || target !== path.resolve(overlay.repository?.worktree?.path ?? "")
              || !roots.some(writableRoot => contained(writableRoot, target))) {
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

function shardScaffold(item, worktree) {
  const files = item.files.map(value => `  - \`${value}\``).join("\n");
  const constraints = item.technical_constraints.map((value, index) => `- **TC-${index + 1}:** ${value}`).join("\n");
  const seams = item.required_seams.length === 0 ? "[]" : JSON.stringify(item.required_seams);
  return `# ${item.id}\n\n- **OpenSpec source:** \`${item.sources[0]}\`\n- **Owner:** ${item.owner}\n- **Specialist:** ${item.specialist}\n- **Worktree:** ${worktree.path} — branch ${worktree.branch}, base ${worktree.base_sha}\n- **Files:**\n${files}\n- **Depends on:** ${item.dependencies.length === 0 ? "none" : item.dependencies.join(", ")}\n- **Discovery directories:** [${item.discovery_scope.directories.join(", ")}]\n- **Discovery globs:** [${item.discovery_scope.globs.join(", ")}]\n- **Required seams:** ${seams}\n\n## Dispatch anchors\n\nrequired_invariants: [${item.required_invariants.join(", ")}]\nrequired_evidence_anchors: [${item.required_evidence_anchors.join(", ")}]\ncross_runtime_preservation: ${item.cross_runtime_preservation}\n\n#### Technical Constraints\n\n${constraints}\n\n#### Verification\n\n- **Pre-implementation test:** ${item.pre_implementation_test}\n- **Required quality checks:** ${item.quality_command_ids.join(", ")}\n- Run the declared quality commands and bind their receipts to the required evidence anchors.\n- **Rollback:** ${item.rollback}\n`;
}

/** Compact Gate-1 index scaffold: mechanical Plan Manifest and Task Index binding the traceability and shard paths this same derivation writes. Judgment content stays in the pinned OpenSpec coordinates each item's traceability entry sources; nothing is authored here. */
function planScaffold(changeName, traceability, executionItems) {
  const manifestRows = [
    `| traceability | shared | \`${traceability}\` | acceptance items, execution items, dispositions |`,
    ...executionItems.map(item => `| task | ${item.id} | \`${item.shard_path}\` | dispatch anchors |`),
  ].join("\n");
  const indexRows = executionItems
    .map(item => `| ${item.id} | ${item.owner} | pending | 1 | ${item.technical_constraints.length} | \`${item.shard_path}\` |`)
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

function repairResult(verdict, errorCode, details = {}) {
  return {
    schema_version: OPENSPEC_DERIVED_REPAIR_SCHEMA_VERSION,
    kind: "team_harness_openspec_derived_repair",
    verdict,
    error_code: errorCode,
    changed: details.changed ?? false,
    classification: details.classification ?? null,
    snapshot_sha256: details.snapshot_sha256 ?? null,
    approved_overlay_sha256: details.approved_overlay_sha256 ?? null,
    regenerated_overlay_sha256: details.regenerated_overlay_sha256 ?? null,
    evidence_path: details.evidence_path ?? null,
    evidence_sha256: details.evidence_sha256 ?? null,
    derivation_error_code: details.derivation_error_code ?? null,
  };
}

async function optionalArtifact(root, relative) {
  try { return await readRegular(root, relative); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

let atomicSequence = 0;
async function atomicReplace(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.repair-${process.pid}-${atomicSequence += 1}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function repairEvidencePath(traceability) {
  const directory = path.posix.dirname(traceability);
  return traceability === "plan/openspec-traceability.json"
    ? "plan/openspec-derived-repair.json"
    : `${directory}/derived-repair.json`;
}

function buildDerivationOverlay(snapshotValue, snapshotFile, snapshot, traceability, executionContract, qualityManifestBytes) {
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
  const contractBySource = new Map(executionContract.tasks.map(task => [task.source_id, task]));
  const taskIdBySource = new Map(taskCoordinates.map((coordinate, index) => [coordinate.id, `Task-${index + 1}`]));
  const executionItems = taskCoordinates.map((coordinate, index) => {
    const contractTask = contractBySource.get(coordinate.id);
    return {
      id: `Task-${index + 1}`, sources: [coordinate.id], classification: "direct", rationale: null,
      owner: contractTask.owner, specialist: contractTask.specialist, shard_path: `${taskRoot}/Task-${index + 1}.md`,
      files: contractTask.files, dependencies: contractTask.dependencies.map(source => taskIdBySource.get(source)),
      required_invariants: contractTask.required_invariants, technical_constraints: contractTask.technical_constraints,
      quality_command_ids: contractTask.quality_command_ids, observable_runtime_behavior: contractTask.observable_runtime_behavior,
      pre_implementation_test: contractTask.pre_implementation_test, required_evidence_anchors: contractTask.required_evidence_anchors,
      cross_runtime_preservation: contractTask.cross_runtime_preservation, rollback: contractTask.rollback,
      delivery_group: contractTask.delivery_group, discovery_scope: contractTask.discovery_scope,
      required_seams: contractTask.required_seams,
    };
  });
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
    repository: {
      root: snapshotValue.repository.root,
      ownership: executionItems.map(item => ({ path: item.files[0], owner: item.owner })),
      worktree: executionContract.worktree,
    },
    quality_commands: Object.keys(executionContract.quality_manifest.commands).sort().map(id => ({ id })),
    freeze: {
      baseline_sha256: hash(snapshotFile.bytes), state_anchor: "00-state.md", evidence_root: "reviews",
      quality_manifest_path: ".team-harness/quality.json", quality_manifest_sha256: hash(qualityManifestBytes),
    },
    acceptance_items: acceptanceItems, execution_items: executionItems,
    source_dispositions: sourceDispositions, operator_disclosures: operatorDisclosures,
  };
  return { overlay, acceptanceItems, executionItems };
}

/** Write the quality manifest, every complete shard, the Gate-1 index, and traceability; remove outputs written by a failed call. */
async function writeDerivationOutputs(root, traceability, plan, planText, overlay, executionItems, qualityManifestBytes) {
  const written = [];
  try {
    const manifestPath = path.resolve(root, ".team-harness/quality.json");
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, qualityManifestBytes);
    written.push(manifestPath);
    for (const item of executionItems) {
      const shardPath = path.resolve(root, item.shard_path);
      await mkdir(path.dirname(shardPath), { recursive: true });
      await writeFile(shardPath, shardScaffold(item, overlay.repository.worktree));
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
  const targets = [traceability, plan, ".team-harness/quality.json", ...executionItems.map(item => item.shard_path)];
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
 * Derive overlay v2 mechanically from a validated OpenSpec change, its pinned snapshot, and the
 * closed execution contract inside canonical tasks.md. Every `scenario` coordinate becomes one
 * acceptance item, every `task` coordinate becomes one implementable execution item and shard,
 * and every `requirement` or
 * `design-decision` coordinate — carrying no standalone testable or executable shape — is
 * dispositioned `excluded` with a disclosed rationale. There is no model call or operator input:
 * files, commands, worktree topology, discovery, seams, evidence, preservation, and rollback are
 * validated judgment authored by the single planning pass, never guessed from task titles.
 * All-or-nothing: refuses and writes nothing unless BOTH the snapshot's own repository root AND
 * the resolved `workspace` write root are each independently contained by a writable root, and
 * the traceability file, quality manifest, Gate-1 index, and every target shard path either do not yet exist or
 * `overwrite: true` was passed explicitly. If a write fails partway through, every shard and index
 * output already written in this call is removed before the failure result is returned; the
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
    const allCoordinates = snapshotValue.artifacts.flatMap(artifact => artifact.coordinates);
    if (!allCoordinates.some(coordinate => coordinate.kind === "scenario")
      || !allCoordinates.some(coordinate => coordinate.kind === "task")) {
      return derivationResult("fail", "SOURCE_COVERAGE_INCOMPLETE");
    }

    const taskArtifact = snapshotValue.artifacts.find(artifact => artifact.artifact_id === "tasks");
    if (!taskArtifact) return derivationResult("fail", "EXECUTION_CONTRACT_INVALID");
    const taskFile = await readRegular(path.resolve(snapshotValue.repository.root), taskArtifact.path);
    if (hash(taskFile.bytes) !== taskArtifact.content_sha256) return derivationResult("fail", "SOURCE_CHANGED");
    const taskCoordinates = taskArtifact.coordinates.filter(coordinate => coordinate.kind === "task");
    const parsedContract = extractExecutionContract(taskFile.bytes.toString("utf8"));
    if (validateExecutionContract(parsedContract, snapshotValue, taskCoordinates, roots) === null) {
      return derivationResult("fail", "EXECUTION_CONTRACT_INVALID");
    }
    const qualityManifestBytes = Buffer.from(`${JSON.stringify(parsedContract.quality_manifest, null, 2)}\n`, "utf8");

    const built = buildDerivationOverlay(snapshotValue, snapshotFile, snapshot, traceability, parsedContract, qualityManifestBytes);
    if (built === null) return derivationResult("fail", "SOURCE_COVERAGE_INCOMPLETE");
    const { overlay, acceptanceItems, executionItems } = built;

    const resolved = await resolveDerivationTargets(root, traceability, plan, executionItems, overwrite);
    if (!resolved.ok) return derivationResult("fail", resolved.code);

    const planText = planScaffold(snapshotValue.change.name, traceability, executionItems);
    const overlayBytes = await writeDerivationOutputs(root, traceability, plan, planText, overlay, executionItems, qualityManifestBytes);

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

/**
 * Restore only Gate-1-approved derived bytes before the first implementation dispatch.
 * The caller supplies identities from a freshly verified aggregate/gate record. This helper
 * independently proves immutable canonical source, derives and validates in isolation, and
 * refuses replacement unless the regenerated overlay is byte-identical to the approved hash.
 */
export async function repairDerivedOpenSpecArtifacts({
  workspace,
  snapshot = "inputs/openspec-snapshot.json",
  traceability = "plan/openspec-traceability.json",
  plan = "01-plan.md",
  writableRoots,
  approvedSnapshotSha256,
  approvedOverlaySha256,
  approvedAggregateSha256,
  approvedGateIdentitySha256,
  implementationStarted,
  artifactWriter = atomicReplace,
} = {}) {
  const common = {
    classification: "derived-artifact-damage",
    snapshot_sha256: SHA256.test(approvedSnapshotSha256 ?? "") ? approvedSnapshotSha256 : null,
    approved_overlay_sha256: SHA256.test(approvedOverlaySha256 ?? "") ? approvedOverlaySha256 : null,
  };
  if (implementationStarted !== false || !SHA256.test(approvedSnapshotSha256 ?? "")
    || !SHA256.test(approvedOverlaySha256 ?? "") || !SHA256.test(approvedAggregateSha256 ?? "")
    || !SHA256.test(approvedGateIdentitySha256 ?? "") || !safeString(workspace)
    || !SNAPSHOT_PATH.test(snapshot) || !TRACEABILITY_PATH.test(traceability) || !PLAN_PATH.test(plan)) {
    return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
  }
  const roots = normalizeWritableRoots(writableRoots);
  if (roots === null) return repairResult("fail", "ARGUMENT_INVALID", common);

  let root;
  let stage = null;
  try {
    root = await realpath(path.resolve(workspace));
    if (!(await lstat(root)).isDirectory() || !roots.some(writableRoot => contained(writableRoot, root))) {
      return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
    }
    const snapshotFile = await readRegular(root, snapshot);
    if (hash(snapshotFile.bytes) !== approvedSnapshotSha256) {
      return repairResult("fail", "APPROVED_SNAPSHOT_MISMATCH", common);
    }
    const sourceVerification = await verifySnapshot({ snapshotPath: snapshotFile.canonical, phase: "pre-gate1" });
    if (sourceVerification.verdict !== "pass" || sourceVerification.snapshot_sha256 !== approvedSnapshotSha256) {
      return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", {
        ...common, derivation_error_code: sourceVerification.error_code,
      });
    }

    const current = await validateOpenSpecOverlay({ workspace: root, snapshot, traceability, writableRoots: roots });
    if (current.verdict === "pass" && current.overlay_sha256 === approvedOverlaySha256) {
      return repairResult("pass", null, { ...common, regenerated_overlay_sha256: current.overlay_sha256 });
    }

    const stageParent = path.resolve(root, ".team-harness");
    await mkdir(stageParent, { recursive: true });
    stage = await mkdtemp(path.join(stageParent, "derived-repair-"));
    const stagedSnapshot = path.resolve(stage, snapshot);
    await mkdir(path.dirname(stagedSnapshot), { recursive: true });
    await writeFile(stagedSnapshot, snapshotFile.bytes);
    const derived = await deriveOpenSpecOverlay({
      workspace: stage,
      snapshot,
      traceability,
      plan,
      writableRoots: [...roots, stage],
    });
    if (derived.verdict !== "pass") {
      return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", {
        ...common, derivation_error_code: derived.error_code,
      });
    }
    if (derived.overlay_sha256 !== approvedOverlaySha256) {
      return repairResult("fail", "APPROVED_OVERLAY_MISMATCH", {
        ...common, regenerated_overlay_sha256: derived.overlay_sha256,
      });
    }
    const stagedValidation = await validateOpenSpecOverlay({
      workspace: stage, snapshot, traceability, writableRoots: [...roots, stage],
    });
    if (stagedValidation.verdict !== "pass" || stagedValidation.overlay_sha256 !== approvedOverlaySha256) {
      return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", {
        ...common, regenerated_overlay_sha256: stagedValidation.overlay_sha256,
        derivation_error_code: stagedValidation.error_code,
      });
    }

    const stagedOverlay = JSON.parse((await readRegular(stage, traceability)).bytes.toString("utf8"));
    const targets = [
      plan,
      ".team-harness/quality.json",
      ...stagedOverlay.execution_items.map(item => item.shard_path),
      traceability,
    ];
    if (new Set(targets).size !== targets.length) {
      return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
    }
    const records = [];
    for (const relative of targets) {
      const stagedFile = await readRegular(stage, relative);
      const liveFile = await optionalArtifact(root, relative);
      records.push({
        path: relative,
        before: liveFile?.bytes ?? null,
        after: stagedFile.bytes,
        before_sha256: liveFile === null ? null : hash(liveFile.bytes),
        after_sha256: hash(stagedFile.bytes),
      });
    }

    const replaced = [];
    try {
      for (const record of records) {
        await artifactWriter(path.resolve(root, record.path), record.after);
        replaced.push(record);
      }
    } catch {
      let rollbackFailed = false;
      for (const record of replaced.reverse()) {
        try {
          const target = path.resolve(root, record.path);
          if (record.before === null) await unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; });
          else await atomicReplace(target, record.before);
        } catch { rollbackFailed = true; }
      }
      return repairResult("fail", rollbackFailed ? "DERIVED_REPAIR_ROLLBACK_FAILED" : "DERIVED_REPAIR_WRITE_FAILED", common);
    }

    const liveValidation = await validateOpenSpecOverlay({ workspace: root, snapshot, traceability, writableRoots: roots });
    if (liveValidation.verdict !== "pass" || liveValidation.overlay_sha256 !== approvedOverlaySha256) {
      let rollbackFailed = false;
      for (const record of records.slice().reverse()) {
        try {
          const target = path.resolve(root, record.path);
          if (record.before === null) await unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; });
          else await atomicReplace(target, record.before);
        } catch { rollbackFailed = true; }
      }
      return repairResult("fail", rollbackFailed ? "DERIVED_REPAIR_ROLLBACK_FAILED" : "DERIVED_REPAIR_POST_VALIDATION_FAILED", {
        ...common, regenerated_overlay_sha256: liveValidation.overlay_sha256,
        derivation_error_code: liveValidation.error_code,
      });
    }

    const evidenceRelative = repairEvidencePath(traceability);
    if (await optionalArtifact(root, evidenceRelative) !== null) {
      for (const record of records.slice().reverse()) {
        const target = path.resolve(root, record.path);
        if (record.before === null) await unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; });
        else await atomicReplace(target, record.before);
      }
      return repairResult("fail", "DERIVED_REPAIR_ALREADY_RECORDED", common);
    }
    const evidence = {
      schema_version: OPENSPEC_DERIVED_REPAIR_SCHEMA_VERSION,
      kind: "team_harness_openspec_derived_repair_evidence",
      classification: "derived-artifact-damage",
      implementation_started: false,
      gate_preserved: true,
      approved: {
        snapshot_sha256: approvedSnapshotSha256,
        overlay_sha256: approvedOverlaySha256,
        aggregate_sha256: approvedAggregateSha256,
        gate_identity_sha256: approvedGateIdentitySha256,
      },
      regenerated_overlay_sha256: liveValidation.overlay_sha256,
      artifacts: records.map(({ path: artifactPath, before_sha256, after_sha256 }) => ({
        path: artifactPath, before_sha256, after_sha256,
      })),
      validations: {
        canonical_snapshot: "pass",
        staged_overlay: "pass",
        live_overlay: "pass",
        aggregate_and_gate: "required-before-and-after-by-coordinator",
      },
    };
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    try { await atomicReplace(path.resolve(root, evidenceRelative), evidenceBytes); }
    catch {
      let rollbackFailed = false;
      for (const record of records.slice().reverse()) {
        try {
          const target = path.resolve(root, record.path);
          if (record.before === null) await unlink(target).catch(error => { if (error.code !== "ENOENT") throw error; });
          else await atomicReplace(target, record.before);
        } catch { rollbackFailed = true; }
      }
      return repairResult("fail", rollbackFailed ? "DERIVED_REPAIR_ROLLBACK_FAILED" : "DERIVED_REPAIR_EVIDENCE_FAILED", common);
    }
    return repairResult("pass", null, {
      ...common,
      changed: true,
      regenerated_overlay_sha256: liveValidation.overlay_sha256,
      evidence_path: evidenceRelative,
      evidence_sha256: hash(evidenceBytes),
    });
  } catch {
    return repairResult("fail", "DERIVED_REPAIR_INELIGIBLE", common);
  } finally {
    if (stage !== null) await rm(stage, { recursive: true, force: true }).catch(() => {});
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
    if (argv[index] === "--implementation-started") {
      if (own(result, "implementationStarted") || !["true", "false"].includes(argv[index + 1])) return null;
      result.implementationStarted = argv[index + 1] === "true";
      continue;
    }
    const key = ({
      "--workspace": "workspace",
      "--snapshot": "snapshot",
      "--traceability": "traceability",
      "--plan": "plan",
      "--approved-snapshot-sha256": "approvedSnapshotSha256",
      "--approved-overlay-sha256": "approvedOverlaySha256",
      "--approved-aggregate-sha256": "approvedAggregateSha256",
      "--approved-gate-identity-sha256": "approvedGateIdentitySha256",
    })[argv[index]];
    if (!key || own(result, key)) return null;
    result[key] = argv[index + 1];
  }
  return own(result, "workspace") && result.writableRoots.length > 0
    && (!progress || result.authorizedTaskIds.length > 0) ? result : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const operation = ["rebind", "verify-progress", "verify-and-rebind", "derive", "repair-derived"].includes(argv[0]) ? argv[0] : "validate";
  const progressOperation = ["verify-progress", "verify-and-rebind"].includes(operation);
  const parsed = parseCli(operation === "validate" ? argv : argv.slice(1), progressOperation) ?? {};
  const result = operation === "rebind"
    ? await rebindOpenSpecOverlay(parsed)
    : operation === "derive"
      ? await deriveOpenSpecOverlay(parsed)
      : operation === "repair-derived"
        ? await repairDerivedOpenSpecArtifacts(parsed)
      : progressOperation
        ? await verifyOpenSpecProgress(parsed)
        : await validateOpenSpecOverlay(parsed);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
