#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncClaudePackageAssets } from "../tools/codex-runtime/sync-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownership = JSON.parse(await readFile(path.join(root, "runtime/package-ownership.json"), "utf8"));
const marketplace = JSON.parse(await readFile(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));

async function walk(directory, base = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute, base));
    else if (entry.isFile()) result.push(path.relative(base, absolute).replaceAll("\\", "/"));
  }
  return result.sort();
}

assert.equal(ownership.schema_version, 1);
assert.deepEqual(Object.keys(ownership.packages).sort(), ["claude", "codex", "go-installer", "opencode"]);
assert.equal(marketplace.plugins.length, 1);
assert.deepEqual(marketplace.plugins[0].source, { source: "github", repo: "valianx/team-harness" });

for (const relative of [
  "plugins/team-harness/.claude-plugin/plugin.json",
  "plugins/team-harness/.claude-plugin/hooks.json",
  "plugins/team-harness/agents/ref-pipeline.md",
  "plugins/team-harness/skills/pipeline/SKILL.md",
  "skills/find-bugs/SKILL.md",
  "plugins/team-harness/skills/find-bugs/SKILL.md",
  "installer-assets/opencode-skills/find-bugs/SKILL.md",
  "plugins/team-harness/hooks/run-ts-hook.sh",
]) assert.ok((await readFile(path.join(root, relative))).length > 0, `missing curated Claude asset: ${relative}`);

const forbidden = [
  /^skills\/openspec-[^/]+\//,
  /(?:^|\/)openspec-[^/]+\//,
  /(?:^|\/)commands\/opsx\//,
  /^opsx\//,
  /(?:^|\/)commands\/opsx-[^/]+\.md$/,
  /^opsx-[^/]+\.md$/,
  /(?:^|\/)workflows\/opsx\//,
  /(?:^|\/)superpowers\//,
  /(?:^|\/)bmad-testarch-[^/]+(?:\/|\.md$)/,
  /(?:^|\/)verification-before-completion\//,
  /(?:^|\/)\.superpowers\//,
  /(?:^|\/)\_bmad\/tea\//,
  /^openspec\//,
  /^(?:\.agents|\.claude|\.opencode)\/skills\/find-bugs\//,
];
let inspectedPackageFiles = 0;
for (const packageRoot of new Set(Object.values(ownership.packages).flat())) {
  const absolute = path.join(root, packageRoot);
  let files;
  try { files = await walk(absolute); } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  inspectedPackageFiles += files.length;
  for (const relative of files) {
    assert.equal(forbidden.some(pattern => pattern.test(relative)), false, `external OpenSpec adapter crossed package boundary: ${packageRoot}/${relative}`);
  }
}
assert.ok(inspectedPackageFiles > 0, "distribution check must inspect shipped files");

// These are representative upstream-owned project paths.  Keep the fixture
// list here as a regression check for the ownership declaration: adding a
// provider skill or command to a TH package root must be rejected, while the
// provider's own project files remain outside the roots selected below.
const providerFixtures = [
  ".agents/skills/openspec-verify-change/SKILL.md",
  ".agents/skills/superpowers/verification-before-completion/SKILL.md",
  ".agents/skills/bmad-testarch-test-review/SKILL.md",
  ".agents/skills/find-bugs/SKILL.md",
  ".claude/commands/opsx/verify.md",
  ".claude/skills/superpowers/verification-before-completion/SKILL.md",
  ".claude/skills/bmad-testarch-test-review/SKILL.md",
  ".claude/skills/find-bugs/SKILL.md",
  ".opencode/commands/opsx-verify.md",
  ".opencode/commands/bmad-testarch-test-review.md",
  ".opencode/skills/find-bugs/SKILL.md",
  ".superpowers/sdd/example/plan.md",
  "_bmad/tea/config.yaml",
  "openspec/changes/example/proposal.md",
];

const declaredExternalPatterns = ownership.external_project_patterns;
assert.ok(declaredExternalPatterns.includes(".opencode/commands/opsx-*.md"),
  "flat OpenSpec OpenCode commands must remain externally owned");
for (const required of [
  ".agents/skills/bmad-testarch-*", ".claude/skills/bmad-testarch-*",
  ".opencode/commands/bmad-testarch-*.md", "_bmad/tea/**",
  ".agents/skills/find-bugs/**", ".claude/skills/find-bugs/**",
  ".opencode/skills/find-bugs/**",
]) assert.ok(declaredExternalPatterns.includes(required), `missing external ownership: ${required}`);

for (const fixture of [
  "openspec-verify-change/SKILL.md",
  "opsx/verify.md",
  "skills/superpowers/verification-before-completion/SKILL.md",
  "skills/bmad-testarch-test-review/SKILL.md",
  "skills/verification-before-completion/SKILL.md",
  ".agents/skills/find-bugs/SKILL.md",
  ".claude/skills/find-bugs/SKILL.md",
  ".opencode/skills/find-bugs/SKILL.md",
  "opsx-verify.md",
  "bmad-testarch-test-review.md",
]) {
  assert.equal(forbidden.some((pattern) => pattern.test(fixture)), true,
    `provider asset would be accepted inside a TH package root: ${fixture}`);
}
assert.equal(forbidden.some((pattern) => pattern.test("skills/find-bugs/SKILL.md")), false,
  "TH's canonical find-bugs skill must remain package-owned despite the upstream name collision");

// Synchronize a real TH asset beside external installations: the packaging
// writer must copy its owned asset while leaving provider files untouched.
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "th-package-boundary-"));
try {
  const contents = new Map(providerFixtures.map((fixture) => [fixture, `external fixture: ${fixture}\n`]));
  for (const [relative, content] of contents) {
    const absolute = path.join(fixtureRoot, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  const before = new Map();
  for (const relative of contents.keys()) before.set(relative, await readFile(path.join(fixtureRoot, relative), "utf8"));
  for (const directory of [".claude-plugin", "agents", "hooks", "docs"]) {
    await mkdir(path.join(fixtureRoot, directory), { recursive: true });
  }
  await mkdir(path.join(fixtureRoot, "skills/find-bugs"), { recursive: true });
  await writeFile(path.join(fixtureRoot, "skills/find-bugs/SKILL.md"), "TH-owned find-bugs fixture\n");
  await writeFile(path.join(fixtureRoot, "agents/fixture.md"), "TH owned fixture\n");
  await syncClaudePackageAssets({ rootDir: fixtureRoot, check: false });
  assert.equal(await readFile(path.join(fixtureRoot, "plugins/team-harness/agents/fixture.md"), "utf8"), "TH owned fixture\n");

  const shipped = new Set();
  for (const packageRoot of new Set(Object.values(ownership.packages).flat())) {
    const absolute = path.join(fixtureRoot, packageRoot);
    try {
      for (const relative of await walk(absolute)) {
        shipped.add(path.relative(fixtureRoot, path.join(absolute, relative)).replaceAll("\\", "/"));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  assert.ok(shipped.has("agents/fixture.md"), "the fixture must exercise a nonempty TH package");
  assert.ok(shipped.has("skills/find-bugs/SKILL.md"), "TH's own find-bugs skill must remain package-owned");
  for (const relative of providerFixtures) {
    assert.equal(shipped.has(relative), false, `provider file crossed the package roots: ${relative}`);
  }
  for (const [relative, expected] of before) {
    assert.equal(await readFile(path.join(fixtureRoot, relative), "utf8"), expected,
      `package enumeration mutated provider-owned file: ${relative}`);
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const embed = await readFile(path.join(root, "assets.go"), "utf8");
const embeddedRoots = embed.split(/\r?\n/)
  .filter(line => line.startsWith("//go:embed "))
  .flatMap(line => line.slice("//go:embed ".length).trim().split(/\s+/));
for (const required of ["all:agents", "skills", "hooks", "installer-assets", "all:.codex/agents"]) {
  assert.ok(embeddedRoots.includes(required), `missing Go package root: ${required}`);
}
for (const external of [".agents", ".claude", ".cursor", ".opencode", "openspec"]) {
  assert.equal(embeddedRoots.includes(`all:${external}`) || embeddedRoots.includes(external), false,
    `Go package must not embed ${external}`);
}

process.stdout.write("OpenSpec distribution boundary: PASS\n");
