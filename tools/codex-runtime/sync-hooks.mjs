#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const names = [
  "codex-launcher",
  "policy-block",
  "gcp-guard",
  "gate-guard"
];

export async function sync({ check = false, rootDir = root } = {}) {
  rootDir = resolve(rootDir);
  let stale = false;
  for (const name of names) {
    const source = join(rootDir, "hooks/ts/dist", `${name}.cjs`);
    const target = join(rootDir, "plugins/team-harness/hooks/dist", `${name}.cjs`);
    const sourceBytes = await readFile(source);
    let targetBytes = null;
    try {
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink()) {
        throw new Error(`refusing to sync symbolic link target: ${target}`);
      }
      if (!targetStat.isFile()) {
        throw new Error(`refusing to sync non-regular target: ${target}`);
      }
      targetBytes = await readFile(target);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!targetBytes || !sourceBytes.equals(targetBytes)) {
      stale = true;
      if (!check) {
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target);
      } else {
        process.stderr.write(`stale: plugins/team-harness/hooks/dist/${name}.cjs\n`);
      }
    }
  }
  if (check && stale) throw new Error("Codex hook bundles are stale");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  sync({ check: process.argv.includes("--check") }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
