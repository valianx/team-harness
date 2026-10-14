#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSharedSetupAssets, syncSkills } from "../tools/codex-runtime/sync-skills.mjs";

const rootDir = await mkdtemp(join(tmpdir(), "th-sync-skills-platform-"));
const source = join(rootDir, "skills/setup/scripts/manage_github_identities.py");
const targets = [
  join(rootDir, "plugins/team-harness/skills/setup/scripts/manage_github_identities.py"),
  join(rootDir, "installer-assets/opencode-skills/setup/scripts/manage_github_identities.py"),
];
const content = "#!/usr/bin/env python3\nprint('fixture')\n";

try {
  await mkdir(join(rootDir, "skills/setup/scripts"), { recursive: true });
  for (const target of targets) await mkdir(join(target, ".."), { recursive: true });
  await writeFile(source, content, { mode: 0o755 });
  for (const target of targets) {
    await writeFile(target, content, { mode: 0o755 });
    // Fixture modes must not inherit a developer's restrictive umask.
    await chmod(target, 0o755);
  }

  // Native Windows does not expose the Git executable bit through lstat().mode.
  // The synchronization check must still compare content while retaining the
  // executable-bit assertion on POSIX hosts.
  await syncSharedSetupAssets({ check: true, rootDir });

  await writeFile(targets[0], "changed fixture\n");
  await assert.rejects(
    syncSharedSetupAssets({ check: true, rootDir }),
    /shared setup assets are stale/,
    "content drift must remain visible on every platform",
  );
  await writeFile(targets[0], content);

  if (process.platform !== "win32") {
    await chmod(targets[1], 0o644);
    await assert.rejects(
      syncSharedSetupAssets({ check: true, rootDir }),
      /shared setup assets are stale/,
      "POSIX executable-bit drift must remain visible",
    );
  }

  assert.equal(await readFile(source, "utf8"), content);

  // Cross-repository analysis is a shared domain workflow. Its OpenCode
  // projection must follow source changes instead of retaining a manual fork.
  const fixtureRoot = join(rootDir, "projection");
  const repository = fileURLToPath(new URL("..", import.meta.url));
  for (const directory of ["skills", "plugins", "installer-assets", ".claude-plugin", "agents", "hooks", "docs"]) {
    await cp(join(repository, directory), join(fixtureRoot, directory), {
      recursive: true,
      filter: path => !path.split(/[\\/]/).some(part => ["node_modules", "__pycache__", ".venv"].includes(part)),
    });
  }
  const projectedDirectory = join(fixtureRoot, "installer-assets/opencode-skills/cross-repo");
  const projectedCanonical = join(projectedDirectory, "canonical.md");
  const resourceSource = join(fixtureRoot, "skills/cross-repo/references/fixture.bin");
  const projectedResource = join(projectedDirectory, "references/fixture.bin");
  const manualAdapter = join(fixtureRoot, "installer-assets/opencode-skills/background/SKILL.md");
  const manualBytes = await readFile(manualAdapter);
  const upstreamAdapter = join(fixtureRoot, "installer-assets/opencode-skills/find-bugs/SKILL.md");
  const upstreamBytes = "---\nname: find-bugs\ndescription: Synthetic upstream owner\n---\n";
  await mkdir(dirname(upstreamAdapter), { recursive: true });
  await writeFile(upstreamAdapter, upstreamBytes);
  const routingSource = join(fixtureRoot, "skills/full-audit/SKILL.md");
  const remoteTarget = "https://example.invalid/find-bugs/SKILL.md";
  await writeFile(routingSource, `${await readFile(routingSource, "utf8")}\n[local fixture](../find-bugs/SKILL.md)\n[remote fixture](${remoteTarget})\n`);
  const nestedSource = join(fixtureRoot, "skills/full-audit/references/route.md");
  await mkdir(dirname(nestedSource), { recursive: true });
  await writeFile(nestedSource, "[nested fixture](../../find-bugs/SKILL.md)\n");
  await mkdir(join(resourceSource, ".."), { recursive: true });
  await writeFile(resourceSource, Buffer.from([0, 1, 2, 255]));
  await rm(projectedDirectory, { recursive: true, force: true });
  const { opencodeGenerated, codexGenerated } = await syncSkills({ rootDir: fixtureRoot });
  assert.ok(opencodeGenerated.includes("cross-repo"), "cross-repo must receive a generated OpenCode projection");
  assert.ok(opencodeGenerated.includes("full-audit") && codexGenerated.includes("full-audit"), "full-audit must be discovered on both runtimes");
  const projectedRouting = join(fixtureRoot, "installer-assets/opencode-skills/full-audit/canonical.md");
  const routingBytes = await readFile(projectedRouting, "utf8");
  const localTarget = routingBytes.match(/\[local fixture\]\(([^)]+)\)/)?.[1];
  assert.equal(resolve(dirname(projectedRouting), localTarget), join(fixtureRoot, "installer-assets/opencode-skills/th-find-bugs/SKILL.md"), "functional diagnosis must resolve to the TH native owner");
  assert.equal(routingBytes.match(/\[remote fixture\]\(([^)]+)\)/)?.[1], remoteTarget);
  assert.equal(await readFile(upstreamAdapter, "utf8"), upstreamBytes, "upstream provider must coexist untouched");
  const nestedProjection = join(dirname(projectedRouting), "references/route.md");
  const nestedTarget = (await readFile(nestedProjection, "utf8")).match(/\[nested fixture\]\(([^)]+)\)/)?.[1];
  assert.equal(resolve(dirname(nestedProjection), nestedTarget), join(fixtureRoot, "installer-assets/opencode-skills/th-find-bugs/SKILL.md"));
  const codexRouting = await readFile(join(fixtureRoot, "plugins/team-harness/skills/full-audit/canonical.md"), "utf8");
  assert.equal(codexRouting.match(/\[local fixture\]\(([^)]+)\)/)?.[1], "../find-bugs/SKILL.md", "Codex retains its native owner name");
  assert.deepEqual(await readFile(projectedResource), await readFile(resourceSource));
  const firstProjection = await readFile(projectedCanonical);
  const canonicalSource = join(fixtureRoot, "skills/cross-repo/SKILL.md");
  await writeFile(canonicalSource, `${await readFile(canonicalSource, "utf8")}\nSynthetic revision for projection testing.\n`);
  await writeFile(resourceSource, Buffer.from([255, 2, 1, 0]));
  await syncSkills({ rootDir: fixtureRoot });
  const refreshedProjection = await readFile(projectedCanonical);
  assert.notDeepEqual(refreshedProjection, firstProjection, "source updates must reach OpenCode");
  assert.deepEqual(await readFile(projectedResource), await readFile(resourceSource), "source resources must reach OpenCode");
  await writeFile(projectedCanonical, firstProjection);
  await assert.rejects(syncSkills({ check: true, rootDir: fixtureRoot }), /opencode skill projections are stale/);
  assert.deepEqual(await readFile(projectedCanonical), firstProjection, "check mode must not repair stale OpenCode bytes");
  await syncSkills({ rootDir: fixtureRoot });
  assert.deepEqual(await readFile(projectedCanonical), refreshedProjection, "generation must repair drift");
  await syncSkills({ check: true, rootDir: fixtureRoot });
  await syncSkills({ rootDir: fixtureRoot });
  assert.deepEqual(await readFile(projectedCanonical), refreshedProjection, "unchanged synchronization must be stable");
  assert.deepEqual(await readFile(manualAdapter), manualBytes, "native lifecycle overrides must remain untouched");
  process.stdout.write("sync-skills platform checks: PASS\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
