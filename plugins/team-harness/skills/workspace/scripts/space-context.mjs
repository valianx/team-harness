import { isDeepStrictEqual } from "node:util";
import { isOpaqueId, isRecord, normalizeSourceAssociations, safeText, sameOwningSources } from "./context-values.mjs";

const unwrap = value => isRecord(value?.structuredContent) ? value.structuredContent : value;
const selection = (status, reason_code, page = null) => ({ status, page_id: page?.page_id ?? null,
  create_allowed: status === "not-found", reason_code, ...(page ? { page: structuredClone(page) } : {}) });

function suppliedPages(values, listingComplete) {
  const pages = [];
  const batches = [];
  let complete = listingComplete === true;
  let unavailable = false;
  let conflict = false;
  if (!Array.isArray(values)) return { pages, complete: false, unavailable, conflict };
  for (const value of values) {
    const record = unwrap(value);
    if (!isRecord(record)) { complete = false; continue; }
    if (record.error || value.isError === true) { unavailable = true; continue; }
    if (Array.isArray(record.items)) {
      batches.push(record);
      pages.push(...record.items);
      if (record.partial_results !== false || (record.incomplete_reasons != null
        && (!Array.isArray(record.incomplete_reasons) || record.incomplete_reasons.length > 0))) complete = false;
    } else {
      pages.push(record);
    }
  }
  const cursors = new Set();
  for (let index = 0; index < batches.length; index += 1) {
    const cursor = batches[index].next_cursor;
    if (index === batches.length - 1 ? cursor != null : !safeText(cursor)) complete = false;
    if (cursor != null && cursors.has(cursor)) complete = false;
    cursors.add(cursor);
  }
  const unique = new Map();
  for (const page of pages) {
    if (!isRecord(page) || !isOpaqueId(page.page_id)) { complete = false; continue; }
    if (unique.has(page.page_id) && !isDeepStrictEqual(unique.get(page.page_id), page)) conflict = true;
    unique.set(page.page_id, page);
  }
  return { pages: [...unique.values()], complete, unavailable, conflict };
}

function pageStatus(page, { parentId, spaceId, title } = {}) {
  if (!isRecord(page) || !isOpaqueId(page.page_id) || !safeText(page.title)
    || page.deleted_at === undefined) return "incomplete";
  if (page.deleted_at !== null || page.access?.can_read === false || page.parent?.unavailable === true) return "unavailable";
  if (page.access?.can_read !== true || !isOpaqueId(page.parent?.page_id)
    || !isOpaqueId(page.drive_space_id) || page.drive_scope === undefined) return "incomplete";
  if (page.drive_scope !== "space" || page.parent.page_id !== parentId || page.drive_space_id !== spaceId
    || (title !== undefined && page.title !== title)) return "destination-conflict";
  return "ready";
}

/** Select a verified native workspace container from supplied metadata. */
export function selectSpaceContainer({ spaceId, rootPageId, storedContainerId = null, pages, listingComplete = false } = {}) {
  if (!isOpaqueId(spaceId) || !isOpaqueId(rootPageId) || spaceId === rootPageId
    || (storedContainerId !== null && !isOpaqueId(storedContainerId))) return selection("destination-conflict", "destination_invalid");
  const supplied = suppliedPages(pages, listingComplete);
  if (supplied.unavailable) return selection("unavailable", "container_read_unavailable");
  if (supplied.conflict) return selection("destination-conflict", "container_metadata_conflict");
  if (storedContainerId !== null) {
    const page = supplied.pages.find(value => value.page_id === storedContainerId);
    if (!page) return selection(supplied.complete ? "unavailable" : "incomplete", "stored_container_not_verified");
    const status = pageStatus(page, { parentId: rootPageId, spaceId, title: "workspace" });
    return selection(status, status === "ready" ? null : "stored_container_not_verified", status === "ready" ? page : null);
  }
  if (!supplied.complete) return selection("incomplete", "container_listing_incomplete");
  if (supplied.pages.some(page => !safeText(page.title))) return selection("incomplete", "container_metadata_incomplete");
  const matches = supplied.pages.filter(page => page.title === "workspace");
  for (const page of matches) {
    const status = pageStatus(page, { parentId: rootPageId, spaceId, title: "workspace" });
    if (status !== "ready") return selection(status, "container_not_verified");
  }
  if (matches.length > 1) return selection("ambiguous", "container_ambiguous");
  return matches.length === 1 ? selection("ready", null, matches[0]) : selection("not-found", "container_absent");
}

function effortStatus(page, containerId) {
  if (!isOpaqueId(page.container_space_id) || page.provenance_complete !== true) return "incomplete";
  const status = pageStatus(page, { parentId: containerId, spaceId: page.container_space_id, title: page.bound_title });
  if (status !== "ready") return status;
  try { normalizeSourceAssociations(page.source_associations); }
  catch { return "incomplete"; }
  return "ready";
}

/** Select an effort by retained ID and verified portable source association. */
export function selectSpaceEffort({ containerId, boundEffortId = null, sourceAssociations, candidates, listingComplete = false } = {}) {
  if (!isOpaqueId(containerId) || (boundEffortId !== null && !isOpaqueId(boundEffortId))) return selection("destination-conflict", "effort_destination_invalid");
  try { normalizeSourceAssociations(sourceAssociations); }
  catch { return selection("incomplete", "source_association_unverified"); }
  const supplied = suppliedPages(candidates, listingComplete);
  if (supplied.unavailable) return selection("unavailable", "effort_read_unavailable");
  if (supplied.conflict) return selection("destination-conflict", "effort_metadata_conflict");
  if (boundEffortId !== null) {
    const page = supplied.pages.find(value => value.page_id === boundEffortId);
    if (!page) return selection(supplied.complete ? "unavailable" : "incomplete", "bound_effort_not_verified");
    const status = effortStatus(page, containerId);
    if (status !== "ready") return selection(status, "bound_effort_not_verified");
    if (!sameOwningSources(sourceAssociations, page.source_associations)) return selection("destination-conflict", "bound_effort_source_conflict");
    return selection("ready", null, page);
  }
  if (!supplied.complete) return selection("incomplete", "effort_listing_incomplete");
  const matches = [];
  for (const page of supplied.pages) {
    const status = effortStatus(page, containerId);
    if (status !== "ready") return selection(status, "effort_candidate_not_verified");
    if (sameOwningSources(sourceAssociations, page.source_associations)) matches.push(page);
  }
  if (matches.length > 1) return selection("ambiguous", "effort_ambiguous");
  return matches.length === 1 ? selection("ready", null, matches[0]) : selection("not-found", "effort_absent");
}

function observedIds(values, ...records) {
  const result = new Set(Array.isArray(values) ? values.filter(isOpaqueId) : []);
  for (const record of records) {
    for (const id of [record?.page_id, record?.metadata?.page_id, record?.content?.page_id]) if (isOpaqueId(id)) result.add(id);
  }
  return [...result];
}

/** Classify native write receipts without replaying or performing writes. */
export function classifySpaceWrite({ operation, receipt, observedPageIds = [] } = {}) {
  const kind = typeof operation === "string" ? operation : operation?.kind;
  const expectedCount = operation?.operation_count;
  const value = unwrap(receipt);
  const error = value?.error;
  const commitStatus = error?.commit_status ?? value?.commit_status;
  const result = { status: "unknown", applied_indices: [], ignored_indices: [], rejected_indices: [], reconcile_required: true,
    observed_page_ids: observedIds(observedPageIds, value, error?.details) };
  if (!["create", "patch", "edit"].includes(kind) || !isRecord(value)) return result;
  const commitUnknown = commitStatus === "unknown" || (commitStatus != null && !["not_committed", "committed"].includes(commitStatus));
  if (kind === "create") {
    if (!error && receipt?.isError !== true && !commitUnknown && commitStatus !== "not_committed"
      && observedIds([], value).length > 0) {
      result.status = "applied";
      result.applied_indices = [0];
      result.reconcile_required = false;
    } else if (error && commitStatus === "not_committed") {
      result.status = "rejected";
      result.rejected_indices = [0];
      result.reconcile_required = result.observed_page_ids.length > 0;
    }
    return result;
  }
  const operations = value.operation_results ?? error?.details?.operation_results;
  if (!Array.isArray(operations) || operations.length === 0) {
    if (error && commitStatus === "not_committed") {
      result.status = "rejected";
      result.reconcile_required = error.code === "edit_conflict";
    }
    return result;
  }
  let unknown = commitUnknown || receipt?.isError === true || (Boolean(error) && commitStatus !== "not_committed" && commitStatus !== "committed");
  const seen = new Set();
  for (const entry of operations) {
    const index = entry?.operation_index;
    if (!Number.isSafeInteger(index) || index < 0 || seen.has(index)) { unknown = true; continue; }
    seen.add(index);
    if (entry.ignored_reason === "block_deleted") result.ignored_indices.push(index);
    else if (entry.ignored_reason != null) unknown = true;
    else if (entry.status === "rejected") result.rejected_indices.push(index);
    else if (entry.status === undefined || entry.status === "applied") result.applied_indices.push(index);
    else unknown = true;
  }
  if (expectedCount !== undefined && (!Number.isSafeInteger(expectedCount) || expectedCount < 1
    || seen.size !== expectedCount || [...seen].some(index => index >= expectedCount))) unknown = true;
  if (commitStatus === "not_committed" && result.applied_indices.length > 0) unknown = true;
  for (const key of ["applied_indices", "ignored_indices", "rejected_indices"]) result[key].sort((a, b) => a - b);
  if (unknown) return result;
  result.status = result.rejected_indices.length > 0 ? (result.applied_indices.length > 0 || result.ignored_indices.length > 0 ? "partial" : "rejected")
    : result.applied_indices.length > 0 ? "applied" : "ignored";
  result.reconcile_required = result.rejected_indices.length > 0;
  return result;
}

/** Combine observed remote readiness with actual configuration persistence. */
export function classifySpaceSetup({ remoteResult, configResult } = {}) {
  const remote = isRecord(remoteResult) ? remoteResult : {};
  const spaceId = isOpaqueId(remote.space_id) ? remote.space_id : null;
  const containerId = isOpaqueId(remote.container_page_id) ? remote.container_page_id : null;
  const configuration = configResult?.readback;
  const configured = configResult?.exit_code === 0 && isRecord(configuration) && spaceId !== null && containerId !== null
    && configuration["workspace-mode"] === "gpt-space" && configuration["workspace-space-id"] === spaceId
    && configuration["workspace-container-page-id"] === containerId && !Object.hasOwn(configuration, "logs-mode");
  const result = { status: "pending", configured, accessible: typeof remote.accessible === "boolean" ? remote.accessible : null,
    readable: typeof remote.readable === "boolean" ? remote.readable : null, writable: typeof remote.writable === "boolean" ? remote.writable : null,
    space_id: spaceId, container_page_id: containerId,
    observed_page_ids: observedIds(remote.observed_page_ids, { page_id: containerId }, { page_id: remote.effort_page_id }), action: "verify_remote" };
  if (remote.status === "unavailable") return { ...result, status: "unavailable", action: "restore_capability" };
  if (remote.status === "unknown" || remote.reconcile_required === true) {
    return { ...result, status: result.observed_page_ids.length > 0 ? "partial" : "pending", action: "reconcile_remote" };
  }
  if (spaceId === null || containerId === null) return result;
  result.status = "partial";
  if (remote.status !== "ready" || remote.readback_verified !== true) return result;
  if (result.accessible !== true || result.readable !== true || result.writable !== true) return { ...result, action: "restore_access" };
  if (configResult?.exit_code !== 0) return { ...result, action: "repair_configuration" };
  if (!isRecord(configuration)) return { ...result, action: "verify_configuration" };
  return configured ? { ...result, status: "ready", action: "none" } : { ...result, action: "repair_configuration" };
}
