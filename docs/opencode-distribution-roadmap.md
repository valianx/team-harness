# Opencode Distribution-Layer Roadmap

> **Status: design only.** Not scheduled, not built. The Go installer (`cmd/install/`) is frozen; the opencode runtime is not present in this repo. This document specifies the distribution-layer mechanisms the future runtime-independent harness will need, at enough depth for a future implementer to build them. Nothing here changes current behavior.

## Buildable-now-vs-defer assessment

| Item | Mechanism | Specifiable now as a design? | Buildable now? | Verdict |
|------|-----------|------------------------------|----------------|---------|
| 1 | Adapter registry + format-shim | Yes — descriptor shape and shim normalization contract are fully specifiable today | No — needs ≥2 concrete runtimes to project to; only Claude Code exists in-repo | **Specify now, defer build** until a second runtime target lands |
| 2 | Two-layer install manifest + managed-ownership state | Yes — schema and ownership model are specifiable today | No — frozen installer; build belongs to the opencode-installer effort | **Specify now, defer build** to the opencode installer |
| 3 | Single data-home resolver | Yes — resolution order and env var are specifiable today | Partially — the resolver is small, pure, and runtime-agnostic; it is the cheapest of the three to land first | **Specify now; first candidate to build** when the opencode effort begins |

---

## Item 1 — Adapter registry + format-shim

**Goal.** Author one canonical hook/agent *body* and project it to N runtimes through small declarative *adapters* plus a single I/O-normalizing *shim*, instead of duplicating or rewriting each body per runtime.

**Why specifiable now.** The descriptor shape and the shim's normalization contract are independent of any specific second runtime — they are defined by the *canonical* body's needs, which already exist for Claude Code. The projection cannot be *built* until a second runtime target exists, but the contract that the build must satisfy is fully determinable today.

**Three parts.**

1. **Canonical body** — the single authored artifact (a hook script or an agent system prompt) that the harness maintains. It is written against the *normalized* I/O contract (below), never against a specific runtime's native event shape.
2. **Adapter descriptor** — a tiny declarative record (one per `{canonical-body, target-runtime}` pair) that tells the projector how to emit the body into that runtime's native packaging (file path, frontmatter dialect, event-name mapping, capability gates).
3. **Format-shim** — a thin runtime-resident translation layer that converts the target runtime's native invocation payload *into* the normalized contract on the way in, and converts the canonical body's normalized output *into* the runtime's native response on the way out.

**Adapter descriptor shape.** One descriptor per `(body, runtime)`. Fields:

```yaml
# adapter descriptor — one per (canonical body, target runtime)
schemaVersion: 1
body: hooks/policy-block            # canonical body id (path-relative, no extension)
kind: hook | agent                  # what is being projected
runtime: claude-code | opencode     # target runtime id (extensible)
emit:
  path: "{runtime_config_root}/hooks/policy-block.sh"  # where the projected file lands
  frontmatterDialect: yaml-claude | toml-opencode | none
  executable: true                  # chmod +x on emit (hooks only)
events:                             # event-name mapping: canonical -> native
  PreToolUse: PreToolUse            # claude-code: identity
  # opencode example: PreToolUse: tool.before
capabilities:                      # capability gates — declared, not assumed
  requires: [bash, stdin-json]      # body needs these to function on this runtime
  degradeIfMissing: skip | error    # behavior when a required capability is absent
ioContract: normalized-v1           # which shim contract version this body speaks
```

**Shim normalization contract (`normalized-v1`).** The shim guarantees the canonical body always sees one stable shape regardless of runtime. The contract has two directions:

- **Inbound (runtime → body).** A single JSON object on stdin with stable keys:
  ```json
  {
    "event": "PreToolUse",
    "tool": { "name": "Bash", "input": { "command": "git push" } },
    "workspace": "/abs/path/to/workspace",
    "runtime": "claude-code",
    "dataHome": "/abs/resolved/data-home"
  }
  ```
  The shim maps each runtime's native event name and payload field names onto these canonical keys using the descriptor's `events` map. Keys absent on a given runtime are emitted as `null`, never omitted.
- **Outbound (body → runtime).** A single JSON object on stdout with a stable decision shape:
  ```json
  { "decision": "allow | deny | ask", "reason": "string", "mutations": null }
  ```
  The shim translates `decision` into the runtime's native control signal (exit code, response field, or block object) per the descriptor.

**Normalization invariants (the contract the build must satisfy):**
- The canonical body is **pure with respect to runtime** — it imports no runtime-specific symbol and reads only `normalized-v1` keys.
- Every native field the body could need has exactly one canonical key; the descriptor's `events` and field maps are the *only* place runtime-specific names appear.
- A missing capability is handled by the descriptor's `degradeIfMissing`, not by branching inside the body — keeping the body single-source.
- The shim is **versioned** (`ioContract: normalized-v1`); a body declares which contract version it speaks, so the projector can refuse a mismatched body/shim pair at emit time.

**Deferred build note.** Projection requires ≥2 runtimes; only Claude Code is present. When a second runtime target lands, the first build step is a `claude-code` identity adapter (proving the canonical body round-trips unchanged) followed by the first non-identity adapter for the new runtime.

### Security contract the build MUST satisfy

The following requirements derive from finding **SEC-07** in the 2026-06-15 security re-validation. They are implementer-facing — the future build must satisfy them; nothing here is yet enforced (no code exists).

- **SEC-07 — Schema-validate inbound payloads before any body trusts them.** The shim MUST validate the inbound object against the `normalized-v1` schema before forwarding to any body. A type mismatch, unparseable input, or structurally invalid payload is a hard reject (fail-closed) — never a partially-parsed passthrough to a security-decision body.
- **SEC-07 — Enforce size and nesting-depth bounds before parsing.** The build MUST impose a maximum payload size and maximum nesting depth prior to any parse step, so a hostile or pathological `tool.input` cannot cause resource exhaustion in the parser (CWE-770).
- **SEC-07 — Treat all payload values as untrusted data.** The shim passes values through; the *body* decides whether to trust them. The shim MUST NOT interpret `tool.input.command` or any other payload field — including as part of any routing, shortcutting, or early-exit logic.
- **SEC-07 — Wrong type = hard reject, not coercion.** A key present with the wrong type (e.g., `event` is an object, not a string) MUST cause an immediate reject, not a type coercion. The existing `null`-for-absent invariant (absent keys emitted as `null`, never omitted) is reaffirmed and must hold on every branch.
- **SEC-07 — Pin a safe-by-default JSON parser.** For a TypeScript/Bun shim implementation, the build MUST use a safe JSON parse with no prototype-pollution-prone object merge (e.g., avoid `Object.assign({}, parsed)` if `parsed` contains a `__proto__` key). This is the TS/Bun-specific realization of the "no pollutable merge" guard.

*These are design guards for a future implementer. No code exists at this writing; severity reflects the consequence of each gap if it reaches a built artifact unaddressed.*

---

## Item 2 — Two-layer install manifest + managed-ownership state

**Goal.** Replace the current binary `standard | low-cost` install switch with a two-layer manifest that carries per-component cost/stability/defaultInstall flags, supports a dry-run `plan` vs `apply` split, and enables a clean uninstall that removes only harness-owned keys and never clobbers operator-owned config.

**Why specifiable now.** The schema and the ownership-tracking model are independent of the installer runtime — they describe *what* is installed and *who owns each key*, not *how* a particular binary applies them. The build belongs to the opencode installer (the frozen Go installer is out of scope), but the manifest contract is fully determinable today.

**Contrast with the current install model.** Today the installer offers one global switch:

| | Current (`standard` / `low-cost`) | Proposed (two-layer manifest) |
|---|---|---|
| Granularity | One global mode for the whole install | Per-component flags (`cost`, `stability`, `defaultInstall`) |
| Selection | All-or-nothing per mode | Module → component tree; operator opts in/out per component |
| Dry-run | None | `plan` shows the full diff before `apply` writes |
| Uninstall | Not modeled | Clean uninstall scoped to harness-owned keys via the ownership ledger |
| Cost signal | Implicit (mode name) | Explicit per-component `cost` flag |

**Two-layer schema.**

- **Layer 1 — Module manifest.** A module is a shippable unit (e.g., `core-pipeline`, `diagramming`, `gcp`). The module manifest lists the module's components and module-level defaults.
  ```yaml
  # module-manifest.yaml
  schemaVersion: 1
  module: diagramming
  description: "D2 / LikeC4 / Excalidraw diagram skills + agents"
  defaultInstall: optional   # always | optional | off
  components: [d2-diagram, likec4-diagram, excalidraw-diagram]
  ```
- **Layer 2 — Component manifest.** A component is the smallest installable item (one agent, one skill, one hook). It carries the install-decision flags.
  ```yaml
  # component-manifest.yaml
  schemaVersion: 1
  component: d2-diagram
  module: diagramming
  kind: skill                # agent | skill | hook
  source: skills/d2-diagram  # repo-relative source path
  cost: low                  # low | medium | high  (runtime model/effort cost signal)
  stability: stable          # experimental | beta | stable
  defaultInstall: false      # whether selected by default
  emits:                     # the keys/files this component owns (ownership tags)
    files: ["{config_root}/skills/d2-diagram/SKILL.md"]
    configKeys: []           # dotted keys this component owns in .team-harness.json
  ```

**Managed-ownership state model.** A single append-only ledger records every key/file the harness created, so uninstall is provably scoped. The ledger lives under the data-home (Item 3).

```jsonl
{"ts":"<iso8601>","op":"install","component":"d2-diagram","owns":{"files":["{config_root}/skills/d2-diagram/SKILL.md"],"configKeys":[]},"manifestVersion":1}
{"ts":"<iso8601>","op":"install","component":"core-pipeline","owns":{"files":["{config_root}/agents/orchestrator.md"],"configKeys":["logs-mode","logs-path"]},"manifestVersion":1}
```

**Ownership invariants:**
- **Harness-owned vs operator-owned.** A key/file is harness-owned **iff** it appears in some component's `owns` ledger entry. Everything else — including `mcpServers.memory` URL/bearer, the context7 API key, and any operator-authored config key — is operator-owned and untouchable by uninstall.
- **Uninstall scope.** `uninstall` removes exactly the union of `owns.files` and `owns.configKeys` across the components being removed, and nothing else. A config file is rewritten read-merge-write (whole document), deleting only the owned keys — mirroring the existing single-config-file rule (CLAUDE.md §5).
- **Manifests carry flags and ownership tags only** — never secrets, tokens, or URLs. Operator identity stays in the existing Keep/Change preservation path.

**`plan` vs `apply` split.**
- `plan` — reads the manifests + the current ledger, computes the diff (`to-create`, `to-update`, `to-skip-hash-match`, `to-remove`), and prints it. **Writes nothing.** This is the dry-run the operator reviews before any filesystem mutation.
- `apply` — executes the `plan` diff, writes/updates files, and appends the resulting `install`/`update`/`remove` entries to the ownership ledger. Idempotent: a hash-matching component is skipped (consistent with the current installer's skip-on-hash-match behavior).

**Deferred build note.** Build belongs to the opencode installer. The frozen Go installer is not modified. The first build milestone is the `plan` reader (pure, no writes), then `apply`, then `uninstall`.

### Security contract the build MUST satisfy

The following requirements derive from findings **SEC-04**, **SEC-05**, and **SEC-06** in the 2026-06-15 security re-validation. Each guard is implementer-facing — the future build must satisfy them; nothing here is yet enforced.

- **SEC-04 — Write-time secret-scan before persisting any manifest or ledger entry.** The manifest/ledger writer MUST run a secret-scan (reusing the `policy-block.sh` pattern class) over every value before persisting, and MUST fail-closed on a high-confidence match. The "manifests carry flags and ownership tags only — never secrets" invariant must be *enforced at write time*, not left as prose discipline. Manifests and ledger files are committed/synced artifacts subject to the same secret floor as any other written file.
- **SEC-05 — Ledger records key NAMES only; never key values, secret material, or expanded user-home absolute paths.** The `configKeys` field in every ledger entry MUST record ownership *identity* (the key name, not its value). Extending the ledger for idempotency or diffing MUST NOT capture the value alongside the key — operator-owned keys explicitly include the MCP bearer and the context7 API key; a value-recording ledger would persist them into an append-only file. Path entries MUST use `{config_root}`-templated placeholders rather than expanded user-home absolute paths.
- **SEC-06 — Uninstall is fail-closed against ledger integrity loss.** A malformed, truncated, or absent ledger entry MUST be skipped — never deleted heuristically. The `uninstall` command MUST NOT delete any key or file that is not provably present in a well-formed ledger entry. A corrupt or missing ledger MUST surface to the operator via the `plan` dry-run rather than triggering any heuristic deletion. The JSONL one-object-per-line shape MUST be mandated so a truncated tail line does not poison earlier entries — the build MUST implement skip-the-bad-line parsing.

*These are design guards for a future implementer. No code exists at this writing; severity reflects the consequence of each gap if it reaches a built artifact unaddressed.*

---

## Item 3 — Single data-home resolver

**Goal.** One env-addressable persistence root, resolved by one function, that yields the harness data-home directory consistently across runtimes and operating systems — so manifests, the ownership ledger, and workspaces have a single well-defined home instead of scattered fixed paths.

**Why specifiable now (and cheapest to build first).** The resolver is a small pure function with a deterministic resolution order and no runtime dependency. It can be specified completely today, and when the opencode effort begins it is the first thing to build because Items 1 and 2 both reference its output (`dataHome`, ledger location).

**Env var name (TH-native).** The canonical override is **`TEAM_HARNESS_DATA_HOME`**, with **`TH_DATA_HOME`** accepted as a short alias.
- *Rationale:* `TEAM_HARNESS_*` mirrors the repo's own product name and the existing `.team-harness.json` config file; `TH_*` mirrors the plugin/skill namespace (`/th:*`) operators already use. Both are unambiguously TH-native. The long form is canonical (self-documenting in scripts); the short form is the ergonomic alias.

**Resolution order (first match wins):**
1. **`TEAM_HARNESS_DATA_HOME`** — explicit canonical override, if set and non-empty.
2. **`TH_DATA_HOME`** — explicit short alias, if set and non-empty.
3. **Runtime-native config root**, if the active runtime exposes one (auto-detected): e.g. the Claude Code config root → `{claude-config-root}/team-harness`. The resolver detects the runtime from a small ordered probe (env markers, then known config-root existence) and uses the first that matches.
4. **OS-default user data dir** (platform auto-detection):
   - Linux/BSD: `$XDG_DATA_HOME/team-harness` if `XDG_DATA_HOME` set, else `~/.local/share/team-harness`.
   - macOS: `~/Library/Application Support/team-harness`.
   - Windows: `%LOCALAPPDATA%\team-harness` if set, else `%APPDATA%\team-harness`.
5. **Final fallback:** `~/.team-harness` (home-relative), used only when no env, runtime root, or OS dir can be resolved.

**Resolver contract:**
- **Signature (language-neutral):** `resolveDataHome() -> absolute path`. Pure with respect to inputs (env + OS + runtime probe); performs no network I/O.
- **Creation + permissions:** the resolved root is created if absent with mode `0700`; state files written under it use `0600`. (Windows: ACL equivalent restricting to the current user.)
- **Stability:** within a single process the result is memoized; across processes it is deterministic for a fixed environment.
- **Path expansion:** `~` and environment variables in an explicit override are expanded once at resolution time; a relative override is rejected (the data-home must be absolute).
- **What lives under it:** the ownership ledger (Item 2), the install manifests' applied-state cache, and — when `logs-mode: local` — the default workspaces root, unless an explicit `logs-path` overrides it. (Obsidian mode's vault path is unaffected; it is operator-owned config.)

**Deferred build note.** This is a self-contained pure function with a unit-testable resolution table; it is the recommended first build artifact of the opencode effort because Items 1 and 2 consume its output.

### Security contract the build MUST satisfy

The following requirements derive from findings **SEC-01**, **SEC-02**, **SEC-03**, and **SEC-08** in the 2026-06-15 security re-validation. The resolver is the highest-risk surface because Items 1 and 2 both consume its output and inherit its weaknesses. These guards are implementer-facing; the future build must satisfy them.

- **SEC-01 — Canonicalize the resolved root and refuse to operate on a symlinked path.** The resolver MUST resolve all symlinks in the resolved root path (`realpath`/`O_NOFOLLOW` semantics) and MUST either refuse to operate on any root whose final or intermediate component is a symlink not owned by the current user, or operate only on the fully-resolved real path after verifying ownership. State-file writes under the root MUST use `O_NOFOLLOW` (or the platform equivalent). On Windows, the ACL-equivalent step MUST also reject reparse points and junctions in the resolved path.
- **SEC-02 — Create the root atomically with the restrictive mode; verify-or-fail-closed on a pre-existing root.** The directory MUST be created with mode `0700` in a single atomic operation. Because `mkdir` honors mode atomically only modulo umask, the build MUST also mandate a `0077` umask around the create OR an explicit `fchmod` on a handle opened to the just-created directory — not a path re-lookup after the fact. If the root already exists, the resolver MUST verify it is a directory, owned by the current user, with no group/other permissions, and MUST fail-closed (refuse, surface to operator) rather than silently `chmod`-correct a directory it does not own.
- **SEC-03 — The `0700`/`0600` mandate binds every resolution branch; the Windows ACL contract is concrete, not implied.** Every branch of the resolution order (XDG, `%LOCALAPPDATA%`, `%APPDATA%`, home-relative fallback) MUST produce a leaf directory that is always tightened to `0700` and state files to `0600`, regardless of where in the ancestor chain directory creation began. Intermediate directories created by the resolver inherit the OS default, but the leaf is always tightened. The Windows ACL contract MUST be spelled out: strip inherited ACEs, grant only the current user SID full control, deny Everyone/Authenticated-Users any ACE. A post-create verification step MUST assert the achieved mode or ACL matches the mandate and MUST fail-closed if it does not.
- **SEC-08 — After single-pass expansion, normalize the path and reject any residual `..` traversal segment.** "Absolute after one expansion" does not by itself prevent absolute paths containing `..` components that traverse outside the intended boundary. The build MUST normalize the expanded path and reject any residual `..` segment. Single-pass expansion MUST be documented as a *security requirement* (not an ergonomic choice) so a future maintainer does not relax it to recursive expansion. An explicit `TEAM_HARNESS_DATA_HOME` or `TH_DATA_HOME` override remains subject to the SEC-01 symlink and SEC-03 ownership/permission checks — overriding the env var does not exempt the resolved path from the safety checks applied to auto-detected roots.

*These are design guards for a future implementer. No code exists at this writing; severity reflects the consequence of each gap if it reaches a built artifact unaddressed.*

---

## Cross-Harness Compatibility Matrix

The table below records the per-asset-type cross-harness compatibility cost, derived from direct research into how the second target harness consumes CC-formatted assets. This is durable design knowledge that informs the authoring mandate and the migration guide.

| Asset | Target harness native format | Reads CC files directly? | Transform cost |
|---|---|---|---|
| **Skills** (`SKILL.md`) | Same `SKILL.md` + frontmatter | **Yes** — discovers `.claude/skills/` directly | **None** — already cross-harness |
| **Rules / context** (`CLAUDE.md`) | `AGENTS.md` (cross-tool standard) | **Yes** — falls back to `CLAUDE.md` when no `AGENTS.md` exists | **Near-zero** — optionally add `AGENTS.md` as an entry point |
| **Agents** (`.md` + frontmatter) | Same Markdown + frontmatter; CC-compatible agent directories are partially read | Partially — structure matches, but `permission`/`model`/`mode` fields differ | **Light** — emit-time frontmatter delta (tool permissions → `permission` object, provider-prefixed model IDs, explicit `mode`) |
| **Commands** (`.md`) | Markdown + frontmatter in `.opencode/commands/`; `$ARGUMENTS` placeholder | Partially — `$ARGUMENTS` vs `{input}`, relocation to `.opencode/commands/` | **Light** — frontmatter delta + path relocation |
| **Hooks** | TypeScript/JS plugins on Bun (async event callbacks, 23+ events), in `.opencode/plugins/` | **No** — no shell-script hook execution; the official migrator skips hooks entirely | **Hard** — rewrite to a TS plugin (Decision A = TypeScript) |

**Two facts collapse most of the assumed conversion work:**

1. Skills and rules are effectively cross-harness today with zero or near-zero effort — the second harness natively ingests CC skill directories and falls back to `CLAUDE.md` for rules. A pure runtime shim is unnecessary for these asset types.
2. Hooks are the only surface with a fundamental execution-model gap. The gap is not an I/O-format difference — it is "Bash script" vs "TypeScript plugin on Bun." A format-shim cannot bridge execution models; the hook must be rewritten or bridged through a materialized TS artifact.

**Hybrid/materialization reality.** Shipping multi-harness projects converge on a hybrid approach: a shared canonical source plus thin per-provider adapters, with some artifacts materialized (committed) rather than generated purely at install via a runtime shim. For agents and commands, a thin emit-time frontmatter transform suffices; the body is unchanged and no runtime shim is needed. For hooks, a materialized TS artifact is unavoidable. This softens the roadmap's prior "pure runtime shim, nothing committed per-runtime" framing: minimize per-runtime materialization; some is unavoidable for the hook surface.

---

## Cross-Harness Authoring Mandate

This mandate is grounded in the per-asset-type matrix above. It is binding as authoring and review discipline today; it is NOT dual-runtime test-enforced today because the projection layer and the hook migration are future work.

### The rule

Every new distributed implementation in this repository must be authorable for both Claude Code and the target second harness, at the cost the matrix assigns to its asset type:

- **Skills and rules** incur no or near-zero cross-harness effort. Author once; both harnesses read them.
- **Agents and commands** are authored against the canonical frontmatter. The emit-time frontmatter delta (permission objects, provider-prefixed model IDs, `$ARGUMENTS` placeholder) is applied by the projector at emit time — not hand-duplicated into a per-harness copy.
- **Hooks are authored in TypeScript (Decision A = A2, CLOSED).** A single TS/JS body runs natively on Claude Code (Node — already a CC runtime dependency) and opencode (Bun). A Bash hook body is no longer the authoring target for any new hook in this repository. The existing 18 Bash hooks are a future migration tracked in `docs/opencode-migration-guide.md`.

### Actionable now (enforceable as review discipline today)

The following are checkable on every pull request today, even without the target harness present in-repo:

- Author skills in their existing `SKILL.md` format with cross-harness-compatible frontmatter — they already satisfy both harnesses.
- Author rules in `CLAUDE.md` (and optionally in `AGENTS.md`); keep rule content free of CC-specific invocation syntax.
- Keep agent and command bodies free of runtime-specific frontmatter values. Emit-time delta owns those values; the body must not assume them.
- **Author all new hooks in TypeScript/JavaScript, not Bash.** Decision A is closed. No new Bash hook should be added to `hooks/` from this point forward; the migration guide documents the rewrite process for the existing hooks.

### Deferred to the build (NOT enforced today)

The following are deferred until the opencode integration effort begins and the second harness is present in-repo:

- Actual dual-runtime projection and the first non-identity adapter (Item 1 build).
- The materialized `.opencode/` directory structure.
- Rewriting the existing 18 Bash hooks to TypeScript (process documented in `docs/opencode-migration-guide.md`).
- Dual-runtime test execution — running the hook suite on both Node (Claude Code) and Bun (target harness) in CI.

### Honest enforceability statement

The mandate is binding as authoring and review discipline today. What is verifiable today is the rule's presence and shape (structural test, Suite 105); what is NOT verifiable today is dual-runtime hook execution, because the projection layer and the hook migration are future work. The migration guide documents the migration process so the deferred work is fully specified before it begins.
