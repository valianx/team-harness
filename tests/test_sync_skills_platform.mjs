#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSharedSetupAssets } from "../tools/codex-runtime/sync-skills.mjs";

const rootDir = await mkdtemp(join(tmpdir(), "th-sync-skills-platform-"));
const source = join(rootDir, "skills/setup/scripts/manage_github_identities.py");
const targets = [
  join(rootDir, "plugins/team-harness/skills/setup/scripts/manage_github_identities.py"),
  join(rootDir, "installer-assets/opencode-skills/setup/scripts/manage_github_identities.py"),
];
const content = "#!/usr/bin/env python3\nprint('fixture')\n";

try {
  await mkdir(join(rootDir, "skills/setup/scripts"), { recursive: true });
  for (const target of targets) await mkdir(join(target, ".."), { recursive: true });
  await writeFile(source, content, { mode: 0o755 });
  for (const target of targets) {
    await writeFile(target, content, { mode: 0o755 });
    // Fixture modes must not inherit a developer's restrictive umask.
    await chmod(target, 0o755);
  }

  // Native Windows does not expose the Git executable bit through lstat().mode.
  // The synchronization check must still compare content while retaining the
  // executable-bit assertion on POSIX hosts.
  await syncSharedSetupAssets({ check: true, rootDir });

  await writeFile(targets[0], "changed fixture\n");
  await assert.rejects(
    syncSharedSetupAssets({ check: true, rootDir }),
    /shared setup assets are stale/,
    "content drift must remain visible on every platform",
  );
  await writeFile(targets[0], content);

  if (process.platform !== "win32") {
    await chmod(targets[1], 0o644);
    await assert.rejects(
      syncSharedSetupAssets({ check: true, rootDir }),
      /shared setup assets are stale/,
      "POSIX executable-bit drift must remain visible",
    );
  }

  assert.equal(await readFile(source, "utf8"), content);
  process.stdout.write("sync-skills platform checks: PASS\n");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
