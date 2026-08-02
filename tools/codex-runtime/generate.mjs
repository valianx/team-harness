#!/usr/bin/env node

import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const capabilityProfiles = new Map([
  ["review-read-only", { default: "deny", allow: ["read", "glob", "grep"] }]
]);

function fail(message) {
  throw new Error(`codex-runtime: ${message}`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
}

function assertUniqueStringArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail(`${label} must be ${nonEmpty ? "a non-empty" : "an"} array`);
  }
  const seen = new Set();
  for (const item of value) {
    assertNonEmptyString(item, `${label} entry`);
    if (seen.has(item)) fail(`${label} contains duplicate ${item}`);
    seen.add(item);
  }
  return seen;
}

function repositoryPath(rootDir, path, label) {
  assertNonEmptyString(path, label);
  if (isAbsolute(path) || path.includes("\\")) fail(`${label} must be a repository-relative POSIX path`);
  const resolved = resolve(rootDir, path);
  const prefix = `${resolve(rootDir)}${sep}`;
  if (!resolved.startsWith(prefix)) fail(`${label} escapes repository`);
  return resolved;
}

function parseSemanticFrontmatter(content, label) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") fail(`${label}: missing YAML frontmatter`);
  const closing = lines.indexOf("---", 1);
  if (closing < 0) fail(`${label}: unterminated YAML frontmatter`);
  const fields = new Map();
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (fields.has(key)) fail(`${label}: duplicate frontmatter field ${key}`);
    fields.set(key, value);
  }
  return fields;
}

function validateProjectionTiers(contract, allowedSourceModels, allowedSourceEfforts) {
  if (!Array.isArray(contract.projection_tiers) || contract.projection_tiers.length === 0) {
    fail("projection_tiers must be a non-empty array");
  }
  const names = new Set();
  return contract.projection_tiers.map(tier => {
    assertNonEmptyString(tier.name, "projection tier name");
    if (!/^[a-z][a-z0-9-]*$/.test(tier.name)) fail(`${tier.name}: invalid projection tier name`);
    if (names.has(tier.name)) fail(`${tier.name}: duplicate projection tier name`);
    names.add(tier.name);
    const sourceModels = assertUniqueStringArray(tier.source_models, `${tier.name}.source_models`, { nonEmpty: true });
    const sourceEfforts = assertUniqueStringArray(tier.source_efforts, `${tier.name}.source_efforts`, { nonEmpty: true });
    for (const model of sourceModels) {
      if (!allowedSourceModels.has(model)) fail(`${tier.name}: unsupported source model ${model}`);
    }
    for (const effort of sourceEfforts) {
      if (!allowedSourceEfforts.has(effort)) fail(`${tier.name}: unsupported source effort ${effort}`);
    }
    return { name: tier.name, sourceModels, sourceEfforts };
  });
}

function validateProfile(contract, profileName, usedProjectionTiers, allowedRuntimeReasoningEfforts) {
  assertNonEmptyString(contract.default_profile, "default_profile");
  if (!contract.profiles || typeof contract.profiles !== "object" || Array.isArray(contract.profiles)) {
    fail("profiles must be an object");
  }
  const profile = contract.profiles[profileName];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) fail(`unsupported profile ${profileName}`);
  if (typeof profile.inherit_parent !== "boolean") fail(`${profileName}: inherit_parent must be boolean`);
  if (profile.inherit_parent) {
    if (profile.tiers !== undefined) {
      fail(`${profileName}: inherited profile cannot define concrete mappings`);
    }
    return profile;
  }
  if (!profile.tiers || typeof profile.tiers !== "object" || Array.isArray(profile.tiers)) {
    fail(`${profileName}: missing tiers`);
  }
  for (const tier of usedProjectionTiers) {
    const mapping = profile.tiers[tier];
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) fail(`${profileName}: missing tier ${tier}`);
    assertNonEmptyString(mapping.model, `${profileName}.tiers.${tier}.model`);
    assertNonEmptyString(mapping.reasoning_effort, `${profileName}.tiers.${tier}.reasoning_effort`);
    if (!allowedRuntimeReasoningEfforts.has(mapping.reasoning_effort)) {
      fail(`${profileName}.tiers.${tier}: unsupported runtime reasoning effort ${mapping.reasoning_effort}`);
    }
  }
  return profile;
}

export async function render({ rootDir = repositoryRoot, profileName } = {}) {
  rootDir = resolve(rootDir);
  const contractPath = join(rootDir, "runtime/schema/codex-agents.json");
  const outputDirs = [
    join(rootDir, ".codex/agents"),
    join(rootDir, "plugins/team-harness/skills/setup/assets/agents")
  ];
  let contract;
  try {
    contract = JSON.parse(await readFile(contractPath, "utf8"));
  } catch (error) {
    fail(`cannot read registry: ${error.message}`);
  }

  if (contract.format_version !== 1 || contract.runtime !== "codex") {
    fail("unsupported contract format or runtime");
  }
  if (!Number.isInteger(contract.max_concurrent_threads_per_session) || contract.max_concurrent_threads_per_session < 1) {
    fail("max_concurrent_threads_per_session must be a positive integer");
  }
  const allowedCapabilities = assertUniqueStringArray(contract.allowed_capabilities, "allowed_capabilities", { nonEmpty: true });
  const allowedSandboxModes = assertUniqueStringArray(contract.allowed_sandbox_modes, "allowed_sandbox_modes", { nonEmpty: true });
  const projectExecution = contract.project_execution;
  if (!projectExecution || typeof projectExecution !== "object" || Array.isArray(projectExecution)) {
    fail("project_execution must be an object");
  }
  if (!allowedSandboxModes.has(projectExecution.sandbox_mode)) {
    fail(`project_execution: unsupported sandbox mode ${projectExecution.sandbox_mode ?? "missing"}`);
  }
  if (projectExecution.approval_policy !== "on-request") {
    fail("project_execution.approval_policy must be on-request");
  }
  if (typeof projectExecution.network_access !== "boolean") {
    fail("project_execution.network_access must be a boolean");
  }
  const writableRoots = assertUniqueStringArray(
    projectExecution.writable_roots,
    "project_execution.writable_roots",
    { nonEmpty: true }
  );
  const expectedWritableRoots = new Set([
    "~/.cache/go-build",
    "~/.cache/uv",
    "~/.npm",
    "~/go/pkg/mod"
  ]);
  if (writableRoots.size !== expectedWritableRoots.size
      || [...writableRoots].some(root => !expectedWritableRoots.has(root))) {
    fail("project_execution.writable_roots must declare exactly the supported user-scoped cache paths");
  }
  const allowedSourceModels = assertUniqueStringArray(contract.allowed_source_models, "allowed_source_models", { nonEmpty: true });
  const allowedSourceEfforts = assertUniqueStringArray(contract.allowed_source_efforts, "allowed_source_efforts", { nonEmpty: true });
  const allowedRuntimeReasoningEfforts = assertUniqueStringArray(contract.allowed_runtime_reasoning_efforts, "allowed_runtime_reasoning_efforts", { nonEmpty: true });
  const projectionTiers = validateProjectionTiers(contract, allowedSourceModels, allowedSourceEfforts);
  if (!Array.isArray(contract.agents) || contract.agents.length === 0) fail("agents must be a non-empty array");

  const names = new Set();
  const outputPaths = new Set();
  const usedProjectionTiers = new Set();
  const validatedAgents = [];
  for (const agent of contract.agents) {
    for (const field of ["name", "description", "semantic_source", "sandbox_mode", "instruction_source", "output_path"]) {
      assertNonEmptyString(agent[field], `${agent.name ?? "agent"}.${field}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(agent.name)) fail(`${agent.name}: invalid name`);
    if (names.has(agent.name)) fail(`${agent.name}: duplicate name`);
    names.add(agent.name);
    if (!allowedSandboxModes.has(agent.sandbox_mode)) fail(`${agent.name}: unsupported sandbox mode ${agent.sandbox_mode}`);
    const capabilities = assertUniqueStringArray(agent.capabilities, `${agent.name}.capabilities`, { nonEmpty: true });
    for (const capability of capabilities) {
      if (!allowedCapabilities.has(capability)) fail(`${agent.name}: unsupported capability ${capability}`);
    }
    let capabilityProfile = null;
    if (agent.capability_profile !== undefined) {
      assertNonEmptyString(agent.capability_profile, `${agent.name}.capability_profile`);
      capabilityProfile = capabilityProfiles.get(agent.capability_profile);
      if (!capabilityProfile) fail(`${agent.name}: unsupported capability profile ${agent.capability_profile}`);
      if (agent.sandbox_mode !== "read-only") {
        fail(`${agent.name}: capability profile ${agent.capability_profile} requires read-only sandbox mode`);
      }
    }

    const expectedSemanticSource = `agents/${agent.name}.md`;
    if (agent.semantic_source !== expectedSemanticSource) fail(`${agent.name}: semantic_source must be ${expectedSemanticSource}`);
    const semanticPath = repositoryPath(rootDir, agent.semantic_source, `${agent.name}.semantic_source`);
    let semanticFields;
    try {
      semanticFields = parseSemanticFrontmatter(await readFile(semanticPath, "utf8"), agent.semantic_source);
    } catch (error) {
      if (error.message.startsWith("codex-runtime:")) throw error;
      fail(`${agent.name}: cannot read semantic source: ${error.message}`);
    }
    if (semanticFields.get("name") !== agent.name) fail(`${agent.name}: semantic source name does not match`);
    const sourceModel = semanticFields.get("model");
    const sourceEffort = semanticFields.get("effort");
    if (!allowedSourceModels.has(sourceModel)) fail(`${agent.name}: unsupported semantic model ${sourceModel ?? "missing"}`);
    if (!allowedSourceEfforts.has(sourceEffort)) fail(`${agent.name}: unsupported semantic effort ${sourceEffort ?? "missing"}`);
    const matches = projectionTiers.filter(tier => tier.sourceModels.has(sourceModel) && tier.sourceEfforts.has(sourceEffort));
    if (matches.length !== 1) fail(`${agent.name}: semantic model/effort must map to exactly one projection tier (matched ${matches.length})`);

    const expectedSource = `runtime/codex/instructions/${agent.name}.md`;
    if (agent.instruction_source !== expectedSource) fail(`${agent.name}: instruction_source must be ${expectedSource}`);
    repositoryPath(rootDir, agent.instruction_source, `${agent.name}.instruction_source`);
    const expectedOutput = `.codex/agents/${agent.name}.toml`;
    if (agent.output_path !== expectedOutput) fail(`${agent.name}: output_path must be ${expectedOutput}`);
    const resolvedOutput = repositoryPath(rootDir, agent.output_path, `${agent.name}.output_path`);
    if (outputPaths.has(resolvedOutput)) fail(`${agent.name}: duplicate output_path`);
    outputPaths.add(resolvedOutput);
    usedProjectionTiers.add(matches[0].name);
    validatedAgents.push({ ...agent, capabilityProfile, projectionTier: matches[0].name, sourceModel, sourceEffort });
  }

  const semanticRoster = [];
  let semanticEntries;
  try {
    semanticEntries = await readdir(join(rootDir, "agents"), { withFileTypes: true });
  } catch (error) {
    fail(`cannot read canonical agent roster: ${error.message}`);
  }
  const semanticFilenames = semanticEntries
    .filter(entry => entry.isFile()
      && entry.name.endsWith(".md")
      && entry.name !== "README.md"
      && !entry.name.startsWith("ref-"))
    .map(entry => entry.name)
    .sort();
  for (const filename of semanticFilenames) {
    const expectedName = filename.slice(0, -3);
    const source = `agents/${filename}`;
    let semanticFields;
    try {
      semanticFields = parseSemanticFrontmatter(
        await readFile(repositoryPath(rootDir, source, `${expectedName}.semantic_source`), "utf8"),
        source
      );
    } catch (error) {
      if (error.message.startsWith("codex-runtime:")) throw error;
      fail(`${expectedName}: cannot read semantic source: ${error.message}`);
    }
    if (semanticFields.get("name") !== expectedName) fail(`${expectedName}: semantic source name does not match`);
    const sourceModel = semanticFields.get("model");
    const sourceEffort = semanticFields.get("effort");
    if (!allowedSourceModels.has(sourceModel)) fail(`${expectedName}: unsupported semantic model ${sourceModel ?? "missing"}`);
    if (!allowedSourceEfforts.has(sourceEffort)) fail(`${expectedName}: unsupported semantic effort ${sourceEffort ?? "missing"}`);
    const matches = projectionTiers.filter(tier => tier.sourceModels.has(sourceModel) && tier.sourceEfforts.has(sourceEffort));
    if (matches.length !== 1) fail(`${expectedName}: semantic model/effort must map to exactly one projection tier (matched ${matches.length})`);
    usedProjectionTiers.add(matches[0].name);
    semanticRoster.push({ name: expectedName, projectionTier: matches[0].name, sourceModel, sourceEffort });
  }
  for (const name of names) {
    if (!semanticRoster.some(agent => agent.name === name)) fail(`${name}: missing from canonical agent roster`);
  }

  const selectedProfileName = profileName ?? contract.default_profile;
  const profile = validateProfile(contract, selectedProfileName, usedProjectionTiers, allowedRuntimeReasoningEfforts);
  const files = new Map();
  for (const agent of validatedAgents) {
    const sourcePath = repositoryPath(rootDir, agent.instruction_source, `${agent.name}.instruction_source`);
    let instructions;
    try {
      instructions = (await readFile(sourcePath, "utf8")).trim();
    } catch (error) {
      fail(`${agent.name}: cannot read instruction source: ${error.message}`);
    }
    if (instructions === "") fail(`${agent.name}: instruction source is empty`);

    const generated = [
      "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
      `# Instruction source: ${agent.instruction_source}`,
      `# Semantic source: ${agent.semantic_source} (${agent.sourceModel}/${agent.sourceEffort})`,
      `# Projection tier: ${agent.projectionTier}; profile: ${selectedProfileName}`,
      `name = ${JSON.stringify(agent.name)}`,
      `description = ${JSON.stringify(agent.description)}`,
      ...(profile.inherit_parent ? [] : [
        `model = ${JSON.stringify(profile.tiers[agent.projectionTier].model)}`,
        `model_reasoning_effort = ${JSON.stringify(profile.tiers[agent.projectionTier].reasoning_effort)}`
      ]),
      `sandbox_mode = ${JSON.stringify(agent.sandbox_mode)}`,
      `developer_instructions = ${JSON.stringify(instructions)}`,
      ...(agent.capabilityProfile ? [
        "",
        "[capabilities]",
        `default = ${JSON.stringify(agent.capabilityProfile.default)}`,
        `allow = [${agent.capabilityProfile.allow.map(capability => JSON.stringify(capability)).join(", ")}]`
      ] : []),
      ""
    ].join("\n");
    files.set(repositoryPath(rootDir, agent.output_path, `${agent.name}.output_path`), generated);
    files.set(join(rootDir, "plugins/team-harness/skills/setup/assets/agents", `${agent.name}.toml`), generated);
  }

  const config = [
    "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
    `sandbox_mode = ${JSON.stringify(projectExecution.sandbox_mode)}`,
    `approval_policy = ${JSON.stringify(projectExecution.approval_policy)}`,
    "",
    "[sandbox_workspace_write]",
    `network_access = ${projectExecution.network_access}`,
    `writable_roots = [${[...writableRoots].map(root => JSON.stringify(root)).join(", ")}]`,
    "",
    "[agents]",
    "enabled = true",
    `max_concurrent_threads_per_session = ${contract.max_concurrent_threads_per_session}`,
    "interrupt_message = true",
    ""
  ].join("\n");
  files.set(join(rootDir, ".codex/config.toml"), config);

  const rosterRows = semanticRoster.map(agent => {
    const mapping = profile.inherit_parent
      ? { model: "inherits parent", reasoning_effort: "inherits parent" }
      : profile.tiers[agent.projectionTier];
    const codexSurface = names.has(agent.name)
      ? "installed custom agent"
      : agent.name === "orchestrator"
        ? "Main via `init` / `pipeline` skills"
        : "not shipped in Codex beta";
    return `| \`${agent.name}\` | \`${agent.sourceModel}\` | \`${agent.sourceEffort}\` | \`${mapping.model}\` | \`${mapping.reasoning_effort}\` | ${codexSurface} |`;
  });
  const roster = [
    "# Team Harness Codex agents",
    "",
    "<!-- Code generated from runtime/schema/codex-agents.json; DO NOT EDIT. -->",
    "",
    "## Improve Team Harness from Codex",
    "",
    "Start Codex from the repository root. Use `@Team-Harness init <request>` for lightweight intake or a small bounded improvement; it stays in Main without creating pipeline state or spawning specialists. Use `@Team-Harness pipeline <request>` only when you explicitly want the full gated workflow.",
    "",
    "Author shared role intent in `agents/*.md`. Codex model and effort values are projected from that frontmatter, while Codex-specific execution instructions live in `runtime/codex/instructions/*.md` and workflow adapters live in `plugins/team-harness/skills/`. A semantic prompt change is not translated automatically into those adapters, so review both surfaces when behavior should change in Claude Code and Codex.",
    "",
    "After changing any canonical agent's model or effort, one of the eleven installed role contracts, a Codex instruction adapter, or `runtime/schema/codex-agents.json`, run `$sync-codex-agents`. The equivalent repository commands are:",
    "",
    "```bash",
    "node tools/codex-runtime/generate.mjs",
    "node tools/codex-runtime/generate.mjs --check",
    "node tools/codex-runtime/test_generate.mjs",
    "bash tests/run-all.sh",
    "```",
    "",
    "Read `CONTRIBUTING.md` for the cross-runtime change matrix and `docs/codex-runtime.md` for packaging, local installation, and the complete validation set. Do not edit this generated roster, `.codex/agents/*.toml`, or `plugins/team-harness/skills/setup/assets/agents/*.toml` directly.",
    "",
    "## Canonical roster and Codex availability",
    "",
    `Generated with the \`${selectedProfileName}\` profile. This table includes every canonical Team Harness agent so missing Codex coverage is visible. A projected model/effort is the mapping the role would receive; only rows marked as installed have a generated custom-agent TOML in this beta.`,
    "",
    "| Agent | Canonical Claude model | Canonical source effort | Codex model | Codex effort | Codex availability |",
    "|---|---|---|---|---|---|",
    ...rosterRows,
    ""
  ].join("\n");
  files.set(join(rootDir, ".codex/README.md"), roster);
  return { files, outputDirs, profileName: selectedProfileName };
}

export async function generate({ check = false, rootDir = repositoryRoot, profileName } = {}) {
  const { files, outputDirs } = await render({ rootDir, profileName });
  const expected = new Set(files.keys());
  const stalePaths = [];
  const extraPaths = [];

  for (const [path, content] of files) {
    let current = null;
    try { current = await readFile(path, "utf8"); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current !== content) stalePaths.push(path);
  }
  for (const outputDir of outputDirs) {
    try {
      for (const entry of await readdir(outputDir, { withFileTypes: true })) {
        const path = join(outputDir, entry.name);
        if (entry.name.endsWith(".toml") && !expected.has(path)) extraPaths.push(path);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  if (check) {
    for (const path of stalePaths) process.stderr.write(`stale: ${relative(rootDir, path)}\n`);
    for (const path of extraPaths) process.stderr.write(`unexpected: ${relative(rootDir, path)}\n`);
    if (stalePaths.length > 0 || extraPaths.length > 0) fail("generated Codex artifacts are stale");
    return;
  }
  if (extraPaths.length > 0) fail(`unexpected generated agent ${relative(rootDir, extraPaths[0])}`);
  for (const path of stalePaths) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, files.get(path));
  }
}

function parseArguments(args) {
  let check = false;
  let profileName;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") check = true;
    else if (argument === "--profile") {
      profileName = args[index + 1];
      if (!profileName || profileName.startsWith("--")) fail("--profile requires a value");
      index += 1;
    } else fail(`unknown argument ${argument}`);
  }
  return { check, profileName };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  Promise.resolve()
    .then(() => generate(parseArguments(process.argv.slice(2))))
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
