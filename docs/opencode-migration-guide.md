# Opencode Migration Guide

> **Status: process design only.** This document describes the migration process for converting team-harness assets from Claude Code format to the target second harness format. It does NOT perform the migration. No `agents/`, `skills/`, or `hooks/` file is modified by this document. The actual migration — rewriting the 18 Bash hooks to TypeScript, materializing the `.opencode/` directory structure, building adapters — is future work tracked separately. This guide is written before the migration begins so the process is fully specified and reviewable before any conversion starts.
>
> **Interim canonicality (declared 2026-07-01, issue batch #446-452, T6a).** The 11 hook families wired into Claude Code already have a TS port (`hooks/ts/bodies/`), but `hooks.json`/`config.json` still invoke the Bash `.sh` files. **Until the CC cutover lands (Group B), Bash is the canonical source of gate logic for Claude Code and TS is the generated/hand-ported projection** — a divergence between the two is a defect in the TS projection, not an ambiguity about which side is authoritative. The dual-target functional-suite mechanism (`HOOK_IMPL=bash|ts` in `tests/run-all.sh`) is the verification spike required by point 4 above; it runs the existing Bash-oracle test cases against the compiled TS artifacts for every wired hook family. This line is superseded, not accumulated, when Group B completes the cutover and TS becomes canonical for both runtimes.

---

## Per-asset-type migration process

### Skills

**No migration step required.** The target harness discovers `.claude/skills/` directly and reads `SKILL.md` files in the same format Claude Code uses. Skills are already cross-harness. Optionally, a future packaging decision may require surfacing skills under `.opencode/skills/` — that is an install-time placement step, not a content conversion.

### Rules / context (`CLAUDE.md`)

**No migration step required.** The target harness falls back to `CLAUDE.md` when no `AGENTS.md` exists. Rules are effectively cross-harness without conversion. Optionally, add `AGENTS.md` as a cross-tool entry point that points at or summarizes the same rule content — this is a near-zero-effort authoring step, not a conversion.

### Agents and commands

**Emit-time frontmatter delta.** The body content of agent and command files requires no modification. The migration applies a frontmatter transformation at emit time, driven by the Item 1 adapter descriptor — not by hand-editing each file. The transform covers:

- **Tool permissions:** CC-style `tools` allowlist → explicit `permission` object with `allow`, `ask`, and `deny` arrays.
- **Model identifiers:** bare model names → provider-prefixed identifiers (e.g., `claude-opus-4-5` → `anthropic/claude-opus-4-5`).
- **Mode:** add explicit `mode` field if absent.
- **Argument placeholder:** `$ARGUMENTS` is the canonical placeholder on both harnesses (verified against live Claude Code and opencode docs). The transform is **identity** — no rewrite is needed. (A prior draft of this guide listed `{input}` → `$ARGUMENTS`, but `{input}` is not a token in either live harness.)
- **Relocation:** agent files → `.opencode/agents/`; command files → `.opencode/commands/`.

This transform is reversible and idempotent. The canonical body remains in `agents/` unchanged; the projected copy lands in the target harness directory.

### Hooks

**Hard case — TypeScript rewrite required.**

The target harness does not execute shell scripts as hooks. Its hook model uses TypeScript/JavaScript plugins on Bun, registered as async event callbacks in `.opencode/plugins/`. There is no execution-model bridge that converts a Bash hook body into a TS plugin without a rewrite. This is the only fundamentally incompatible surface.

**Process per hook family:**

1. **Event mapping.** Map each CC hook event (e.g., `PreToolUse`, `PostToolUse`, `Stop`) to the corresponding target harness plugin event callback. The target harness exposes 23+ events; most CC hook events have a direct counterpart.
2. **Decision-object translation.** CC hooks communicate via exit code and stdout JSON (`{ "decision": "allow|deny|ask", "reason": "..." }`). The TS plugin equivalent is a return value from the async callback function — translate the exit-code semantics to the TS return value contract.
3. **Gate semantics preservation.** The deterministic security gates (`policy-block`, `dev-guard`, `checkpoint-guard`, `prepublish-guard`) rely on fail-closed behavior: a missing or erroring hook defaults to deny on security-critical paths. The TS rewrite MUST preserve this: an uncaught exception or a missing decision field in the TS plugin MUST be treated as a deny, not as a pass-through allow.
4. **Verification spike (required before trusting the rewrite).** Whether the deterministic gate semantics (fail-closed behavior, the specific deny/ask/allow decision logic) are faithfully preserved when rewritten as a TS-on-Bun plugin is a security-relevant unknown. A verification spike — running the rewritten TS gates against the existing hook test suite and against known-bad inputs — MUST be completed and signed off before the rewritten hooks are trusted in production. This is not optional.
5. **Entropy-scan fold.** The `policy-block` hook currently calls a Python entropy-scanning component (`policy-block.sh` invokes Python-based pattern matching for high-entropy strings). The TS rewrite MUST fold this entropy-scan logic directly into the TS hook body, so full secret-detection coverage no longer requires Python on the end-user machine. This is the corollary of the two-tier dependency rule: a TS-native hook that ships the entropy scan inline drops the Python end-user dependency entirely, producing a leaner install on both Claude Code (Node) and the target harness (Bun).

---

## Hook-language options considered

The operator requested that the options be documented before the decision was recorded, so the rationale is preserved for future reference.

### A1 — Keep Bash bodies + ship ONE TS compat-plugin [considered, not chosen]

Author all existing Bash hook bodies unchanged. Ship a single TypeScript plugin for the target harness that reads the CC hooks configuration and dispatches to the existing Bash scripts via child process.

**Pro:** Preserves the entire existing 18-hook Bash investment with no rewrite cost. Adds only one materialized TS bridge artifact for the target harness provider.

**Con:** Keeps two languages in the hook surface. The bridge is a per-provider materialized artifact that adds its own maintenance burden. The deterministic gate guarantees through the bridge are unverified — the Bash scripts run as child processes from within a TS plugin, adding a process boundary whose failure modes differ from direct hook invocation. If the child process fails or times out, the bridge must still fail-closed for the gate semantics to hold — an additional guarantee the bridge must implement.

### A2 — Full TypeScript/JavaScript rewrite of all hooks [CHOSEN]

Rewrite all 18 Bash hook bodies as TypeScript/JavaScript plugins. A single TS body runs natively on Claude Code (Node) and the target harness (Bun) without a bridge.

**Pro:** Single authoring language across both harnesses. Native execution on both runtimes. No per-provider bridge artifact. Lower long-term maintenance burden.

**Con:** Higher up-front rewrite cost. Discards the existing Bash hook investment.

**Chosen** because the runtime-dependency analysis (below) shows TS adds little marginal runtime cost, and a single language across both harnesses is the lower long-term maintenance burden. The verification spike (see hooks migration process above) addresses the security-relevant unknown before the rewritten gates are trusted.

### A3 — Hermetic Python via uv [DROPPED]

Author hooks in Python, distributed hermetially via `uv` so no system Python is required.

**Con:** Does not help the target harness — it wants TS-on-Bun, not Python. This option was the earlier hedge against the Node runtime dependency but is weakened by the evidence: the target harness requires TS/JS plugins and has no Python execution path. Dropped.

---

## Runtime-dependency analysis

**Node is already a Claude Code runtime dependency.** Claude Code ships on Node; it is already required on any machine running Claude Code. Authoring hooks in TypeScript therefore adds little marginal runtime cost on the Claude Code side — the Node runtime is already present.

**The target harness runs plugins on Bun.** Bun executes TypeScript/JavaScript natively without a separate compilation step. A TS hook body is the only language that runs natively on both harnesses (Node on CC, Bun on the target) without a bridge or an added runtime.

This is the load-bearing rationale for choosing A2 over A1 and A3: TS is the single-language path that is native on both harnesses with no added end-user runtime dependency beyond what is already required.

---

## Installation / distribution on opencode

### An installer is mandatory

An installer script is **mandatory** for the target second harness. There is no plugin marketplace equivalent to Claude Code's `/plugin marketplace add` → `/plugin install th` flow. The canonical CC distribution path does not reach the target harness at all. Converted assets must be physically placed into the target harness's config locations and its config file must be merged — which is exactly what an installer does.

### Asset-placement map

The following table shows where each converted asset type lands after migration:

| Asset type | Target location |
|---|---|
| Agents | `.opencode/agents/` (or registered as entries in `opencode.json`) |
| Commands | `.opencode/commands/` |
| Skills | `.opencode/skills/` — or reuse `.claude/skills/` directly (the target harness reads CC skill directories; no placement step may be needed) |
| Rules | `AGENTS.md` (cross-tool standard), with `CLAUDE.md` as fallback |
| Hooks (TS plugins) | `.opencode/plugins/` |
| Config | Merged into `opencode.json` |

### Installer mechanism

The installer mechanism is the roadmap's **Item 2** design (two-layer install manifest + ownership ledger + `plan`/`apply` split + clean uninstall) running on the **Item 3** single data-home resolver (`TEAM_HARNESS_DATA_HOME`). Per **Decision B (LOCKED)**, the installer is the repurposed single-binary Go installer (`cmd/install/`), which the roadmap already reserves as the opencode agents installer. This guide does not re-specify the Item 2 or Item 3 contracts — refer to `docs/opencode-distribution-roadmap.md` for the full mechanism.

### Install-path options

Three options are available for placing assets on the target harness:

1. **Dedicated installer binary (recommended — Decision B).** The existing Go installer (`cmd/install/`), repurposed for the target harness, places all file-based assets and merges `opencode.json` in one pass. This is the only option that covers agents, commands, skills, rules, hooks, and config in a single operation. It mirrors the existing Go-installer flow and is the Decision B choice.

2. **Native npm plugin referenced from `opencode.json` `plugins`.** The target harness can load a published npm package as a plugin. This option can serve the TS hook plugins but cannot place the file-based agents, commands, skills, or rules — it is insufficient on its own for a full harness install.

3. **Hybrid: installer for file-based assets + npm package for hooks.** The installer materializes the file-based assets; the TS hook plugins are distributed as a published npm package and referenced in `opencode.json`. This option adds value once the hook plugins exist as a publishable artifact. Recommended as a complement to option 1 at that stage.

**Recommendation:** option 1 for the initial implementation; option 3 if and when the hook plugins are later distributed as a published package.

### Uninstall

A clean uninstall is scoped by the **Item 2 ownership ledger** — the uninstall command removes only harness-owned keys and files (those recorded in `{config_root}`-templated paths and `opencode.json` keys the manifest recorded at install time), never operator config. The full ledger contract is specified in `docs/opencode-distribution-roadmap.md` § Item 2; it is not re-specified here.

### Contrast with Claude Code

In Claude Code, the canonical distribution path is the plugin marketplace: `/plugin marketplace add valianx/team-harness` → `/plugin install th`. No installer script is needed by the operator. In the target harness, there is no equivalent marketplace. The installer/script is the mandatory and only distribution path. This asymmetry is not an oversight — it reflects the difference in the two harnesses' distribution models.

### Scope of this section

This section documents the installation and distribution path for the target second harness. It does NOT build the installer. The opencode installer is future work — the Item 2 design realized for the target harness runtime. Nothing in this document ships an installer binary.
