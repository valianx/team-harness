#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, render } from "../tools/pi-runtime/generate.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const rootDir = await realpath(await mkdtemp(path.join(tmpdir(), "th-pi-generation-")));
const expectedWorkers = [
  "adversary", "agent-builder", "architect", "cleaner", "code-researcher", "d2-diagrammer",
  "delivery", "diagrammer", "documenter", "gcp-cost-analyzer", "gcp-infra", "implementer",
  "init-project", "inline-reviewer", "likec4-diagrammer", "mentor", "plan-reviewer",
  "pr-review-qa", "pr-review-security", "pr-review-verifier", "qa", "research-consolidator",
  "researcher", "reviewer", "reviewer-consolidator", "security", "tester", "translator", "ux-reviewer",
].sort();
const expectedReaders = [
  "code-researcher", "inline-reviewer", "plan-reviewer", "pr-review-qa", "pr-review-security",
  "pr-review-verifier", "research-consolidator", "researcher", "reviewer", "reviewer-consolidator",
].sort();

try {
  await cp(path.join(repository, "agents"), path.join(rootDir, "agents"), { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ version: "3.49.0" }));
  const { catalog, files } = await render({ rootDir });
  const catalogPath = path.join(rootDir, "runtime/pi/agents.json");
  assert.deepEqual(Object.keys(catalog), ["schema_version", "runtime", "version", "agents"]);
  assert.equal(catalog.schema_version, 1);
  assert.equal(catalog.runtime, "pi");
  assert.equal(catalog.version, "3.49.0");
  assert.deepEqual(catalog.agents.map(agent => agent.name), expectedWorkers,
    "all eligible canonical specialists are exposed, without coordinator or references");
  assert.deepEqual(catalog.agents.filter(agent => agent.read_only).map(agent => agent.name), expectedReaders);
  for (const agent of catalog.agents) {
    assert.deepEqual(Object.keys(agent), ["name", "description", "source", "prompt", "model", "effort", "tools", "read_only"]);
    assert.equal(agent.source, `agents/${agent.name}.md`);
    assert.equal(agent.prompt, `installer-assets/pi-agents/${agent.name}.md`);
    assert.ok(files.has(path.join(rootDir, agent.prompt)), "every catalog prompt is generated");
  }
  for (const name of expectedReaders) {
    assert.deepEqual(catalog.agents.find(agent => agent.name === name).tools, ["read", "grep", "find", "ls"],
      `${name} excludes shell and mutation capabilities`);
  }
  const implementer = catalog.agents.find(agent => agent.name === "implementer");
  assert.deepEqual(implementer.tools, ["read", "grep", "find", "ls", "bash", "edit", "write"]);
  assert.equal(implementer.model, "sonnet", "canonical model aliases are metadata, not invented Pi identifiers");
  assert.equal(implementer.effort, "high");
  const researcher = catalog.agents.find(agent => agent.name === "researcher");
  const researcherPrompt = files.get(path.join(rootDir, researcher.prompt));
  assert.match(researcherPrompt, /WebFetch, WebSearch/);
  assert.equal(files.size, expectedWorkers.length + 1, "references stay inert instead of acquiring worker prompts");
  assert.equal(await readFile(path.join(rootDir, "agents/ref-pipeline.md"), "utf8"),
    await readFile(path.join(repository, "agents/ref-pipeline.md"), "utf8"));
  await assert.rejects(readFile(catalogPath), { code: "ENOENT" }, "rendering is read-only");
  await assert.rejects(generate({ rootDir, check: true }), /generated Pi artifacts are stale/);
  await assert.rejects(readFile(catalogPath), { code: "ENOENT" }, "check mode does not create absent outputs");

  await generate({ rootDir });
  await generate({ rootDir, check: true });
  const before = new Map(await Promise.all([...files.keys()].map(async file => [file, await readFile(file, "utf8")])));
  await generate({ rootDir });
  for (const [file, content] of before) assert.equal(await readFile(file, "utf8"), content, "generation is deterministic");

  const canonicalPath = path.join(rootDir, "agents/code-researcher.md");
  const canonical = await readFile(canonicalPath, "utf8");
  const promptPath = path.join(rootDir, "installer-assets/pi-agents/code-researcher.md");
  const originalPrompt = await readFile(promptPath, "utf8");
  await writeFile(canonicalPath, `${canonical}\nFixture role evidence stays canonical.\n`);
  await assert.rejects(generate({ rootDir, check: true }), /generated Pi artifacts are stale/);
  assert.equal(await readFile(promptPath, "utf8"), originalPrompt, "freshness checking cannot repair prompt drift");
  await generate({ rootDir });
  assert.ok((await readFile(promptPath, "utf8")).endsWith("Fixture role evidence stays canonical.\n"));
  await writeFile(canonicalPath, canonical);

  await writeFile(canonicalPath, canonical.replace(/^tools:.*$/m, "tools: Read, Task"));
  await assert.rejects(render({ rootDir }), /unsupported canonical tool Task/,
    "new capabilities require an explicit projection rather than accidental worker delegation");
  await writeFile(canonicalPath, canonical.replace(/^name:.*$/m, "name: reference-alias"));
  await assert.rejects(render({ rootDir }), /source name does not match/);
  await writeFile(canonicalPath, canonical);

  const fixtureSource = path.join(rootDir, "agents/source-fixture.md");
  await writeFile(fixtureSource, [
    "---", "name: source-fixture", 'description: "Quoted: source metadata"',
    "model: canonical-future-alias", "effort: high", "tools: Read, Write", "---", "", "Fixture role body.", "",
  ].join("\n"));
  const withFixture = (await render({ rootDir })).catalog.agents.find(agent => agent.name === "source-fixture");
  assert.equal(withFixture.description, "Quoted: source metadata");
  assert.equal(withFixture.model, "canonical-future-alias");
  assert.deepEqual(withFixture.tools, ["read", "write"]);
  assert.equal(withFixture.read_only, false);
  await rm(fixtureSource);

  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ version: "3.49.1" }));
  assert.equal((await render({ rootDir })).catalog.version, "3.49.1", "catalog release metadata has one package owner");
  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ version: "3.49.0" }));
  await generate({ rootDir });
  const retired = path.join(rootDir, "installer-assets/pi-agents/retired.md");
  await writeFile(retired, await readFile(promptPath));
  await assert.rejects(generate({ rootDir, check: true }), /generated Pi artifacts are stale/);
  assert.ok((await readFile(retired)).length > 0, "check mode preserves stale generated files");
  await generate({ rootDir });
  await assert.rejects(readFile(retired), { code: "ENOENT" }, "only obsolete generated prompts are removed");

  const unmanaged = path.join(rootDir, "installer-assets/pi-agents/operator-note.md");
  await writeFile(unmanaged, "Owned by the operator.\n");
  await assert.rejects(generate({ rootDir }), /unmanaged Pi prompt/);
  assert.equal(await readFile(unmanaged, "utf8"), "Owned by the operator.\n");
  await rm(unmanaged);
  await generate({ rootDir, check: true });
  process.stdout.write("Pi generation: PASS (eligible roles, native tools, metadata, inert references and deterministic freshness)\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
