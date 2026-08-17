#!/usr/bin/env node
/** Validate the minimal Team Harness execution overlay over a pinned OpenSpec snapshot. */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isOpenSpecSnapshot } from "./openspec-snapshot.mjs";

export const OPENSPEC_OVERLAY_SCHEMA_VERSION = 1;
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 4096;
const SHA256 = /^[a-f0-9]{64}$/;
const ITEM_ID = /^(?:AC|Task)-[1-9][0-9]*$/;
const QUALITY_ID = /^[a-z][a-z0-9_]*$/;
const CLASSIFICATIONS = new Set(["direct", "split", "merged", "th-extension", "excluded", "ambiguous"]);
const SOURCE_KINDS = new Set(["requirement", "scenario", "design-decision", "task"]);
const FORBIDDEN_NORMATIVE_KEYS = new Set([
  "title", "description", "text", "source_text", "normative_text", "requirement", "scenario", "given", "when", "then",
]);

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
function finding(code, target) { return { code, target }; }
function rationaleValid(classification, rationale) {
  return classification === "direct" ? rationale === null : safeString(rationale, 2048);
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
    : ["id", "sources", "classification", "rationale", "owner", "specialist", "shard_path", "files", "dependencies", "invariants", "technical_constraints", "quality_command_ids", "pre_implementation_test", "evidence_anchors", "rollback", "delivery_group"];
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
    || !safeRelative(item.shard_path) || !/^plan\/tasks\/Task-[1-9][0-9]*\.md$/.test(item.shard_path)
    || !Array.isArray(item.files) || item.files.length === 0 || new Set(item.files).size !== item.files.length || !item.files.every(safeRelative)
    || !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length || !item.dependencies.every(id => ITEM_ID.test(id) && id.startsWith("Task-"))
    || !Array.isArray(item.invariants) || item.invariants.length === 0 || !item.invariants.every(value => safeString(value, 1024))
    || !Array.isArray(item.technical_constraints) || !item.technical_constraints.every(value => safeString(value, 1024))
    || !Array.isArray(item.quality_command_ids) || new Set(item.quality_command_ids).size !== item.quality_command_ids.length
    || !item.quality_command_ids.every(id => qualityIds.has(id))
    || !["required", "not-applicable"].includes(item.pre_implementation_test)
    || !Array.isArray(item.evidence_anchors) || item.evidence_anchors.length === 0 || !item.evidence_anchors.every(safeRelative)) {
    findings.push(finding("EXECUTION_CONTROL_INVALID", item.id));
  }
}

function validateShape(overlay, snapshot, snapshotBytes, findings) {
  const keys = ["schema_version", "kind", "plan_format", "snapshot", "repository", "quality_commands", "freeze", "acceptance_items", "execution_items", "source_dispositions", "operator_disclosures"];
  if (!exact(overlay, keys) || overlay.schema_version !== OPENSPEC_OVERLAY_SCHEMA_VERSION
    || overlay.kind !== "team_harness_openspec_execution_overlay" || overlay.plan_format !== "sharded-v1") {
    findings.push(finding("OVERLAY_SCHEMA_INVALID", "overlay"));
    return;
  }
  if (hasForbiddenKeys(overlay)) findings.push(finding("NORMATIVE_TEXT_DUPLICATED", "overlay"));
  if (!exact(overlay.snapshot, ["path", "sha256", "artifact_set_sha256", "change_name"])
    || overlay.snapshot.path !== "inputs/openspec-snapshot.json"
    || overlay.snapshot.sha256 !== hash(snapshotBytes) || overlay.snapshot.artifact_set_sha256 !== snapshot.artifact_set_sha256
    || overlay.snapshot.change_name !== snapshot.change.name) findings.push(finding("SNAPSHOT_STALE", "snapshot"));
  if (!exact(overlay.repository, ["root", "ownership"]) || overlay.repository.root !== snapshot.repository.root
    || !Array.isArray(overlay.repository.ownership) || overlay.repository.ownership.length === 0
    || overlay.repository.ownership.some(entry => !exact(entry, ["path", "owner"]) || !safeRelative(entry.path) || !safeString(entry.owner, 512))) {
    findings.push(finding("OWNERSHIP_INVALID", "repository"));
  }
  if (!Array.isArray(overlay.quality_commands) || overlay.quality_commands.length === 0
    || overlay.quality_commands.some(entry => !exact(entry, ["id"]) || !QUALITY_ID.test(entry.id))
    || new Set(overlay.quality_commands.map(entry => entry.id)).size !== overlay.quality_commands.length) {
    findings.push(finding("QUALITY_COMMAND_INVALID", "quality_commands"));
  }
  if (!exact(overlay.freeze, ["baseline_sha256", "state_anchor", "evidence_root"])
    || !SHA256.test(overlay.freeze.baseline_sha256) || !safeRelative(overlay.freeze.state_anchor) || !safeRelative(overlay.freeze.evidence_root)) {
    findings.push(finding("FREEZE_CONTROL_INVALID", "freeze"));
  }
}

export async function validateOpenSpecOverlay({ workspace, snapshot = "inputs/openspec-snapshot.json", traceability = "plan/openspec-traceability.json" } = {}) {
  const started = process.hrtime.bigint();
  const findings = [];
  let snapshotValue = null;
  let overlay = null;
  let snapshotDigest = null;
  let overlayDigest = null;
  try {
    if (!safeString(workspace) || snapshot !== "inputs/openspec-snapshot.json" || traceability !== "plan/openspec-traceability.json") throw new Error("arguments");
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
      validateShape(overlay, snapshotValue, snapshotFile.bytes, findings);
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
          try { await readRegular(root, item.shard_path); }
          catch { findings.push(finding("SHARD_INVALID", item.id ?? "Task")); }
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

function parseCli(argv) {
  if (argv.length !== 6) return null;
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = ({ "--workspace": "workspace", "--snapshot": "snapshot", "--traceability": "traceability" })[argv[index]];
    if (!key || own(result, key)) return null;
    result[key] = argv[index + 1];
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateOpenSpecOverlay(parseCli(process.argv.slice(2)) ?? {});
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.verdict !== "pass") process.exitCode = 1;
}
