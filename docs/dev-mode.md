# Orchestrator Disposition — Contract

The top-level Claude Code agent IS the orchestrator. This is the CC native architecture, not a mode that activates or deactivates. The security property that protects outward actions is enforced by the `dev-guard` gate (`.claude-plugin/hooks.json` → `hooks/run-ts-hook.sh dev-guard` → `hooks/ts/dist/dev-guard.cjs`), which fires UNCONDITIONALLY for every covered outward action and gates by destination — no filesystem marker required or consulted.

**SEC-DR-2 re-founding (v2.89.0).** The former "dev mode" was a conditional disposition controlled by `~/.claude/.dev-mode-active`. That model was retired when empirical testing (M1 probe, 2026-06-14) confirmed that nested foreground subagents retain the `Task` tool — the foundational premise behind the handoff machinery was obsolete on the CC path. The disposition is now unconditional: the general agent is always the orchestrator, and the gate is always armed.

---

## Outward-Action Gate (`dev-guard`)

The deterministic security layer is the PreToolUse hook `dev-guard`, wired in its own dedicated `Bash`-only PreToolUse entry in `.claude-plugin/hooks.json` — the marketplace plugin's runtime, the only Claude Code install path (the Go installer's CC path is retired; `hooks/config.json`, its per-OS wiring template, no longer exists). The entry runs `hooks/run-ts-hook.sh dev-guard`, a fail-closed launcher with no gate logic of its own that execs `node` against `hooks/ts/dist/dev-guard.cjs` — TypeScript is the single source of gate logic, shared with the opencode runtime. `policy-block` is in a separate entry with matcher `Bash|Write|Edit|NotebookEdit` so it continues to secret-scan write/edit content — dev-guard never fires on Edit/Write/NotebookEdit. This is the GUARANTEE — not the disposition.

The gate fires UNCONDITIONALLY for covered outward actions and gates by destination — evaluating every one of them, never skipping the check, while the DECISION varies with what the command actually targets. No filesystem marker is read; no session state is checked.

**What it gates (by DESTINATION, not by binary):**

| Covered action | Decision | Rationale |
|---|---|---|
| Push to a remote: single recognized refspec targeting a non-default branch on `origin` (no force/mirror/all/tags/delete) | `allow` | The closed-form recognizer confirms the destination is a non-default branch on `origin` — a routine feature-branch push proceeds without a prompt |
| Push to a remote: default branch, tag, force (flag or `+refspec`/`--mirror`), multi-refspec, delete refspec, or a remote other than `origin` | `ask` | Any push outside the single recognized safe form is an irreversible outward action |
| `gh pr create` | `ask` by default; `allow` under the opt-in config key `autogate.pr_create: true` (`hooks/ts/bodies/dev-guard.ts:743-754`) | Opens a PR — an outward, GitHub-visible action; the opt-in exists for operators who want to remove the double-prompt on top of the `gate-guard` order floor below |
| `gh pr merge` | `ask` | Merges to main cannot be undone |
| `gh pr review` (including `--dismiss`) | `ask` | Publishes a review on behalf of the operator |
| `gh pr comment` | `ask` | Publishes a comment on behalf of the operator |
| `gh api -X PUT|POST|PATCH|DELETE` against PR endpoints (`/pulls/.../merge|reviews|comments`) | `ask` | Covers API-level bypass of the `gh` CLI |
| `gh api graphql` with a PR-write mutation name (`resolveReviewThread`, `unresolveReviewThread`, `addPullRequestReviewThreadReply`, `addPullRequestReview`, `submitPullRequestReview`, `mergePullRequest`) | `ask` | GraphQL PR mutations post to `/graphql` without `-X` flag — not matched by the REST pattern above; read-only `reviewThreads` listing queries stay ungated |
| `curl`/`wget` with mutating method against `api.github.com` | `ask` | Covers binary-level bypass |
| ClickUp MCP outward writes (`mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`) | `ask` | Outward write to external service |
| Any non-covered call (Edit/Write/NotebookEdit payloads; benign Bash) | no decision (exit 0, empty stdout) | Defer to the operator's normal permission flow |

**What `ask` means:** `permissionDecision: "ask"` causes the Claude Code runtime to prompt the OPERATOR interactively for that specific call. The agent CANNOT auto-approve an `ask`. There is NO authorisation marker file — the authorisation is human out-of-band. A legitimate delivery push at STAGE-GATE-3 proceeds through this same operator approval, mirroring the preview-and-confirm contract of review-mode (#251/#252).

**Fail-CLOSED for covered actions:** the hook evaluates every covered outward action unconditionally and returns a destination-aware decision — `allow` only for the single recognized safe push form, `ask` for every other form (default-branch/tag/force/multi-refspec/non-`origin` pushes, merges, PR/issue creation, API/ClickUp writes). This is the intentional fail-mode: the consequences of an unauthorised merge to main are irreversible; the consequences of an over-zealous `ask` are a minor friction.

**Default → no-decision for non-covered calls:** when the command is not a covered outward action, the hook emits **no permissionDecision** — exit 0, empty stdout — and defers to the operator's normal permission flow. A permission gate must never widen permissions on its fail-safe path.

**No authorisation file.** A file that the agent can write with `echo authorized > ...` is forgeable by the same subject the gate protects — it is not a control. The authorisation is `ask` (human), not a file.

**Residual limit (documented honesty):** obfuscation via `eval`/`base64`/alias/heredoc — and reconstruction of a gated verb the router cannot see as a contiguous token, whether by quote/backslash splicing (`''git push`, `g''it push`) or by parameter/command expansion (`p=push; git $p …`) — is a known limit of any string-matching gate (parity with `policy-block`). The threat model is disposition that rationalises the readable path — not an adversary who actively obfuscates; for the injected-obfuscation case the prompt-injection floor (§6.6) is the primary defense.

---

## Deterministic order floor (`gate-guard`) — deny vs ask, and the force-push floor (Invariant E)

**`gh pr create` correction — already covered, not net-new.** The table above lists `gh pr create` as `ask` by default with an `allow` opt-in (`autogate.pr_create`) — that coverage PRE-DATES this section and is unchanged by it. An earlier draft of the motivating issue (#495) assumed `gh pr create` was uncovered by `dev-guard`; it was not, and this design does not add a new `ask` to it. The net-new contribution documented below is the ORDER floor (`gate-guard`), not `gh pr create` coverage.

**What `gate-guard` adds.** `gate-guard` (`hooks/ts/bodies/gate-guard.ts`, its own dedicated PreToolUse `Bash` entry, structural sibling of `prepublish-guard`) is a SEPARATE deterministic hook that closes a gap neither `dev-guard` nor `policy-block` addressed: whether a `git push` / `gh pr create` from a pipeline lane is preceded by a recorded `gate3_release: ship` for that lane. It resolves the governing lane by mtime-selecting the active `00-state.md` — parity with `checkpoint-guard`'s `selectByMtime` (local workspaces subtree +, when configured, the obsidian vault subtree) — then correlates the current git context against that lane's `working_branch` field, valid in BOTH delivery topologies: a worktree lane (`realpath(cwd()) == realpath(worktree)`) and a branch-in-place lane (`worktree: null`, resolved purely by branch-name match against `working_branch`). Full contract: `agents/_shared/gate-contract.md § "Outward-action release floor"`.

**Block-on-condition / open-on-fault, fail-closed once a lane resolves.** Once a governing lane RESOLVES, `gate-guard` is fail-closed: `gate3_release ∈ {ship}` → `none` (permit); any other value (`null`, `amend`, `abort`), or a field-read fault discovered after the lane already resolved, → `deny`. When NO lane resolves at all — a manual developer push, an inline (no-orchestrator) session, an unrelated repository, or no active `00-state.md` found — `gate-guard` defers: `decision: none`. `none` is reserved exclusively for "no lane resolved"; it is never returned for a resolved lane with a corrupt or missing field.

**Deny (`gate-guard`, ORDER) vs ask (`dev-guard`, destination) — independent and additive, not a replacement.** `gate-guard`'s decision set is `{none, deny}` only — it never emits `ask`, so it neither inherits nor removes the ask-class caveat below, which continues to apply unchanged to `dev-guard`'s own `ask` on `gh pr create`/`gh pr merge`. `dev-guard` gates by WHAT the command targets (destination), unconditionally on session state. `gate-guard` gates by WHETHER a release was recorded before this specific invocation (order), only when a pipeline lane resolves. A push/pr-create from a detected lane must clear BOTH checks independently — `gate-guard`'s order deny AND `dev-guard`'s destination-based ask/allow — neither one substitutes for the other.

**Residuals this floor does NOT close.** `gate-guard` reads `gate3_release` — an intra-privilege-forgeable field, per the same no-writer-identity limit as every other gate-release field (`agents/_shared/gate-contract.md § "Integrity model"`, layer 1): nothing distinguishes which agent wrote it, and this addition does not verify writer identity. Nor does it bind CONTENT: `gate3_release: ship` fixes ORDER (that the release preceded the push), not a tree hash — HEAD can move between recording `ship` and the push actually running (an `amend`, a concurrent mutation), so the pushed tree can differ from the one the operator saw at the gate. This content-drift residual is mitigated elsewhere (an `amend` re-runs Internal Review and regenerates the gate nonce), never by `gate-guard` itself — see `agents/_shared/gate-contract.md § "Integrity model"` for the full honesty statement.

**Force-push floor (Invariant E, operator-mandated) — layered, not redundant.** `gate-guard` also denies, unconditionally on `gate3_release`, a force-push from a detected pipeline lane in EITHER form: the flag form (`-f`, `--force`, `--force-with-lease`) or the `+`-prefixed refspec form (`git push origin +feature:main`) — force-push is never legitimate from an in-lane pipeline delivery, so `ship` does not authorize it. This deny layers on top of two pre-existing floors, unchanged by this design:

- `policy-block`'s unconditional flag-based force-push deny (`hooks/ts/bodies/policy-block.ts:295` — `/git\s+push\s+(?:[^|]*\s)?(-f\b|--force\b|--force-with-lease)/i`), which applies in every context, pipeline or not.
- `dev-guard`'s outside-lane `ask` on a `+`-prefixed refspec (`hooks/ts/bodies/dev-guard.ts:559-561`), destination-only, with no lane-state read.

**Detection mechanism (Invariant G) — a shared closed positive grammar, not a
character-denylist.** `gate-guard`'s force/shape check calls `command-lexer.ts`'s
`matchBenignPushGrammar(rawCmd)`. It permits ONLY the exact benign push shape — `git
push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>`, where
`<plain-branch>` excludes any ref-namespace-qualified or tag-like destination (a
destination whose first `/`-segment is `refs`/`heads`/`tags`/`remotes`, checked via
`isPlainBranchDestination`), with the `origin <plain-branch>` positional pair
required and every character of the command inside the safe set
`[A-Za-z0-9 _./-]` — and denies every deviation from that one shape: no force flag, no
`+`-prefixed refspec, and no character-based reconstruction technique (quoting,
backslash-escaping, `$`-expansion/substitution, backtick substitution, brace
expansion, globbing, process substitution) can pass, because each requires a character
outside the safe set. A dash-prefixed positional (`git push origin -f`) is closed
separately: every dash-prefixed token, in any position, is classified as a flag and
checked against the same benign allowlist. This replaces an earlier character-denylist
implementation of the same invariant, defeated three times by three different shell
token-reconstruction techniques — a denylist can only enumerate the constructions it
already knows about, while a positive grammar denies anything that is not the one
permitted shape, known or not. `dev-guard`'s Step 0 push char-gate (`rejectShell
QuotingOrComposition`) consumes the same shared `isLiteralSafeCommand` predicate, so
both hooks apply an identical, single-sourced char-gate rather than two independently
maintained denylists.

**Honest scope of the grammar (string-level, not resolved-execution-level).** The
grammar reasons about what the git-push command STRING can express, not the resolved
argv, binary, git config, or environment a real shell would ultimately execute. A `git`
shell alias or function, a shadowing `git` binary earlier on `PATH`,
`push.default`/`remote.origin.push` git config (closed for the commands that pass the
grammar by the required `origin <plain-branch>` positional, since those config keys
only apply to a bare/no-refspec push), or a `GIT_*` environment-variable override are
all out of scope by design — an attacker who controls any of those already has code
execution in the session and does not need to smuggle a force-push through a git
command string. This is the same class of limit every string-inspecting hook in this
repo already carries (`policy-block`, `dev-guard`, the retired denylist), not a
regression introduced by this mechanism.

**Non-redundancy rationale.** `gate-guard`'s own deny is not superfluous: (i) it gives `gate-guard` a self-sufficient in-lane guarantee that does not depend on a sibling hook's regex never changing — a defense-in-depth stance consistent with this repo's own recurring lesson that a contract enforced at one site alone tends to drift from its siblings; (ii) it is the ONLY hook that closes the `+refspec` sub-form for the in-lane case — `policy-block`'s flag-only regex does not match a bare `+`-prefix, and `dev-guard`'s handling of that sub-form is destination-only and never reads pipeline-lane state.

**This design never touches or works around server-side branch protections.** Nothing here bypasses, disables, or reconfigures a repository's branch-protection rules. Mutating `gh api` writes remain `ask` under `dev-guard`, unchanged.

**The philosophy this design anchors: only two hard points.** Force-push (deny in-lane, `ask` outside) and merge (always `ask`, non-configurable) are the only two hard points in the outward-action model; every other git operation — branching, committing, pushing to a feature branch, opening a PR — stays frictionless. "Merge" in this statement means a **PR merge** — `gh pr merge`, or any action that lands commits on `main` or another protected branch — never a LOCAL `git merge origin/main` into the pipeline's own working branch (an ordinary fast-forward/update, which is unremarkable git handling and must never be asked or denied). This distinction holds in the actual matcher: `dev-guard.ts`'s `GH_PR_MERGE_RE` (`hooks/ts/bodies/dev-guard.ts:211-212`) matches only the literal `gh pr merge` CLI subcommand — lexically distinct from `git merge` — and `gate-guard.ts` introduces no matcher for any form of "merge" at all; a local `git merge` is not a covered action for either hook.

---

## Ask-class caveat — the gate stops only when the session stops on `ask`

The outward-action gate is `ask`-class, not `deny`-class. When `dev-guard` returns `permissionDecision: "ask"` for a lane's push / merge / PR write, that decision only STOPS the action if the operator's session actually halts on an `ask` — i.e. the session is interactive and a present operator answers the prompt. It is not a `deny`: the runtime does not refuse the action outright; it defers to the operator's normal permission flow. This is a deliberate loosening (a delivery push at STAGE-GATE-3 must be able to proceed through operator approval), and its consequences must be stated honestly rather than oversold.

- **Do not assume `ask` stops under a broad Bash auto-allow.** If the operator's session runs with a blanket `Bash` allow, `--dangerously-skip-permissions`, or any posture that auto-satisfies `ask` prompts, an `ask` is auto-answered and the outward action proceeds with no human in the loop. The gate did its job (it issued `ask`); the session's permission posture is what determined whether that `ask` actually halted.
- **Do not assume `ask` stops under a non-interactive or bridged posture.** In a headless / `-p` / bridged / relay session there may be no interactive operator to answer the prompt; how the runtime handles an unanswered `ask` is a session-posture property outside the gate's control.
- **th:leader's gate presentation must not oversell this.** When th:leader presents a lane's STAGE-GATE to the operator inline and relays the decision back to the owning orchestrator (`agents/leader.md § Gate presentation protocol` — "Ask-class caveat"), the presentation is a request for a human decision, not a claim that anything is being mechanically "halted." The leader does not know the session's permission posture and must not imply a guarantee the `ask`-class gate does not make.
- **The in-lane skip-permissions prohibition IS a `deny` floor — correctly so.** Where an outward-action `ask` is deliberately soft, the security-critical case of a lane spawning a `claude … --dangerously-skip-permissions` child is a `deny` in `policy-block` (SEC-DR-B, AC-6.2) — fail-closed, not deferred. The asymmetry is intentional: a skip-permissions spawn would bypass every downstream hook at any depth, so it is refused outright rather than handed to a permission prompt that a broad auto-allow could satisfy. AC-6.4 (native `Task`-tool spawn on the split path — no Bash `claude` invocation exists to evade) is the structural control; the `policy-block` deny is the defense-in-depth backstop for the legacy Bash-spawn path.

---

## STAGE-GATE-3 presentation and the ask-class loosening (SEC-DR-G)

The ask-class caveat has a direct consequence for how STAGE-GATE-3 — the human push/PR gate — is surfaced and released in the leader+orchestrator split.

**(a) The leader presents STAGE-GATE-3 inline and relays the operator's decision.** STAGE-GATE-3 is prepared and recorded inside the orchestrator that owns the task; the leader presents its STOP block to the operator inline — in the operator's main conversation, the only reliably reachable channel — and relays the operator's decision (verbatim, tagged `leader-relayed-operator`) back to the orchestrator, which records the release (`agents/leader.md § Gate presentation protocol`). Because the outward-action `ask` does not itself guarantee a stop (it can be auto-satisfied), the presentation must be an active, unmissable interactive surface that names three things: the orchestrator (its slug), the gate (`STAGE-GATE-3`), and the decision the operator is being asked to make. A passive breadcrumb the operator might scroll past is insufficient — the human decision is the actual control here. The deterministic floor on the actual push/PR remains `dev-guard`'s native `ask`, not this presentation; the presentation is what routes the operator to that decision.

**(b) Anti-pattern: broad Bash auto-allow + lane mode.** Running a multi-lane fan-out under a blanket `Bash` auto-allow (or any posture that auto-answers `ask`) is an anti-pattern: it removes the human from the STAGE-GATE-3 outward-action prompt, so a lane's delivery push/merge could proceed without the operator ever entering the gate. The operator releases STAGE-GATE-3 by replying to the leader's inline presentation; the leader relays that decision to the owning orchestrator, which records the release (the gate release travels operator → leader → orchestrator, tagged `leader-relayed-operator`), and recover's STAGE-GATE-3 clear-allowlist requires `gate3_release = ship` (`skills/recover/SKILL.md § Rule 1`). The broad auto-allow posture defeats the interactive stop this design depends on.

**(c) recover's fail-safe covers gate NON-release, not an already-run `ask`-satisfied action.** `/th:recover`'s Rule 1 (re-present any un-cleared STAGE-GATE, fail-closed — `skills/recover/SKILL.md`) protects the case where a gate was never released: on resume it finds no `gate3_release = ship` plus `stage.gate.release` event and the orchestrator returns its `gate_pending`, which `th:leader` re-presents inline. It does NOT and cannot undo an outward action that ALREADY RAN because an `ask` was auto-satisfied under a broad auto-allow — a push that already landed is not an un-cleared gate, it is a completed irreversible action with no state to re-present. The fail-safe is a forward re-prompt for un-taken decisions, never a rollback of a taken one. This is the residual the ask-class loosening acknowledges: the deterministic floor for the truly irreversible in-lane case is the `deny` in `policy-block` (see the ask-class caveat above), not recover.

---

## Inline Orchestration Permit (SEC-DR-2)

**Re-founded in v2.89.0.** Executing the orchestrator role inline at top level is the CC native architecture — the general agent IS the orchestrator. No filesystem marker is required. The condition for inline orchestration is:

- The session is a top-level CC session (level 0 — `Task` is available), AND
- The request is a development task that belongs in the pipeline.

This condition is satisfied in every normal CC session. No separate activation step, no marker write, no mode toggle.

**Prohibited case:** executing orchestration inline is PROHIBITED only when the top-level agent is itself running as a subagent inside another orchestrator. In that case, the nested-handoff/takeover machinery in `docs/subagent-orchestration.md` is the FALLBACK (opencode/legacy path).

**Previous framing (retired):** before v2.89.0, SEC-DR-2 required `~/.claude/.dev-mode-active` to contain `dev_mode: true`. That observable was retired when the foundational premise (nested orchestrator loses `Task`) was disproven by the M1 empirical probe. The gate — `dev-guard` — is now unconditional.

---

## Disposition mechanism: output-style replaces the base (persistent strong floor)

**Why output-style, not a skill.** A prior implementation used a `/dev-mode` skill (commit 18ea492). A live test proved that mechanism structurally insufficient: the skill LAYERED the orchestrator contract OVER the base "make-progress" disposition of the general agent, and the base won — the agent operated inline, merged a PR to main without a pipeline, and rationalised the skip. A skill superposes; the base built-in beats it.

The correction is a change of MECHANISM, not of content. The `developer-mode` output style with `keep-coding-instructions: false` REPLACES the built-in software engineering instructions (how to scope changes, write comments, verify work) instead of layering over them. There is no base to beat — it is gone. The orchestrator contract (routing Step 6 + Discover + reasoning-checkpoint + anti-rushing/triage) becomes the governing set of instructions for the session.

**What `keep-coding-instructions: false` discards — and why its loss is not a security gap (AC-18).**

The Claude Code docs describe this flag precisely: *"Custom output styles leave out Claude Code's built-in software engineering instructions, such as how to scope changes, write comments, and verify work."* And the framing: *"Output styles change how Claude responds, not what Claude knows."*

This distinction is load-bearing:
- **What is discarded:** SWE WORKFLOW guidance (how to scope, comment, verify). This is disposition of process, NOT a security control. Its absence degrades workflow tidiness, not safety. The orchestrator contract loaded by the style replaces this guidance with a more explicit version: the SDD pipeline IS scoping + verification.
- **What is NOT discarded:** The model's harm-rejection and safety layer ("what Claude knows" — Anthropic's constitutional training). An output style adjusts the system prompt; it does NOT disarm the model's refusal to produce harmful outputs, exfiltrate data, or follow malicious instructions. That layer does not live in the "software engineering instructions" block.
- **Security floors are PROMPT-INDEPENDENT (hooks, not prompt):** the security guarantees of this harness are PreToolUse hooks wired by matcher — they fire regardless of which system prompt is active. Every gate below runs through `hooks/run-ts-hook.sh <name>`, a fail-closed launcher that execs `node` against the matching `hooks/ts/dist/<name>.cjs` bundle (TypeScript is the single source of gate logic for CC and opencode). The enumerated catalogue (Bash-command gates + the MCP-write gate) is:
  - `policy-block` — matcher `Bash|Write|Edit|NotebookEdit`. Blocks `rm -rf / ~ $HOME`, `git push --force`, `git reset --hard`, `git clean -f`, `--no-verify`, destructive SQL, and writes to sensitive file paths (`.env`, `.pem`, `.ssh/`, credentials). Survives the output-style swap intact.
  - `dev-guard` — two dedicated PreToolUse entries: (a) `Bash`-only: gates outward/mutating Bash actions unconditionally (git push, gh pr merge/review/comment, gh api mutating PR endpoints, curl/wget to api.github.com; see § Outward-Action Gate); (b) `mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`: gates ClickUp MCP outward writes unconditionally — issues `ask` on any write. Both entries survive the output-style swap intact.
  - `checkpoint-guard` — matcher `Task`. Gates phase dispatch at reasoning-checkpoint boundaries. Survives intact.

**Conclusion:** `keep-coding-instructions: false` is safe for this harness because the security floors are hooks, not prompt. No security-relevant default lives exclusively in the discarded SWE instructions that the orchestrator contract + hooks do not re-establish.

**Default-on disposition (v2.89.0+):** The `SessionStart` hook (`session-start`, run via `hooks/run-ts-hook.sh session-start`) fires an orchestrator disposition directive at every session start — no marker needed. Operators can optionally select the `developer-mode` output style via `/config` → Output style → `developer-mode` for the strong base-replacement (`keep-coding-instructions: false`).

**`force-for-plugin` is NOT set** on the `developer-mode` output style — it is never applied automatically via the plugin mechanism. The output style is an opt-in strong floor. `force-for-plugin` is intentionally omitted to preserve the per-operator escape hatch.

---

## Security Floor Non-Waivability (SEC-DR-3)

The orchestrator disposition is a **signal of routing topology** — the same category as the intake survey answers and `--fast`. Like those signals, it is NEVER written to `security_sensitive`, `security_gate_status`, or any gate-status field in `00-state.md`.

The following security mechanisms run **input-independent** and are NOT waivable:

- **HI-2 (discover-phase.md §3):** the security floor non-waivability invariant. No disposition signal can bypass the security gate. The gate fires whenever `security_sensitive: true` is set, regardless of session state.
- **Path-pattern auto-escalation (`leader.md § Phase 0a` classification):** sets `security_sensitive: true` based on file paths touched by the PR. This runs on the diff, not on the session state.
- **Bug-fix forcing rule:** for `type: fix` and `type: hotfix`, `security_sensitive: true` is forced and the security agent always runs at Phase 3.

---

## Triage Safety-Bias (SEC-DR-1)

The general agent's default disposition ("be helpful / make progress") is replaced — not just supplemented — by the output style. Before taking any action:

**TRIAGE INVARIANT — FAIL-CLOSED:** before ANY ambiguity about whether a task requires the pipeline → enter the pipeline or ask for confirmation; NEVER treat ambiguity as a license to handle the task inline without gates.

**Phase Checklist enforcement:** no Phase Checklist item may be marked `[~skipped: reason]` unless the skip is authorised by an operator-declared tier (`[TIER: 0]`, `[TIER: 1]`, `--fast`) or the bug-fix tier system. Marking a gate as skipped without authorisation is a contract violation.

---

## Reasoning Checkpoint Promotion

In standard mode (orchestrator as subagent, `Task` stripped on opencode path), only the Layer-2 self-check (orchestrator's own contract discipline) enforces the reasoning checkpoint at boundaries B1/B2/B3. The Layer-1 hook (`checkpoint-guard`, `PreToolUse`/matcher `Task`) never fires because there is no `Task` call to intercept.

On the CC foreground path (top-level, `Task` available), the Layer-1 hook fires on every leaf dispatch. B1/B2/B3 are enforced by a harness-level deterministic floor, not just the orchestrator's own discipline. This is a strengthening of the checkpoint. Security floors remain independent of the checkpoint state in both modes (see `docs/reasoning-checkpoint.md § Enforcement`).

---

## Role Adoption

When the orchestrator disposition is active, the top-level agent reads and applies the following files (by pointer — the output style body does not duplicate their content):

- `agents/leader.md` — intake, Discover phase, classification and routing.
- `agents/orchestrator.md` — all phase contracts and gate enforcement.
- `docs/discover-phase.md` — patient intake, advance-signal gate, intake survey.
- `docs/reasoning-checkpoint.md` — B1/B2/B3 boundaries and advance contract.
- `docs/subagent-orchestration.md` — dispatch protocol and Takeover Pipeline Manifest.

Resolve these from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`

---

## Reconciliation with review-mode hard gates (#251/#252)

The review-mode hard gates (merged in #251/#252) and the outward-action gate address the SAME class of risk — outward action without operator approval — at complementary layers:

| Aspect | #251/#252 (review mode) | outward-action gate | Relation |
|---|---|---|---|
| Risk class | Publish review/comment without operator approval | push/merge/publish inline | SAME class |
| Enforcement layer | PROMPT (imperative constraints) + Suite 57 tokens | FLOOR deterministic (hook Bash) | COMPLEMENTARY |
| Approval mechanism | Preview-and-confirm, `--auto-publish` opt-in | `permissionDecision: "ask"` (human out-of-band, agent cannot auto-approve) | MIRRORS preview-and-confirm |
| Coverage | `gh pr review`, `POST /reviews`, replies, dismiss | by DESTINATION: push to remote; `pulls/.../merge|reviews|comments` via any binary | SUPERSET of #252 vocabulary |

The gate does NOT re-implement the review-mode publish gate. It reinforces it with a floor that the agent cannot rationalise through. Where #252 covers review-mode at prompt level, `dev-guard` covers at hook level — and by extension it also protects the "top-level inline execution" site that #252 identified as the highest-risk gap. See `agents/ref-direct-modes.md § Publish Gate` for the review-mode contract.

---

## Installation

`/th:setup` installs the outward-action gate by:
1. Copying `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (makes the `developer-mode` style available in `/config` as an opt-in strong floor).
2. Writing the `orchestrator-dispatch-rule` managed block to `~/.claude/CLAUDE.md` (operator-facing documentation of the feature).

`/th:update` re-synchronizes the output style and managed blocks on every run. It removes any retired `dev-mode`, `nested-dispatch-takeover`, and `dev-mode-entry` blocks from existing `~/.claude/CLAUDE.md` files. No marker is written.
