# Opencode Distribution-Layer Roadmap

> **Status: see [`docs/lifecycle.md`](./lifecycle.md) for the current stage-by-stage maturity of the opencode runtime.** The Go installer (`cmd/install/`) ships the OpenCode agents, skills, commands, MCP configuration, and ownership ledger. It does not install Claude Code or a Team Harness OpenCode hook plugin; OpenCode uses native permissions and approvals.

## Build status — buildable-now-vs-defer

| Item | Mechanism | Status | Notes |
|------|-----------|--------|-------|
| 1 | Agent projection | **BUILT** | Canonical agent bodies receive the OpenCode name/model/mode delta at install time. General per-agent permissions are omitted; the four PR review agents receive a deny-by-default read/glob/grep map. |
| 2 | Two-layer install manifest + managed-ownership state | **BUILT** (opencode path) | `ComputePlan`/`ApplyPlan`/`appendLedger`/`readLedger` implement the plan/apply/ledger contract in `cmd/install/plan.go`, `apply.go`, `ledger.go`. All SEC-04/05/06 guards enforced. `--runtime claude-code` through the manifest engine is a deliberate empty no-op — the former legacy file-copy path (`installAgents`/`installSkills`/`installHooks` in `main.go`) was retired with the hook Bash→TS cutover (issue #446); Claude Code installs exclusively through the marketplace plugin, so there is no CC path left to unify into the manifest engine (see Genuine residual gaps, item 2, [RESOLVED]). |
| 3 | Single data-home resolver | **BUILT** | `ResolveDataHome()` in `cmd/install/datahome.go` implements the five-branch resolution order with full SEC-01/02/03/08 enforcement. |
| 4 | Updater (`install update`) | **BUILT** | `cmd/install/update.go` + `bin/update-opencode.{sh,ps1}`. Three-state version-delta (update-available / already-current / installed-ahead). `ComputePlan` diff preview, interactive `[Y/n]` confirm (operator "n" → zero writes), `ApplyPlan` apply, managed-key-only config bump (`refreshManagedConfigKeys`), restart-to-activate honesty block. `dist/VERSION` release asset for cheap pre-check. |

## Security enforcement (current code)

All SEC-01..08 guards referenced in the original design are enforced in the production codebase:

| Guard | Enforcement point | File |
|-------|-------------------|------|
| SEC-01 / SEC-02 / SEC-03 / SEC-08 | Data-home resolver security pipeline | `cmd/install/datahome.go` `secureAndVerify()` |
| SEC-01 / SEC-DR-3 | Hardened write path (O_NOFOLLOW leaf, per-segment lstat reject) | `cmd/install/hardened_write.go` `hardenedWriteFile()` |
| SEC-04 | Secret-scan before every ledger write | `cmd/install/ledger.go` `appendLedger()` |
| SEC-05 | Structural gate on ledger ownership tags | `cmd/install/ledger.go` `validateOwnershipTags()` |
| SEC-06 | Fail-closed malformed-line parsing in ledger read | `cmd/install/ledger.go` `readLedger()` |
| SEC-OC-R4 | Managed-key-only overwrite (never trust forged `installed_version`) | `cmd/install/opencode_config.go` `writeOpencodeTeamHarnessConfig()`, `refreshManagedConfigKeys()` |
| SEC-DR-6 | Operator-disabled MCP servers never re-enabled | `cmd/install/opencode_json.go` `registerOpencodeMCP()` |
| SEC-DR-7 | Non-interactive flag closes "TTY present, no human" hang | `cmd/install/dispatch.go` `nonInteractiveFlag` |

## Genuine residual gaps

The following items are NOT built and are tracked as future work:

1. **Adapter projector (Item 1 descriptor-consuming build).** `opencodeRuntimeTransform` in `transform.go` hard-codes the CC→opencode frontmatter delta in Go. A descriptor-consuming projector that reads adapter YAML and generates the transform at install time does not exist. Entry files (e.g. `opencode.json`, `agents/*.md` for opencode) are hand-authored. When a third runtime target appears, this becomes the blocker.

2. **[RESOLVED, hook Bash→TS cutover] CC path through the manifest engine.** Superseded, not built: the operator directive that closed issue #446 retired the Claude Code install path from this binary entirely — the former legacy file-copy path (`installAgents`/`installSkills`/`installHooks` in `main.go`) is unreachable from a bare invocation (it now prints a marketplace redirect notice), and `--runtime claude-code` through the manifest engine (`ComputePlan`/`ApplyPlan`) resolves to empty manifests, a deliberate no-op. Claude Code installs exclusively through the marketplace plugin; there is no CC path left to unify into the manifest engine. See `docs/lifecycle.md`.

3. **Per-component operator selection surface.** `install update` updates the full default-install set (matching `install apply`). A `clack groupMultiselect`-style opt-in tree for selecting individual components (filtered by `cost`/`stability`/`defaultInstall` flags) is not built. This is additive (the current full-set apply is a safe, correct default).

4. **Static manifest YAML.** Component and module manifests are synthesized in Go code (`cmd/install/manifest_registry.go`, `opencode_deps.go`) rather than from declarative YAML files on disk. A static YAML representation would make the manifest auditable as a committed artifact without reading Go source. The current approach is functional and correct; YAML is a presentation-layer improvement.

5. **Live OpenCode smoke CI.** Go tests cover projection and installation, but CI does not yet launch OpenCode and resolve the installed default agent end to end.

---

## Item 1 — Adapter registry + format-shim

**Goal.** Author one canonical agent body and project only the frontmatter differences required by OpenCode.

**Current build state.** The transform layer exists (`transform.go`), as do the component and module manifests (`manifest_registry.go`). The canonical agent bodies are built. The **adapter descriptor shape** and the **shim normalization contract** are specified below. The **descriptor-consuming projector** (the code that reads adapter YAML and drives the projection) is NOT built — it is the first build milestone when a third runtime target appears.

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

**Normalization invariants (the contract the projector build must satisfy):**
- The canonical body is **pure with respect to runtime** — it imports no runtime-specific symbol and reads only `normalized-v1` keys.
- Every native field the body could need has exactly one canonical key; the descriptor's `events` and field maps are the *only* place runtime-specific names appear.
- A missing capability is handled by the descriptor's `degradeIfMissing`, not by branching inside the body — keeping the body single-source.
- The shim is **versioned** (`ioContract: normalized-v1`); a body declares which contract version it speaks, so the projector can refuse a mismatched body/shim pair at emit time.

**Deferred build note.** Projection requires ≥2 runtimes; both Claude Code and opencode are now present. The first build step is a `claude-code` identity adapter (proving the canonical body round-trips unchanged) followed by the first non-identity adapter for opencode. The current hard-coded `opencodeRuntimeTransform` is the manual equivalent — migration to a descriptor-driven projector is additive. The descriptor-consuming projector itself is **design only** until the third runtime target triggers the build; `cmd/install/transform.go` is the production placeholder.

### Security contract the build MUST satisfy (projector milestone)

- **SEC-07 — Schema-validate inbound payloads before any body trusts them.** The shim MUST validate the inbound object against the `normalized-v1` schema before forwarding to any body. A type mismatch, unparseable input, or structurally invalid payload is a hard reject (fail-closed) — never a partially-parsed passthrough to a security-decision body.
- **SEC-07 — Enforce size and nesting-depth bounds before parsing.** The build MUST impose a maximum payload size and maximum nesting depth prior to any parse step.
- **SEC-07 — Treat all payload values as untrusted data.** The shim passes values through; the *body* decides whether to trust them. The shim MUST NOT interpret `tool.input.command` or any other payload field.
- **SEC-07 — Wrong type = hard reject, not coercion.** A key present with the wrong type MUST cause an immediate reject, not a type coercion.
- **SEC-07 — Pin a safe-by-default JSON parser.** For a TypeScript/Bun shim implementation, avoid prototype-pollution-prone object merge (e.g., avoid `Object.assign({}, parsed)` if `parsed` contains a `__proto__` key).

---

## Item 2 — Two-layer install manifest + managed-ownership state

**Status: BUILT for the opencode runtime.** The CC path is a deliberate empty no-op (see residual gap 2 above).

The schema and the ownership-tracking model are implemented in `cmd/install/`. The build milestones specified in the design — `plan` reader (pure, no writes), then `apply`, then `uninstall` — are all complete for the opencode path.

**Contrast with the current install model.**

| | Legacy (`standard` / `low-cost`) | Manifest engine |
|---|---|---|
| Granularity | One global mode for the whole install | Per-component flags (`cost`, `stability`, `defaultInstall`) |
| Selection | All-or-nothing per mode | Module → component tree; operator opts in/out per component (UI deferred — see residual gap 3) |
| Dry-run | None | `plan` shows the full diff before `apply` writes |
| Uninstall | Not modeled | Clean uninstall scoped to harness-owned keys via the ownership ledger |
| Update | Re-run the full installer | `update` subcommand: version-delta, diff preview, managed-key-only config bump |

**Ownership invariants (enforced in code):**
- A key/file is harness-owned iff it appears in a well-formed component ledger entry (`readLedger` → `latestOwnership`). Everything else is operator-owned.
- `uninstall` removes exactly the union of `owns.files` and `owns.configKeys` for the targeted components, and nothing else.
- `update` bumps only `installed_version`/`updated_at`/`format_version` in `.team-harness.json`; all other operator keys survive byte-for-byte (SEC-OC-R4 via `refreshManagedConfigKeys`).

### Security contract the build MUST satisfy (enforced in production)

- **SEC-04** — Secret-scan before every `appendLedger` call.
- **SEC-05** — Ledger records key NAMES only; `{config_root}`-templated placeholders for paths; no secret values.
- **SEC-06** — Fail-closed on malformed ledger lines; `ToRemove` derives only from well-formed entries.

---

## Item 3 — Single data-home resolver

**Status: BUILT.** `ResolveDataHome()` in `cmd/install/datahome.go` implements the five-branch resolution order with full SEC-01/02/03/08 enforcement. The resolver is memoized, cross-platform (Windows/macOS/Linux), and unit-tested (`cmd/install/datahome_test.go`, `datahome_unix_test.go`, `datahome_windows_test.go`).

**Resolution order (first match wins):** `TEAM_HARNESS_DATA_HOME` env var → `TH_DATA_HOME` env var → runtime-native config root (opencode: `XDG_CONFIG_HOME/opencode` or `~/.config/opencode`) → OS default → `~/.team-harness` fallback.

### Security contract the build MUST satisfy (enforced in production)

- **SEC-01 / SEC-02 / SEC-03 / SEC-08** — `secureAndVerify()` in `datahome.go`: per-segment `lstat` walk rejects symlinks and reparse points before resolving each directory segment; final path containment check (`isDescendantOf`); single-expansion `os.ExpandEnv` (no double-expansion, SEC-08); result pinned before any I/O uses it.
- **SEC-DR-3** — Hardened write path for all files placed under the data-home root: `O_NOFOLLOW` on the leaf open (`hardenedWriteFile` in `hardened_write_unix.go`), per-segment `mkdir` (not recursive `MkdirAll`).

---

## Cross-Harness Compatibility Matrix

| Asset | Target harness native format | Reads CC files directly? | Transform cost |
|---|---|---|---|
| **Skills** (`SKILL.md`) | Same `SKILL.md` + frontmatter | **Yes** — discovers `.claude/skills/` directly | **None** — already cross-harness |
| **Rules / context** (`CLAUDE.md`) | `AGENTS.md` (cross-tool standard) | **Yes** — falls back to `CLAUDE.md` when no `AGENTS.md` exists | **Near-zero** — optionally add `AGENTS.md` as an entry point |
| **Agents** (`.md` + frontmatter) | Same Markdown + frontmatter; CC-compatible agent directories are partially read | Partially — structure matches, but `permission`/`model`/`mode` fields differ | **Light** — omit general permission/model fields, emit explicit `mode`, and project an exact read-only permission map for the four PR review agents; built in `opencodeRuntimeTransform` |
| **Commands** (`.md`) | Markdown + frontmatter in `.opencode/commands/`; `$ARGUMENTS` placeholder | Partially — `$ARGUMENTS` vs `{input}`, relocation to `.opencode/commands/` | **Light** — frontmatter delta + path relocation |
| **Hooks** | Native OpenCode permissions and approvals | **No** | **None** — Team Harness does not install a parallel OpenCode hook plugin |

---

## Cross-Harness Authoring Mandate

Every new distributed implementation must be authorable for both Claude Code and opencode, at the cost the matrix assigns to its asset type:

- **Skills and rules** incur no or near-zero cross-harness effort. Author once; both harnesses read them.
- **Agents and commands** are authored against the canonical frontmatter. The emit-time frontmatter delta is applied by `opencodeRuntimeTransform` at install time — not hand-duplicated into a per-harness copy.
- **Hooks are a Claude Code runtime surface.** OpenCode relies on its native permission and approval model rather than duplicating those controls in a Team Harness plugin.

### Actionable now (enforceable as review discipline)

- Author skills in their existing `SKILL.md` format with cross-harness-compatible frontmatter.
- Author rules in `CLAUDE.md` (and optionally in `AGENTS.md`); keep rule content free of CC-specific invocation syntax.
- Keep agent and command bodies free of runtime-specific frontmatter values.
- **Author all new hooks in TypeScript/JavaScript, not Bash.** Decision A is closed.

### Deferred to the projector build

- Actual descriptor-driven projection and the first non-identity adapter (Item 1 projector build).
- The materialized `.opencode/` directory structure via the projector.
- Live OpenCode default-agent resolution in CI.

### Honest enforceability statement

The mandate is binding as authoring and review discipline. OpenCode installation and projection are verified by `go test ./cmd/install/`; Team Harness does not claim dual-runtime hook execution.
