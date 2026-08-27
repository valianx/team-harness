#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  authorizeSpecialistWorkspaceWrite,
  validateSpecialistWorkspaceWriteScope,
} from "../skills/pipeline/scripts/specialist-write-scope.mjs";

const root = await mkdtemp(join(tmpdir(), "th-specialist-write-scope-"));
const evidence = join(root, "evidence");
await mkdir(evidence);
const resultPath = join(evidence, "task-1.json");

const empty = validateSpecialistWorkspaceWriteScope({
  role: "implementer",
  workspace_artifact_root: root,
  workspace_write_coordinates: [],
});
assert.equal(empty.verdict, "pass");
assert.deepEqual(empty.coordinate, []);

const scope = {
  role: "implementer",
  workspace_artifact_root: root,
  workspace_write_coordinates: [{
    path: resultPath,
    operations: ["create", "replace"],
    purpose: "bounded-command-result",
  }],
};
assert.equal(validateSpecialistWorkspaceWriteScope(scope).verdict, "pass");
assert.equal(authorizeSpecialistWorkspaceWrite({
  ...scope,
  requested_path: resultPath,
  requested_operation: "create",
}).action, "authorize-write");

const implementationReport = join(root, "02-implementation.md");
const undeclared = authorizeSpecialistWorkspaceWrite({
  ...scope,
  requested_path: implementationReport,
  requested_operation: "replace",
});
assert.equal(undeclared.verdict, "fail");
assert.equal(undeclared.error_code, "WORKSPACE_WRITE_UNDECLARED");

const operationDenied = authorizeSpecialistWorkspaceWrite({
  ...scope,
  requested_path: resultPath,
  requested_operation: "append",
});
assert.equal(operationDenied.error_code, "WORKSPACE_WRITE_OPERATION_DENIED");

const duplicate = validateSpecialistWorkspaceWriteScope({
  ...scope,
  workspace_write_coordinates: [scope.workspace_write_coordinates[0], scope.workspace_write_coordinates[0]],
});
assert.equal(duplicate.error_code, "WORKSPACE_WRITE_COORDINATE_INVALID");

const external = await mkdtemp(join(tmpdir(), "th-specialist-write-external-"));
assert.equal(validateSpecialistWorkspaceWriteScope({
  ...scope,
  workspace_write_coordinates: [{
    path: join(external, "escape.json"),
    operations: ["create"],
    purpose: "assigned-evidence",
  }],
}).error_code, "WORKSPACE_WRITE_COORDINATE_INVALID");

const symlinked = join(root, "symlinked");
await symlink(external, symlinked);
assert.equal(validateSpecialistWorkspaceWriteScope({
  ...scope,
  workspace_write_coordinates: [{
    path: join(symlinked, "escape.json"),
    operations: ["create"],
    purpose: "assigned-evidence",
  }],
}).error_code, "WORKSPACE_WRITE_COORDINATE_INVALID");

await writeFile(resultPath, "{}\n", "utf8");
assert.equal(authorizeSpecialistWorkspaceWrite({
  ...scope,
  requested_path: resultPath,
  requested_operation: "replace",
}).verdict, "pass");

assert.equal(validateSpecialistWorkspaceWriteScope({ unexpected: true }).error_code, "ARGUMENT_INVALID");
assert.equal(resolve(root), root);

console.log("specialist workspace write scope: PASS");
