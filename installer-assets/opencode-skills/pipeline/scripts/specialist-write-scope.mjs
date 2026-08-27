#!/usr/bin/env node

import {
  lstatSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const SPECIALIST_WRITE_SCOPE_SCHEMA_VERSION = 1;

const ROLES = new Set(["implementer", "tester", "cleaner", "qa", "security", "delivery"]);
const OPERATIONS = new Set(["create", "replace", "append"]);
const PURPOSES = new Set(["bounded-command-result", "assigned-evidence", "assigned-report"]);
const SCOPE_KEYS = new Set(["role", "workspace_artifact_root", "workspace_write_coordinates"]);
const AUTHORIZE_KEYS = new Set([...SCOPE_KEYS, "requested_path", "requested_operation"]);
const COORDINATE_KEYS = new Set(["path", "operations", "purpose"]);

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.size && Object.keys(value).every(key => keys.has(key));
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function result({ verdict, errorCode = null, action, role = null, requestedPath = null, coordinate = null, observation }) {
  return {
    schema_version: SPECIALIST_WRITE_SCOPE_SCHEMA_VERSION,
    kind: "team_harness_specialist_workspace_write",
    verdict,
    error_code: errorCode,
    action,
    role,
    requested_path: requestedPath,
    coordinate,
    observation,
  };
}

function invalid(errorCode, observation, role = null, requestedPath = null) {
  return result({ verdict: "fail", errorCode, action: "block", role, requestedPath, observation });
}

function canonicalDirectory(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) return null;
    return path;
  } catch {
    return null;
  }
}

function canonicalLeaf(root, path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || !contained(root, path)) return null;
  const parent = dirname(path);
  if (canonicalDirectory(parent) === null || !contained(root, parent) && parent !== root) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) return null;
    return { path, exists: true };
  } catch (error) {
    if (error?.code !== "ENOENT") return null;
    return { path, exists: false };
  }
}

export function validateSpecialistWorkspaceWriteScope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !exactKeys(input, SCOPE_KEYS)) {
    return invalid("ARGUMENT_INVALID", "The specialist workspace-write scope input is invalid.");
  }
  const { role, workspace_artifact_root: workspaceRootValue, workspace_write_coordinates: coordinates } = input;
  const workspaceRoot = canonicalDirectory(workspaceRootValue);
  if (!ROLES.has(role) || workspaceRoot === null || !Array.isArray(coordinates) || coordinates.length > 64) {
    return invalid("ARGUMENT_INVALID", "The specialist workspace-write scope identity is invalid.", ROLES.has(role) ? role : null);
  }

  const normalized = [];
  const paths = new Set();
  for (const coordinate of coordinates) {
    if (!coordinate || typeof coordinate !== "object" || Array.isArray(coordinate)
      || !exactKeys(coordinate, COORDINATE_KEYS)
      || canonicalLeaf(workspaceRoot, coordinate.path) === null
      || !Array.isArray(coordinate.operations) || coordinate.operations.length === 0
      || coordinate.operations.some(operation => !OPERATIONS.has(operation))
      || new Set(coordinate.operations).size !== coordinate.operations.length
      || !PURPOSES.has(coordinate.purpose) || paths.has(coordinate.path)) {
      return invalid("WORKSPACE_WRITE_COORDINATE_INVALID", "A workspace-write coordinate is invalid, escaped, duplicated, or unsafe.", role);
    }
    paths.add(coordinate.path);
    normalized.push({
      path: coordinate.path,
      operations: [...coordinate.operations].sort(),
      purpose: coordinate.purpose,
    });
  }

  return result({
    verdict: "pass",
    action: "accept-scope",
    role,
    coordinate: normalized,
    observation: "The exact workspace-write coordinate set is valid; every other workspace path remains read-only.",
  });
}

export function authorizeSpecialistWorkspaceWrite(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !exactKeys(input, AUTHORIZE_KEYS)) {
    return invalid("ARGUMENT_INVALID", "The specialist workspace-write authorization input is invalid.");
  }
  const scope = validateSpecialistWorkspaceWriteScope({
    role: input.role,
    workspace_artifact_root: input.workspace_artifact_root,
    workspace_write_coordinates: input.workspace_write_coordinates,
  });
  if (scope.verdict !== "pass") return scope;
  if (typeof input.requested_path !== "string" || !isAbsolute(input.requested_path)
    || resolve(input.requested_path) !== input.requested_path || !OPERATIONS.has(input.requested_operation)) {
    return invalid("ARGUMENT_INVALID", "The requested workspace write is invalid.", input.role);
  }
  const coordinate = scope.coordinate.find(entry => entry.path === input.requested_path);
  if (!coordinate) {
    return invalid(
      "WORKSPACE_WRITE_UNDECLARED",
      "The requested workspace path is not an assigned write coordinate; return the result to Main instead of writing it.",
      input.role,
      input.requested_path,
    );
  }
  if (!coordinate.operations.includes(input.requested_operation)) {
    return invalid(
      "WORKSPACE_WRITE_OPERATION_DENIED",
      "The requested write operation is not allowed by its exact coordinate.",
      input.role,
      input.requested_path,
    );
  }
  const target = canonicalLeaf(input.workspace_artifact_root, input.requested_path);
  if (target === null) {
    return invalid(
      "WORKSPACE_WRITE_COORDINATE_INVALID",
      "The requested workspace target changed identity or became unsafe after scope validation.",
      input.role,
      input.requested_path,
    );
  }
  if (input.requested_operation === "create" && target.exists) {
    return invalid(
      "WORKSPACE_WRITE_TARGET_EXISTS",
      "Create cannot overwrite an existing workspace artifact.",
      input.role,
      input.requested_path,
    );
  }
  if ((input.requested_operation === "replace" || input.requested_operation === "append") && !target.exists) {
    return invalid(
      "WORKSPACE_WRITE_TARGET_MISSING",
      "Replace or append requires an existing workspace artifact.",
      input.role,
      input.requested_path,
    );
  }
  return result({
    verdict: "pass",
    action: "authorize-write",
    role: input.role,
    requestedPath: input.requested_path,
    coordinate,
    observation: input.requested_operation === "create"
      ? "The exact assigned create is authorized for a missing target; the caller must use exclusive creation and fail on EEXIST."
      : "The exact assigned existing workspace artifact and operation are authorized; no sibling report or coordination artifact is writable.",
  });
}

function parseJson(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 64 * 1024) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, raw, ...rest] = process.argv.slice(2);
  const input = rest.length === 0 ? parseJson(raw) : null;
  const output = operation === "validate"
    ? validateSpecialistWorkspaceWriteScope(input)
    : operation === "authorize"
      ? authorizeSpecialistWorkspaceWrite(input)
      : invalid("ARGUMENT_INVALID", "Use validate or authorize with one bounded JSON object.");
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (output.verdict !== "pass") process.exitCode = 1;
}
