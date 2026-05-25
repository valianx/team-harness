Pull the latest team-harness release into `~/.claude/` inline, without launching the Go installer binary. This is a standalone utility — does NOT route through the orchestrator.

> **Plugin installations only:** If team-harness was installed as a Claude Code plugin, updates are handled automatically. Use `/plugin marketplace update` instead. This skill is for Go installer installations only.

## Voice

Formal, neutral, declarative. No enthusiasm markers, no emoji decoration, no first-person personality, no filler closings. workspaces prose follows the operator's chat language; structural elements (headers, field names, status-block keys) stay English.

Analyze the input: $ARGUMENTS

---

## What this skill does

The skill drives the update directly from inside this Claude Code session using `Bash`, `Read`, `Write`, `Edit`, and `Glob`. It downloads the source tarball of the latest GitHub Release, extracts it to a temp directory, and copies the asset files into `~/.claude/` using the canonical mapping below. No separate process is spawned, so the entire summary and any errors stay in the same conversation transcript.

This is the canonical update path. The Go installer (`install.sh` / `install.ps1` / `install.cmd` one-liners) remains the bootstrap path for first-time installs only — it handles MCP server registration, TTY-driven credential prompts, manifest write, and the "Press Enter to exit" prompt that are irrelevant once the operator is already running team-harness.

The skill is intentionally destructive: it always overwrites every file it touches. Local edits to team-harness files under `~/.claude/agents/`, `~/.claude/skills/`, and `~/.claude/hooks/` will be replaced with the bytes from the release tarball. Source-level customizations belong in the team-harness repo and reach the operator via a new release, not via hand-edits in `~/.claude/`. No `--force` flag is exposed because no other mode is possible.

---

## Argument parsing

This skill accepts one optional flag:

- `--force` — bypass the version check and download + replace all files regardless of whether the installed version matches the latest release. Useful when local files are corrupted or when the operator wants a clean reinstall without running the full installer.

If `$ARGUMENTS` contains `--force` (case-insensitive), set a `force` flag to true. All other arguments are ignored.

---

## Pre-flight checks

Before any download, verify the required CLI tools are available. If a check fails, print the error verbatim and stop — do not fall back to alternative tools.

1. **`curl` is installed.** Run `curl --version`. If the command is not found, print:
   ```
   curl is required but not installed. curl ships with macOS, all Linux distributions, and Windows 10+ (since April 2018).
   Install instructions: https://curl.se/
   ```
   and stop.

2. **`tar` is available.** Run `tar --version`. If the command is not found, print:
   ```
   tar is required but not found. tar ships with Windows 10+ and all macOS/Linux installs.
   Please install or upgrade.
   ```
   and stop.

---

## Step 1 — Resolve the latest release tag

Run:

```bash
tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/valianx/team-harness/releases/latest | sed 's|.*/tag/||' | tr -d '\r\n')
```

The command issues a HEAD request to GitHub's `/releases/latest` URL, follows the redirect to `/releases/tag/<latest-tag>`, and captures the final effective URL. `sed` strips everything up to and including `/tag/`, leaving just the tag (e.g., `v2.5.1`). `tr -d '\r\n'` defends against trailing CR/LF that Windows curl can emit.

If `tag` is empty after the command (network failure, GitHub redirect shape changed, no releases published), print:

```
failed to resolve latest release tag from https://github.com/valianx/team-harness/releases/latest
```

and stop. Do not retry.

Store the tag for use in subsequent steps.

---

## Step 1b — Compare against installed version (skip if up-to-date)

Read the installed version from the orchestrator agent file:

```bash
installed=$(grep -m1 '^var version\|^## team-harness' ~/.claude/agents/orchestrator.md 2>/dev/null | head -1)
```

If that doesn't work, try reading the manifest:

```bash
installed_version=$(cat ~/.claude/.team-harness.json 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//')
```

Compare the resolved tag (e.g., `v2.17.0`) against the installed version. The tag has a `v` prefix; the manifest version does not. Strip the `v` prefix for comparison:

```bash
latest_version=${tag#v}
```

**If the `force` flag is set**, skip the comparison entirely and proceed to Step 2 (download). Print: `Force flag set — downloading regardless of installed version.`

**If the versions match** (`latest_version` equals `installed_version` and `force` is NOT set), print:

```
team-harness up to date
-----------------------
installed: v<installed_version>
latest:    <tag>

No update needed. To force a full reinstall, use the platform-appropriate installer command:
```

Then print the installer command appropriate for the current platform:
- On macOS or Linux: `curl -fsSL https://valianx.github.io/team-harness/install.sh | bash`
- On Windows: `irm https://valianx.github.io/team-harness/install.ps1 | iex`

Detect the platform from the environment context available to the agent (e.g., the OS reported in the session environment or via `uname`/`$env:OS`).

and stop. Do not download, extract, or copy anything.

**If the versions differ or the installed version cannot be determined** (manifest missing, grep failed), proceed to Step 2.

---

## Step 2 — Create a temp directory

Run:

```bash
tmpdir=$(mktemp -d -t th-update-XXXXXX 2>/dev/null || mktemp -d)
```

This works on Linux, macOS, and Windows under Git Bash. Capture the path for use in later steps. If `mktemp` fails, print the error and stop.

---

## Step 3 — Download the source tarball

Run:

```bash
curl -fsSL "https://github.com/valianx/team-harness/archive/refs/tags/${tag}.tar.gz" -o "$tmpdir/repo.tgz"
```

Substitute `${tag}` with the value captured in Step 1. This is GitHub's deterministic source-archive URL pattern. `-f` fails on HTTP errors (so a 404 from a malformed tag aborts cleanly). If the command exits non-zero (network error, missing tag, 404), print stderr verbatim and stop.

---

## Step 4 — Extract the tarball

Run:

```bash
tar -xzf "$tmpdir/repo.tgz" -C "$tmpdir"
```

The archive expands to a single folder named `team-harness-<tag-without-v>/` inside `$tmpdir` (GitHub's convention for source tarballs).

Resolve the extracted folder dynamically — do not hardcode the name:

```bash
extracted=$(find "$tmpdir" -maxdepth 1 -mindepth 1 -type d | head -n 1)
```

If `extracted` is empty after the tar succeeds, print "extraction produced no directory under $tmpdir" and stop.

---

## Step 5 — Copy files using the canonical mapping

The mapping below mirrors the Go installer's file selection (`cmd/install/files.go` + `cmd/install/main.go`) with one deliberate override: `hooks/config.json` is never written by this skill (operators merge it into `~/.claude/settings.json` manually — see CLAUDE.md §4).

Track per-category counters as you go, incrementing only when a file is actually written. The counters drive the operator-facing summary.

**Mapping (in order):**

1. **Agents** — every `agents/*.md` file in the extracted tree, except `README.md`, is copied to `~/.claude/agents/<filename>`. Includes `ref-direct-modes.md` and `ref-special-flows.md`. Ensure `~/.claude/agents/` exists first (`mkdir -p`). Increment `agents_count` for each file written.

2. **Skills** — every subdirectory under `skills/` that contains a `SKILL.md` is copied recursively (preserving subfolder structure) to `~/.claude/skills/<dirname>/`. Use `cp -r` (or the equivalent loop with `mkdir -p` + per-file copy on Windows). Increment `skills_count` once per top-level subdirectory copied — not once per inner file. Detection: list directories under `skills/` and check for the presence of `SKILL.md` inside each.

   Note: all skills are now in directory format. There are no longer any flat `skills/*.md` files to copy to `~/.claude/commands/`.

3. **Hooks** — every `hooks/*.sh` file in the extracted tree is copied to `~/.claude/hooks/<filename>`. Ensure `~/.claude/hooks/` exists first. On Linux and macOS, set the executable bit (`chmod +x`); on Windows, no chmod is required. Increment `hooks_count` for each file written. **Do NOT copy `hooks/config.json`** — that file stays under operator control.

4. **Legacy cleanup — orphaned flat skill files in `~/.claude/commands/`**. After copying skills in step 2, check for orphaned flat skill files that were installed by older versions of team-harness. These files exist in `~/.claude/commands/` and match known skill names. Remove each if present:

   ```
   audit.md, background.md, cross-repo.md, define-ac.md, deliver.md, design.md,
   diagram.md, docs.md, eval.md, gcp-costs.md, init.md, issue.md, lint.md,
   memory.md, plan.md, recover.md, research.md, review-pr.md, security.md,
   setup.md, spike.md, status.md, test.md, test-pipeline.md, th-update.md,
   tmux.md, trace.md, translate.md, validate.md
   ```

   For each file, check whether it exists at `~/.claude/commands/<name>.md`. If it does, remove it with `rm -f`. Track the names of files actually removed in a `legacy_commands_removed` list. If none are found, the list is empty. This cleanup is idempotent — safe to run on a fresh install (the files simply won't be present).

5. **Legacy cleanup — `orchestrator.md` removal (one-shot, v2.6.0 rename migration)**. After the agent copy in step 1, check whether `~/.claude/agents/orchestrator.md` still exists on disk. If it does, remove it with `rm -f` (no error if missing — the file disappears silently on systems that already migrated). Track this in a `legacy_agent_removed` flag (boolean) so the operator-facing summary can surface the cleanup. This is a one-time migration: the v2.6.0 release renamed the `orchestrator` agent to `orchestrator`, and existing installs would otherwise carry both the stale and the new file side-by-side. The check is conditional and idempotent — safe to re-run.

**File-copy failure handling.** If any individual copy fails (permission denied, disk full, source not found after extraction), print the failing source path and destination path and stop. Do not roll back files already written; report counters as they stood at the failure.

---

## Step 5b — Update manifest version (preserve all other fields)

After all files are copied successfully, update the installed version in the manifest so the next `/th:update` invocation can detect "already up-to-date" correctly.

Read `~/.claude/.team-harness.json`. If it exists, parse the **entire** JSON object, update ONLY the `"version"` field (or `"installed_version"` if that key exists instead) to `latest_version` (tag without `v` prefix), and write back the **complete object** with all other fields preserved. Fields that MUST be preserved if present: `format_version`, `installed_version`, `updated_at`, `logs-mode`, `logs-path`, `logs-subfolder`, `files`, and any other keys.

Use a read-modify-write pattern: parse the full JSON into a generic object/dictionary, set the version key, serialize back. Do NOT construct a new object with only the version — that destroys operator configuration.

If the file does not exist, create it with the minimal shape:

```json
{"version": "<latest_version>"}
```

This is the minimal manifest shape needed for Step 1b version comparison. The Go installer may extend it with additional fields (hashes, timestamps, logs-mode) on its next run — that is expected and harmless.

---

## Step 6 — Files explicitly NOT touched

- `~/.claude.json` — MCP server registration (memory, context7) is owned by the bootstrap installer. The update skill never modifies this file.
- `~/.claude/settings.json` — the operator's hook wiring choice. Never touched.
- `~/.claude/commands/` — no new files are written here. Legacy files are only removed (Step 5, item 4).
- `hooks/config.json` from the release tarball — never copied (see Step 5).

---

## Step 7 — Clean up the temp directory

Run:

```bash
rm -rf "$tmpdir"
```

If the cleanup fails, print a one-line warning (`temp directory cleanup failed at $tmpdir`) and continue — do not stop the skill. The summary still renders.

---

## Step 8 — Render the operator-facing summary

After every successful copy, print this block exactly as shown (no emoji, no enthusiasm markers, no first-person prose):

```
team-harness update
-------------------
release:  <tag>
agents:   <agents_count>
skills:   <skills_count> directories installed to ~/.claude/skills/
hooks:    <hooks_count>
```

If `legacy_agent_removed` is true (the v2.6.0 one-shot orchestrator-to-orchestrator migration fired this run), append one line immediately after the `hooks:` line:

```
legacy:   removed ~/.claude/agents/orchestrator.md
```

If `legacy_commands_removed` is non-empty (orphaned flat skill files were cleaned up), append one line after any `legacy:` agent line (or after `hooks:` if the agent legacy line was omitted):

```
cleanup:  removed <N> flat skill file(s) from ~/.claude/commands/ (<comma-separated list of filenames>)
```

Where `<N>` is the count of files removed and the list is the filenames (e.g., `deliver.md, design.md`).

If both `legacy_agent_removed` is false and `legacy_commands_removed` is empty, omit both legacy/cleanup lines entirely — operators on a clean install should not see no-op rows.

Substitute the tag captured in Step 1 and the counters tracked in Step 5.

If the skill stopped on an error before reaching this step, print the failure block instead:

```
team-harness update failed
--------------------------
<error message verbatim from the failing step>
```

Include the counters that were already incremented so the operator knows how far the update got before the failure.

---

## Step 9 — Closing line (mandatory)

After the summary block, emit this exact sentence as the final line of the response:

```
Restart Claude Code to load the new agents and skills.
```

No emoji, no leading marker, no rephrasing. Print this even on a partial-failure summary — the operator may have a partially-updated install and the restart still applies to whatever was written.

---

## Important

- This skill does NOT route through the orchestrator.
- This skill does NOT launch the Go installer binary, `install.sh`, `install.ps1`, or `install.cmd`. The previous version of this skill did, and the binary's output was unreadable to the agent because the binary ran in a separate process (a new console window on Windows). This skill drives the update entirely inline so the summary and any errors stay in the agent's transcript.
- This skill does NOT prompt the operator interactively. There are no credentials to capture — `MEMORY_MCP_URL`, `MEMORY_MCP_BEARER`, and `CONTEXT7_API_KEY` were already written to `~/.claude.json` during the original bootstrap install and are not touched here.
- This skill compares the latest release tag against the installed version (from manifest). If they match, it prints "up to date" and exits without downloading. To force a full reinstall regardless, use the installer one-liner.
- This skill does NOT write to `workspaces/`.
- This skill does NOT retry on network failure. The agent surfaces the error and the operator re-invokes `/th:update` when their connection is back.
- The skill always overwrites. Operators who customize agents should fork the repo or contribute upstream — local edits to `~/.claude/agents/*.md` are explicitly out of scope.
