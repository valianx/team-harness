# Permission Provisioning — Gated Local Rules for Out-of-CWD Surfaces

By default, every subagent `Edit`/`Write` into a path outside the current session's working directory prompts for approval, and that approval does not persist across dispatches. This is expected friction for a one-off change. It is a repeated tax for two recurring, low-risk surfaces this pipeline already trusts: the operator's own obsidian workspace vault, and a work-surface repo (e.g. a git worktree) the pipeline itself created. Permission provisioning closes that gap by writing local Claude Code permission rules — once, gated, and reported — so future dispatches into those surfaces stop prompting.

This document is the canonical contract. Every provisioning site in the codebase (`skills/setup/SKILL.md`, `agents/lider.md`) implements exactly this mechanism; do not introduce a variant mechanism at a new site.

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

Both provisioning sites write to a Claude Code settings file (`~/.claude/settings.json` or `.claude/settings.local.json`) using the same discipline already established for `~/.claude/.team-harness.json` (`skills/setup/SKILL.md:166`), and — for the backup + atomic-write sequence — the same discipline already established for `~/.claude.json` (`skills/setup/SKILL.md:121-127`):

1. Read the full JSON document (or start from `{}` if the target file does not exist yet).
2. **Back up before writing.** If the target file already exists, copy it to `{file}.bak` (`settings.json.bak` / `settings.local.json.bak` — a single rolling backup, each write overwrites the previous one) at `0o600` from the moment of creation. Skipped when the target file does not yet exist — there is nothing to preserve.
3. Append the new `Edit`/`Write` rule strings to `permissions.allow`, the matching `.git/` deny pair to `permissions.deny` (see "`.git/` exclusion invariant" below), and the new base to `permissions.additionalDirectories`.
4. **Deduplicate** — never append a rule or directory entry that already covers the same base; a rule already present for a base is left untouched. **Known limitation:** deduplication matches the resolved base/path as an exact string. A broader pre-existing rule (e.g. a manually-added `Edit(//mnt/**)`) is not detected or reconciled against the narrower rule this contract writes — the two may coexist. This is a documented limitation, not a silent gap: no new unprompted write is introduced by it.
5. **Preserve every other key** in the document byte-for-byte — this write touches ONLY `permissions.allow`, `permissions.deny`, and `permissions.additionalDirectories`, nothing else.
6. **Atomic write.** Write the merged JSON to a temporary file in the same directory, created at `0o600` from the moment of creation, verify it parses as valid JSON, then rename it over the target file. A crash before the rename leaves the original (and its `.bak`) untouched; a crash after the rename leaves the new file in place.

A partial payload (writing only the new keys, dropping the rest of the document) is never acceptable — this is the exact failure mode the merge-write contract exists to prevent.

## Resolved-value validation floor

Before any rule is constructed from a resolved `base`/`path`, this contract validates the resolved value itself — not merely the rule template. Provisioning **aborts before any gate is shown** — no rule written, no Y/n offer — reporting a one-line operator-facing reason, when the resolved value is any of:

- Empty, `.`, or unresolved (template substitution failed).
- The filesystem root (`/`) or a Windows-normalized equivalent (`//`, `///`, ...).
- The user's home directory — the literal `~`, `$HOME`, or its expanded absolute form.
- A filesystem top-level directory — fewer than 2 non-empty path segments below root (depth < 2).
- Contains a `..` path-traversal segment or a glob metacharacter (`*`, `?`, `[`, `]`).

This floor runs on the RESOLVED value, after normalization and before rule construction — it is the mechanism that guarantees "never a bare root rule" at the value level (a mis-resolved `base` of `/` or `~` would otherwise still pass the template-level guarantee in "Scoping" below, since the resulting rule string never literally matches the bare-root needle `//**`). Both provisioning sites (`skills/setup/SKILL.md` § 3a, `agents/lider.md` Phase 0a Step 1g parts a and b) apply this floor identically before presenting any gate.

## `.git/` exclusion invariant

A provisioned scope never covers `.git/`. Alongside every `Edit`/`Write` allow rule this contract writes for a base, it also writes the matching deny pair — `Edit(//{base}/.git/**)` and `Write(//{base}/.git/**)` in `permissions.deny` — in the same write. Claude Code's permission model resolves deny over allow, so this pairing holds even though the allow rule's `**` glob would otherwise match paths under `.git/`. This closes a local code-execution vector: for a cross-repo work-surface, an unprompted write to `{path}/.git/hooks/pre-commit` would execute arbitrary shell on the tree's next `git commit` — outside the `dev-guard` outward-action gate, which gates `git push`/`gh`, not `git commit`. Both provisioning sites apply this pairing identically, for every base/path they provision (obsidian workspace included).

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
- A rule for an outward action (`git push`, `gh pr *`, any GitHub/ClickUp API write). Outward actions remain gated exclusively by `dev-guard` (CLAUDE.md § "Outward-action gate") — this contract only ever touches local `Edit`/`Write`/deny rules and `additionalDirectories`.

## Read-only allowlist — disjointness invariant

Both provisioning sites offer one additional class of `permissions.allow` rules in the same gated Y/n write as the `Edit`/`Write`/`additionalDirectories` triad above: a positive list of inert `Bash(...)` commands, four prefix-safe `gh` read verbs, `gh auth switch`, and the `mcp__memory__*` Knowledge Graph tool family. Unlike the `Edit`/`Write` rules, these are NOT scoped to `{base}/**` — Claude Code's `Bash` and MCP-tool permission rules match on a command/tool-name prefix, not on a filesystem path, so they apply wherever the session runs rather than only inside a provisioned base. This section is the canonical definition of that set; `skills/setup/SKILL.md` § 3a and `agents/lider.md` Phase 0a Step 1g reproduce it identically (multi-site invariant (c)) — a divergence between the two sites is a defect, not an allowed variation.

### The governing constraint — Claude Code issue #18312

When a `permissions.allow` rule string-prefix-matches a tool call, Claude Code grants it WITHOUT invoking any hook for that call — an `allow` rule silently overrides a `dev-guard` `ask` or `deny` for the same command. Every rule this class offers MUST therefore be **prefix-disjoint** from every outward-action command `dev-guard` covers (`hooks/ts/bodies/dev-guard.ts` — `GIT_PUSH_RE`, the `GH_*_RE` family, the GraphQL PR-mutation name list, the curl/wget-to-`api.github.com` patterns, and the ClickUp write pattern): no offered allow-prefix `P` (the string inside `Bash(` up to `:*)`, or the bare tool-name prefix before a trailing `*`) may be a string-prefix of any covered outward command. `tests/test_permission_disjointness.py` enforces this mechanically — it derives the outward-action catalogue from the live patterns in `dev-guard.ts` rather than a hand-maintained example list, so a future outward pattern added to the hook without a corresponding test sample fails the suite (see "Catalogue-driven enforcement" below).

### Offered set

- **Inert `Bash(...)` commands** — read no secrets, mutate nothing, and are string-prefix-disjoint from every dev-guard outward pattern: `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git rev-parse:*)`, `Bash(git branch --list:*)`, `Bash(git worktree list:*)`, `Bash(ls:*)`, `Bash(cat:*)`, `Bash(rg:*)`, `Bash(grep:*)`.
- **Prefix-safe `gh` read verbs** — `Bash(gh pr view:*)`, `Bash(gh pr list:*)`, `Bash(gh issue view:*)`, `Bash(gh issue list:*)`. Each is disjoint from the corresponding write verb dev-guard covers (`gh pr create|merge|review|comment`, `gh issue create|edit|comment`) — `view`/`list` is never a prefix of `create`/`merge`/`review`/`comment`/`edit`.
- **`Bash(gh auth switch:*)`** — does not perform an outward write; it changes the active `gh` account used by later commands. Documented residual: on a multi-account setup, a repo-embedded instruction could flip the active account ahead of a later auto-allowed push (see "Documented residuals" below).
- **`mcp__memory__*`** — the Knowledge Graph MCP tool family (`search_nodes`, `create_nodes`, `add_observations`, `create_relations`, etc.). Content is technical-only per `docs/kg-content-policy.md`; the MCP endpoint is the operator's own deployment.
- **`additionalDirectories`** for the repo work-surface (git worktree / session cwd) and the obsidian vault — this is the existing base-scoped mechanism documented above ("`permissions.additionalDirectories`"), offered alongside this set at the same gate, not a new mechanism.

### Excluded — every form of `gh api`

No form of `gh api` — `Bash(gh api:*)`, `Bash(gh api graphql:*)`, `Bash(gh api /repos/...:*)` — is offered. None is prefix-disjoint from the outward mutations dev-guard covers: `gh api -X POST|PUT|PATCH|DELETE .../pulls` and `gh api graphql -f query='mutation{mergePullRequest…}'` both start with the literal string `gh api`, and the HTTP method (`GET` vs `POST`) is a flag, not a prefix — Claude Code's prefix-matching cannot separate them. Worst case if this exclusion were dropped: a repo-embedded instruction runs `gh api graphql -f query='mutation{mergePullRequest…}'` (or `gh api -X POST …/pulls/…/merge`) and the offered allow-rule silently defeats the dev-guard `ask` for that mutation (#18312). Read-only `gh api` calls (e.g. `gh api /repos/{owner}/{repo}`) are not offered either — they keep prompting, a partial-but-honest mitigation consistent with the rest of this floor.

### Excluded — effective git verbs and remote-mutating commands

`git checkout`, `git fetch`, `git pull`, `git clean`, `git reset`, `git rebase`, `git merge`, and `git push` are never offered — the positive list is limited to the inert read-only commands enumerated above. `git remote set-url`, `git remote add`, `git remote rename`, and `git remote set-head` are also excluded: the dev-guard branch-aware push recognizer resolves "remote = origin" by NAME (`docs/dev-mode.md` § Outward-Action Gate), so an unprompted rule that could mutate what `origin` points to (or which branch `origin/HEAD` names as the default) would undermine that trust assumption for a later auto-allowed push — these commands stay prompted through the normal permission flow. `git remote set-head` is the specific command that could stale or spoof the `origin/HEAD` pointer the dev-guard's default-branch resolution depends on (see "Documented residuals" below) — keeping it off the allowlist means that half of the residual still surfaces a prompt.

### Documented residuals

- `git diff`/`git show`/`git log -p`, allowlisted here as inert, respect repo-local config (`.gitattributes` textconv/external-diff filters, `core.pager`) that can execute arbitrary commands in a hostile repo. Residual accepted under the "trusted repo" model this contract already operates in; optional hardening is `-c core.pager=cat -c diff.external=` on the reader's own invocations. The offered set above is the full inert positive-list this contract grants — it is not widened beyond it.
- `gh auth switch` changes gh account state without performing an outward write — see "Offered set" above.
- **Compound-command decomposition is Claude Code's responsibility, not this contract's.** The disjointness invariant and `tests/test_permission_disjointness.py` model a SINGLE command per allow-prefix check (`P` is-prefix-of `O` for one command string) — they do not model shell composition (`git diff && git push origin main`, `git log; git push origin main`, or substitution forms like `git diff "$(git push origin main)"`). Whether such a compound string is safe under this offered set depends entirely on how Claude Code's own `permissions.allow` matcher evaluates a compound Bash string: if it requires every shell-split segment to independently match an allow-rule (and treats `$(...)`/newlines safely), the offered inert prefixes remain single-command-safe and no compound vector opens. If it instead prefix-matches the whole string or only the leading segment, an inert-prefixed compound command could defeat the dev-guard `ask` for a chained mutation. This repo cannot observe Claude Code's internal matcher behavior from the outside; the offered rules in this section are documented and tested as single-command-safe, not compound-command-safe — the operator is relying on Claude Code's own command-composition handling for the compound case, the same way any other `Bash(...)` allow-rule does.
- **The dev-guard `git push` auto-allow requires a positively-resolvable `origin/HEAD` (separate from this allowlist, but adjacent enough to document here).** `hooks/ts/bodies/dev-guard.ts`'s closed positive grammar treats the static `{main, master}` set as an ask-floor, never a permissive fallback — when the repository's real default branch cannot be positively resolved via `git symbolic-ref refs/remotes/origin/HEAD` (or `git rev-parse --abbrev-ref origin/HEAD`), the recognizer fails closed to `ask` rather than assuming a non-`{main,master}` destination is safe. `origin/HEAD` is set automatically by a normal `git clone` of a non-empty remote, so this is true for the overwhelming majority of developer worktrees; it is commonly UNSET after a shallow/partial clone, a bare fetch, or certain CI checkout strategies that skip the remote-HEAD symref — in those environments, a feature-branch push that would otherwise auto-allow safely falls back to a prompt instead. Operators who see an unexpected `ask` for an otherwise-safe push can run `git remote set-head origin -a` to (re-)establish the symref.
- **`origin/HEAD` staleness/spoofing residual — accepted, not hardened.** The auto-allow of a non-default-branch push determines "the default branch" from the LOCAL `origin/HEAD` pointer, which is a mutable local ref — it can go STALE (a remote default-branch rename that the local clone never refreshed) or be SPOOFED (`git remote set-head origin <name>`, pointed at a name the operator did not intend). For a repository whose real default branch has a NON-STANDARD name (anything other than `main`/`master`), a wrong `origin/HEAD` can cause a push to the true default branch to be auto-allowed without a prompt, because the destination name no longer matches the resolved (wrong) default and the static `{main, master}` floor does not apply to non-standard names. Repositories whose default is `main` or `master` are UNAFFECTED by this residual — the static floor (`docs/dev-mode.md` § Outward-Action Gate) gates those two names unconditionally, independent of what `origin/HEAD` resolves to. Recovery / hardening for non-standard-default repos: run `git remote set-head origin -a` after any default-branch rename to refresh the local pointer. This is an ACCEPTED residual, not a gap awaiting a fix: the alternative — a live `git ls-remote --symref origin HEAD` query on every push — was considered and declined, because it would trade away the low-latency, offline-capable evaluation that is the point of this gate for a marginal hardening of a residual that already requires a non-standard default name AND a stale/spoofed local ref to manifest. The other half of this residual — actually mutating `origin/HEAD` — still surfaces a prompt: `git remote set-head` is excluded from the offered read-only allowlist (see "Excluded — effective git verbs and remote-mutating commands" above), so the spoof step itself is never auto-allowed.

### Catalogue-driven enforcement

`tests/test_permission_disjointness.py` is the mechanical enforcement of this invariant:

1. **Derives** the outward-action catalogue from the real patterns in `hooks/ts/bodies/dev-guard.ts` (every `GH_*_RE`, `GIT_PUSH_RE`, the GraphQL PR-mutation name list, the curl/wget-to-`api.github.com` patterns, and the ClickUp write pattern) — never a hand-maintained example list.
2. **Asserts** `!O.startsWith(P)` for every offered allow-prefix `P` (derived from this section's "Offered set", stripped of `Bash(` / `:*)` or a trailing `*`) against every outward command sample `O` derived from that catalogue.
3. **Includes a canary** — a broad prefix such as `Bash(git:*)` or `Bash(gh:*)` is asserted to trigger a disjointness violation under the test's own detection logic, so the test cannot pass vacuously (an empty or trivially-satisfied allowlist would otherwise report a false green).
4. **Fails on drift** — if `dev-guard.ts` gains a new outward-action pattern with no corresponding outward-command sample in the test, the test fails rather than silently under-covering the new pattern.

## Rule report

Every write under this contract — confirmed at either site — reports back to the operator:

- The exact rules added (`Edit(...)`, `Write(...)`, `additionalDirectories: ...`).
- The target settings file the rules were written to.

This is the audit/revert surface: the operator can locate and remove any rule this contract added by reading the reported file and rule strings.

## Decline semantics

A decline never widens access and never re-prompts within the same run:

- **`/th:setup` § 3a (site A):** on decline, nothing is written; the operator can re-run `/th:setup` (or the targeted `/th:setup workspace`) at any time to be offered again.
- **Lider Phase 0a Step 1g (site B):** on decline, nothing is written; the decline is recorded in `00-state.md § Current State` as `permission_provisioning_decline: obsidian | cross-repo | both` — a session-scoped decision. The current pipeline run does not re-offer; the next pipeline run may offer again (declines do not persist across runs).

## Provisioning sites

Two surfaces, two destinations, matched to the lifecycle of the underlying data:

| Site | Where | Destination | Lifecycle | Trigger |
|---|---|---|---|---|
| **A — Setup (KEYS-once)** | `skills/setup/SKILL.md` § 3a, after the Step 3 obsidian workspace configuration | `~/.claude/settings.json` (user, cross-project) | Set once at configuration time | Operator runs `/th:setup` in obsidian mode |
| **B — Lider Phase 0a (existing-install / recurring)** | `agents/lider.md` § Phase 0a Step 1g | (a) `~/.claude/settings.json` for the obsidian workspace base — same destination as site A; (b) `.claude/settings.local.json` (project-local, gitignored) for cross-repo work-surface paths | (a) covers an install that never re-runs `/th:setup`, or a prior decline; (b) is per-pipeline, revertible | Every pipeline run, in obsidian mode (a) or when the pipeline declares an out-of-cwd work-surface path (b) |

Site B exists because `/th:setup` is a one-time configuration step that most operators never re-run after their first install — an operator who installed before this mechanism existed, or who declined the offer at setup time, would otherwise never be covered. Site B closes that gap by re-checking on every pipeline run and re-offering only when the rules are genuinely missing (see "Confirmation gate" above — already-present rules are a silent pass-through, not a repeated prompt).

The `.claude/settings.local.json` destination for cross-repo rules (site B, part b) is chosen because it is gitignored, project-local, and already governs the repository the operator has confided the pipeline to — it never needs a merge-write against the operator's global `~/.claude/settings.json`.

`settings.json`/`settings.local.json` are Claude Code's own configuration files, not a team-harness config file — writing to them does not violate the "single config file — `~/.claude/.team-harness.json`" rule (CLAUDE.md §5).
