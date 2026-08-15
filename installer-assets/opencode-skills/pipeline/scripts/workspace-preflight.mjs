#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { lstat, mkdtemp, open, realpath, rmdir, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const SCHEMA_VERSION = 1;
const PROBE_PREFIX = ".team-harness-write-probe-";

function emit(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, ...result })}\n`);
  process.exitCode = exitCode;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== "--root" && name !== "--workspace") {
      throw new Error(`unknown argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || values.has(name)) {
      throw new Error(`missing or duplicate value for ${name}`);
    }
    values.set(name, value);
    index += 1;
  }
  if (!values.has("--root") || !values.has("--workspace")) {
    throw new Error("required arguments: --root ABSOLUTE_PATH --workspace ABSOLUTE_PATH");
  }
  return { root: values.get("--root"), workspace: values.get("--workspace") };
}

function isContained(root, candidate) {
  const child = relative(root, candidate);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function validateRoot(input) {
  if (!isAbsolute(input)) throw new Error("root must be absolute");
  const requested = resolve(input);
  if (requested === resolve(requested, sep)) throw new Error("root must not be a filesystem root");
  const stat = await lstat(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("root must be an existing non-symlink directory");
  }
  const canonical = await realpath(requested);
  if (canonical !== requested) throw new Error("root must be supplied in canonical form");
  return canonical;
}

async function validateWorkspace(root, input) {
  if (!isAbsolute(input)) throw new Error("workspace must be absolute");
  const requested = resolve(input);
  if (!isContained(root, requested)) throw new Error("workspace must remain strictly below root");
  try {
    const stat = await lstat(requested);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("existing workspace must be a non-symlink directory");
    }
    const canonical = await realpath(requested);
    if (!isContained(root, canonical) || canonical !== requested) {
      throw new Error("existing workspace escapes or aliases its canonical root");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return requested;
}

async function probeWrite(root) {
  let directory;
  let file;
  let handle;
  try {
    directory = await mkdtemp(join(root, PROBE_PREFIX));
    file = join(directory, "probe");
    handle = await open(
      file,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile("team-harness-workspace-preflight\n", "utf8");
  } finally {
    if (handle) await handle.close();
    if (file) {
      try { await unlink(file); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
    if (directory) {
      try { await rmdir(directory); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const root = await validateRoot(args.root);
    const workspace = await validateWorkspace(root, args.workspace);
    try {
      await probeWrite(root);
    } catch (error) {
      if (["EACCES", "EPERM", "EROFS"].includes(error?.code)) {
        emit({
          status: "not-writable",
          reason_code: error.code,
          root,
          workspace,
          state_created: false,
        }, 2);
        return;
      }
      throw error;
    }
    emit({ status: "ready", reason_code: null, root, workspace, state_created: false });
  } catch (error) {
    emit({
      status: "invalid",
      reason_code: error?.code ?? "INVALID_INPUT",
      message: String(error?.message ?? error),
      state_created: false,
    }, 2);
  }
}

await main();
