#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  selectSpaceContainer,
  selectSpaceEffort,
  classifySpaceWrite,
  classifySpaceSetup,
} from "../skills/workspace/scripts/space-context.mjs";

const native = JSON.parse(await readFile(new URL("./fixtures/space-context/native-pages.json", import.meta.url), "utf8"));
const writes = JSON.parse(await readFile(new URL("./fixtures/space-context/write-receipts.json", import.meta.url), "utf8"));
const before = JSON.stringify({ native, writes });
const containerInput = { spaceId: native.space_id, rootPageId: native.root_page_id,
  pages: [native.container], listingComplete: true };
const chooseContainer = changes => selectSpaceContainer({ ...containerInput, ...changes });
assert.equal(chooseContainer().status, "ready", "unique verified workspace container is reusable");
assert.equal(chooseContainer().page_id, native.container.page_id);
assert.equal(chooseContainer({ storedContainerId: native.container.page_id, listingComplete: false }).status, "ready",
  "a retained exact ID needs its own verified read rather than a fresh unbound search");
assert.equal(chooseContainer({ pages: native.complete_absence }).status, "not-found");
assert.equal(chooseContainer({ pages: native.complete_absence }).create_allowed, true,
  "only complete authorized absence permits Main to consider an authorized create");
for (const pages of [native.continuing_empty, native.partial_empty, native.unknown_completeness]) {
  const result = chooseContainer({ pages });
  assert.equal(result.status, "incomplete");
  assert.equal(result.create_allowed, false, "caller assertion cannot override provider incompleteness");
}
assert.equal(chooseContainer({ pages: [], listingComplete: false }).status, "incomplete");
assert.equal(chooseContainer({ pages: native.unavailable_listing }).status, "unavailable");
assert.equal(chooseContainer({ pages: [native.container, { ...native.container, page_id: "page_duplicate" }] }).status, "ambiguous",
  "duplicate exact titles never choose a newest candidate");
assert.equal(chooseContainer({ pages: [{ ...native.container, title: null }] }).status, "incomplete");
assert.equal(chooseContainer({ storedContainerId: "page_missing", pages: native.complete_absence }).status, "unavailable");
for (const changed of [
  { title: "Workspace" },
  { parent: { page_id: "page_elsewhere" } },
  { drive_space_id: "space_other" },
]) {
  const result = chooseContainer({ storedContainerId: native.container.page_id, pages: [{ ...native.container, ...changed }] });
  assert.equal(result.status, "destination-conflict");
  assert.equal(result.create_allowed, false, "stale stored identity is never replaced");
}
for (const changed of [
  { deleted_at: "2026-10-17T12:00:00Z" },
  { access: { can_read: false, can_write: false } },
  { parent: { unavailable: true } },
]) {
  assert.equal(chooseContainer({ storedContainerId: native.container.page_id, pages: [{ ...native.container, ...changed }] }).status,
    "unavailable");
}
const copiedId = chooseContainer({ pages: [native.container, { ...native.container, title: "changed" }] });
assert.equal(copiedId.status, "destination-conflict", "contradictory records for one ID are not deduplicated into success");

const effortInput = { containerId: native.container.page_id, sourceAssociations: native.source_associations,
  candidates: [native.effort], listingComplete: true };
const chooseEffort = changes => selectSpaceEffort({ ...effortInput, ...changes });
assert.equal(chooseEffort().status, "ready", "portable owning sources match despite checkout and evidence-only changes");
assert.equal(chooseEffort().page_id, native.effort.page_id);
assert.equal(chooseEffort({ boundEffortId: native.effort.page_id, listingComplete: false }).status, "ready");
assert.equal(chooseEffort({ candidates: [native.effort, { ...native.effort, page_id: "page_second", updated_at: "2099-01-01" }] }).status,
  "ambiguous", "matching source binding cannot be settled by recency or title");
assert.equal(chooseEffort({ candidates: [], listingComplete: true }).status, "not-found");
assert.equal(chooseEffort({ candidates: [], listingComplete: false }).status, "incomplete");
assert.equal(chooseEffort({ boundEffortId: "page_missing", candidates: [] }).status, "unavailable");
for (const changed of [
  { parent: { page_id: "page_elsewhere" } },
  { drive_space_id: "space_elsewhere" },
  { source_associations: [{ kind: "repository", identity: "repository:other", role: "writable-owner", verified: true }] },
]) {
  const result = chooseEffort({ boundEffortId: native.effort.page_id, candidates: [{ ...native.effort, ...changed }] });
  assert.equal(result.status, "destination-conflict");
  assert.equal(result.create_allowed, false);
}
for (const changed of [
  { provenance_complete: false },
  { source_associations: undefined },
  { container_space_id: undefined },
]) {
  assert.equal(chooseEffort({ candidates: [{ ...native.effort, ...changed }] }).status, "incomplete");
}
assert.equal(chooseEffort({ candidates: [{ ...native.effort, access: { can_read: false } }] }).status, "unavailable");
const renamed = { ...native.effort, source_associations: [{ kind: "repository", identity: "repository:renamed", role: "writable-owner",
  verified: true, aliases: [{ identity: "repository:merchant", verified: true, evidence: "verified repository transfer" }] }] };
assert.equal(chooseEffort({ candidates: [renamed] }).status, "ready", "verified alias evidence permits changed source identity");
assert.equal(chooseEffort({ candidates: [{ ...renamed, source_associations: [{ ...renamed.source_associations[0], aliases: [] }] }] }).status,
  "not-found", "a new remote identity without alias evidence does not bind by path or title");
const projectless = [{ kind: "projectless", identity: "project:annual-review", role: "writable-owner", verified: true }];
assert.equal(chooseEffort({ sourceAssociations: projectless, candidates: [{ ...native.effort, source_associations: projectless }] }).status,
  "ready");

const create = classifySpaceWrite({ operation: "create", receipt: { structuredContent: writes.create_success } });
assert.equal(create.status, "applied");
assert.deepEqual(create.observed_page_ids, ["page_created"]);
const uncertainCreate = classifySpaceWrite({ operation: "create", receipt: writes.create_unknown, observedPageIds: ["page_earlier"] });
assert.equal(uncertainCreate.status, "unknown");
assert.equal(uncertainCreate.reconcile_required, true);
assert.deepEqual(uncertainCreate.observed_page_ids, ["page_earlier", "page_observed"]);
assert.equal(classifySpaceWrite({ operation: "create", receipt: {}, observedPageIds: ["page_earlier"] }).status,
  "unknown", "a previously observed ID does not prove a new create response succeeded");
const partial = classifySpaceWrite({ operation: { kind: "patch", operation_count: 3 }, receipt: writes.partial_patch });
assert.deepEqual(partial, { status: "partial", applied_indices: [0], ignored_indices: [1], rejected_indices: [2],
  reconcile_required: true, observed_page_ids: [] }, "every receipt determines what must be excluded from later writes");
const legacy = classifySpaceWrite({ operation: "patch", receipt: writes.legacy_applied });
assert.equal(legacy.status, "applied");
assert.deepEqual(legacy.applied_indices, [0], "omitted legacy operation status means applied");
assert.deepEqual(legacy.ignored_indices, []);
const deleted = classifySpaceWrite({ operation: "edit", receipt: { operation_results: [writes.partial_patch.operation_results[1]] } });
assert.equal(deleted.status, "ignored");
assert.deepEqual(deleted.ignored_indices, [1]);
assert.deepEqual(deleted.applied_indices, [], "a deleted-target no-op is never replayable applied work");
for (const [name, expected] of [["not_committed_conflict", "rejected"], ["unknown_conflict", "unknown"], ["unknown_error", "unknown"]]) {
  const result = classifySpaceWrite({ operation: "patch", receipt: writes[name] });
  assert.equal(result.status, expected, name);
  assert.equal(result.reconcile_required, true, `${name} requires current state before a rebuilt write`);
}
assert.equal(classifySpaceWrite({ operation: "edit", receipt: writes.schema_rejected }).status, "rejected");
for (const receipt of [null, {}, { operation_results: [{ operation_index: 0, status: "unfamiliar" }] },
  { operation_results: [{ operation_index: 0 }, { operation_index: 0 }] }]) {
  assert.equal(classifySpaceWrite({ operation: "edit", receipt }).status, "unknown", "missing or inconsistent receipts do not prove success");
}
assert.equal(classifySpaceWrite({ operation: { kind: "patch", operation_count: 2 }, receipt: writes.legacy_applied }).status,
  "unknown", "a missing expected operation receipt requires reconciliation");
assert.equal(classifySpaceWrite({ operation: "patch", receipt: { ...writes.legacy_applied, commit_status: "unknown" } }).status,
  "unknown", "unknown commit metadata wins over otherwise applied operation receipts");
for (const status of [undefined, "applied"]) {
  const result = classifySpaceWrite({ operation: "patch", receipt: { commit_status: "not_committed",
    operation_results: [{ operation_index: 0, ...(status === undefined ? {} : { status }) }] } });
  assert.equal(result.status, "unknown", "not_committed contradicts applied or omitted legacy status");
  assert.equal(result.reconcile_required, true);
}

const rejectedEdit = { error: { code: "validation_error", commit_status: "not_committed",
  details: { operation_results: [{ operation_index: 0, status: "rejected" }] } } };
const editOperation = { kind: "edit", operation_count: 1 };
const directRejected = classifySpaceWrite({ operation: editOperation, receipt: rejectedEdit });
assert.equal(directRejected.status, "rejected");
assert.equal(directRejected.reconcile_required, true);
assert.deepEqual(directRejected.rejected_indices, [0]);
assert.deepEqual(classifySpaceWrite({ operation: editOperation,
  receipt: { isError: true, structuredContent: rejectedEdit } }), directRejected,
  "an MCP error wrapper cannot erase a definitive structured not_committed result");

for (const [receipt, expectedStatus, expectedReconcile] of [
  [writes.schema_rejected, "rejected", false],
  [writes.not_committed_conflict, "rejected", true],
  [writes.unknown_conflict, "unknown", true],
  [writes.unknown_error, "unknown", true],
]) {
  const direct = classifySpaceWrite({ operation: editOperation, receipt });
  const wrapped = classifySpaceWrite({ operation: editOperation, receipt: { isError: true, structuredContent: receipt } });
  assert.equal(direct.status, expectedStatus);
  assert.equal(direct.reconcile_required, expectedReconcile);
  assert.deepEqual(wrapped, direct, "structured error commit metadata has the same meaning with or without the MCP wrapper");
}
for (const commitMetadata of [{}, { commit_status: "unknown" }]) {
  const receipt = { error: { code: "validation_error", details: rejectedEdit.error.details, ...commitMetadata } };
  for (const supplied of [receipt, { isError: true, structuredContent: receipt }]) {
    const result = classifySpaceWrite({ operation: editOperation, receipt: supplied });
    assert.equal(result.status, "unknown", "rejected operations cannot prove an error's absent or unknown commit state");
    assert.equal(result.reconcile_required, true);
    assert.deepEqual(result.rejected_indices, [0]);
  }
}
for (const operation_results of [
  [{ operation_index: 0, status: "rejected" }],
  [{ operation_index: 0, status: "applied", ignored_reason: "block_deleted" }],
]) {
  const receipt = { error: { code: "validation_error", commit_status: "committed", details: { operation_results } } };
  for (const supplied of [receipt, { isError: true, structuredContent: receipt }]) {
    const result = classifySpaceWrite({ operation: editOperation, receipt: supplied });
    assert.equal(result.status, "unknown", "a committed error contradicts receipts describing no applied changes");
    assert.equal(result.reconcile_required, true);
  }
}
const committedPartial = { error: { code: "partial_failure", commit_status: "committed",
  details: { operation_results: writes.partial_patch.operation_results } } };
for (const receipt of [committedPartial, { isError: true, structuredContent: committedPartial }]) {
  assert.deepEqual(classifySpaceWrite({ operation: { kind: "patch", operation_count: 3 }, receipt }), partial,
    "consistent committed partial receipts retain applied and ignored operations so they cannot be replayed");
}
for (const operation_results of [
  [{ operation_index: 0, status: "unfamiliar" }],
  [{ operation_index: 0, status: "rejected" }, { operation_index: 0, status: "rejected" }],
]) {
  const receipt = { error: { ...rejectedEdit.error, details: { operation_results } } };
  for (const supplied of [receipt, { isError: true, structuredContent: receipt }]) {
    assert.equal(classifySpaceWrite({ operation: editOperation, receipt: supplied }).status, "unknown",
      "definitive commit metadata does not make malformed operation receipts trustworthy");
  }
}
for (const [operation, receipt] of [["create", writes.create_success], ["patch", writes.legacy_applied],
  [{ kind: "patch", operation_count: 3 }, writes.partial_patch]]) {
  for (const commitMetadata of [{}, { commit_status: "unknown" }]) {
    const uncertain = classifySpaceWrite({ operation,
      receipt: { isError: true, structuredContent: { ...receipt, ...commitMetadata } } });
    assert.equal(uncertain.status, "unknown", "an error wrapper without definitive structured commit status remains uncertain");
    assert.equal(uncertain.reconcile_required, true);
  }
  assert.deepEqual(classifySpaceWrite({ operation,
    receipt: { isError: true, structuredContent: { ...receipt, commit_status: "committed" } } }),
    classifySpaceWrite({ operation, receipt }), "a definitive committed wrapper preserves the structured operation results");
}

const remoteReady = { status: "ready", space_id: native.space_id, container_page_id: native.container.page_id,
  accessible: true, readable: true, writable: true, readback_verified: true, observed_page_ids: [native.container.page_id] };
const configReady = { exit_code: 0, readback: { "workspace-mode": "gpt-space", "workspace-space-id": native.space_id,
  "workspace-container-page-id": native.container.page_id } };
const configured = classifySpaceSetup({ remoteResult: remoteReady, configResult: configReady });
assert.equal(configured.status, "ready");
assert.equal(configured.configured, true);
assert.equal(configured.accessible, true);
assert.equal(configured.readable, true);
assert.equal(configured.writable, true);
for (const configResult of [{ exit_code: 1, error: "disk full" }, { exit_code: null }, undefined]) {
  const result = classifySpaceSetup({ remoteResult: remoteReady, configResult });
  assert.equal(result.status, "partial");
  assert.equal(result.container_page_id, native.container.page_id);
  assert.deepEqual(result.observed_page_ids, [native.container.page_id]);
  assert.equal(result.action, "repair_configuration", "preserve created ID rather than create a replacement");
}
const unverifiedConfig = classifySpaceSetup({ remoteResult: remoteReady, configResult: { exit_code: 0 } });
assert.equal(unverifiedConfig.status, "partial");
assert.equal(unverifiedConfig.action, "verify_configuration", "command completion alone cannot verify stored destination IDs");
assert.equal(classifySpaceSetup({ remoteResult: remoteReady,
  configResult: { ...configReady, readback: { ...configReady.readback, "workspace-container-page-id": "page_other" } } }).action,
  "repair_configuration");
const noWriteAccess = classifySpaceSetup({ remoteResult: { ...remoteReady, writable: false }, configResult: configReady });
assert.equal(noWriteAccess.status, "partial");
assert.equal(noWriteAccess.writable, false);
const unknownRemote = classifySpaceSetup({ remoteResult: { ...remoteReady, status: "unknown", readback_verified: false }, configResult: configReady });
assert.equal(unknownRemote.action, "reconcile_remote");
assert.equal(unknownRemote.container_page_id, native.container.page_id);
const unavailable = classifySpaceSetup({ remoteResult: { ...remoteReady, status: "unavailable", writable: null }, configResult: configReady });
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.container_page_id, native.container.page_id);
assert.equal(JSON.stringify({ native, writes }), before, "metadata helpers do not mutate native evidence");

console.log("space context: PASS (native metadata, pagination, source binding, write receipts and partial setup)");
