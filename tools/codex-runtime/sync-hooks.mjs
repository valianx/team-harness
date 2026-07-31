#!/usr/bin/env node

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const names = [
  "policy-block",
  "dev-guard",
  "gcp-guard",
  "prepublish-guard",
  "gate-guard",
  "worktree-guard"
];

export async function sync({ check = false } = {}) {
  let stale = false;
  for (const name of names) {
    const source = join(root, "hooks/ts/dist", `${name}.cjs`);
    const target = join(root, "plugins/team-harness/hooks/dist", `${name}.cjs`);
    const sourceBytes = await readFile(source);
    let targetBytes = null;
    try { targetBytes = await readFile(target); } catch {}
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  sync({ check: process.argv.includes("--check") }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
