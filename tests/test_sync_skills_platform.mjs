#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  await mkdir(join(resourceSource, ".."), { recursive: true });
  await writeFile(resourceSource, Buffer.from([0, 1, 2, 255]));
  await rm(projectedDirectory, { recursive: true, force: true });
  const { opencodeGenerated, codexGenerated } = await syncSkills({ rootDir: fixtureRoot });
  assert.ok(opencodeGenerated.includes("cross-repo"), "cross-repo must receive a generated OpenCode projection");
  assert.ok(opencodeGenerated.includes("full-audit") && codexGenerated.includes("full-audit"), "full-audit must be discovered on both runtimes");
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
