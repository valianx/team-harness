# The setup/update model

This document describes the working model that governs how Team Harness is installed and kept current. The model was previously implicit, spread across `skills/setup/SKILL.md` and `skills/update/SKILL.md`. This document brings it together in one place, with the SKILL.md files remaining the authoritative source for per-OS command syntax.

---

## Division of labour: setup vs update

`/th:setup` and `/th:update` are not interchangeable. Each owns a distinct set of concerns and runs at a different frequency.

| What | Owner | Frequency |
|------|-------|-----------|
| Operator KEYS — Memory MCP URL + token, context7 API key, workspace mode (`logs-mode`, `logs-path`, `logs-subfolder`), default `language` | `/th:setup` | One-time bootstrap; re-run to reconfigure |
| Architecture prerequisites — fixed constants the pipeline itself needs to run correctly, with no operator value to elicit (e.g. the subagent nesting-depth env var below) | **BOTH** `/th:setup` and `/th:update` | One-time write per prerequisite; self-healing (re-checked, silently) on every run of either command |
| FILES — managed `~/.claude/CLAUDE.md` blocks, `output-styles/developer-mode.md` | `/th:update` | Every release |
| FLOWS — marketplace catalog refresh, plugin version download | `/th:update` | Every release |
| `~/.claude/.team-harness.json` full write (merge-write-whole-document) | `/th:setup` | One-time bootstrap; re-run to reconfigure |

**Key constraint:** `/th:update` reads `~/.claude/.team-harness.json` but **never writes it**, with one closed exception — see [The residual seam: new operator keys](#the-residual-seam-new-operator-keys). That exception is scoped to a single namespaced decline-record key for the architecture-prerequisite class below; it is not a general write grant.

### Operator KEYS vs architecture prerequisites — why the split exists

An operator KEY is personal and sensitive — a URL, a token, a workspace path — and there is no correct default: `/th:setup` must ask. An architecture prerequisite is neither: it is a single fixed value the pipeline itself needs (today, one value — `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"`) to restore Claude Code's native subagent-nesting capability, and there is exactly one correct value to offer, never a range of operator preference. Gating it behind a one-time `/th:setup`-only bootstrap would leave every operator who never re-runs `/th:setup` — the majority, per the residual-seam limitation below — permanently on the degraded relay path. Both commands own it for that reason: `/th:setup` covers a fresh install, `/th:update` covers the installed base that never returns to setup.

---

## Two propagation classes

Team Harness artifacts fall into two classes based on how they reach an installed machine after a release.

### Cache artifacts (auto-loaded)

These artifacts live inside the plugin cache directory (`~/.claude/plugins/cache/team-harness-marketplace/th/<version>/`) and are loaded automatically by the Claude Code plugin runtime on update and reload. No explicit copy step is required.

**Artifacts in this class:**
- `agents/*.md` — all agent system prompts
- `skills/<name>/SKILL.md` — all namespaced plugin skills (e.g. `/th:update`, `/th:setup`)
- Hooks registered in `.claude-plugin/hooks.json` — loaded via `${CLAUDE_PLUGIN_ROOT}` (the plugin runtime variable that resolves to the cache directory at runtime)

**Evidence:** `.claude-plugin/hooks.json` registers every hook using the form `bash ${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh`. The runtime resolves `${CLAUDE_PLUGIN_ROOT}` to the newly-downloaded version directory after `/reload-plugins`, so the updated hooks take effect automatically without a copy step.

**Implication:** to ship a new agent, skill, or hook, it is sufficient to add the file to the repo and release. No sync step in `/th:update` is required for these artifacts.

### Fixed-path artifacts (explicit sync required)

These artifacts must land at a specific absolute path under `~/.claude/` that the plugin runtime does **not** manage automatically. They require an explicit copy (or write) step in `/th:update` Step 6 every time a release is published.

**Artifacts in this class:**

| Artifact | Target path | Mechanism in `/th:update` Step 6 |
|----------|-------------|----------------------------------|
| `orchestrator-dispatch-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| `voice-rule` managed block | `~/.claude/CLAUDE.md` (marker-delimited section) | Destructive marker-bounded replace or append |
| Developer-mode output style | `~/.claude/output-styles/developer-mode.md` | Force-copy from plugin cache |

> **Retired in v2.89.0 (dev mode eliminated):** the `dev-mode` and `nested-dispatch-takeover` managed blocks, the `/dev-mode` user-level skill, and the `~/.claude/.dev-mode-active` marker are no longer written. `/th:update` Step 6 additionally **deletes** the two retired blocks (and the obsolete `dev-mode-entry` marker) from any existing `~/.claude/CLAUDE.md`. The orchestrator disposition is now unconditional and the outward-action gate (`dev-guard.sh`) is always armed — no marker arms it.

For the exact per-OS command blocks (bash and PowerShell), see `skills/update/SKILL.md` Step 6.

---

## The update flow (three steps)

A `th` update is three distinct steps. The skill performs two; the operator performs one.

1. **Refresh the catalog** — `claude plugin marketplace update team-harness-marketplace`
   Updates the marketplace metadata so the CLI knows a newer version exists. Downloads nothing.

2. **Download the new version** — `claude plugin update th@team-harness-marketplace`
   Fetches the new version into the plugin cache. The CLI prints `Restart to apply changes`. This is the step that actually downloads; the catalog refresh alone does not.

3. **Activate** — `/reload-plugins` (or restart Claude Code)
   Loads the downloaded version into the running session.

`/th:update` performs steps 1 and 2 from Bash, then runs the Step 6 fixed-path sync described in [Fixed-path artifacts (explicit sync required)](#fixed-path-artifacts-explicit-sync-required). Step 3 is operator-driven — the skill cannot reload the session.

Running `/th:update` every release keeps both the cache artifacts (via the plugin runtime) and the fixed-path artifacts (via Step 6) aligned. Re-running `/th:setup` is **not** part of the update flow.

---

## Self-healing / idempotency

`/th:update` Step 6 re-syncs every fixed-path artifact on every run, regardless of whether the plugin version changed:

- **Managed CLAUDE.md blocks** (`orchestrator-dispatch-rule`, `voice-rule`) — destructive marker-bounded replace (if markers are present) or append (if markers are absent). No content comparison — marker presence is the only check. Step 6 also **deletes** the retired `dev-mode` / `nested-dispatch-takeover` blocks if present.
- **Output style** — force-copy from the highest-version plugin cache directory.

Because Step 6 is unconditional and destructive, a machine that missed one or more updates self-corrects on the next run: the fixed-path artifacts are overwritten with the current version's canonical content.

**Concrete example:** an operator whose `~/.claude/CLAUDE.md` was missing one or more managed blocks — because the version of the plugin they installed did not write them yet — gets those blocks restored on the next `/th:update`. Step 6 appends any block whose start/end markers are absent, so no manual intervention is required. The same behavior applies whether a block was never written or was accidentally deleted: the next update run re-inserts it unconditionally.

---

## Author maintenance invariant (normative)

> When a new fixed-path artifact is introduced under `~/.claude/` in a release, its sync step **MUST** be added to `/th:update` Step 6 in the same release.

If the sync step is omitted, the artifact never reaches installed machines — the plugin runtime does not copy it, and no future update will add it retroactively unless the sync step is also added in that future release.

This is the same family of failure as issue #272: an artifact was shipped to the repo but not wired into the sync step, so installed operators did not receive it until the sync was patched in.

**Checklist for adding a new fixed-path artifact:**

- [ ] Add the artifact file to the plugin cache layout (the appropriate path under `skills/`, `output-styles/`, etc.).
- [ ] Add a sync step in `skills/update/SKILL.md` Step 6 (both the bash and PowerShell command blocks).
- [ ] Add the same idempotent sync in `skills/setup/SKILL.md` (for first-time installs that have not run `/th:update` yet).
- [ ] Confirm the sync is destructive / force-copy (no content comparison — only presence checks for marker-bounded blocks).

---

## Architecture prerequisite: subagent nesting depth

Claude Code's native subagent-nesting depth is configurable, not a permanent cap, via the `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` environment variable in `~/.claude/settings.json`. When unset, a dispatched subagent (e.g. `th:orchestrator`) does not itself retain the `Task` tool, so it cannot dispatch its own leaf specialists — it falls back to emitting a `dispatch_handoff` directive for the top-level session to relay instead (`docs/subagent-orchestration.md`). Setting the value to `"2"` (one layer below the top-level session, one more below that) restores direct nested dispatch: the top-level session is layer 0, `th:orchestrator` is layer 1, and its own specialist dispatches are layer 2, with no further nesting permitted below that.

This is the canonical mechanism both lifecycle commands implement identically. Neither `skills/setup/SKILL.md` nor `skills/update/SKILL.md` restates it — each references this section and applies only the concrete values below.

**The prerequisite:**

| Field | Value |
|---|---|
| Target file | `~/.claude/settings.json` |
| JSON path | `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` |
| Value | `"2"` (string, matching the env-var convention) |

**Mechanism (identical at both sites):**

1. **Already present with the expected value → silent pass-through.** No prompt, no write. The fact appears as one row in the command's final report only.
2. **Absent, and no decline previously recorded → explicit Y/n gate (absent-value gate).** Before writing, the gate shows the exact JSON path and value, and states the blast radius: this key applies to every Claude Code session on the machine, on every project, not only to team-harness, and persists until removed manually. On decline, nothing is written — see step 5.
3. **Present with a DIFFERENT value, and no decline previously recorded → its own gate, never a silent overwrite.** A present-but-different value (e.g. an operator who deliberately set `"1"` or `"3"`) is NOT treated as absent. Before writing, this gate discloses the exact current value read from the file (`env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is currently set to "{current-value}"`), states the same blast radius as step 2, and asks whether to overwrite it with `"2"`. Only an explicit confirmation to THIS gate authorizes the write; the absent-value gate's text (step 2) must never be shown when a different value is already present — a reader of that text could otherwise infer no value is set. On decline, record the same durable decline as step 5 (an operator who kept a deliberately-different value has, in effect, declined "2") — this is never re-prompted once recorded.
4. **On confirm (either gate) → write following the merge-write-whole-document contract already established for this class of file** (`docs/permission-provisioning.md § Merge-write-whole-document contract`): back up the existing `~/.claude/settings.json` to `settings.json.bak` at `0o600` from the moment of creation (skipped if the file does not yet exist). Read the target file: if it does not exist, start from `{}`; if it exists but fails to parse as JSON (corrupted file), **abort before writing** — no backup restore is needed since nothing was written yet — and report the failure naming the corrupted file and the exact parse error; never fall back to `{}` for an existing-but-unparseable file, since that would silently discard any `permissions.*` rules already present. Only when the file parses (or does not exist) does the write proceed: set only `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; write the merged document to a temp file in the same directory at `0o600`, validate it parses as JSON, then rename it atomically over the target.
5. **Post-write assertion (mandatory).** Re-read and re-parse the written file. Assert it differs from the pre-write parse in **exactly one** JSON path (`env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), and that `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories` are identical element-for-element to the pre-write parse. On any other delta, restore the `.bak` and report the write as failed — never leave a partially-changed file in place. This guards specifically against a lost `permissions.deny` entry (deny-over-allow resolution means a dropped entry widens access without producing an error).
6. **Write refused by the host runtime → operator-executed fallback, never a retry via any alternative mechanism.** This outcome is distinct from an existing-but-unparseable file (step 4, which never even attempts the write) and from a post-write delta (step 5, which detects a problem after a write that did happen): here the write to `~/.claude/settings.json` itself is refused by the host runtime before it can complete. Nothing was written and the file is unchanged. No `nested_spawn_depth.declined` is recorded — a refusal by the environment is not a decision the operator made — so the next run of either command re-offers the provisioning gate because the key is still absent. The step must not retry the write through any alternative mechanism (another tool, a shell detour, or any other write path), and the agent itself must not execute the fenced command below by any means — not via Bash, not by writing it to a file and running it, not through any other tool: running that command IS the alternative mechanism the previous sentence forbids, because the target file governs `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories`, and routing around a host refusal to write it is evasion of a control, not a degradation. Instead, the operator receives a pointer to the file and heading below — never a reproduction of the block generated, retyped, or shortened by the agent — reads it, and runs it directly; the command's report row for this run carries the value `operator-action-required`, and the rest of the command's flow continues rather than stopping.

**Operator-executed provisioning command**

Transcribed verbatim from the single source of this block — never retyped, paraphrased, or shortened. Uses only `python3` and its standard library, the same probed dependency both commands already document; reproduces, in the operator's own execution context, the same guarantees the agent's own write path holds: `realpath` resolution before touching the target, a `0o600` backup, an explicit abort (never a traceback) on an unparseable or unexpected-shape document, a single JSON path set, one atomic temp-file-and-rename path for the backup, the target, and the restoration alike, and the same post-write assertion as step 5 above.

```bash
python3 - <<'PY'
import json, os, sys, tempfile

nominal = os.path.expanduser("~/.claude/settings.json")
path    = os.path.realpath(nominal)
bak     = path + ".bak"
KEY     = "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH"

def write_600(target, payload):
    """Every write in this script goes through here: temp file at 0o600 in the
    same directory, fsync, atomic rename. No path mutates the target in place."""
    d = os.path.dirname(os.path.abspath(target))
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

def strip_key(doc):
    d = json.loads(json.dumps(doc))
    env = d.get("env")
    if isinstance(env, dict):
        env.pop(KEY, None)
        if not env:
            d.pop("env", None)
    return d

if path != nominal:
    print("NOTE: %s resolves to %s. The resolved file is the one backed up and "
          "written; the symlink itself is left in place." % (nominal, path))

before, backed_up = {}, False
if os.path.exists(path):
    try:
        raw = open(path, encoding="utf-8").read()
        before = json.loads(raw)
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        sys.exit("ABORT: %s does not parse as JSON (%s). Nothing was written; "
                 "repair the file by hand first." % (path, exc))
    if not isinstance(before, dict) or not isinstance(before.get("env", {}), dict):
        sys.exit("ABORT: %s has an unexpected shape (top level or 'env' is not an "
                 "object). Nothing was written." % path)
    try:
        write_600(bak, raw)
    except Exception as exc:
        sys.exit("ABORT: the backup %s could not be written (%s). Nothing was "
                 "written to %s." % (bak, exc, path))
    backed_up = True

expected = json.loads(json.dumps(before))
expected.setdefault("env", {})[KEY] = "2"

try:
    write_600(path, json.dumps(expected, indent=2, ensure_ascii=False) + "\n")
except Exception as exc:
    sys.exit("WRITE FAILED: %s. Nothing was changed." % exc)

written  = json.loads(open(path, encoding="utf-8").read())
problems = []
if (before.get("permissions") or {}) != (written.get("permissions") or {}):
    problems.append("the permissions subtree changed")
if written.get("env", {}).get(KEY) != "2":
    problems.append("env.%s was not set" % KEY)
if strip_key(before) != strip_key(written):
    problems.append("a JSON path other than env.%s changed" % KEY)

if problems:
    if backed_up:
        try:
            write_600(path, open(bak, encoding="utf-8").read())
            recovery = "Restored %s from %s." % (path, bak)
        except Exception as exc:
            recovery = ("RESTORE FAILED (%s) — %s still holds the previous "
                        "content; recover by hand." % (exc, bak))
    else:
        recovery = ("%s did not exist before this run, so there is no backup to "
                    "restore; delete it to return to the previous state." % path)
    sys.exit("ASSERTION FAILED: %s. %s" % ("; ".join(problems), recovery))

print('OK: env.%s = "2" written to %s' % (KEY, path))
if backed_up:
    print("Previous file backed up to %s — this is a single rolling backup and it "
          "overwrote any earlier one." % bak)
print("Restart Claude Code (or start a new session) for it to take effect.")
PY
```

`settings.json.bak` is a single rolling backup shared with `docs/permission-provisioning.md § Merge-write-whole-document contract` step 2 — running the command above consumes whatever recovery snapshot a prior provisioning write left behind, the same way either write path already does. Its "preserves every other key" guarantee has two documented limits, named here so neither is mistaken for a regression: duplicate JSON keys in the existing document collapse to their last occurrence on the read/write round trip, and the target file's mode is normalized to `0o600` regardless of what it was set to before.

This outcome is scoped to the subagent-nesting-depth mechanism specifically. `docs/permission-provisioning.md`'s two sites that also write `~/.claude/settings.json` from an agent — site A (`/th:setup` § 3a) and site B(a) (`agents/leader.md` Phase 0a Step 1g) — do not yet define a refused-write outcome of their own; this section is not a general fallback for every agent write to that file.

7. **On decline (either gate) → record durably, never re-prompt.** Persist a single namespaced key under `~/.claude/.team-harness.json` (merge-write-whole-document, preserving every other key) recording that the operator declined this prerequisite. On every later run of either command, a recorded decline is treated the same as "nothing to offer" — report it as a row, never re-ask. This is the one closed exception `/th:update` needs to `~/.claude/.team-harness.json` — see [The residual seam: new operator keys](#the-residual-seam-new-operator-keys) for its scope.
8. **After any write → never claim the value is live.** `env` in `settings.json` resolves at session start, so a write in the middle of a running session has no effect on that session. Report that a session restart is required before the value takes effect — the same restart-to-activate honesty this skill already applies to plugin reloads.
9. **On decline, an aborted corrupted-file write, a refused write, or a failed write → the functional path is preserved, not removed.** The `dispatch_handoff` relay (`docs/subagent-orchestration.md`) remains fully functional as the fallback when nesting is not provisioned. This mechanism buys back the cost of that relay; it does not gate correctness on adopting it.

**Never conflated with permission provisioning.** `docs/permission-provisioning.md`'s allowlist mechanism touches only `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories` — never `env`. This mechanism touches only `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` — never any key under `permissions`. Neither command establishes a general-purpose `env`-provisioning path; the JSON path above is the only one this mechanism ever writes.

**Diagnosing a missing prerequisite (not a third provisioning site).** `agents/leader.md § Boot capability check` names this exact cause and remedy when the nesting capability is not available at boot — it diagnoses only: it never offers, prompts, or writes. The two commands above are the only two write sites.

---

## The residual seam: new operator keys

`/th:update` never writes an **operator KEY** to `~/.claude/.team-harness.json` — a personal, sensitive value the operator must supply (MCP URLs, tokens, workspace mode, language preference). That remains `/th:setup`'s exclusive domain, for the reason below.

**Closed exception — the architecture-prerequisite decline record.** `/th:update` MAY write exactly one namespaced key, `nested_spawn_depth.declined`: the durable decline record for the subagent-nesting-depth prerequisite (see [Architecture prerequisite: subagent nesting depth](#architecture-prerequisite-subagent-nesting-depth) above). This is not an operator KEY — it elicits no personal value, carries no sensitive data, and records a fact about pipeline state (declined / not yet offered), not an operator preference. The allowlist for this exception is closed to that single key; it does not open a general write path, and it does not authorize `/th:update` to write any other key in this file, now or in a future release, without a corresponding documented exception here.

**Consequence for genuine operator KEYS:** when a new operator KEY is introduced in a release (for example, the `language` key), an operator who already has Team Harness installed does not receive a prompt to configure the new key when they run `/th:update`. The key is simply absent from their `~/.claude/.team-harness.json` until they re-run `/th:setup`.

This is a known, intentional limitation. The alternative — having `/th:update` write to `.team-harness.json` — would require it to prompt for sensitive values (MCP URL, tokens) on every update, which conflicts with the goal of a non-interactive repeatable command.

**Mitigation for operators:** when a release note mentions a new operator-configurable key, run `/th:setup` once to configure it. Subsequent `/th:update` runs continue normally.

---

## See also

- `docs/install.md § Updating` — the concise procedure reference for updating
- `skills/setup/SKILL.md` — authoritative source for setup steps and per-OS command syntax
- `skills/update/SKILL.md` — authoritative source for update steps and per-OS command syntax
- `docs/dev-mode.md` — the orchestrator disposition contract and the outward-action gate (dev mode retired v2.89.0; disposition is unconditional)
