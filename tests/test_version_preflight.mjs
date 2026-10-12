import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "tools", "codex-runtime", "version-preflight.mjs");
const sites = {
  claude: ".claude-plugin/plugin.json",
  marketplace: ".claude-plugin/marketplace.json",
  codex: "plugins/team-harness/.codex-plugin/plugin.json",
  installer: "cmd/install/main.go",
};

function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: os.devNull, GIT_CONFIG_GLOBAL: os.devNull };
}

async function fixture({ includeCodex = true, includeInstaller = true, initialDistributedFile = null, initialVersion = "1.2.3" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "th-version-preflight-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore", env: fixtureEnv() });
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  if (includeCodex) await mkdir(path.dirname(path.join(root, sites.codex)), { recursive: true });
  if (includeInstaller) await mkdir(path.dirname(path.join(root, sites.installer)), { recursive: true });
  await writeFile(path.join(root, sites.claude), JSON.stringify({ version: initialVersion }, null, 2) + "\n");
  await writeFile(path.join(root, sites.marketplace), JSON.stringify({
    version: "8.0.0",
    plugins: [{ version: initialVersion }],
  }, null, 2) + "\n");
  if (includeCodex) await writeFile(path.join(root, sites.codex), JSON.stringify({ version: initialVersion }, null, 2) + "\n");
  if (includeInstaller) await writeFile(path.join(root, sites.installer), `package main\nvar version = "${initialVersion}"\n`);
  if (initialDistributedFile) {
    const initialPath = path.join(root, initialDistributedFile);
    await mkdir(path.dirname(initialPath), { recursive: true });
    await writeFile(initialPath, "before move\n");
  }
  await writeFile(path.join(root, "CHANGELOG.md"), `# Changelog\n\n## [${initialVersion}] - 2026-01-01\n`);
  await writeFile(path.join(root, "README.md"), "baseline\n");
  git("init", "-q", "--template=");
  git("config", "user.email", "version-preflight@example.invalid");
  git("config", "user.name", "Version Preflight Test");
  git("add", ".");
  git("commit", "-qm", "baseline");
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", env: fixtureEnv() }).trim();
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
    env: { ...fixtureEnv(), ...extraEnv },
  });
}

let caseNumber = 0;
async function withFixture(callback, options = {}) {
  caseNumber += 1;
  return test(options.name || `release contract fixture ${caseNumber}`, async () => {
    const f = await fixture(options);
    try {
      await callback(f);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
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

for (const relative of [
  "installer-assets/opencode-skills/example/SKILL.md",
  "installer-assets/opencode-commands/th-example.md",
  "runtime/package-ownership.json",
  "bin/install.sh",
  "bin/install.ps1",
  "bin/install.cmd",
  "bin/install-opencode.sh",
  "bin/install-opencode.ps1",
  "bin/update-opencode.sh",
  "bin/update-opencode.ps1",
]) {
  await withFixture(async (f) => {
    await writeFile(path.join(f.root, relative), "changed shipped asset\n");
    commit(f, "unversioned shipped asset edit");
    const result = invoke(f);
    assert.notEqual(result.status, 0, `${relative} was accepted without a release`);
    assert.match(result.stderr, /strictly greater/i);
  }, { initialDistributedFile: relative, name: `requires a release for ${relative} edits` });
}

for (const relative of [
  "skills/example/SKILL.md",
  "installer-assets/opencode-skills/example/SKILL.md",
  "installer-assets/opencode-commands/th-example.md",
  "bin/install-opencode.sh",
]) {
  for (const operation of ["delete", "move"]) {
    await withFixture(async (f) => {
      if (operation === "delete") {
        await rm(path.join(f.root, relative));
      } else {
        await mkdir(path.join(f.root, "docs"), { recursive: true });
        await rename(path.join(f.root, relative), path.join(f.root, "docs/moved-asset.md"));
      }
      commit(f, `${operation} shipped asset`);
      const result = invoke(f);
      assert.notEqual(result.status, 0, `${relative} ${operation} bypassed the release contract`);
      assert.match(result.stderr, /strictly greater/i);
    }, { initialDistributedFile: relative, name: `requires a release to ${operation} ${relative}` });
  }
}

for (const relative of ["bin/README.md", "docs/example.md", "tests/example.mjs", "cmd/install/example_test.go"]) {
  await withFixture(async (f) => {
    await mkdir(path.dirname(path.join(f.root, relative)), { recursive: true });
    await writeFile(path.join(f.root, relative), "documentation or test-only change\n");
    commit(f, "no distributed change");
    const result = invoke(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No release metadata change required/);
  }, { name: `does not require a release for ${relative}` });
}

for (const [baseVersion, headVersion, accepted] of [
  ["1.2.3-alpha", "1.2.3-alpha.1", true],
  ["1.2.3-alpha.1", "1.2.3-alpha.beta", true],
  ["1.2.3-beta.2", "1.2.3-beta.11", true],
  ["1.2.3-beta.11", "1.2.3-rc.1", true],
  ["1.2.3-rc.1", "1.2.3", true],
  ["1.2.3", "1.2.3-rc.1", false],
  ["1.2.3-beta.11", "1.2.3-beta.2", false],
  ["1.2.3+first", "1.2.3+second", false],
  ["1.2.3-beta.2+first", "1.2.3-beta.2+second", false],
  ["1.2.3+first", "1.2.4+second", true],
]) {
  await withFixture(async (f) => {
    await changeVersion(f, headVersion);
    commit(f, "semver precedence change");
    const result = invoke(f);
    if (accepted) assert.equal(result.status, 0, result.stderr);
    else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /strictly greater/i);
    }
  }, { initialVersion: baseVersion, name: `${accepted ? "accepts" : "rejects"} SemVer ${baseVersion} -> ${headVersion}` });
}

for (const version of ["01.2.4", "1.2.4-01", "1.2.4-", "1.2.4+", "1.2.4+a..b"]) {
  await withFixture(async (f) => {
    await changeVersion(f, version);
    commit(f, "invalid semantic version");
    const result = invoke(f);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid SemVer/i);
  }, { name: `rejects malformed SemVer ${version}` });
}

await withFixture(async (f) => {
  await changeVersion(f, "1.2.4");
  await writeFile(path.join(f.root, "CHANGELOG.md"), "# Changelog\n\n## [1.2.5] - 2026-01-02\n");
  commit(f, "wrong changelog release");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHANGELOG\.md.*1\.2\.4/i);
}, { name: "rejects a changed changelog heading for a different version" });

await withFixture(async (f) => {
  await changeVersion(f, "1.2.4");
  commit(f, "committed valid release");
  const head = gitText(f, "rev-parse", "HEAD");
  await writeFile(path.join(f.root, sites.claude), "uncommitted broken metadata\n");
  await writeFile(path.join(f.root, "CHANGELOG.md"), "uncommitted broken changelog\n");
  const before = gitText(f, "status", "--porcelain");
  const result = invoke(f, [], { BASE_SHA: f.base, HEAD_SHA: head });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\.2\.3 -> 1\.2\.4/);
  assert.equal(gitText(f, "status", "--porcelain"), before);
  assert.equal(gitText(f, "rev-parse", "HEAD"), head);
  assert.equal(await readFile(path.join(f.root, sites.claude), "utf8"), "uncommitted broken metadata\n");
}, { name: "reads only committed inputs and preserves dirty worktree state" });

await withFixture(async (f) => {
  await mkdir(path.join(f.root, "skills/example"), { recursive: true });
  await writeFile(path.join(f.root, "skills/example/SKILL.md"), "unversioned committed change\n");
  commit(f, "committed distributed edit");
  await changeVersion(f, "1.2.4");
  const result = invoke(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strictly greater/i);
}, { name: "uncommitted release metadata cannot satisfy a committed distributed change" });

await withFixture(async (f) => {
  const missingHead = invoke(f, ["--base", f.base, "--head", "missing-ref"]);
  assert.notEqual(missingHead.status, 0);
  assert.match(missingHead.stderr, /Head ref does not resolve/i);
  const blob = gitText(f, "rev-parse", "HEAD:README.md");
  const nonCommit = invoke(f, ["--base", f.base, "--head", blob]);
  assert.notEqual(nonCommit.status, 0);
  assert.match(nonCommit.stderr, /Head ref does not resolve/i);
}, { name: "rejects missing and non-commit head refs" });

await withFixture(async (f) => {
  const brokenCommit = execFileSync("git", ["hash-object", "-t", "commit", "--literally", "-w", "--stdin"], {
    cwd: f.root,
    env: fixtureEnv(),
    encoding: "utf8",
    input: "tree ffffffffffffffffffffffffffffffffffffffff\nauthor Test <test@example.invalid> 0 +0000\ncommitter Test <test@example.invalid> 0 +0000\n\nunreadable tree\n",
  }).trim();
  const result = invoke(f, ["--base", f.base, "--head", brokenCommit]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unable to diff base and head commits/i);
}, { name: "fails closed when valid commit objects cannot be diffed" });

function gitText(f, ...args) {
  return execFileSync("git", args, { cwd: f.root, encoding: "utf8", env: fixtureEnv() }).trim();
}

async function removeLooseBlob(f, ref, file) {
  const oid = gitText(f, "rev-parse", `${ref}:${file}`);
  const object = path.join(f.root, ".git", "objects", oid.slice(0, 2), oid.slice(2));
  await rm(object);
  return object;
}

for (const optionalSite of [sites.codex, sites.installer]) {
  await withFixture(async (f) => {
    if (optionalSite === sites.codex) {
      await writeFile(path.join(f.root, optionalSite), JSON.stringify({ version: "1.2.3", optional: true }) + "\n");
      f.git("add", ".");
      f.git("commit", "--amend", "-qm", "distinct optional metadata");
      f.base = gitText(f, "rev-parse", "HEAD");
    }
    await changeVersion(f, "1.2.4");
    commit(f, "valid release before optional-object loss");
    assert.equal(invoke(f).status, 0);
    await removeLooseBlob(f, f.base, optionalSite);
    await removeLooseBlob(f, "HEAD", optionalSite);
    const result = invoke(f);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /missing|unreadable|unable/i);
  }, { name: `rejects unreadable optional metadata objects: ${optionalSite}` });
}

await withFixture(async (f) => {
  await changeVersion(f, "1.2.4");
  commit(f, "valid release with trusted diff configuration");
  const marker = path.join(f.root, "driver-ran");
  const driver = path.join(f.root, "side-effect-driver.mjs");
  await writeFile(driver, `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "ran"); process.exit(1);\n`);
  const command = `"${process.execPath.replaceAll("\\", "/")}" "${driver.replaceAll("\\", "/")}"`;
  f.git("config", "diff.external", command);
  f.git("config", "diff.trustExitCode", "true");
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
}, { name: "does not execute trusted external diff helpers" });

await withFixture(async (f) => {
  await writeFile(path.join(f.root, sites.codex), JSON.stringify({ version: "1.2.3", optional: true }) + "\n");
  f.git("add", ".");
  f.git("commit", "--amend", "-qm", "distinct optional metadata");
  f.base = gitText(f, "rev-parse", "HEAD");
  await changeVersion(f, "1.2.4");
  commit(f, "valid release before promisor-object loss");
  const remote = path.join(f.root, ".git", "recovery.git");
  f.git("clone", "--bare", "--no-local", f.root, remote);
  f.git("remote", "add", "recovery", remote);
  f.git("config", "remote.recovery.promisor", "true");
  f.git("config", "remote.recovery.partialCloneFilter", "blob:none");
  const object = await removeLooseBlob(f, "HEAD", sites.codex);
  const result = invoke(f, undefined, { GIT_NO_LAZY_FETCH: "0" });
  assert.notEqual(result.status, 0, result.stdout);
  await assert.rejects(readFile(object), { code: "ENOENT" });
}, { name: "does not fetch missing objects from a local promisor remote" });

await test("fixture Git operations ignore ambient signing and repository overrides", async () => {
  const overrides = {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "commit.gpgSign",
    GIT_CONFIG_VALUE_0: "true",
    GIT_DIR: path.join(os.tmpdir(), "th-nonexistent-ambient-git-dir"),
  };
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  let f;
  try {
    Object.assign(process.env, overrides);
    f = await fixture();
    await changeVersion(f, "1.2.4");
    commit(f, "valid release under hostile ambient configuration");
    const result = invoke(f);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (f) await rm(f.root, { recursive: true, force: true });
  }
});
