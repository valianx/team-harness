#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncSharedSetupAssets, syncSkills } from "../tools/codex-runtime/sync-skills.mjs";

const rootDir = await mkdtemp(join(tmpdir(), "th-sync-skills-platform-"));
const source = join(rootDir, "skills/setup/scripts/manage_github_identities.py");
const targets = [
  join(rootDir, "plugins/team-harness/skills/setup/scripts/manage_github_identities.py"),
  join(rootDir, "installer-assets/opencode-skills/setup/scripts/manage_github_identities.py"),
];
const content = "#!/usr/bin/env python3\nprint('fixture')\n";
const referenceSource = join(rootDir, "skills/setup/references/worker-models.md");
const referenceTargets = targets.map(target => join(dirname(dirname(target)), "references/worker-models.md"));
const referenceBytes = "Opaque reference resource fixture.\n";
const setupResources = [
  { name: "setup_status.py", content: "#!/usr/bin/env python3\nprint('status fixture')\n", mode: 0o755 },
  { name: "setup_requirements.json", content: '{"schema_version":1}\n', mode: 0o644 },
  { name: "worker-models.mjs", content: await readFile(new URL("../skills/setup/scripts/worker-models.mjs", import.meta.url), "utf8"), mode: 0o644 },
  { name: "worker-model-profiles.json", content: await readFile(new URL("../skills/setup/scripts/worker-model-profiles.json", import.meta.url), "utf8"), mode: 0o644 },
];

try {
  await mkdir(join(rootDir, "skills/setup/scripts"), { recursive: true });
  for (const target of targets) await mkdir(join(target, ".."), { recursive: true });
  for (const file of [referenceSource, ...referenceTargets]) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, referenceBytes, { mode: 0o644 });
  }
  await writeFile(source, content, { mode: 0o755 });
  await chmod(source, 0o755);
  for (const target of targets) {
    await writeFile(target, content, { mode: 0o755 });
    // Fixture modes must not inherit a developer's restrictive umask.
    await chmod(target, 0o755);
  }
  for (const asset of setupResources) {
    for (const directory of [dirname(source), ...targets.map(dirname)]) {
      const file = join(directory, asset.name);
      await writeFile(file, asset.content, { mode: asset.mode });
      await chmod(file, asset.mode);
    }
  }

  // Native Windows does not expose the Git executable bit through lstat().mode.
  // The synchronization check must still compare content while retaining the
  // executable-bit assertion on POSIX hosts.
  await syncSharedSetupAssets({ check: true, rootDir });

  if (process.platform !== "win32") {
    // Git tracks the owner execute bit, not an exact POSIX permission mask.
    // A normal checkout under umask 0002 creates 0775 executable files.
    for (const mode of [0o775, 0o755, 0o700]) {
      await chmod(source, mode);
      for (const target of targets) await chmod(target, mode);
      await syncSharedSetupAssets({ check: true, rootDir });
      await syncSharedSetupAssets({ check: false, rootDir });
      for (const path of [source, ...targets]) {
        assert.equal((await lstat(path)).mode & 0o777, mode, "valid checkout permissions must remain unchanged");
      }
    }

    for (const mode of [0o644, 0o655]) {
      await chmod(source, mode);
      for (const check of [true, false]) {
        await assert.rejects(
          syncSharedSetupAssets({ check, rootDir }),
          /source.*not executable/,
          "a canonical source without its Git executable bit must be rejected",
        );
      }
      assert.equal((await lstat(source)).mode & 0o777, mode, "source validation must not repair permissions");
    }
    await chmod(source, 0o755);
    for (const target of targets) await chmod(target, 0o755);
  }

  await writeFile(targets[0], "changed fixture\n");
  await assert.rejects(
    syncSharedSetupAssets({ check: true, rootDir }),
    /shared setup assets are stale/,
    "content drift must remain visible on every platform",
  );
  await writeFile(targets[0], content);

  if (process.platform !== "win32") {
    for (const mode of [0o644, 0o655]) {
      await chmod(targets[1], mode);
      await assert.rejects(
        syncSharedSetupAssets({ check: true, rootDir }),
        /shared setup assets are stale/,
        "POSIX executable-bit drift must remain visible",
      );
      assert.equal((await lstat(targets[1])).mode & 0o777, mode, "check mode must not repair permissions");
    }
  }

  assert.equal(await readFile(source, "utf8"), content);

  // Manual lifecycle overrides receive shared modules and data alongside the
  // optional diagnostic; checking drift must never repair these resources.
  await syncSharedSetupAssets({ check: false, rootDir });
  for (const asset of setupResources) {
    const target = join(dirname(targets[0]), asset.name);
    await writeFile(target, "stale diagnostic resource\n");
    await assert.rejects(syncSharedSetupAssets({ check: true, rootDir }), /shared setup assets are stale/);
    assert.equal(await readFile(target, "utf8"), "stale diagnostic resource\n");
    await syncSharedSetupAssets({ check: false, rootDir });
    for (const directory of targets.map(dirname)) {
      const projected = join(directory, asset.name);
      assert.equal(await readFile(projected, "utf8"), asset.content);
      if (process.platform !== "win32") {
        assert.equal((await lstat(projected)).mode & 0o100, asset.mode & 0o100);
      }
    }
  }

  for (const directory of targets.map(dirname)) {
    const contract = await import(pathToFileURL(join(directory, "worker-models.mjs")).href);
    assert.deepEqual(contract.resolveWorkerSelection(undefined, "architect"), {
      selection: { mode: "inherit" }, profile: "reasoning", source: "inherit",
    }, "installed shared consumers load their adjacent neutral category data");
  }

  await writeFile(referenceTargets[0], "stale reference fixture\n");
  await assert.rejects(syncSharedSetupAssets({ check: true, rootDir }), /shared setup assets are stale/);
  assert.equal(await readFile(referenceTargets[0], "utf8"), "stale reference fixture\n");
  await syncSharedSetupAssets({ check: false, rootDir });
  for (const file of referenceTargets) assert.equal(await readFile(file, "utf8"), referenceBytes);

  // Cross-repository analysis is a shared domain workflow. Its OpenCode
  // projection must follow source changes instead of retaining a manual fork.
  const fixtureRoot = join(rootDir, "projection");
  const repository = fileURLToPath(new URL("..", import.meta.url));
  for (const directory of ["skills", "plugins", "installer-assets", ".claude-plugin", "agents", "hooks", "docs", "runtime"]) {
    await cp(join(repository, directory), join(fixtureRoot, directory), {
      recursive: true,
      filter: path => !path.split(/[\\/]/).some(part => ["node_modules", "__pycache__", ".venv"].includes(part)),
    });
  }
  const projectedDirectory = join(fixtureRoot, "installer-assets/opencode-skills/cross-repo");
  const projectedCanonical = join(projectedDirectory, "canonical.md");
  const resourceSource = join(fixtureRoot, "skills/cross-repo/references/fixture.bin");
  const projectedResource = join(projectedDirectory, "references/fixture.bin");
  const piRoot = join(fixtureRoot, "installer-assets/pi-skills");
  const piSetupSource = join(fixtureRoot, "runtime/pi/skill-overrides/setup.md");
  const piOverrideBodies = new Map();
  for (const name of ["setup", "update", "reload"]) {
    const source = join(fixtureRoot, "runtime/pi/skill-overrides", `${name}.md`);
    piOverrideBodies.set(name, (await readFile(source, "utf8")).trimEnd() + "\n");
  }
  const importSource = join(fixtureRoot, "skills/cross-repo/scripts/import-fixture.mjs");
  await mkdir(dirname(importSource), { recursive: true });
  await writeFile(importSource, 'import { selectWorkspacePreference } from "../../workspace/scripts/workspace-preference.mjs";\nexport const selection = selectWorkspacePreference({ "workspace-mode": "gpt-space" });\n');
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
  const { opencodeGenerated, codexGenerated, piGenerated, names } = await syncSkills({ rootDir: fixtureRoot });
  assert.ok(Array.isArray(piGenerated), "Pi must have an explicit native projection result");
  assert.deepEqual(piGenerated, names, "every canonical skill receives a Pi projection, including lifecycle overrides");
  const piCrossRepoSkill = await readFile(join(piRoot, "cross-repo/SKILL.md"), "utf8");
  const piPlanSkill = await readFile(join(piRoot, "plan/SKILL.md"), "utf8");
  assert.match(piCrossRepoSkill, /^---\nname: th-cross-repo\n/);
  assert.match(piPlanSkill, /\ndisable-model-invocation: true\n/);
  for (const [name, body] of piOverrideBodies) {
    const projection = await readFile(join(piRoot, name, "SKILL.md"), "utf8");
    assert.ok(projection.endsWith(body), `Pi ${name} projection preserves its actual lifecycle source body`);
  }
  assert.equal(await readFile(join(piRoot, "full-audit/canonical.md"), "utf8"),
    (await readFile(routingSource, "utf8")).replace(/^---\n[\s\S]*?\n---\n?/, "").trimEnd() + "\n",
    "Pi preserves canonical relative links and directory names");
  const piFindBugsSkill = await readFile(join(piRoot, "find-bugs/SKILL.md"), "utf8");
  assert.match(piFindBugsSkill, /\nname: th-find-bugs\n/);
  assert.deepEqual(await readFile(join(piRoot, "cross-repo/references/fixture.bin")), await readFile(resourceSource));
  const imported = await import(pathToFileURL(join(piRoot, "cross-repo/scripts/import-fixture.mjs")).href);
  assert.equal(imported.selection.mode, "gpt-space", "cross-skill helper imports resolve under unchanged Pi directories");
  const packagedSettings = await import(pathToFileURL(join(fixtureRoot, "runtime/pi/settings.mjs")).href);
  assert.equal(typeof packagedSettings.readSettings, "function", "the lifecycle settings helper resolves its packaged dependencies");
  assert.ok((await lstat(join(piRoot, "setup/scripts/manage_github_identities.py"))).isFile(),
    "the lifecycle identity helper is present under the declared Pi skill path");
  for (const asset of setupResources) {
    assert.deepEqual(await readFile(join(piRoot, "setup/scripts", asset.name)),
      await readFile(join(fixtureRoot, "skills/setup/scripts", asset.name)),
      "Pi lifecycle projects the canonical diagnostic resources");
  }
  const piModels = await import(pathToFileURL(join(piRoot, "setup/scripts/worker-models.mjs")).href);
  assert.equal(piModels.resolveWorkerSelection(undefined, "cleaner").profile, "mechanical");
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
  assert.deepEqual(await readFile(join(piRoot, "cross-repo/references/fixture.bin")), await readFile(resourceSource),
    "canonical resource changes reach Pi");
  await writeFile(projectedCanonical, firstProjection);
  await assert.rejects(syncSkills({ check: true, rootDir: fixtureRoot }), /opencode skill projections are stale/);
  assert.deepEqual(await readFile(projectedCanonical), firstProjection, "check mode must not repair stale OpenCode bytes");
  await syncSkills({ rootDir: fixtureRoot });
  assert.deepEqual(await readFile(projectedCanonical), refreshedProjection, "generation must repair drift");
  await syncSkills({ check: true, rootDir: fixtureRoot });
  await syncSkills({ rootDir: fixtureRoot });
  assert.deepEqual(await readFile(projectedCanonical), refreshedProjection, "unchanged synchronization must be stable");
  assert.deepEqual(await readFile(manualAdapter), manualBytes, "native lifecycle overrides must remain untouched");

  const otherHostOutputs = new Map();
  for (const base of [join(fixtureRoot, "plugins/team-harness/skills"), join(fixtureRoot, "installer-assets/opencode-skills")]) {
    for (const name of await readdir(base, { recursive: true })) {
      const file = join(base, name);
      if ((await lstat(file)).isFile()) otherHostOutputs.set(file, await readFile(file));
    }
  }
  const firstPiSetup = await readFile(join(piRoot, "setup/SKILL.md"), "utf8");
  await writeFile(piSetupSource, "# Native Pi setup\n\nRevised Pi-only setup fixture.\n");
  await assert.rejects(syncSkills({ check: true, rootDir: fixtureRoot }), /pi skill projections are stale/);
  assert.equal(await readFile(join(piRoot, "setup/SKILL.md"), "utf8"), firstPiSetup, "check mode does not repair Pi overrides");
  await syncSkills({ rootDir: fixtureRoot });
  assert.ok((await readFile(join(piRoot, "setup/SKILL.md"), "utf8"))
    .endsWith((await readFile(piSetupSource, "utf8")).trimEnd() + "\n"),
    "Pi setup regeneration preserves the supplied override body");
  for (const [file, bytes] of otherHostOutputs) {
    assert.deepEqual(await readFile(file), bytes, "Pi-only source changes preserve every existing host projection");
  }
  await syncSkills({ check: true, rootDir: fixtureRoot });
  process.stdout.write("sync-skills platform checks: PASS\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
