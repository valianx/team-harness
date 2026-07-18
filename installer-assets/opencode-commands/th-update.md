---
name: th-update
description: Update Team Harness (opencode) — execute the dedicated fail-closed updater and report the result.
---

Update the Team Harness opencode installation by executing the dedicated
updater. Do not just print the command for the operator to copy — run it.

## Execute the updater

Run this exact command through the Bash tool:

```
curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash -s -- --non-interactive
```

This downloads and runs `bin/update-opencode.sh` — the dedicated opencode
updater, NOT `install-opencode.sh` (the full first-install script; do not
substitute it here).

`--non-interactive` is the only flag this command adds by default. It
reuses the existing `.team-harness.json` config already on disk and skips
the diff-preview `[Y/n]` confirm prompt, which no one is present to answer
from a Bash tool call.

The only other flag this command may ever add is `--opencode-dir`, and
only when the operator explicitly names a non-default config root — pass
it as a separate, literal argv token appended after `--non-interactive`.
Never build the command line by interpolating arbitrary operator text; the
allowlist is exactly these two flags (`--opencode-dir`, `--non-interactive`),
nothing else.

## What the updater does (unchanged, fail-closed)

1. A cheap `VERSION` pre-check. If the installed version already matches
   the latest release, it prints "already current" and exits with zero
   writes and no binary download.
2. Otherwise, it downloads `SHA256SUMS` and the platform binary and
   verifies the binary's hash against the anchored `SHA256SUMS` entry
   before running anything. This verification is never skipped, and there
   is no alternate or unverified download path — never point the
   download at a different URL or add a flag that bypasses it.
3. It runs `binary update --runtime opencode --scope global`, which
   re-confirms the three-state result authoritatively and applies only
   the files that changed.

## Report the result

After the command exits, report exactly one of the three states:

- **already current** — no writes, no download.
- **updated** — asset files were applied. Name restarting the opencode
  session as the single remaining manual step — the update is not live
  in any running session until the operator restarts it.
- **installed ahead** — the installed version is newer than the latest
  release; no action is possible until the next release ships.

## Integrity floor

The integrity floor is TLS on the download channel, GitHub's control over
release assets, and the binary SHA256 check inside `update-opencode.sh` —
this is not a code signature. The Bash tool's own permission prompt, which
the operator sees before this command executes, is the residual human
checkpoint on top of that floor.

## Standalone — never gated by the boot capability check

This command is a standalone utility, not a pipeline dispatch. The
leader's boot capability check gates orchestrator-spawning for pipeline
work; it never gates a standalone utility. Run this command regardless of
which runtime branch the boot check resolved, including a session where
the boot check has not run at all.
