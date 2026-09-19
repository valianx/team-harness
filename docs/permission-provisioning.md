# Permission Provisioning — Gated Local Rules for Out-of-CWD Surfaces

By default, every subagent `Edit`/`Write` into a path outside the current session's working directory prompts for approval, and that approval does not persist across dispatches. This is expected friction for a one-off change. It is a repeated tax for two recurring, low-risk surfaces this pipeline already trusts: the operator's own obsidian workspace vault, and a work-surface repo (e.g. a git worktree) the pipeline itself created. Permission provisioning closes that gap by writing local Claude Code permission rules — once, gated, and reported — so future dispatches into those surfaces stop prompting.

This document is the canonical contract. The setup flow (`skills/setup/SKILL.md`) and active pipeline activation reference (`plugins/team-harness/skills/pipeline/references/activation.md`) consume this mechanism; do not introduce a variant mechanism.

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

Provisioning writes under this contract target a Claude Code settings file (`~/.claude/settings.json` or `.claude/settings.local.json`) and use the same discipline already established for `~/.claude/.team-harness.json` (`skills/setup/SKILL.md:166`), and — for the backup + atomic-write sequence — the same discipline already established for `~/.claude.json` (`skills/setup/SKILL.md:121-127`):

1. Read the full JSON document (or start from `{}` if the target file does not exist yet).
2. **Back up before writing.** If the target file already exists, copy it to `{file}.bak` (`settings.json.bak` / `settings.local.json.bak` — a single rolling backup, each write overwrites the previous one) at `0o600` from the moment of creation. Skipped when the target file does not yet exist — there is nothing to preserve.
3. Append the new `Edit`/`Write` rule strings to `permissions.allow`, the matching `.git/` deny pair to `permissions.deny` (see "`.git/` exclusion invariant" below), and the new base to `permissions.additionalDirectories`.
4. **Deduplicate** — never append a rule or directory entry that already covers the same base; a rule already present for a base is left untouched. **Known limitation:** deduplication matches the resolved base/path as an exact string. A broader pre-existing rule (e.g. a manually-added `Edit(//mnt/**)`) is not detected or reconciled against the narrower rule this contract writes — the two may coexist. This is a documented limitation, not a silent gap: no new unprompted write is introduced by it.
5. **Preserve every other key** in the document byte-for-byte — this write touches ONLY `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories`, nothing else.
6. **Atomic write.** Write the merged JSON to a temporary file in the same directory, created at `0o600` from the moment of creation, verify it parses as valid JSON, then rename it over the target file. A crash before the rename leaves the original (and its `.bak`) untouched; a crash after the rename leaves the new file in place.

A partial payload (writing only the new keys, dropping the rest of the document) is never acceptable — this is the exact failure mode the merge-write contract exists to prevent.

**Disjoint from the architecture-prerequisite mechanism.** `docs/setup-update-model.md § Architecture prerequisite: subagent nesting depth` reuses this same merge-write-whole-document discipline to provision `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` in the same `~/.claude/settings.json` file — but it is a separate mechanism with a disjoint key allowlist. This contract touches ONLY `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories` (point 5 above); it never touches `env`. The architecture-prerequisite mechanism touches only its one `env` path; it never touches any key under `permissions`. Neither mechanism widens the other's scope, and the two are never merged into a single write.

## Resolved-value validation floor

Before any rule is constructed from a resolved `base`/`path`, this contract validates the resolved value itself — not merely the rule template. Provisioning **aborts before any gate is shown** — no rule written, no Y/n offer — reporting a one-line operator-facing reason, when the resolved value is any of:

- Empty, `.`, or unresolved (template substitution failed).
- The filesystem root (`/`) or a Windows-normalized equivalent (`//`, `///`, ...).
- The user's home directory — the literal `~`, `$HOME`, or its expanded absolute form.
- A filesystem top-level directory — fewer than 2 non-empty path segments below root (depth < 2).
- Contains a `..` path-traversal segment or a glob metacharacter (`*`, `?`, `[`, `]`).

This floor runs on the RESOLVED value, after normalization and before rule construction — it is the mechanism that guarantees "never a bare root rule" at the value level (a mis-resolved `base` of `/` or `~` would otherwise still pass the template-level guarantee in "Scoping" below, since the resulting rule string never literally matches the bare-root needle `//**`). The setup flow and active pipeline activation apply this floor before presenting any gate.

## `.git/` exclusion invariant

A provisioned scope never covers `.git/`. Alongside every `Edit`/`Write` allow rule this contract writes for a base, it also writes the matching deny pair — `Edit(//{base}/.git/**)` and `Write(//{base}/.git/**)` in `permissions.deny` — in the same write. Claude Code's permission model resolves deny over allow, so this pairing holds even though the allow rule's `**` glob would otherwise match paths under `.git/`. This closes a local code-execution vector: for a cross-repo work-surface, an unprompted write to `{path}/.git/hooks/pre-commit` would execute arbitrary shell on the tree's next `git commit`. The setup flow and active pipeline activation apply this pairing identically, for every base/path they provision (obsidian workspace included).

## Confirmation gate

Permission provisioning is `security_sensitive: true` (it widens local write access) and is **never silent when a rule is missing.** Every offer:

- Shows the exact `Edit`/`Write` rule strings, the `.git/` deny pair, and the `additionalDirectories` entry that will be added, before asking.
- Requires an explicit Y/n confirmation. On decline, nothing is written.
- Is scoped to a single, declared base per offer — no bundling of unrelated surfaces into one opaque "grant permissions?" prompt.
- For the `~/.claude/settings.json` (user-scope) destination, names the blast radius: the rule applies to every Claude Code session on every project, not only this pipeline, and persists until removed manually from that file.

**When rules are already present for a base, there is no gate at all** — provisioning is a silent pass-through in that case, but still reports the already-covering rule and target file so the operator retains audit visibility into what is already granted. The gate exists to protect the FIRST write of a new rule, not to re-confirm a rule that is already in effect.

## Scoping

Every rule this contract writes is scoped strictly to `{base}/**` for a single, explicitly declared base (the resolved obsidian workspace path, or a declared work-surface repo path), after that base has passed the "Resolved-value validation floor" above. This contract never emits:

- A root-anchor rule without a path suffix (e.g. bare `//**`) — that would grant access far beyond the declared surface.
- A rule for an outward action (`git push`, `gh pr *`, any GitHub/ClickUp API write). Outward actions remain subject to native host permissions and approvals — this contract only ever touches local `Edit`/`Write`/deny rules and `additionalDirectories`.

## Read-only allowlist — disjointness invariant

The setup flow offers one additional class of `permissions.allow` rules in the same gated Y/n write as the `Edit`/`Write`/`additionalDirectories` triad above: a positive list of inert `Bash(...)` commands, four read-only `gh` verbs, `gh auth switch`, and the `mcp__memory__*` Knowledge Graph tool family. Unlike the `Edit`/`Write` rules, these are NOT scoped to `{base}/**` — Claude Code's `Bash` and MCP-tool permission rules match on a command/tool-name prefix, not on a filesystem path, so they apply wherever the session runs rather than only inside a provisioned base. This section is the canonical definition of that read-only set. **`skills/setup/SKILL.md` § 3a reproduces the set identically** and the pipeline activation reference delegates to this section rather than widening it inline.

### The governing constraint — native permission scope

A `permissions.allow` entry can suppress a later prompt for the matching command, so this contract offers only inert inspection commands and explicitly read-only integration verbs. It never offers `git push`, effective `git` mutation verbs, `gh api`, GitHub/ClickUp writes, or an outward MCP operation. Native host permissions and approvals decide all outward actions; this document does not emulate or outrank that policy.

### Offered set

- **Inert `Bash(...)` commands** — read no secrets and mutate nothing: `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git rev-parse:*)`, `Bash(git branch --list:*)`, `Bash(git worktree list:*)`, `Bash(ls:*)`, `Bash(cat:*)`, `Bash(rg:*)`, `Bash(grep:*)`.
- **Read-only `gh` verbs** — `Bash(gh pr view:*)`, `Bash(gh pr list:*)`, `Bash(gh issue view:*)`, `Bash(gh issue list:*)`. Write verbs remain outside this allowlist and follow native host approval.
- **`Bash(gh auth switch:*)`** — does not perform an outward write; it changes the active `gh` account used by later commands. Operators should verify the selected account before an outward action.
- **`mcp__memory__*`** — the Knowledge Graph MCP tool family (`search_nodes`, `create_nodes`, `add_observations`, `create_relations`, etc.). Content is technical-only per `docs/kg-content-policy.md`; the MCP endpoint is the operator's own deployment.
- **`additionalDirectories`** for the repo work-surface (git worktree / session cwd) and the obsidian vault — this is the existing base-scoped mechanism documented above ("`permissions.additionalDirectories`"), offered alongside this set at the same gate, not a new mechanism.

### Excluded — every form of `gh api`

No form of `gh api` — `Bash(gh api:*)`, `Bash(gh api graphql:*)`, `Bash(gh api /repos/...:*)` — is offered. A single allow prefix cannot safely distinguish read and write API verbs, so all `gh api` calls remain in the host's normal permission flow.

### Excluded — effective git verbs and remote-mutating commands

`git checkout`, `git fetch`, `git pull`, `git clean`, `git reset`, `git rebase`, `git merge`, and `git push` are never offered — the positive list is limited to the inert read-only commands enumerated above. `git remote set-url`, `git remote add`, `git remote rename`, and `git remote set-head` are also excluded because they can change repository routing or remote metadata. These commands stay in the host's normal permission flow.

### Documented residuals

- `git diff`/`git show`/`git log -p`, allowlisted here as inert, respect repo-local config (`.gitattributes` textconv/external-diff filters, `core.pager`) that can execute arbitrary commands in a hostile repo. Residual accepted under the "trusted repo" model this contract already operates in; optional hardening is `-c core.pager=cat -c diff.external=` on the reader's own invocations. The offered set above is the full inert positive-list this contract grants — it is not widened beyond it.
- `gh auth switch` changes gh account state without performing an outward write — see "Offered set" above.
- **Compound commands remain host-defined.** The allowlist documents single-command read access only; the native runtime decides how shell composition is evaluated. The operator should inspect any compound command that contains a mutation.
- **Remote metadata is operator-owned.** The native host permission flow remains responsible for commands that change `origin`, remote heads, or other delivery routing. Refresh or inspect that metadata before an outward action when the repository's default branch changed.

### Scope validation

The read-only set is intentionally finite and does not include outward commands. Changes to it require reviewing the native host's matching and approval behavior; this document does not claim that Team Harness reproduces or strengthens that behavior.

## Rule report

Every provisioning attempt under this contract reports back to the operator:

- The exact rules added or confirmed (`Edit(...)`, `Write(...)`, `additionalDirectories: ...`).
- The target settings file and the observed outcome.

After an approval, a success report is allowed only after the target is re-read, parses, and contains every requested entry. A native runtime refusal or execution failure is reported as unconfirmed and is not recorded as an operator decline; do not repeat the same refused write or widen permissions. If verification is unavailable or fails after partial progress may have occurred, report the known entries and the remaining partial or unknown state without claiming that nothing changed or that all rules were provisioned. Continue independent setup steps.

This is the audit/revert surface: the operator can locate and remove any rule this contract added by reading the reported file and rule strings.

## Decline semantics

A live operator decline never widens access and never re-prompts within the same run. Under `/th:setup` § 3a, nothing is written; a later setup invocation may offer the same bounded rules again. Active pipeline activation follows the same no-write-on-decline behavior when it applies this contract before the first write to an out-of-repository workspace. A native runtime refusal or execution failure is not a decline, is not recorded as one, and is not retried within the same run; a later independent run may offer the bounded gate again.

## Provisioning surfaces

The same contract serves two active consumers and preserves the existing destinations:

| Consumer | Where | Destination | Trigger |
|---|---|---|---|
| **Setup** | `skills/setup/SKILL.md` § 3a, after workspace output mode selects obsidian | `~/.claude/settings.json` (user, cross-project) | Operator runs `/th:setup` in obsidian mode |
| **Pipeline activation** | `plugins/team-harness/skills/pipeline/references/activation.md` § Workspace and repository identity | `~/.claude/settings.json` for the obsidian workspace base; `.claude/settings.local.json` (project-local, gitignored) for cross-repo work-surface paths | Before the first write to a workspace outside the repository root |

The activation reference performs the already-present check, shows the exact bounded allow/deny/additional-directory delta, and requires documented live confirmation. It delegates the canonical allowlist and outcome contract here rather than restating them. The project-local destination remains gitignored and revertible; the user-scoped destination retains its cross-project blast-radius disclosure.

`settings.json`/`settings.local.json` are Claude Code's own configuration files, not a team-harness config file — writing to them does not violate the "single config file — `~/.claude/.team-harness.json`" rule (CLAUDE.md §5).
