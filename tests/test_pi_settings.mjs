#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const moduleUrl = new URL("../runtime/pi/settings.mjs", import.meta.url);
const helper = fileURLToPath(moduleUrl);
const fixture = JSON.parse(await readFile(new URL("fixtures/workspace-preferences.json", import.meta.url), "utf8"));

async function temporary(run) {
  const root = await mkdtemp(join(tmpdir(), "th-pi-settings-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function cli(root, ...args) {
  return execute(process.execPath, [helper, ...args], {
    env: { ...process.env, PI_CODING_AGENT_DIR: root },
  });
}

test("Pi show uses its selected native root without creating settings or another host's files", async () => {
  await temporary(async root => {
    const selected = join(root, "selected 資料");
    const { stdout, stderr } = await cli(selected, "show");
    assert.equal(stderr, "");
    const shown = JSON.parse(stdout);
    assert.equal(shown.path, join(selected, ".team-harness.json"));
    assert.deepEqual(shown.config, {});
    assert.deepEqual(shown.workspace, {
      status: "selected", mode: "local", selected_from: "default", conflict: false, reason_code: null,
    });
    assert.deepEqual(await readdir(root), []);
  });
});

test("explicit native roots override environment roots and missing reads remain nonmutating", async () => {
  const { readSettings, resolveAgentDir } = await import(moduleUrl);
  await temporary(async root => {
    const native = join(root, "native");
    assert.equal(resolveAgentDir(native), native);
    assert.deepEqual(await readSettings(native), {});
    assert.deepEqual(await readdir(root), []);
    for (const invalid of ["relative", "", null, 23]) {
      assert.throws(() => resolveAgentDir(invalid), /agent directory/i);
    }
    assert.equal(resolveAgentDir(homedir()), homedir());
    assert.equal(resolveAgentDir(parse(root).root), parse(root).root);
    assert.equal(resolveAgentDir(join(root, "literal*directory")), join(root, "literal*directory"));
    const home = join(root, "home");
    const shown = await execute(process.execPath, [helper, "show"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: "", CODEX_HOME: join(root, "codex") },
    });
    assert.equal(JSON.parse(shown.stdout).path, join(home, ".pi/agent/.team-harness.json"));
    assert.deepEqual(await readdir(root), []);
  });
});

test("CLI and direct readers agree on a custom root while other native stores remain untouched", async () => {
  const { readSettings } = await import(moduleUrl);
  await temporary(async root => {
    const home = join(root, "home");
    const selected = join(root, "selected 資料");
    const sentinels = [join(home, ".pi/agent/.team-harness.json"), join(root, "codex/.team-harness.json"),
      join(root, "opencode/.team-harness.json")];
    for (const path of sentinels) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, '{"sentinel":"preserve exact bytes"}');
    }
    const result = await execute(process.execPath, [helper, "ensure", "--version", "3.49.0"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: selected,
        CODEX_HOME: join(root, "codex"), OPENCODE_CONFIG_DIR: join(root, "opencode") },
    });
    assert.equal(JSON.parse(result.stdout).path, join(selected, ".team-harness.json"));
    const direct = await readSettings(selected);
    assert.equal(direct["workspace-mode"], "local");
    assert.equal(direct.installed_version, "3.49.0");
    for (const path of sentinels) assert.equal(await readFile(path, "utf8"), '{"sentinel":"preserve exact bytes"}');
  });
});

test("all shared workspace representations survive reads and repeated maintenance", async () => {
  const { ensureSettings, readSettings, showSettings } = await import(moduleUrl);
  await temporary(async root => {
    for (const item of fixture.cases) {
      const selected = join(root, item.name);
      await mkdir(selected);
      const original = { ...item.config, opaque: { keep: [false, null, { note: "資料" }] }, english_learning: null };
      const originalBytes = `${JSON.stringify(original)}\n`;
      const path = join(selected, ".team-harness.json");
      await writeFile(path, originalBytes);
      const expected = { ...structuredClone(original), format_version: "1", installed_version: "3.49.0" };
      if (item.expected.selected_from === "default") {
        expected["workspace-mode"] = "local";
        expected["logs-mode"] = "local";
      }
      assert.deepEqual(await readSettings(selected), original, item.name);
      assert.equal(await readFile(path, "utf8"), originalBytes, item.name);
      assert.deepEqual((await showSettings(selected)).workspace, item.expected, item.name);
      const first = await ensureSettings(selected, { version: "3.49.0" });
      assert.equal(first.changed, true, item.name);
      const persisted = await readSettings(selected);
      assert.match(persisted.updated_at, /^\d{4}-\d\d-\d\dT/);
      delete persisted.updated_at;
      assert.deepEqual(persisted, expected, item.name);
      assert.equal(await readFile(`${path}.bak`, "utf8"), originalBytes, item.name);
      const stableBytes = await readFile(path, "utf8");
      assert.equal((await ensureSettings(selected, { version: "3.49.0" })).changed, false, item.name);
      assert.equal(await readFile(path, "utf8"), stableBytes, item.name);
      assert.deepEqual((await readSettings(selected)).opaque, original.opaque, item.name);
    }
  });
});

test("explicit grouped changes validate before publishing and preserve unrelated settings", async () => {
  const { setSettings, readSettings } = await import(moduleUrl);
  await temporary(async root => {
    const path = join(root, ".team-harness.json");
    const original = {
      "workspace-mode": "obsidian", "logs-mode": "local", "logs-path": "unavailable-old-path",
      "logs-subfolder": "old", obsidian_tasks: { enabled: false, vault: "retained" },
      github: { account_routes: [] }, opaque: { keep: true },
    };
    const before = `${JSON.stringify(original)}\n`;
    await writeFile(path, before);
    await assert.rejects(setSettings(root, { assignments: ['language="es"', 'workspace-mode="gpt-space"'] }), /workspace destination/i);
    assert.equal(await readFile(path, "utf8"), before);
    assert.deepEqual(await readdir(root), [".team-harness.json"]);
    await setSettings(root, { assignments: ['language="es"'] });
    assert.deepEqual((await readSettings(root))["workspace-mode"], "obsidian");
    assert.equal((await readSettings(root))["logs-mode"], "local");
    await setSettings(root, { assignments: [
      'workspace-mode="gpt-space"', 'workspace-space-id="space_1"', 'workspace-container-page-id="page_1"', "obsidian_tasks=true",
    ] });
    const remote = await readSettings(root);
    assert.equal(remote["workspace-mode"], "gpt-space");
    assert.equal(Object.hasOwn(remote, "logs-mode"), false);
    assert.equal(remote["logs-path"], original["logs-path"]);
    assert.deepEqual(remote.obsidian_tasks, { enabled: true, vault: "retained" });
    assert.deepEqual(remote.github, original.github);
    assert.deepEqual(remote.opaque, original.opaque);
    await setSettings(root, { assignments: ['logs-mode="local"'] });
    const local = await readSettings(root);
    assert.equal(local["workspace-mode"], "local");
    assert.equal(local["logs-mode"], "local");
    assert.equal(local["workspace-space-id"], "space_1");
    if (process.platform !== "win32") assert.equal((await lstat(path)).mode & 0o777, 0o600);
  });
});

test("invalid settings never partially write or expose rejected values", async () => {
  await temporary(async root => {
    const attempts = [
      ["set", "--set", 'workspace-mode="unknown_CANARY"'],
      ["set", "--set", 'language="es"', "--set", "english_learning=1"],
      ["set", "--set", "__proto__.polluted=true"],
      ["set", "--set", 'workspace-mode="local"', "--set", 'logs-mode="obsidian"'],
      ["set", "--set", 'workspace-space-id="https://CANARY.example/space"'],
      ["set", "--set", 'language="ghp_CANARYDO_NOTPRINT"'],
      ["set", "--set", "language=CANARY_INVALID_JSON"],
      ["ensure", "--version", "CANARY_INVALID_VERSION"],
    ];
    for (const args of attempts) {
      await assert.rejects(cli(join(root, "selected"), ...args), error => {
        assert.equal(error.code, 1);
        assert.equal(error.stdout, "");
        assert.equal(error.stderr.includes("CANARY"), false);
        assert.ok(error.stderr.length > 0 && error.stderr.length < 500);
        return true;
      });
      assert.deepEqual(await readdir(root), []);
    }
  });
});

test("CLI repeated assignments and removals publish one complete remote change", async () => {
  const { readSettings } = await import(moduleUrl);
  await temporary(async root => {
    const path = join(root, ".team-harness.json");
    await writeFile(path, JSON.stringify({ english_learning: true, clickup: { workspace_id: "old", keep: 3 },
      flow_telemetry: { enabled: false, keep: "opaque" } }));
    const result = await cli(root, "set", "--set", 'workspace-mode="gpt-space"',
      "--set", 'workspace-space-id="space_1"', "--set", 'workspace-container-page-id="page_1"',
      "--set", "flow_telemetry.enabled=true", "--remove", "english_learning", "--remove", "clickup.workspace_id");
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).changed, true);
    const stored = await readSettings(root);
    delete stored.updated_at;
    assert.deepEqual(stored, {
      "workspace-mode": "gpt-space", "workspace-space-id": "space_1", "workspace-container-page-id": "page_1",
      clickup: { keep: 3 }, flow_telemetry: { enabled: true, keep: "opaque" }, format_version: "1",
    });
    const before = await readFile(path, "utf8");
    await assert.rejects(cli(root, "set", "--set", 'language="es"', "--remove", "workspace-space-id"));
    assert.equal(await readFile(path, "utf8"), before);
  });
});

test("a failed atomic rename preserves old settings and cleans the unpublished temporary file", async () => {
  await temporary(async root => {
    const path = join(root, ".team-harness.json");
    const before = '{"language":"en","opaque":{"keep":true}}\n';
    await writeFile(path, before);
    const script = `
      import fs from "node:fs/promises";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      const original = fs.rename;
      fs.rename = async (from, to) => {
        if (to.endsWith(".team-harness.json")) throw Object.assign(new Error("injected publication failure"), { code: "EIO" });
        return original(from, to);
      };
      syncBuiltinESMExports();
      const { setSettings } = await import(pathToFileURL(process.argv[2]));
      try {
        await setSettings(process.argv[3], { assignments: ['language="es"'] });
        process.stdout.write("unexpected success");
        process.exitCode = 1;
      } catch (error) {
        if (error.code !== "EIO") throw error;
        process.stdout.write("publication refused");
      }
    `;
    const result = await execute(process.execPath, ["--input-type=module", "-e", script, "publication-fixture", helper, root]);
    assert.equal(result.stdout, "publication refused");
    assert.equal(result.stderr, "");
    assert.equal(await readFile(path, "utf8"), before);
    assert.equal(await readFile(`${path}.bak`, "utf8"), before);
    assert.deepEqual((await readdir(root)).sort(), [".team-harness.json", ".team-harness.json.bak"]);
    const { setSettings, readSettings } = await import(moduleUrl);
    assert.equal((await setSettings(root, { assignments: ['language="es"'] })).changed, true);
    assert.deepEqual((await readSettings(root)).opaque, { keep: true });
    assert.equal((await readSettings(root)).language, "es");
  });
});

test("Obsidian changes use native lexical paths and bounded relative subfolders", async () => {
  const { setSettings, readSettings } = await import(moduleUrl);
  await temporary(async root => {
    const invalid = [
      ["relative", "notes"], [parse(root).root, "notes"], [homedir(), "notes"],
      [join(root, "vault") + "/../other", "notes"], [join(root, "vault*"), "notes"],
      [join(root, "vault"), "../notes"], [join(root, "vault"), "notes\\child"],
      [join(root, "vault"), "C:notes"], [join(root, "vault"), "{notes}"],
      [join(root, "vault"), "é".repeat(513)], [join(root, "vault"), "notes\nchild"],
    ];
    for (const [base, subfolder] of invalid) {
      await assert.rejects(setSettings(join(root, "config"), { assignments: [
        'workspace-mode="obsidian"', `logs-path=${JSON.stringify(base)}`, `logs-subfolder=${JSON.stringify(subfolder)}`,
      ] }), /setting|destination/i);
    }
    const valid = [[join(root, "vault 資料 {literal}"), "notes/資料"], [join(root, "vault"), " "], [join(root, "vault"), "é".repeat(512)]];
    if (process.platform !== "win32") valid.push([join(root, "vault\\literal"), "notes"]);
    for (const [base, subfolder] of valid) {
      await setSettings(join(root, "config"), { assignments: [
        'workspace-mode="obsidian"', `logs-path=${JSON.stringify(base)}`, `logs-subfolder=${JSON.stringify(subfolder)}`,
      ] });
      const stored = await readSettings(join(root, "config"));
      assert.equal(stored["logs-path"], base);
      assert.equal(stored["logs-subfolder"], subfolder);
    }
  });
});

test("malformed or linked settings are refused and show redacts preserved secret metadata", async () => {
  const { readSettings, showSettings, ensureSettings } = await import(moduleUrl);
  await temporary(async root => {
    const path = join(root, ".team-harness.json");
    for (const raw of ['["CANARY"]', '{"token":"CANARY",']) {
      await writeFile(path, raw);
      await assert.rejects(readSettings(root), error => {
        assert.equal(error.message.includes("CANARY"), false);
        return true;
      });
      assert.equal(await readFile(path, "utf8"), raw);
    }
    const value = { opaque: { api_key: "CANARY", note: "ghp_CANARY" }, "workspace-mode": "gpt-space" };
    await writeFile(path, JSON.stringify(value));
    const shown = JSON.stringify(await showSettings(root));
    assert.equal(shown.includes("CANARY"), false);
    assert.deepEqual(await readSettings(root), value);
    assert.deepEqual((await showSettings(root)).workspaceDiagnostics, ["incomplete_space_destination"]);
    if (process.platform !== "win32") {
      const target = join(root, "external.json");
      await writeFile(target, JSON.stringify(value));
      await rm(path);
      await symlink(target, path);
      await assert.rejects(readSettings(root), /regular file|symlink/i);
      await assert.rejects(ensureSettings(root), /regular file|symlink/i);
      assert.equal(await readFile(target, "utf8"), JSON.stringify(value));
    }
  });
});
