import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generate, render } from "./generate.mjs";

const root = new URL("../..", import.meta.url).pathname;

async function makeFixture() {
  const fixture = await mkdtemp(join(tmpdir(), "codex-runtime-"));
  await mkdir(join(fixture, "runtime/schema"), { recursive: true });
  await mkdir(join(fixture, "runtime/codex"), { recursive: true });
  await mkdir(join(fixture, "agents"), { recursive: true });
  await cp(join(root, "runtime/schema/codex-agents.json"), join(fixture, "runtime/schema/codex-agents.json"));
  await cp(join(root, "runtime/codex/instructions"), join(fixture, "runtime/codex/instructions"), { recursive: true });
  const semanticAgents = (await readdir(join(root, "agents"), { withFileTypes: true }))
    .filter(entry => entry.isFile()
      && entry.name.endsWith(".md")
      && entry.name !== "README.md"
      && !entry.name.startsWith("ref-"));
  for (const entry of semanticAgents) {
    await cp(join(root, "agents", entry.name), join(fixture, "agents", entry.name));
  }
  return fixture;
}

async function readRegistry(fixture) {
  return JSON.parse(await readFile(join(fixture, "runtime/schema/codex-agents.json"), "utf8"));
}

async function writeRegistry(fixture, registry) {
  await writeFile(join(fixture, "runtime/schema/codex-agents.json"), `${JSON.stringify(registry, null, 2)}\n`);
}

async function expectRegistryFailure(mutator, pattern) {
  const fixture = await makeFixture();
  try {
    const registry = await readRegistry(fixture);
    await mutator(registry, fixture);
    await writeRegistry(fixture, registry);
    await assert.rejects(() => render({ rootDir: fixture }), pattern);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function withMutedStderr(action) {
  const original = process.stderr.write;
  process.stderr.write = () => true;
  try { return await action(); } finally { process.stderr.write = original; }
}

const first = await render();
const second = await render();
assert.equal(first.files.size, 24);
assert.deepEqual([...first.files], [...second.files], "identical inputs must render identical bytes");

const agentOutputs = [...first.files].filter(([path]) => path.includes("/.codex/agents/"));
assert.equal(agentOutputs.length, 11);
for (const [, content] of agentOutputs) {
  assert.match(content, /^name = /m);
  assert.match(content, /^description = /m);
  assert.match(content, /^developer_instructions = /m);
  assert.match(content, /^# Semantic source: agents\//m);
  assert.match(content, /^# Projection tier: /m);
}

const packagedAgentOutputs = [...first.files].filter(([path]) =>
  path.includes("/plugins/team-harness/skills/setup/assets/agents/"));
assert.equal(packagedAgentOutputs.length, 11);
for (const [path, content] of agentOutputs) {
  const name = path.split("/").at(-1);
  assert.equal(
    first.files.get(join(root, "plugins/team-harness/skills/setup/assets/agents", name)),
    content,
    `${name} must be packaged byte-for-byte with the generated project agent`
  );
}

const projectConfig = first.files.get(join(root, ".codex/config.toml"));
assert.match(projectConfig, /^sandbox_mode = "workspace-write"$/m);
assert.match(projectConfig, /^approval_policy = "on-request"$/m);
assert.match(projectConfig, /^\[sandbox_workspace_write\]$/m);
assert.match(projectConfig, /^network_access = true$/m);
assert.match(projectConfig, /^writable_roots = \["~\/\.cache\/go-build", "~\/\.cache\/uv", "~\/\.npm", "~\/go\/pkg\/mod"\]$/m);
assert.doesNotMatch(projectConfig, /^\[shell_environment_policy\]$/m);

for (const name of ["architect", "security"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /^model = "gpt-5\.6-sol"$/m);
  assert.match(content, /^model_reasoning_effort = "xhigh"$/m);
}
for (const name of [
  "implementer",
  "tester",
  "qa",
  "delivery",
  "reviewer",
  "pr-review-qa",
  "pr-review-security",
  "reviewer-consolidator"
]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /^model = "gpt-5\.6-luna"$/m);
  assert.match(content, /^model_reasoning_effort = "max"$/m);
}
const inlineReviewer = first.files.get(join(root, ".codex/agents/inline-reviewer.toml"));
assert.match(inlineReviewer, /^model = "gpt-5\.6-luna"$/m);
assert.match(inlineReviewer, /^model_reasoning_effort = "max"$/m);
assert.match(inlineReviewer, /^sandbox_mode = "read-only"$/m);
assert.match(inlineReviewer, /^\[capabilities\]$/m);
assert.match(inlineReviewer, /^default = "deny"$/m);
assert.match(inlineReviewer, /^allow = \["read", "glob", "grep"\]$/m);

for (const name of ["reviewer", "pr-review-qa", "pr-review-security", "reviewer-consolidator"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /^\[capabilities\]$/m);
  assert.match(content, /^default = "deny"$/m);
  assert.match(content, /^allow = \["read", "glob", "grep"\]$/m);
}
for (const name of ["architect", "implementer", "tester", "qa", "security", "delivery"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.doesNotMatch(content, /^\[capabilities\]$/m);
}

// The pipeline skill preflight uses a canonical digest in addition to the
// human-readable generated markers. Keep both copies of that allowlist in
// lockstep with the actual generated bytes so an instruction change cannot
// silently leave the identity contract stale.
const pipelineIdentityDocs = await Promise.all([
  readFile(join(root, "plugins/team-harness/skills/pipeline/SKILL.md"), "utf8"),
  readFile(join(root, "plugins/team-harness/skills/pipeline/references/activation.md"), "utf8"),
]);
for (const name of ["architect", "implementer", "tester", "qa", "security", "delivery"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  const normalized = content.replace(/\r\n?/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  const row = new RegExp("\\\\|\\s+`?" + name + "`?\\s+\\|\\s+`" + digest + "`\\s+\\|");
  for (const document of pipelineIdentityDocs) {
    assert.match(document, row, `${name} digest allowlist is stale`);
  }
}

const roster = first.files.get(join(root, ".codex/README.md"));
assert.match(roster, /^# Team Harness Codex agents$/m);
assert.match(roster, /^## Improve Team Harness from Codex$/m);
assert.match(roster, /@Team-Harness init <request>/);
assert.match(roster, /@Team-Harness pipeline <request>/);
assert.match(roster, /\$sync-codex-agents/);
assert.match(roster, /\| Agent \| Canonical Claude model \| Canonical source effort \| Codex model \| Codex effort \| Codex availability \|/);
assert.match(roster, /\| `architect` \| `opus` \| `xhigh` \| `gpt-5\.6-sol` \| `xhigh` \| installed custom agent \|/);
assert.match(roster, /\| `implementer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `inline-reviewer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `reviewer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `pr-review-qa` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `pr-review-security` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `reviewer-consolidator` \| `sonnet` \| `medium` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `orchestrator` \| `opus` \| `high` \| `gpt-5\.6-sol` \| `xhigh` \| Main via `init` \/ `pipeline` skills \|/);
assert.match(roster, /\| `agent-builder` \| `opus` \| `xhigh` \| `gpt-5\.6-sol` \| `xhigh` \| not shipped in Codex beta \|/);

const opusOtherFixture = await makeFixture();
try {
  const source = join(opusOtherFixture, "agents/implementer.md");
  const content = await readFile(source, "utf8");
  await writeFile(source, content.replace("model: sonnet\neffort: high", "model: opus\neffort: high"));
  const projected = await render({ rootDir: opusOtherFixture });
  const output = projected.files.get(join(opusOtherFixture, ".codex/agents/implementer.toml"));
  assert.match(output, /^model = "gpt-5\.6-sol"$/m);
  assert.match(output, /^model_reasoning_effort = "xhigh"$/m);
} finally {
  await rm(opusOtherFixture, { recursive: true, force: true });
}

await expectRegistryFailure(registry => {
  registry.agents[0].name = "Bad_Name";
}, /invalid name/);
await expectRegistryFailure(registry => {
  registry.agents[0].semantic_source = "agents/security.md";
}, /semantic_source must be/);
await expectRegistryFailure(registry => {
  registry.agents[0].instruction_source = "..\/outside.md";
}, /instruction_source must be/);
await expectRegistryFailure(registry => {
  registry.agents[0].capabilities.push("root-access");
}, /unsupported capability/);
await expectRegistryFailure(registry => {
  registry.agents[0].sandbox_mode = "danger-full-access";
}, /unsupported sandbox mode/);
await expectRegistryFailure(registry => {
  registry.agents[0].capability_profile = "unknown";
}, /unsupported capability profile/);
await expectRegistryFailure(registry => {
  const reviewer = registry.agents.find(agent => agent.name === "reviewer");
  reviewer.sandbox_mode = "workspace-write";
}, /requires read-only sandbox mode/);
await expectRegistryFailure(registry => {
  registry.project_execution.sandbox_mode = "danger-full-access";
}, /project_execution: unsupported sandbox mode/);
await expectRegistryFailure(registry => {
  registry.project_execution.approval_policy = "never";
}, /approval_policy must be on-request/);
await expectRegistryFailure(registry => {
  registry.project_execution.writable_roots = ["~/.cache"];
}, /must declare exactly the supported user-scoped cache paths/);
await expectRegistryFailure(registry => {
  registry.agents[0].output_path = ".codex/agents/wrong.toml";
}, /output_path must be/);
await expectRegistryFailure(registry => {
  registry.projection_tiers.push({
    name: "overlap",
    source_models: ["opus"],
    source_efforts: ["xhigh"]
  });
}, /map to exactly one projection tier \(matched 2\)/);
await expectRegistryFailure(registry => {
  registry.projection_tiers = registry.projection_tiers.filter(tier => tier.name !== "non-opus");
}, /map to exactly one projection tier \(matched 0\)/);
await expectRegistryFailure(registry => {
  registry.profiles["team-harness"].tiers["non-opus"].reasoning_effort = "unbounded";
}, /unsupported runtime reasoning effort/);

const checkFixture = await makeFixture();
try {
  await generate({ rootDir: checkFixture });
  await generate({ rootDir: checkFixture, check: true });

  const changedPath = join(checkFixture, ".codex/agents/architect.toml");
  await writeFile(changedPath, "manual change\n");
  await withMutedStderr(() => assert.rejects(
    () => generate({ rootDir: checkFixture, check: true }),
    /generated Codex artifacts are stale/
  ));
  assert.equal(await readFile(changedPath, "utf8"), "manual change\n", "--check must not mutate stale files");

  const extraPath = join(checkFixture, ".codex/agents/extra.toml");
  await writeFile(extraPath, "extra\n");
  await withMutedStderr(() => assert.rejects(
    () => generate({ rootDir: checkFixture, check: true }),
    /generated Codex artifacts are stale/
  ));
  assert.equal(await readFile(extraPath, "utf8"), "extra\n", "--check must not remove extra files");
} finally {
  await rm(checkFixture, { recursive: true, force: true });
}

console.log("codex runtime generator: PASS");
