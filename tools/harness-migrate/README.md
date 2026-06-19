# tools/harness-migrate

Bidirectional deterministic transform for team-harness assets between Claude Code and opencode formats.

## What this tool does

`migrate.mjs` projects agent and command files between the two harness formats:

- **Forward (`to-opencode`):** `agents/*.md` → `.opencode/agents/` and `.claude/commands/*.md` → `.opencode/commands/`
- **Inverse (`to-claude-code`):** `.opencode/agents/` → `agents/` and `.opencode/commands/` → `.claude/commands/`

The transform covers:
- Agent tool permissions: `tools:` comma-string ↔ `permission.allow` array (agent surface)
- Command tool permissions: `allowed-tools:` string/array ↔ `permission.allow` array (command surface)
- Model identifiers: bare/alias ↔ provider-prefixed (`anthropic/…`)
- Mode: forward-add `mode: subagent` for agents (dropped on inverse for CC-origin files)
- Argument placeholder: `$ARGUMENTS` is identity on both harnesses — no rewrite
- Body content: always verbatim (no modification)

Skills, rules (`CLAUDE.md`), and hooks are out of scope — those surfaces need no content transform (skills/rules) or a full TS rewrite (hooks, handled by `hooks/ts/`).

## Usage

```
node tools/harness-migrate/migrate.mjs to-opencode
node tools/harness-migrate/migrate.mjs to-claude-code
```

Both directions produce a projected-file manifest listing each file as:
- `projected` — written to the output directory
- `skipped (idempotent)` — already in target format, not re-written
- `rejected (containment)` — output path failed the write-path safety check

## Reversibility

**CC-origin files round-trip losslessly.** `to-opencode` then `to-claude-code` returns byte-identical CC originals. This is provable by construction (single mapping table, both directions, identity placeholder, verbatim body) and asserted by the test suite.

**Opencode-origin files with populated `ask`/`deny` are documented-lossy.** CC `tools`/`allowed-tools` has no concept of an explicit `ask` or `deny` list. When `to-claude-code` encounters a non-empty `ask` or `deny`, it reports the dropped arrays in the manifest as `lossy: ask/deny dropped` rather than silently discarding them.

## Audience

**Team-harness contributors only.** This tool is repo-local contributor tooling — it is not distributed to end users and does not touch `agents/`, `skills/`, or `hooks/` distributed plugin surfaces. There is no plugin version bump associated with this tool.

## Security

- **Write-path containment:** every output path is `realpath`-canonicalized and verified as a strict segment-prefix descendant of the repo root before any write. Paths containing `..`, symlink escapes, or targets outside the writable-prefix allowlist (`.opencode/agents/`, `.opencode/commands/`, `agents/`, `.claude/commands/`) are rejected fail-closed.
- **Per-component lstat symlink/reparse rejection:** every path component from the repo root down to the leaf is checked with `lstat` before any write. If any existing component is a symlink (POSIX) or a Windows junction/reparse point (Node v18+ maps these to `isSymbolicLink()=true`), the file is rejected fail-closed and no write occurs. This closes the intermediate-component gap on all platforms.
- **Per-segment directory creation:** directories are created one segment at a time (not `mkdir -p`) — each existing segment is `lstat`-verified to be a real directory before descending into it. This prevents `mkdir -p` from following intermediate symlinks while materialising the directory tree.
- **Batch fail-closed:** a dry-run validates ALL output paths before the first write. Any containment failure aborts the entire batch with zero writes.
- **TOCTOU close — actual guarantee:** on POSIX, leaf writes additionally go through an `O_NOFOLLOW` handle as belt-and-suspenders. On Windows, `O_NOFOLLOW` is `0` (unavailable); the lstat-per-component rejection above is the primary protection on Windows. **Residual:** Node provides no portable atomic `openat`-relative write, so a sub-millisecond race between the per-component lstat checks and the subsequent `fs.open` on an intermediate component cannot be fully eliminated. This is accepted for a repo-local contributor tool. This write pattern **must not** be promoted to a distributed or security-01 surface without an atomic `openat`-based implementation.
- **Shell-injection rejection:** files carrying either documented injection form — inline `` !` `` (non-anchored substring) or fenced ```` ```! ```` — are rejected over both body and frontmatter values.
- **Allowlist-only key read:** only named frontmatter keys are read and written; no spread/merge; prototype-pollution keys (`__proto__`/`constructor`/`prototype`) are rejected.

## Tests

```
node tools/harness-migrate/test_harness_migrate.mjs
```

Also wired into `tests/run-all.sh` (Suite 16 with a `node`-availability guard).

## Cross-platform

Pure `.mjs` on Node 18+ and Bun. No Bash, no PowerShell, no platform-specific syntax. The `O_NOFOLLOW` flag is used as a belt-and-suspenders leaf guard on POSIX; on Windows `O_NOFOLLOW` is `0` (unavailable) and write-path protection relies on the per-component `lstat` symlink/reparse rejection, which is portable across platforms via Node's `fs.lstat` (Node v18+ maps Windows junctions and reparse points to `isSymbolicLink()=true`).
