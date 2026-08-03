#!/usr/bin/env node
/** Hermetic coverage for the provenance-only Codex A/B pre-measurement runner. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFile,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_PIPELINE_ROSTER,
  RECEIPT_KIND,
  RECEIPT_SCHEMA_VERSION,
  containsExplicitPipelineInvocation,
  hashDirectoryTree,
  isProvenanceReceipt,
  isSafeRunRootPath,
  sha256Hex,
} from "./benchmark_codex_pipeline_efficiency.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(testDirectory, "benchmark_codex_pipeline_efficiency.mjs");
const failures = [];

async function check(name, callback) {
  try {
    await callback();
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  [FAIL] ${name}: ${error instanceof Error ? error.message : "unexpected failure"}`);
  }
}

async function temporaryRoot(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "th-benchmark-test-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function newRunRoot() {
  return mkdtemp("/tmp/team-harness-codex-efficiency-ab.");
}

async function makeSource(root, name, version, marker) {
  const plugin = path.join(root, "plugins", "team-harness");
  await mkdir(path.join(plugin, ".codex-plugin"), { recursive: true });
  await mkdir(path.join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(path.join(root, ".codex", "agents"), { recursive: true });
  await writeFile(
    path.join(plugin, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "team-harness", version }),
  );
  await writeFile(path.join(plugin, "marker.txt"), `${marker}\n`);
  await writeFile(
    path.join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify({
      name: "team-harness",
      plugins: [{ name: "team-harness", source: { source: "local", path: "./plugins/team-harness" } }],
    }),
  );
  await Promise.all(
    EXPECTED_PIPELINE_ROSTER.map((agent) => writeFile(
      path.join(root, ".codex", "agents", agent),
      `generated ${name} ${agent}\n`,
    )),
  );
  return root;
}

async function makeFakeCodex(root, mode = "success") {
  const executable = path.join(root, `fake-codex-ARGV_SECRET_${mode}.mjs`);
  const script = `#!/usr/bin/env node
import { appendFile, cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
const home = process.env.CODEX_HOME;
if (!home || process.env.HOME !== home || process.env.OPENAI_API_KEY) process.exit(91);
process.stderr.write("CHILD_STREAM_SECRET_CANARY\\n");
const state = path.join(home, "plugins", "marketplaces", "team-harness", "source.txt");
await writeFile(path.join(home, "config.toml"), "# isolated Codex configuration\\n");
await mkdir(path.join(home, "tmp", "arg0"), { recursive: true });
await mkdir(path.join(home, ".tmp", "marketplaces"), { recursive: true });

if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("codex 9.9.9\\n");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add" && args[4] === "--json") {
  await mkdir(path.dirname(state), { recursive: true });
  await writeFile(state, args[3]);
  process.stdout.write("{}\\n");
} else if (args[0] === "plugin" && args[1] === "add" && args[2] === "team-harness@team-harness" && args[3] === "--json") {
  const source = await readFile(state, "utf8");
  const manifest = JSON.parse(await readFile(path.join(source, "plugins", "team-harness", ".codex-plugin", "plugin.json"), "utf8"));
  const installed = path.join(home, "plugins", "cache", "team-harness", "team-harness", manifest.version);
  await mkdir(path.dirname(installed), { recursive: true });
  await cp(path.join(source, "plugins", "team-harness"), installed, { recursive: true, force: false });
  if (mode === "installed-mismatch") await appendFile(path.join(installed, "marker.txt"), "mismatch\\n");
  if (mode === "unexpected-home") await writeFile(path.join(home, "auth.json"), "not-an-auth-copy");
  if (mode === "config-symlink") {
    const outsideConfig = path.join(path.dirname(home), "outside-config");
    await writeFile(outsideConfig, "outside");
    await rm(path.join(home, "config.toml"));
    await symlink(outsideConfig, path.join(home, "config.toml"));
  }
  if (mode === "tmp-marketplace-file") {
    await writeFile(path.join(home, ".tmp", "marketplaces", "unexpected"), "unexpected");
  }
  if (mode === "tmp-extra-child") {
    await mkdir(path.join(home, "tmp", "unexpected"));
  }
  if (mode === "tmp-arg0-content") {
    await writeFile(path.join(home, "tmp", "arg0", "unexpected"), "unexpected");
  }
  if (mode === "tmp-arg0-symlink") {
    const outsideTemporaryArg0 = path.join(path.dirname(home), "outside-tmp-arg0");
    await mkdir(outsideTemporaryArg0);
    await rm(path.join(home, "tmp", "arg0"), { recursive: true });
    await symlink(outsideTemporaryArg0, path.join(home, "tmp", "arg0"));
  }
  if (mode === "dot-tmp-symlink") {
    const outsideTemporary = path.join(path.dirname(home), "outside-dot-tmp");
    await mkdir(outsideTemporary);
    await rm(path.join(home, ".tmp"), { recursive: true });
    await symlink(outsideTemporary, path.join(home, ".tmp"));
  }
  if (mode === "marketplaces-symlink") {
    const outsideMarketplaces = path.join(path.dirname(home), "outside-marketplaces");
    await mkdir(outsideMarketplaces);
    await rm(path.join(home, ".tmp", "marketplaces"), { recursive: true });
    await symlink(outsideMarketplaces, path.join(home, ".tmp", "marketplaces"));
  }
  let receiptInstalledPath = installed;
  if (mode === "path-escape") {
    receiptInstalledPath = path.join(path.dirname(home), "outside-installed-cache");
    await mkdir(receiptInstalledPath, { recursive: true });
  }
  process.stdout.write(JSON.stringify({
    pluginId: "team-harness@team-harness",
    name: "team-harness",
    marketplaceName: "team-harness",
    version: manifest.version,
    installedPath: receiptInstalledPath,
    authPolicy: "none",
  }) + "\\n");
} else if (args[0] === "plugin" && args[1] === "list" && args[2] === "--json") {
  if (mode === "malformed-plugin-list") {
    process.stdout.write("{ definitely-not-json");
  } else {
    const source = await readFile(state, "utf8");
    const manifest = JSON.parse(await readFile(path.join(source, "plugins", "team-harness", ".codex-plugin", "plugin.json"), "utf8"));
    const listedVersion = mode === "add-list-conflict" ? "2.0.0" : manifest.version;
    const listedSource = mode === "provenance-mismatch" ? path.join(source, "plugins") : path.join(source, "plugins", "team-harness");
    const marketplaceSource = mode === "provenance-mismatch" ? path.join(source, "plugins") : source;
    const installedEntries = [{
        pluginId: "team-harness@team-harness",
        name: "team-harness",
        marketplaceName: "team-harness",
        version: listedVersion,
        installed: mode !== "uninstalled-plugin",
        enabled: mode !== "disabled-plugin",
        source: { source: "local", path: listedSource },
        marketplaceSource: { sourceType: "local", source: marketplaceSource },
      }];
    if (mode === "duplicate-plugin") installedEntries.push({ ...installedEntries[0] });
    process.stdout.write(JSON.stringify({
      installed: installedEntries,
      available: [],
    }) + "\\n");
  }
} else {
  process.exit(92);
}
`;
  await writeFile(executable, script, { mode: 0o700 });
  await chmod(executable, 0o700);
  return executable;
}

async function makeInputs(root, { mode = "success", prompt = "PRIVATE_PROMPT_SECRET @Team-Harness pipeline: start\n" } = {}) {
  const baseline = await makeSource(path.join(root, "baseline-SOURCE_PATH_SECRET"), "baseline", "1.0.0", "baseline-marker");
  const candidate = await makeSource(path.join(root, "candidate-SOURCE_PATH_SECRET"), "candidate", "1.0.1", "candidate-marker");
  const promptFile = path.join(root, "prompt-PROMPT_PATH_SECRET.txt");
  await writeFile(promptFile, prompt);
  const codex = await makeFakeCodex(root, mode);
  const runRoot = await newRunRoot();
  return { baseline, candidate, promptFile, codex, runRoot };
}

function runRunnerArguments(args) {
  const result = spawnSync(process.execPath, [
    runner,
    ...args,
  ], {
    encoding: "utf8",
    env: { ...process.env, OPENAI_API_KEY: "ENV_SECRET_CANARY" },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  const receipt = JSON.parse(result.stdout);
  assert.equal(isProvenanceReceipt(receipt), true);
  return { ...result, receipt };
}

function runRunner(inputs) {
  return runRunnerArguments([
    "--baseline-source-root", inputs.baseline,
    "--candidate-source-root", inputs.candidate,
    "--run-root", inputs.runRoot,
    "--prompt-file", inputs.promptFile,
    "--codex", inputs.codex,
  ]);
}

async function cleanInputs(inputs) {
  await rm(inputs.runRoot, { recursive: true, force: true });
}

console.log("=== Codex pipeline-efficiency provenance runner ===");

await check("pure receipt and invocation guards are deterministic and closed", async () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(containsExplicitPipelineInvocation("@Team-Harness pipeline: begin"), true);
  assert.equal(containsExplicitPipelineInvocation("@Team-Harness pipeline-direct"), false);
  assert.equal(containsExplicitPipelineInvocation("use @Team-Harness init first"), false);
  assert.equal(isSafeRunRootPath("/tmp/team-harness-codex-efficiency-ab.safe_1"), true);
  assert.equal(isSafeRunRootPath("/tmp/not-the-runner-root"), false);
});

await check("entry-point guards fail closed before provenance work", async () => {
  const missingFlag = runRunnerArguments([]);
  assert.equal(missingFlag.status, 1);
  assert.equal(missingFlag.receipt.reason_code, "ARGUMENT_INVALID");

  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root);
    try {
      const outsideRunRoot = path.join(root, "outside-run-root");
      await mkdir(outsideRunRoot);
      const unsafe = runRunnerArguments([
        "--baseline-source-root", inputs.baseline,
        "--candidate-source-root", inputs.candidate,
        "--run-root", outsideRunRoot,
        "--prompt-file", inputs.promptFile,
        "--codex", inputs.codex,
      ]);
      assert.equal(unsafe.status, 1);
      assert.equal(unsafe.receipt.reason_code, "RUN_ROOT_UNSAFE");

      await writeFile(path.join(inputs.runRoot, "unexpected"), "x");
      const nonempty = runRunner(inputs);
      assert.equal(nonempty.status, 1);
      assert.equal(nonempty.receipt.reason_code, "RUN_ROOT_NOT_EMPTY");
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("success attests distinct local sources, isolated caches, and the six-agent roster", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root);
    try {
      const before = await hashDirectoryTree(path.join(inputs.baseline, "plugins", "team-harness"));
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 0);
      assert.equal(receipt.schema_version, RECEIPT_SCHEMA_VERSION);
      assert.equal(receipt.kind, RECEIPT_KIND);
      assert.equal(receipt.status, "PASS");
      assert.equal(receipt.reason_code, "MEASUREMENT_PERMITTED");
      assert.equal(receipt.codex_version, "9.9.9");
      assert.deepEqual(receipt.plugin_versions, { baseline: "1.0.0", candidate: "1.0.1" });
      assert.equal(receipt.distinct, true);
      assert.equal(receipt.explicit_pipeline, true);
      assert.equal(receipt.source_tree_hashes.baseline, before.hash);
      assert.equal(receipt.source_tree_hashes.baseline, receipt.installed_tree_hashes.baseline);
      assert.equal(receipt.source_tree_hashes.candidate, receipt.installed_tree_hashes.candidate);
      assert.notEqual(receipt.installed_tree_hashes.baseline, receipt.installed_tree_hashes.candidate);
      assert.deepEqual((await readdir(inputs.runRoot)).sort(), ["codex-home-baseline", "codex-home-candidate"]);
      for (const side of ["baseline", "candidate"]) {
        assert.deepEqual(
          (await readdir(path.join(inputs.runRoot, `codex-home-${side}`))).sort(),
          [".tmp", "agents", "config.toml", "plugins", "tmp"],
        );
        assert.deepEqual(
          await readdir(path.join(inputs.runRoot, `codex-home-${side}`, ".tmp")),
          ["marketplaces"],
        );
        assert.deepEqual(
          await readdir(path.join(inputs.runRoot, `codex-home-${side}`, ".tmp", "marketplaces")),
          [],
        );
        assert.deepEqual(
          await readdir(path.join(inputs.runRoot, `codex-home-${side}`, "tmp")),
          ["arg0"],
        );
        assert.deepEqual(
          await readdir(path.join(inputs.runRoot, `codex-home-${side}`, "tmp", "arg0")),
          [],
        );
        assert.deepEqual(
          (await readdir(path.join(inputs.runRoot, `codex-home-${side}`, "agents"))).sort(),
          [...EXPECTED_PIPELINE_ROSTER].sort(),
        );
      }
      const after = await hashDirectoryTree(path.join(inputs.baseline, "plugins", "team-harness"));
      assert.equal(after.hash, before.hash);
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("identical baseline and candidate plugin trees fail before creating homes", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root);
    try {
      await writeFile(path.join(inputs.candidate, "plugins", "team-harness", "marker.txt"), "baseline-marker\n");
      await writeFile(
        path.join(inputs.candidate, "plugins", "team-harness", ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "team-harness", version: "1.0.0" }),
      );
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.status, "FAIL");
      assert.equal(receipt.reason_code, "SOURCE_TREE_NOT_DISTINCT");
      assert.equal(receipt.distinct, false);
      assert.deepEqual(await readdir(inputs.runRoot), []);
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("an installed cache that differs from its source fails closed", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { mode: "installed-mismatch" });
    try {
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.reason_code, "INSTALLED_TREE_MISMATCH");
      assert.equal(receipt.installed_tree_hashes.baseline, null);
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("a prompt without an explicit live pipeline invocation cannot reach installation", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { prompt: "PRIVATE_PROMPT_SECRET direct mode only\n" });
    try {
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.reason_code, "PROMPT_NOT_PIPELINE");
      assert.equal(receipt.explicit_pipeline, false);
      assert.equal(receipt.prompt_digest, sha256Hex("PRIVATE_PROMPT_SECRET direct mode only\n"));
      assert.deepEqual(await readdir(inputs.runRoot), []);
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("source symlinks and installed cache escapes are rejected", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root);
    try {
      const outside = path.join(root, "outside");
      await writeFile(outside, "outside");
      await symlink(outside, path.join(inputs.candidate, "plugins", "team-harness", "escape"));
      const first = runRunner(inputs);
      assert.equal(first.status, 1);
      assert.equal(first.receipt.reason_code, "PATH_ESCAPE");
      assert.deepEqual(await readdir(inputs.runRoot), []);
    } finally {
      await cleanInputs(inputs);
    }
  });

  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { mode: "path-escape" });
    try {
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.reason_code, "INSTALLED_PATH_INVALID");
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("malformed plugin-list JSON fails without relaying the raw stream", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { mode: "malformed-plugin-list" });
    try {
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.reason_code, "PLUGIN_LIST_MALFORMED");
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("add/list conflicts, disabled or uninstalled entries, and provenance mismatches fail closed", async () => {
  for (const mode of ["add-list-conflict", "disabled-plugin", "uninstalled-plugin", "duplicate-plugin", "provenance-mismatch"]) {
    await temporaryRoot(async (root) => {
      const inputs = await makeInputs(root, { mode });
      try {
        const { status, receipt } = runRunner(inputs);
        assert.equal(status, 1, mode);
        assert.equal(receipt.reason_code, "PLUGIN_PROVENANCE_MISMATCH", mode);
      } finally {
        await cleanInputs(inputs);
      }
    });
  }
});

await check("receipt and process streams exclude prompt, argv/path, child-stream, and auth canaries", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { mode: "unexpected-home" });
    try {
      const result = runRunner(inputs);
      assert.equal(result.status, 1);
      assert.equal(result.receipt.reason_code, "HOME_UNEXPECTED_CONTENT");
      const visible = `${result.stdout}${result.stderr}`;
      for (const canary of [
        "PRIVATE_PROMPT_SECRET",
        "PROMPT_PATH_SECRET",
        "SOURCE_PATH_SECRET",
        "ARGV_SECRET",
        "CHILD_STREAM_SECRET_CANARY",
        "ENV_SECRET_CANARY",
        "definitely-not-json",
      ]) {
        assert.equal(visible.includes(canary), false);
      }
      assert.equal(visible.includes(inputs.runRoot), false);
      assert.equal(visible.includes(inputs.codex), false);
      assert.equal(Object.keys(result.receipt).sort().join(","), [
        "codex_version",
        "distinct",
        "explicit_pipeline",
        "installed_tree_hashes",
        "kind",
        "plugin_versions",
        "prompt_digest",
        "reason_code",
        "schema_version",
        "source_tree_hashes",
        "status",
      ].join(","));
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("the expected isolated config remains a bounded regular non-symlink file", async () => {
  await temporaryRoot(async (root) => {
    const inputs = await makeInputs(root, { mode: "config-symlink" });
    try {
      const { status, receipt } = runRunner(inputs);
      assert.equal(status, 1);
      assert.equal(receipt.reason_code, "PATH_ESCAPE");
    } finally {
      await cleanInputs(inputs);
    }
  });
});

await check("the isolated temporary layouts are closed to files, extra children, and symlinks", async () => {
  for (const [mode, expectedCode] of [
    ["tmp-marketplace-file", "HOME_UNEXPECTED_CONTENT"],
    ["tmp-extra-child", "HOME_UNEXPECTED_CONTENT"],
    ["tmp-arg0-content", "HOME_UNEXPECTED_CONTENT"],
    ["tmp-arg0-symlink", "PATH_ESCAPE"],
    ["dot-tmp-symlink", "PATH_ESCAPE"],
    ["marketplaces-symlink", "PATH_ESCAPE"],
  ]) {
    await temporaryRoot(async (root) => {
      const inputs = await makeInputs(root, { mode });
      try {
        const { status, receipt } = runRunner(inputs);
        assert.equal(status, 1, mode);
        assert.equal(receipt.reason_code, expectedCode, mode);
      } finally {
        await cleanInputs(inputs);
      }
    });
  }
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s): ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll provenance-runner checks passed.");
}
