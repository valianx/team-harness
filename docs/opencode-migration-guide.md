# Opencode Migration Guide

> **Current status:** agents, skills, commands, and context are projected to OpenCode. Team Harness hooks remain on the Claude Code runtime only; OpenCode uses its native permissions and approval flow instead of a duplicate Team Harness plugin layer.

---

## Per-asset-type migration process

### Skills

**No migration step required.** The target harness discovers `.claude/skills/` directly and reads `SKILL.md` files in the same format Claude Code uses. Skills are already cross-harness. Optionally, a future packaging decision may require surfacing skills under `.opencode/skills/` — that is an install-time placement step, not a content conversion.

### Rules / context (`CLAUDE.md`)

**No migration step required.** The target harness falls back to `CLAUDE.md` when no `AGENTS.md` exists. Rules are effectively cross-harness without conversion. Optionally, add `AGENTS.md` as a cross-tool entry point that points at or summarizes the same rule content — this is a near-zero-effort authoring step, not a conversion.

### Agents and commands

**Emit-time frontmatter delta.** The body content of agent and command files requires no modification. The migration applies a frontmatter transformation at emit time, driven by the Item 1 adapter descriptor — not by hand-editing each file. The transform covers:

- **Tool permissions:** omitted from general installed agents and commands so the host's native policy remains authoritative. `reviewer`, `pr-review-qa`, `pr-review-security`, and `reviewer-consolidator` instead receive `"*": deny` plus read/glob/grep allows.
- **Mode:** add explicit `mode` field if absent.
- **Argument placeholder:** `$ARGUMENTS` is the canonical placeholder on both harnesses (verified against live Claude Code and opencode docs). The transform is **identity** — no rewrite is needed. (A prior draft of this guide listed `{input}` → `$ARGUMENTS`, but `{input}` is not a token in either live harness.)
- **Relocation:** agent files → `.opencode/agents/`; command files → `.opencode/commands/`.

This transform is deterministic and idempotent. General permission and model fields are omitted so OpenCode inherits host policy and model selection; the closed PR-agent exception projects a deny-by-default read-only map. The canonical body remains in `agents/` unchanged; the projected copy lands in the target harness directory. Host overrides remain outside the guarantee of the emitted artifact.

### Hooks

**Not projected.** The OpenCode installer does not emit files under `.opencode/plugins/`. Existing TypeScript bodies remain available to Claude Code and for historical regression coverage, but are not an OpenCode runtime dependency.

OpenCode intentionally uses its native permission and approval system instead of a translated Team Harness hook layer. Claude Code remains the only runtime that installs the TypeScript guard hooks.

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
| Hooks | Not installed; OpenCode uses native permissions and approvals |
| Config | Merged into `opencode.json` |

### Installer mechanism

The installer mechanism is the roadmap's **Item 2** design (two-layer install manifest + ownership ledger + `plan`/`apply` split + clean uninstall) running on the **Item 3** single data-home resolver (`TEAM_HARNESS_DATA_HOME`). Per **Decision B (LOCKED)**, the installer is the repurposed single-binary Go installer (`cmd/install/`), which the roadmap already reserves as the opencode agents installer. This guide does not re-specify the Item 2 or Item 3 contracts — refer to `docs/opencode-distribution-roadmap.md` for the full mechanism.

### Install-path options

Three options are available for placing assets on the target harness:

1. **Dedicated installer binary (implemented — Decision B).** The Go installer (`cmd/install/`) places the file-based assets and merges `opencode.json` while preserving operator-owned keys.

2. **Native npm plugin referenced from `opencode.json` `plugins`.** The target harness can load a published npm package as a plugin. This option can serve the TS hook plugins but cannot place the file-based agents, commands, skills, or rules — it is insufficient on its own for a full harness install.

3. **Hybrid: installer for file-based assets + npm package for hooks.** The installer materializes the file-based assets; the TS hook plugins are distributed as a published npm package and referenced in `opencode.json`. This option adds value once the hook plugins exist as a publishable artifact. Recommended as a complement to option 1 at that stage.

**Current implementation:** option 1 without OpenCode hook plugins.

### Uninstall

A clean uninstall is scoped by the **Item 2 ownership ledger** — the uninstall command removes only harness-owned keys and files (those recorded in `{config_root}`-templated paths and `opencode.json` keys the manifest recorded at install time), never operator config. The full ledger contract is specified in `docs/opencode-distribution-roadmap.md` § Item 2; it is not re-specified here.

### Contrast with Claude Code

In Claude Code, the canonical distribution path is the plugin marketplace: `/plugin marketplace add valianx/team-harness` → `/plugin install th`. No installer script is needed by the operator. In the target harness, there is no equivalent marketplace. The installer/script is the mandatory and only distribution path. This asymmetry is not an oversight — it reflects the difference in the two harnesses' distribution models.

### Scope of this section

This section documents the shipped OpenCode installer and distribution path.
