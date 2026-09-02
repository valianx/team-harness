import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generate, render } from "./generate.mjs";
import { sharedPipelineScripts, syncSharedPipelineAssets } from "./sync-skills.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
// The roster is imported rather than restated: a second copy is how a fixture starts
// passing against a list the shipped code no longer has.
const pipelineScripts = sharedPipelineScripts;

async function makePipelineFixture() {
  const fixture = await mkdtemp(join(tmpdir(), "codex-pipeline-sync-"));
  await mkdir(join(fixture, "skills/pipeline/scripts"), { recursive: true });
  for (const name of pipelineScripts) {
    await writeFile(join(fixture, "skills/pipeline/scripts", name), `source:${name}\n`);
  }
  await writeFile(join(fixture, "skills/pipeline/openspec-policy.json"), '{"fixture":true}\n');
  return fixture;
}

async function makeFixture() {
  const fixture = await mkdtemp(join(tmpdir(), "codex-runtime-"));
  await mkdir(join(fixture, "runtime/schema"), { recursive: true });
  await mkdir(join(fixture, "runtime/codex"), { recursive: true });
  await mkdir(join(fixture, "agents/_shared"), { recursive: true });
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
  await cp(
    join(root, "agents/_shared/dispatch-contract.md"),
    join(fixture, "agents/_shared/dispatch-contract.md"),
  );
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
assert.equal(first.files.size, 42);
assert.deepEqual([...first.files], [...second.files], "identical inputs must render identical bytes");

const agentOutputs = [...first.files].filter(([path]) => path.includes("/.codex/agents/"));
assert.equal(agentOutputs.length, 20);
for (const [path, content] of agentOutputs) {
  assert.match(content, /^name = /m);
  assert.match(content, /^description = /m);
  assert.match(content, /^developer_instructions = /m);
  assert.match(content, /^# Semantic source: agents\//m);
  assert.match(content, /^# Projection tier: /m);
  assert.doesNotMatch(content, /gpt-5\.6-terra/, `${path} retains Terra in a current projection`);
  assert.doesNotMatch(content, /^\[capabilities\]$/m, "Codex 0.146 role-schema parser rejects capability tables");
}

const packagedAgentOutputs = [...first.files].filter(([path]) =>
  path.includes("/plugins/team-harness/skills/setup/assets/agents/"));
assert.equal(packagedAgentOutputs.length, 20);
for (const [path, content] of agentOutputs) {
  const name = path.split("/").at(-1);
  assert.equal(
    first.files.get(join(root, "plugins/team-harness/skills/setup/assets/agents", name)),
    content,
    `${name} must be packaged byte-for-byte with the generated project agent`
  );
}

for (const name of ["reviewer", "pr-review-qa", "pr-review-security", "pr-review-verifier", "reviewer-consolidator"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /metadata, not project paths to open/, `${name} may infer its source marker as project context`);
  assert.match(content, /run that verification before `sed` or any content read/, `${name} may read before path verification`);
  assert.match(content, /required-read-failed/, `${name} does not distinguish required-read failure`);
  assert.match(content, /failed_read_path/, `${name} cannot report the failed coordinate`);
  assert.doesNotMatch(content, /If a bounded read actually fails, return the exact read failure to Main/,
    `${name} still promotes every failed inferred read to fatal transport failure`);
}

for (const name of ["reviewer", "pr-review-qa", "pr-review-security", "pr-review-verifier"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /Changed-files membership only nominates a project candidate/,
    `${name} treats changed-files membership as sufficient read authorization`);
  assert.match(content, /non-symlink regular file/,
    `${name} may follow a symlink while reading frozen worktree content`);
  assert.match(content, /resolved path remains inside the detached worktree/,
    `${name} does not constrain resolved content paths to the frozen worktree`);
  assert.match(content, /Read deleted-file evidence from the supplied diff only/,
    `${name} may attempt to read a deleted path from the head worktree`);
}

const projectConfig = first.files.get(join(root, ".codex/config.toml"));
assert.doesNotMatch(projectConfig, /^model = /m, "project fallback must not override Main's model");
assert.doesNotMatch(projectConfig, /^model_reasoning_effort = /m, "project fallback must not override Main's effort");
assert.match(
  projectConfig,
  /^project_doc_fallback_filenames = \["CLAUDE\.md"\]$/m,
  "project config must load CLAUDE.md only when AGENTS.md is absent",
);
assert.match(projectConfig, /^sandbox_mode = "workspace-write"$/m);
assert.match(projectConfig, /^approval_policy = "on-request"$/m);
assert.match(projectConfig, /^\[features\]$/m);
assert.match(projectConfig, /^multi_agent = true$/m);
assert.match(projectConfig, /^multi_agent_v2 = true$/m);
assert.match(projectConfig, /^\[sandbox_workspace_write\]$/m);
assert.match(projectConfig, /^network_access = true$/m);
assert.doesNotMatch(projectConfig, /^writable_roots\s*=/m, "global setup owns user-specific writable roots");
assert.match(projectConfig, /^default_subagent_model = "gpt-5\.6-luna"$/m);
assert.match(projectConfig, /^default_subagent_reasoning_effort = "max"$/m);
assert.doesNotMatch(projectConfig, /gpt-5\.6-terra/, "project fallback retains Terra");
assert.doesNotMatch(projectConfig, /^\[shell_environment_policy\]$/m);

for (const name of ["architect", "qa", "security"]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /^model = "gpt-5\.6-sol"$/m);
  assert.match(content, /^model_reasoning_effort = "xhigh"$/m);
}
for (const name of [
  "implementer",
  "tester",
  "cleaner",
  "inline-reviewer",
  "reviewer",
  "pr-review-qa",
  "pr-review-security",
  "delivery",
  "reviewer-consolidator",
]) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.match(content, /^model = "gpt-5\.6-luna"$/m);
  assert.match(content, /^model_reasoning_effort = "max"$/m);
}
const inlineReviewer = first.files.get(join(root, ".codex/agents/inline-reviewer.toml"));
assert.match(inlineReviewer, /^model = "gpt-5\.6-luna"$/m);
assert.match(inlineReviewer, /^model_reasoning_effort = "max"$/m);
assert.match(inlineReviewer, /^sandbox_mode = "read-only"$/m);
assert.doesNotMatch(inlineReviewer, /^\[capabilities\]$/m);

const cleaner = first.files.get(join(root, ".codex/agents/cleaner.toml"));
assert.match(cleaner, /^model = "gpt-5\.6-luna"$/m);
assert.match(cleaner, /^model_reasoning_effort = "max"$/m);
assert.match(cleaner, /^sandbox_mode = "workspace-write"$/m);

const pipelineRoleMap = {
  "pipeline-architect": "architect",
  "pipeline-implementer": "implementer",
  "pipeline-tester": "tester",
  "pipeline-cleaner": "cleaner",
  "pipeline-qa": "qa",
  "pipeline-security": "security",
  "pipeline-delivery": "delivery",
};
for (const [name, role] of Object.entries(pipelineRoleMap)) {
  const content = first.files.get(join(root, `.codex/agents/${name}.toml`));
  assert.doesNotMatch(content, /^model = /m, `${name} must accept an explicit spawn model`);
  assert.doesNotMatch(content, /^model_reasoning_effort = /m, `${name} must accept an explicit spawn effort`);
  assert.match(content, new RegExp(`^name = "${name}"$`, "m"));
  assert.match(content, new RegExp(`^# Instruction source: runtime/codex/instructions/${role}\\.md$`, "m"));
  assert.match(content, new RegExp(`^# Semantic source: agents/${role}\\.md`, "m"));
}
for (const role of ["implementer", "tester", "cleaner", "qa", "security", "delivery"]) {
  const content = first.files.get(join(root, `.codex/agents/pipeline-${role}.toml`));
  for (const marker of ["capability", "lease", "result"]) {
    assert.ok(content.includes(marker), `pipeline-${role} adapter misses ${marker}`);
  }
  assert.doesNotMatch(content, /TH-LIVENESS-(?:PROBE|ACK)|ordinal allowance/,
    `pipeline-${role} retains retired liveness routing`);
}

const architect = first.files.get(join(root, ".codex/agents/architect.toml"));
for (const marker of [
  "agents/architect.md",
  "pipeline v5",
  "just-in-time capability",
  "lease",
  "result envelope",
  "upstream OpenSpec propose/update",
  "Never write `01-plan.md`",
]) {
  assert.match(architect, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `architect adapter misses ${marker}`);
}

// The pipeline skill preflight uses a canonical digest in addition to the
// human-readable generated markers. Keep both copies of that allowlist in
// lockstep with the actual generated bytes so an instruction change cannot
// silently leave the identity contract stale.
const pipelineIdentityDocs = await Promise.all([
  readFile(join(root, "plugins/team-harness/skills/pipeline/SKILL.md"), "utf8"),
  readFile(join(root, "plugins/team-harness/skills/pipeline/references/activation.md"), "utf8"),
]);
const pipelineVersionContracts = await Promise.all([
  readFile(join(root, "plugins/team-harness/skills/pipeline/SKILL.md"), "utf8"),
  readFile(join(root, "plugins/team-harness/skills/pipeline/references/state-and-gates.md"), "utf8"),
  readFile(join(root, "plugins/team-harness/skills/pipeline/references/recovery.md"), "utf8"),
  readFile(join(root, "skills/recover/SKILL.md"), "utf8"),
  readFile(join(root, "agents/_shared/gate-contract.md"), "utf8"),
  readFile(join(root, "agents/delivery.md"), "utf8"),
]);
for (const contract of pipelineVersionContracts) {
  assert.doesNotMatch(contract, /migration to the v3 pipeline|canonical (?:full )?v3|active v3 state|(?:write|writes|persist|set) `pipeline_version: 3`/i,
    "pipeline contract can persist or activate the retired writable v3 schema");
}
assert.match(pipelineVersionContracts[0], /only current machine[\s\S]*design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete/,
  "Codex pipeline activation is not pinned to the canonical v5 state machine");
assert.match(pipelineIdentityDocs[1], /Choose the configured repository or Obsidian workspace root/,
  "Codex pipeline does not honor the configured workspace root");
assert.match(pipelineIdentityDocs[1], /Bind the repository's OpenSpec change root separately from the workspace root/,
  "Codex pipeline conflates canonical OpenSpec and workspace projections");
const pipelineStateReference = await readFile(join(root, "plugins/team-harness/skills/pipeline/references/state-and-gates.md"), "utf8");
const canonicalOrchestratorState = await readFile(join(root, "agents/_shared/orchestrator-state.md"), "utf8");
assert.match(canonicalOrchestratorState,
  /hash-linked `control\/control\.jsonl`[\s\S]*only durable control[\s\S]*projections or telemetry/,
  "Codex pipeline state does not establish the v5 sole-authority contract");
assert.match(pipelineStateReference, /only durable control authority[\s\S]*Main alone appends/,
  "pipeline state reference loses the v5 control-log ownership contract");
for (const script of ["bounded-command.mjs", "cli-entrypoint.mjs", "code-hygiene.mjs", "control-plane.mjs", "control-plane-specialist.mjs", "workspace-identity.mjs", "herdr-message.mjs"]) {
  const source = await readFile(join(root, "skills/pipeline/scripts", script), "utf8");
  const projected = await readFile(join(root, "plugins/team-harness/skills/pipeline/scripts", script), "utf8");
  assert.equal(projected, source, `${script} generated projection is stale`);
}
const boundedCommandScript = await readFile(join(root, "skills/pipeline/scripts/bounded-command.mjs"), "utf8");
const codeHygieneScript = await readFile(join(root, "skills/pipeline/scripts/code-hygiene.mjs"), "utf8");
const architectAdapter = await readFile(join(root, "runtime/codex/instructions/architect.md"), "utf8");
const testerSemantic = await readFile(join(root, "agents/tester.md"), "utf8");
const dispatchContract = await readFile(join(root, "agents/_shared/dispatch-contract.md"), "utf8");
const orchestratorStateContract = await readFile(join(root, "agents/_shared/orchestrator-state.md"), "utf8");
for (const marker of ["boundedCommandProcessStatus", "result.outcome === \"completed\"", "result.exit_code === 0"]) {
  assert.ok(boundedCommandScript.includes(marker), `bounded-command process-status guard misses ${marker}`);
}
for (const marker of ["CODE_HYGIENE_PATTERN_VERSION", "team_harness_code_hygiene_receipt", "WORK_NARRATION_DETECTED", "diff_sha256"]) {
  assert.ok(codeHygieneScript.includes(marker), `code-hygiene helper misses ${marker}`);
}
for (const marker of ["independent-test predicate", "There is no universal RED dispatch", "canonical OpenSpec scenarios"]) {
  assert.ok(testerSemantic.includes(marker), `tester semantic contract misses risk-derived marker ${marker}`);
}
for (const marker of ["capability_lease", "immediately before", "Native dispatch", "exclusive ownership"]) {
  assert.ok(dispatchContract.includes(marker), `shared dispatch contract misses specialist marker ${marker}`);
}
assert.doesNotMatch(testerSemantic, /Pre-implementation covers prerequisites and RED/,
  "tester retained the universal pre-implementation RED route");
for (const marker of ["control/control.jsonl", "projection", "Main is the only log appender"]) {
  assert.ok(orchestratorStateContract.includes(marker), `orchestrator artifact verification misses section marker ${marker}`);
}
const implementationContract = await readFile(join(root, "plugins/team-harness/skills/pipeline/references/implementation.md"), "utf8");
const coordinatorRecoveryContract = await readFile(join(root, "agents/_shared/coordinator-recovery.md"), "utf8");
for (const marker of ["Continue the same lease", "Replace the session", "Pause", "live decision", "Counts, ordinals", "fresh QA"]) {
  assert.ok(coordinatorRecoveryContract.includes(marker), `coordinator recovery contract misses ${marker}`);
}
for (const marker of ["Just-in-time batching", "capability_lease", "one committing writer", "independentTestRequirement", "cleanerEligibility"]) {
  assert.ok(implementationContract.includes(marker), `specialist workspace ownership contract misses ${marker}`);
}
assert.doesNotMatch(implementationContract, /repair-derived|seal-dispatch|permanent seal|execution_items/,
  "current implementation route retains a legacy overlay, seal, or universal RED hot path");
assert.match(implementationContract, /no universal RED/);
for (const role of ["implementer", "tester"]) {
  const adapter = await readFile(join(root, `runtime/codex/instructions/${role}.md`), "utf8");
  const generatedAgent = await readFile(join(root, `.codex/agents/${role}.toml`), "utf8");
  assert.doesNotMatch(adapter, /For OpenSpec (?:implementation|testing), accept only/,
    `${role} adapter duplicates the shared dispatch reference contract`);
  for (const marker of ["capability_lease", "coherent batch", "exclusive ownership", "result envelope"]) {
    assert.ok(generatedAgent.includes(marker), `${role} generated agent misses canonical dispatch marker ${marker}`);
  }
  for (const marker of ["writable paths", "Native dispatch", "coordinator"] ) {
    assert.ok(generatedAgent.includes(marker), `${role} generated agent misses lease ownership marker ${marker}`);
  }
}
for (const marker of ["agents/architect.md", "just-in-time capability", "result envelope", "OpenSpec propose/update"] ) {
  assert.ok(architectAdapter.includes(marker), `Codex architect adapter misses ${marker}`);
}
const herdrReference = await readFile(join(root, "plugins/team-harness/agents/_shared/herdr-agent-messaging.md"), "utf8");
for (const marker of ["herdr agent list", "herdr pane current", "herdr agent send", "herdr pane send-keys", "herdr agent read", "current-session-output", "queued"]) {
  assert.ok(herdrReference.includes(marker), `HerdR projection misses ${marker}`);
}
assert.doesNotMatch(herdrReference, /herdr agent wait|wait boundedly for `idle`/,
  "HerdR projection still delays queued messages until idle");
for (const workflow of ["tmux", "background"]) {
  const canonical = await readFile(join(root, `plugins/team-harness/skills/${workflow}/canonical.md`), "utf8");
  assert.match(canonical, /herdr-agent-messaging\.md/,
    `${workflow} does not route HerdR messaging through the shared contract`);
  assert.match(canonical, /`queued`/,
    `${workflow} permits queued HerdR input to disappear`);
}
assert.doesNotMatch(pipelineIdentityDocs[1], /obsidian-direct/,
  "Codex pipeline retains the retired obsidian-direct mode");
const standardPipelineMatrix = {
  architect: ["pipeline-architect", "gpt-5.6-sol", "xhigh"],
  implementer: ["pipeline-implementer", "gpt-5.6-luna", "max"],
  tester: ["pipeline-tester", "gpt-5.6-luna", "max"],
  cleaner: ["pipeline-cleaner", "gpt-5.6-luna", "max"],
  qa: ["pipeline-qa", "gpt-5.6-sol", "xhigh"],
  security: ["pipeline-security", "gpt-5.6-sol", "xhigh"],
  delivery: ["pipeline-delivery", "gpt-5.6-luna", "max"],
};
for (const [role, [agentType, model, effort]] of Object.entries(standardPipelineMatrix)) {
  const row = `| ${role} | ${agentType} | ${model} / ${effort} |`;
  assert.ok(pipelineIdentityDocs[0].includes(row), `${role} standard pipeline projection is stale`);
}

const roster = first.files.get(join(root, ".codex/README.md"));
assert.doesNotMatch(roster, /gpt-5\.6-terra/, "current generated roster retains Terra");
assert.match(roster, /^# Team Harness Codex agents$/m);
assert.match(roster, /^## Improve Team Harness from Codex$/m);
assert.match(roster, /@Team-Harness init <request>/);
assert.match(roster, /@Team-Harness pipeline <request>/);
assert.match(roster, /\$sync-codex-agents/);
assert.match(roster, /\| Agent \| Canonical Claude model \| Canonical source effort \| Codex model \| Codex effort \| Codex availability \|/);
assert.match(roster, /\| `architect` \| `opus` \| `xhigh` \| `gpt-5\.6-sol` \| `xhigh` \| installed custom agent \|/);
assert.match(roster, /\| `qa` \| `opus` \| `xhigh` \| `gpt-5\.6-sol` \| `xhigh` \| installed custom agent \|/);
assert.match(roster, /\| `adversary` \| `sonnet` \| `xhigh` \| `gpt-5\.6-luna` \| `max` \| not shipped in Codex beta \|/);
assert.match(roster, /\| `implementer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `cleaner` \| `sonnet` \| `medium` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `inline-reviewer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `reviewer` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `pr-review-qa` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `pr-review-security` \| `sonnet` \| `high` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `pr-review-verifier` \| `opus` \| `high` \| `gpt-5\.6-sol` \| `xhigh` \| installed custom agent \|/);
assert.match(roster, /\| `reviewer-consolidator` \| `sonnet` \| `medium` \| `gpt-5\.6-luna` \| `max` \| installed custom agent \|/);
assert.match(roster, /\| `researcher` \| `haiku` \| `medium` \| `gpt-5\.6-luna` \| `max` \| not shipped in Codex beta \|/);
assert.match(roster, /\| `orchestrator` \| `opus` \| `high` \| `gpt-5\.6-sol` \| `xhigh` \| Main via `init` \/ `pipeline` skills \|/);
assert.match(roster, /\| `agent-builder` \| `opus` \| `xhigh` \| `gpt-5\.6-sol` \| `xhigh` \| not shipped in Codex beta \|/);
assert.doesNotMatch(roster, /qa-plan/, "generated Codex roster exposes the removed planning-QA role");
await assert.rejects(readFile(join(root, "agents/qa-plan.md")), /ENOENT/);
await assert.rejects(readFile(join(root, "plugins/team-harness/agents/qa-plan.md")), /ENOENT/);
const explicitPlanReview = await readFile(join(root, "skills/plan-review/SKILL.md"), "utf8");
assert.match(explicitPlanReview, /exactly one surviving `plan-reviewer`/);
assert.doesNotMatch(explicitPlanReview, /qa-plan/);
assert.match(explicitPlanReview, /does not define acceptance, run a security\s+design panel/);
assert.match(explicitPlanReview, /Security specialist: not run/);

const pipelineContract = await readFile(join(root, "agents/ref-pipeline.md"), "utf8");
assert.match(pipelineContract, /^## Failures$/m);
assert.match(pipelineContract, /\| `transport` \| Native dispatch\/message transport failed/);
const lintContract = await readFile(join(root, "skills/lint/SKILL.md"), "utf8");
assert.match(lintContract, /agents\/README\.md § Roster/);
assert.doesNotMatch(lintContract, /agents\/ref-pipeline\.md.*§ Your Team/);
const intakeContract = await readFile(join(root, "agents/ref-intake-flows.md"), "utf8");
assert.doesNotMatch(intakeContract, /agents\/ref-pipeline\.md.*§ Intake/);

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

const haikuFixture = await makeFixture();
try {
  const source = join(haikuFixture, "agents/init-project.md");
  const content = await readFile(source, "utf8");
  await writeFile(source, content.replace("model: haiku\neffort: medium", "model: haiku\neffort: xhigh"));
  const projected = await render({ rootDir: haikuFixture });
  const roster = projected.files.get(join(haikuFixture, ".codex/README.md"));
  assert.match(roster, /\| `init-project` \| `haiku` \| `xhigh` \| `gpt-5\.6-luna` \| `max` \| not shipped in Codex beta \|/);
} finally {
  await rm(haikuFixture, { recursive: true, force: true });
}

await expectRegistryFailure(registry => {
  registry.agents[0].name = "Bad_Name";
}, /invalid name/);
await expectRegistryFailure(registry => {
  registry.agents.find(agent => agent.name === "pipeline-architect").model_policy = "profile";
}, /aliased roles must use spawn model policy/);
await expectRegistryFailure(registry => {
  registry.agents.find(agent => agent.name === "pipeline-architect").model_policy = "ambient";
}, /unsupported model policy/);
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
  registry.projection_tiers = registry.projection_tiers.filter(tier => tier.name !== "sonnet-high");
}, /map to exactly one projection tier \(matched 0\)/);
await expectRegistryFailure(registry => {
  registry.profiles["team-harness"].tiers["sonnet-high"].reasoning_effort = "unbounded";
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

const pipelineSyncFixture = await makePipelineFixture();
const pipelineSyncOutside = await mkdtemp(join(tmpdir(), "codex-pipeline-sync-outside-"));
try {
  const targetRoot = join(pipelineSyncFixture, "plugins/team-harness/skills/pipeline/scripts");
  await mkdir(join(pipelineSyncFixture, "plugins/team-harness/skills/pipeline"), { recursive: true });
  let symlinkAvailable = true;
  try {
    await symlink(pipelineSyncOutside, targetRoot, "dir");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) symlinkAvailable = false;
    else throw error;
  }
  if (symlinkAvailable) {
    await assert.rejects(
      () => syncSharedPipelineAssets({ check: false, rootDir: pipelineSyncFixture }),
      /symbolic-link pipeline destination/,
    );
    assert.deepEqual(await readdir(pipelineSyncOutside), []);
  }
} finally {
  await rm(pipelineSyncFixture, { recursive: true, force: true });
  await rm(pipelineSyncOutside, { recursive: true, force: true });
}

const pipelineProjectionFixture = await makePipelineFixture();
try {
  await syncSharedPipelineAssets({ check: false, rootDir: pipelineProjectionFixture });
  await syncSharedPipelineAssets({ check: true, rootDir: pipelineProjectionFixture });
  for (const targetRoot of [
    "plugins/team-harness/skills/pipeline",
    "installer-assets/opencode-skills/pipeline",
  ]) {
    assert.equal(
      await readFile(join(pipelineProjectionFixture, targetRoot, "openspec-policy.json"), "utf8"),
      '{"fixture":true}\n',
    );
    for (const name of pipelineScripts) {
      assert.equal(
        await readFile(join(pipelineProjectionFixture, targetRoot, "scripts", name), "utf8"),
        `source:${name}\n`,
      );
    }
  }
} finally {
  await rm(pipelineProjectionFixture, { recursive: true, force: true });
}

console.log("codex runtime generator: PASS");
