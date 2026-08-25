#!/usr/bin/env node

import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const DATED_WORKSPACE = /^\d{4}-\d{2}-\d{2}_(.+)$/;

async function realDirectory(candidate) {
  try {
    const value = await lstat(candidate);
    return value.isDirectory() && !value.isSymbolicLink();
  } catch {
    return false;
  }
}

async function regularFile(candidate) {
  try {
    const value = await lstat(candidate);
    return value.isFile() && !value.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function resolveWorkspace({ basePath, feature } = {}) {
  if (typeof basePath !== "string" || !path.isAbsolute(basePath)
    || typeof feature !== "string" || feature.length === 0 || feature.length > 256
    || !SAFE_SEGMENT.test(feature) || feature === "." || feature === "..") {
    return { status: "invalid", reason_code: "ARGUMENT_INVALID", candidates: [] };
  }

  const base = path.resolve(basePath);
  if (!(await realDirectory(base))) {
    return { status: "not-found", reason_code: "BASE_NOT_FOUND", base, feature, candidates: [] };
  }

  const datedInput = DATED_WORKSPACE.test(feature);
  const names = [];
  if (await realDirectory(path.join(base, feature))) names.push(feature);

  if (!datedInput) {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      const match = DATED_WORKSPACE.exec(entry.name);
      if (!match || match[1] !== feature || names.includes(entry.name)) continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()
        && await realDirectory(path.join(base, entry.name))) names.push(entry.name);
    }
  }

  names.sort();
  if (names.length === 0) {
    return { status: "not-found", reason_code: "WORKSPACE_NOT_FOUND", base, feature, candidates: [] };
  }
  if (names.length > 1) {
    return { status: "ambiguous", reason_code: "WORKSPACE_AMBIGUOUS", base, feature, candidates: names };
  }

  const workspace = path.join(base, names[0]);
  const handoff = path.join(workspace, "00-session-handoff.md");
  const state = path.join(workspace, "00-state.md");
  if (!(await regularFile(handoff))) {
    return {
      status: "handoff-missing",
      reason_code: "HANDOFF_NOT_FOUND",
      base,
      feature,
      workspace,
      workspace_name: names[0],
      handoff,
      state,
      candidates: names,
    };
  }
  return {
    status: "resolved",
    reason_code: null,
    base,
    feature,
    workspace,
    workspace_name: names[0],
    handoff,
    state,
    state_available: await regularFile(state),
    candidates: names,
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--base", "--feature"].includes(flag)) return null;
    values[flag.slice(2)] = value;
  }
  return values.base && values.feature ? values : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArguments(process.argv.slice(2));
  const result = args ? await resolveWorkspace({ basePath: args.base, feature: args.feature })
    : { status: "invalid", reason_code: "ARGUMENT_INVALID", candidates: [] };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "resolved") process.exitCode = 2;
}
