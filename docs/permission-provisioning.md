# Permission Provisioning — Gated Local Rules for Out-of-CWD Surfaces

By default, every subagent `Edit`/`Write` into a path outside the current session's working directory prompts for approval, and that approval does not persist across dispatches. This is expected friction for a one-off change. It is a repeated tax for two recurring, low-risk surfaces this pipeline already trusts: the operator's own obsidian workspace vault, and a work-surface repo (e.g. a git worktree) the pipeline itself created. Permission provisioning closes that gap by writing local Claude Code permission rules — once, gated, and reported — so future dispatches into those surfaces stop prompting.

This document is the canonical contract. Every provisioning site in the codebase (`skills/setup/SKILL.md`, `agents/orchestrator.md`) implements exactly this mechanism; do not introduce a variant mechanism at a new site.

## The `//` double-slash anchor

Claude Code's permission-rule matching recognizes four path anchors:

| Anchor | Resolves relative to | Example |
|---|---|---|
| `//abs` | filesystem root (absolute path) | `Edit(//mnt/c/vault/Work/**)` |
| `~/home` | the user's home directory | `Edit(~/notes/**)` |
| `/settings-source` | the directory of the settings file itself | `Edit(/src/**)` |
| `./cwd` | the current working directory | `Edit(./src/**)` |

**A single leading slash is the settings-source anchor, not the filesystem root.** For a rule meant to match an absolute path outside the current project — the obsidian vault, a sibling worktree — the correct anchor is the double slash (`//`). Writing `Edit(/mnt/c/vault/Work/**)` (single slash) looks correct to a naive reader but silently fails to match: it resolves relative to the settings file's own directory, not to `/`.

**Documented upstream residual (Claude Code issue #25137).** Even with the `//` anchor written correctly, a rule for an absolute path outside the cwd may still prompt on some Claude Code versions — the fix for the single-slash-vs-root bug shipped after the anchor syntax was documented, and an operator running an older Claude Code build inherits the pre-fix matching behavior regardless of how the rule is written. Every provisioning site reports the rules it adds so the operator can verify the actual effect on their own Claude Code version; this residual is outside team-harness's control and is not silently hidden.

**Windows normalization.** Native Windows paths are normalized to POSIX form before the rule is built: `C:\vault\Work` → `//c/vault/Work`.

## `permissions.additionalDirectories`

An `Edit`/`Write` rule alone is not sufficient for a path outside the cwd — Claude Code also needs the base directory listed in `permissions.additionalDirectories` before it grants read/write access to that tree at all. Every provisioning write in this contract adds both: the two `Edit`/`Write` rules AND the corresponding `additionalDirectories` entry, for the same base.

## Merge-write-whole-document contract

Both provisioning sites write to a Claude Code settings file (`~/.claude/settings.json` or `.claude/settings.local.json`) using the same discipline already established for `~/.claude/.team-harness.json` (`skills/setup/SKILL.md:166`):

1. Read the full JSON document (or start from `{}` if the target file does not exist yet).
2. Append the new `Edit`/`Write` rule strings to `permissions.allow` and the new base to `permissions.additionalDirectories`.
3. **Deduplicate** — never append a rule or directory entry that already covers the same base; a rule already present for a base is left untouched.
4. **Preserve every other key** in the document byte-for-byte — this write touches ONLY `permissions.allow` and `permissions.additionalDirectories`, nothing else.
5. Write the whole document back.

A partial payload (writing only the new keys, dropping the rest of the document) is never acceptable — this is the exact failure mode the merge-write contract exists to prevent.

## Confirmation gate

Permission provisioning is `security_sensitive: true` (it widens local write access) and is **never silent when a rule is missing.** Every offer:

- Shows the exact `Edit`/`Write` rule strings and the `additionalDirectories` entry that will be added, before asking.
- Requires an explicit Y/n confirmation. On decline, nothing is written.
- Is scoped to a single, declared base per offer — no bundling of unrelated surfaces into one opaque "grant permissions?" prompt.

**When rules are already present for a base, there is no gate at all** — provisioning is a silent pass-through in that case. The gate exists to protect the FIRST write of a new rule, not to re-confirm a rule that is already in effect.

## Scoping

Every rule this contract writes is scoped strictly to `{base}/**` for a single, explicitly declared base (the resolved obsidian workspace path, or a declared work-surface repo path). This contract never emits:

- A root-anchor rule without a path suffix (e.g. bare `//**`) — that would grant access far beyond the declared surface.
- A rule for an outward action (`git push`, `gh pr *`, any GitHub/ClickUp API write). Outward actions remain gated exclusively by `dev-guard` (CLAUDE.md § "Outward-action gate") — this contract only ever touches local `Edit`/`Write` rules and `additionalDirectories`.

## Rule report

Every write under this contract — confirmed at either site — reports back to the operator:

- The exact rules added (`Edit(...)`, `Write(...)`, `additionalDirectories: ...`).
- The target settings file the rules were written to.

This is the audit/revert surface: the operator can locate and remove any rule this contract added by reading the reported file and rule strings.

## Decline semantics

A decline never widens access and never re-prompts within the same run:

- **`/th:setup` § 3a (site A):** on decline, nothing is written; the operator can re-run `/th:setup` (or the targeted `/th:setup workspace`) at any time to be offered again.
- **Orchestrator Phase 0a Step 1g (site B):** on decline, nothing is written; the decline is recorded in `00-state.md § Current State` as `permission_provisioning_decline: obsidian | cross-repo | both` — a session-scoped decision. The current pipeline run does not re-offer; the next pipeline run may offer again (declines do not persist across runs).

## Provisioning sites

Two surfaces, two destinations, matched to the lifecycle of the underlying data:

| Site | Where | Destination | Lifecycle | Trigger |
|---|---|---|---|---|
| **A — Setup (KEYS-once)** | `skills/setup/SKILL.md` § 3a, after the Step 3 obsidian workspace configuration | `~/.claude/settings.json` (user, cross-project) | Set once at configuration time | Operator runs `/th:setup` in obsidian mode |
| **B — Orchestrator Phase 0a (existing-install / recurring)** | `agents/orchestrator.md` § Phase 0a Step 1g | (a) `~/.claude/settings.json` for the obsidian workspace base — same destination as site A; (b) `.claude/settings.local.json` (project-local, gitignored) for cross-repo work-surface paths | (a) covers an install that never re-runs `/th:setup`, or a prior decline; (b) is per-pipeline, revertible | Every pipeline run, in obsidian mode (a) or when the pipeline declares an out-of-cwd work-surface path (b) |

Site B exists because `/th:setup` is a one-time configuration step that most operators never re-run after their first install — an operator who installed before this mechanism existed, or who declined the offer at setup time, would otherwise never be covered. Site B closes that gap by re-checking on every pipeline run and re-offering only when the rules are genuinely missing (see "Confirmation gate" above — already-present rules are a silent pass-through, not a repeated prompt).

The `.claude/settings.local.json` destination for cross-repo rules (site B, part b) is chosen because it is gitignored, project-local, and already governs the repository the operator has confided the pipeline to — it never needs a merge-write against the operator's global `~/.claude/settings.json`.

`settings.json`/`settings.local.json` are Claude Code's own configuration files, not a team-harness config file — writing to them does not violate the "single config file — `~/.claude/.team-harness.json`" rule (CLAUDE.md §5).
