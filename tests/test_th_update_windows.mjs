import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  process.stdout.write("test_th_update_windows: SKIP (Windows only)\n");
  process.exit(0);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const skillPath = path.join(root, "skills", "update", "SKILL.md");
const skillText = await readFile(skillPath, "utf8");

function extractWindowsBlock(text) {
  const heading = text.indexOf("**Windows (PowerShell)");
  assert.notEqual(heading, -1, "documented Windows update block heading is present");
  const section = text.slice(heading);
  const match = /```powershell\r?\n([\s\S]*?)\r?\n\s*```/.exec(section);
  assert.ok(match, "documented Windows PowerShell fence is present and closed");
  return match[1].replace(/\r\n/g, "\n");
}

// Execute the documented block, so the regression follows what operators run.
const updateBlock = extractWindowsBlock(skillText);

function availablePowerShells() {
  const candidates = [
    ["PowerShell 7", "pwsh.exe"],
    ["Windows PowerShell", "powershell.exe"],
  ];
  return candidates.flatMap(([label, command]) => {
    const probe = spawnSync(
      command,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSEdition"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024 }
    );
    if (probe.error || probe.status !== 0) return [];
    return [{ label, command }];
  });
}

const shells = availablePowerShells();
assert.ok(shells.length > 0, "at least one supported PowerShell executable is available");

function runBlock(shell, profile, scriptPath) {
  const env = { ...process.env, USERPROFILE: profile };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "th_force_blocks") delete env[key];
  }
  return spawnSync(
    shell.command,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
  );
}

function assertSuccessfulRun(result, label) {
  assert.equal(result.error, undefined, `${label}: PowerShell failed to start: ${result.error ?? "unknown error"}`);
  assert.equal(
    result.status,
    0,
    `${label}: documented block failed (status=${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

async function assertNoTempFiles(claudeDir, label) {
  const entries = await readdir(claudeDir, { withFileTypes: true });
  const leftovers = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".tmp"));
  assert.deepEqual(leftovers, [], `${label}: atomic temp files were cleaned up`);
}

async function createFixture() {
  // Spaces and '&' exercise the documented quoted USERPROFILE paths as well.
  const profile = await mkdtemp(path.join(tmpdir(), "th update windows & fixture "));
  const versionRoot = path.join(
    profile,
    ".claude",
    "plugins",
    "cache",
    "team-harness-marketplace",
    "th",
    "3.26.0"
  );
  const managedBlocks = path.join(versionRoot, "skills", "setup", "managed-blocks");
  const outputStyles = path.join(versionRoot, "output-styles");
  const scriptPath = path.join(profile, "update-block.ps1");
  await mkdir(managedBlocks, { recursive: true });
  await mkdir(outputStyles, { recursive: true });
  await cp(path.join(root, "skills", "setup", "managed-blocks"), managedBlocks, { recursive: true });
  await cp(
    path.join(root, "output-styles", "developer-mode.md"),
    path.join(outputStyles, "developer-mode.md")
  );
  // Run the exact extracted block from a file so Windows' command-line length
  // limit cannot truncate the script or change its quoting semantics.
  await writeFile(
    scriptPath,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(updateBlock, "utf8")])
  );
  return {
    profile,
    claudeDir: path.join(profile, ".claude"),
    claudeMd: path.join(profile, ".claude", "CLAUDE.md"),
    backup: path.join(profile, ".claude", "CLAUDE.md.bak"),
    scriptPath,
  };
}

async function runRegression(shell) {
  const fixture = await createFixture();
  try {
    const original = Buffer.from(
      [
        "# operator content before\r\n",
        "<!-- orchestrator-dispatch-rule:start -->\r\n",
        "Old harness content that should be replaced.\r\n",
        "<!-- orchestrator-dispatch-rule:end -->\r\n",
        "# operator content after\r\n",
      ].join(""),
      "utf8"
    );
    await writeFile(fixture.claudeMd, original);

    // Existing CLAUDE.md exercises File.Replace and rolling-backup creation.
    const first = runBlock(shell, fixture.profile, fixture.scriptPath);
    assertSuccessfulRun(first, `${shell.label} existing file`);
    const updated = await readFile(fixture.claudeMd);
    const backup = await readFile(fixture.backup);
    const updatedText = updated.toString("utf8");
    assert.deepEqual(backup, original, `${shell.label}: .bak preserves the original bytes`);
    assert.ok(updatedText.includes("# operator content before\r\n"), `${shell.label}: outside prefix preserved`);
    assert.ok(updatedText.includes("# operator content after\r\n"), `${shell.label}: outside suffix preserved`);
    assert.match(updatedText, /<!-- orchestrator-dispatch-rule:start -->/);
    assert.match(updatedText, /<!-- orchestrator-dispatch-rule:end -->/);
    assert.match(updatedText, /<!-- voice-rule:start -->/);
    assert.match(updatedText, /<!-- voice-rule:end -->/);
    assert.match(updatedText, /## orchestrator dispatch/);
    await assertNoTempFiles(fixture.claudeDir, `${shell.label} existing file`);

    // A second invocation must avoid the write path entirely.
    const beforeRerun = await readFile(fixture.claudeMd);
    const beforeRerunStat = await stat(fixture.claudeMd, { bigint: true });
    await new Promise(resolve => setTimeout(resolve, 50));
    const second = runBlock(shell, fixture.profile, fixture.scriptPath);
    assertSuccessfulRun(second, `${shell.label} idempotent rerun`);
    const afterRerun = await readFile(fixture.claudeMd);
    const afterRerunStat = await stat(fixture.claudeMd, { bigint: true });
    assert.deepEqual(afterRerun, beforeRerun, `${shell.label}: idempotent rerun preserves bytes`);
    assert.equal(
      afterRerunStat.mtimeNs,
      beforeRerunStat.mtimeNs,
      `${shell.label}: idempotent rerun does not rewrite CLAUDE.md`
    );
    await assertNoTempFiles(fixture.claudeDir, `${shell.label} idempotent rerun`);

    // Missing CLAUDE.md exercises the Move-Item creation fallback and must not create a backup.
    await rm(fixture.claudeMd, { force: true });
    await rm(fixture.backup, { force: true });
    const missing = runBlock(shell, fixture.profile, fixture.scriptPath);
    assertSuccessfulRun(missing, `${shell.label} missing file`);
    const created = (await readFile(fixture.claudeMd)).toString("utf8");
    assert.match(created, /<!-- orchestrator-dispatch-rule:start -->/);
    assert.match(created, /<!-- voice-rule:start -->/);
    await assert.rejects(access(fixture.backup, constants.F_OK), `${shell.label}: no backup for new file`);
    await assertNoTempFiles(fixture.claudeDir, `${shell.label} missing file`);
  } finally {
    await rm(fixture.profile, { recursive: true, force: true });
  }
}

for (const shell of shells) await runRegression(shell);
process.stdout.write(
  `test_th_update_windows: PASS (${shells.map(shell => shell.label).join(", ")}; existing/missing/idempotent/cleanup)\n`
);
