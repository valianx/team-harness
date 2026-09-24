import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "tools", "codex-runtime", "version-preflight.mjs");
const sites = {
  claude: ".claude-plugin/plugin.json",
  marketplace: ".claude-plugin/marketplace.json",
  codex: "plugins/team-harness/.codex-plugin/plugin.json",
  installer: "cmd/install/main.go",
};

async function fixture({ includeCodex = true, includeInstaller = true, initialDistributedFile = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "th-version-preflight-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  if (includeCodex) await mkdir(path.dirname(path.join(root, sites.codex)), { recursive: true });
  if (includeInstaller) await mkdir(path.dirname(path.join(root, sites.installer)), { recursive: true });
  await writeFile(path.join(root, sites.claude), JSON.stringify({ version: "1.2.3" }, null, 2) + "\n");
  await writeFile(path.join(root, sites.marketplace), JSON.stringify({
    version: "8.0.0",
    plugins: [{ version: "1.2.3" }],
  }, null, 2) + "\n");
  if (includeCodex) await writeFile(path.join(root, sites.codex), JSON.stringify({ version: "1.2.3" }, null, 2) + "\n");
  if (includeInstaller) await writeFile(path.join(root, sites.installer), 'package main\nvar version = "1.2.3"\n');
  if (initialDistributedFile) {
    const initialPath = path.join(root, initialDistributedFile);
    await mkdir(path.dirname(initialPath), { recursive: true });
    await writeFile(initialPath, "before move\n");
  }
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## [1.2.3] - 2026-01-01\n");
  await writeFile(path.join(root, "README.md"), "baseline\n");
  git("init", "-q");
  git("config", "user.email", "version-preflight@example.invalid");
  git("config", "user.name", "Version Preflight Test");
  git("add", ".");
  git("commit", "-qm", "baseline");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return { root, base, git };
}

async function changeVersion(f, version, { changelog = true, sitesToUpdate = Object.values(sites) } = {}) {
  for (const relative of sitesToUpdate) {
    const absolute = path.join(f.root, relative);
    if (relative === sites.installer) {
      const old = await readFile(absolute, "utf8");
      await writeFile(absolute, old.replace(/var version = "[^"]+"/, `var version = "${version}"`));
      continue;
    }
    const parsed = JSON.parse(await readFile(absolute, "utf8"));
    if (relative === sites.marketplace) parsed.plugins[0].version = version;
    else parsed.version = version;
    await writeFile(absolute, JSON.stringify(parsed, null, 2) + "\n");
  }
  if (changelog) {
    await writeFile(path.join(f.root, "CHANGELOG.md"), `# Changelog\n\n## [${version}] - 2026-01-02\n`);
  }
}

function commit(f, message) {
  f.git("add", ".");
  f.git("commit", "-qm", message);
}

function invoke(f, args = ["--base", f.base, "--head", "HEAD"], extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: f.root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

async function withFixture(callback, options) {
  const f = await fixture(options);
  try {
    return await callback(f);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
}

await withFixture(async (f) => {
  await writeFile(path.join(f.root, "README.md"), "documentation-only edit\n");
  commit(f, "docs only");
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No release metadata change required/);
});

await withFixture(async (f) => {
  await mkdir(path.join(f.root, "docs"), { recursive: true });
  await rename(path.join(f.root, "skills/renamed.md"), path.join(f.root, "docs/renamed.md"));
  commit(f, "move file out of distributed tree");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strictly greater/i);
}, { initialDistributedFile: "skills/renamed.md" });

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
  commit(f, "distributed change without bump");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strictly greater/i);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.4");
  commit(f, "valid distributed release");
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\.2\.4/);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "agents/example.md")), { recursive: true });
  await writeFile(path.join(f.root, "agents/example.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.3");
  commit(f, "unchanged version");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strictly greater/i);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "agents/example.md")), { recursive: true });
  await writeFile(path.join(f.root, "agents/example.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.2");
  commit(f, "version downgrade");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strictly greater/i);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "agents/example.md")), { recursive: true });
  await writeFile(path.join(f.root, "agents/example.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.4", { sitesToUpdate: [sites.claude, sites.marketplace, sites.installer] });
  commit(f, "missing codex version update");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version sites disagree/i);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.4", { sitesToUpdate: [sites.claude, sites.marketplace] });
  commit(f, "historical two-site release");
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 present version sites/);
}, { includeCodex: false, includeInstaller: false });

for (const optionalSite of [sites.codex, sites.installer]) {
  await withFixture(async (f) => {
    await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
    await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
    const sitePath = path.join(f.root, optionalSite);
    await mkdir(path.dirname(sitePath), { recursive: true });
    if (optionalSite === sites.installer) await writeFile(sitePath, 'package main\nvar version = "1.2.4"\n');
    else await writeFile(sitePath, JSON.stringify({ version: "1.2.4" }, null, 2) + "\n");
    await changeVersion(f, "1.2.4", { sitesToUpdate: [sites.claude, sites.marketplace] });
    commit(f, `introduce optional version site: ${optionalSite}`);
    const result = invoke(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /3 present version sites/);
  }, { includeCodex: false, includeInstaller: false });
}

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
  await mkdir(path.dirname(path.join(f.root, sites.codex)), { recursive: true });
  await writeFile(path.join(f.root, sites.codex), JSON.stringify({ version: "1.2.3" }, null, 2) + "\n");
  await changeVersion(f, "1.2.4", { sitesToUpdate: [sites.claude, sites.marketplace] });
  commit(f, "introduce mismatched optional version site");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version sites disagree/i);
}, { includeCodex: false, includeInstaller: false });

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "skills/example/SKILL.md")), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.4");
  await rm(path.join(f.root, sites.codex));
  commit(f, "remove established optional version site");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exists at base and must remain present at head/i);
});

await withFixture(async (f) => {
  await mkdir(path.dirname(path.join(f.root, "agents/example.md")), { recursive: true });
  await writeFile(path.join(f.root, "agents/example.md"), "distributed behavior\n");
  await changeVersion(f, "1.2.4", { changelog: false });
  commit(f, "missing changelog heading");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHANGELOG\.md.*1\.2\.4/i);
});

await withFixture(async (f) => {
  await changeVersion(f, "1.2.4");
  await mkdir(path.dirname(path.join(f.root, "docs/release.md")), { recursive: true });
  await writeFile(path.join(f.root, "docs/release.md"), "release note\n");
  commit(f, "explicit release metadata edit");
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
});

await withFixture(async (f) => {
  await changeVersion(f, "not-semver");
  commit(f, "malformed release metadata");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /valid semver/i);
});

await withFixture(async (f) => {
  await writeFile(path.join(f.root, "README.md"), "docs\n");
  commit(f, "docs");
  const missingBase = invoke(f, ["--base", "missing-ref", "--head", "HEAD"]);
  assert.notEqual(missingBase.status, 0);
  assert.match(missingBase.stderr, /base.*resolve|diff.*failed/i);
  const noRefs = invoke(f, [], { BASE_SHA: "", HEAD_SHA: "" });
  assert.notEqual(noRefs.status, 0);
  assert.match(noRefs.stderr, /base.*head.*required/i);
});

process.stdout.write("version preflight tests passed\n");
