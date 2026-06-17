# Orchestrator Disposition — Contract

The top-level Claude Code agent IS the orchestrator. This is the CC native architecture, not a mode that activates or deactivates. The security property that protects outward actions is enforced by `hooks/dev-guard.sh`, which fires UNCONDITIONALLY for covered outward actions — no filesystem marker required or consulted.

**SEC-DR-2 re-founding (v2.89.0).** The former "dev mode" was a conditional disposition controlled by `~/.claude/.dev-mode-active`. That model was retired when empirical testing (M1 probe, 2026-06-14) confirmed that nested foreground subagents retain the `Task` tool — the foundational premise behind the handoff machinery was obsolete on the CC path. The disposition is now unconditional: the general agent is always the orchestrator, and the gate is always armed.

---

## Outward-Action Gate (`dev-guard.sh`)

The deterministic security layer is the PreToolUse hook `hooks/dev-guard.sh`, wired in its own dedicated `Bash`-only PreToolUse entry in both `hooks/config.json` (Go installer, 3 OS) and `.claude-plugin/hooks.json` (plugin runtime). `policy-block.sh` is in a separate entry with matcher `Bash|Write|Edit|NotebookEdit` so it continues to secret-scan write/edit content — dev-guard never fires on Edit/Write/NotebookEdit. This is the GUARANTEE — not the disposition.

The gate fires UNCONDITIONALLY for covered outward actions. No filesystem marker is read; no session state is checked.

**What it gates (by DESTINATION, not by binary):**

| Covered action | Decision | Rationale |
|---|---|---|
| Push to a remote: `git push` (bare, `git -C <path> push`, `GIT_DIR=... git push`) | `ask` | Any push to a remote is an irreversible outward action |
| `gh pr merge` | `ask` | Merges to main cannot be undone |
| `gh pr review` (including `--dismiss`) | `ask` | Publishes a review on behalf of the operator |
| `gh pr comment` | `ask` | Publishes a comment on behalf of the operator |
| `gh api -X PUT|POST|PATCH|DELETE` against PR endpoints (`/pulls/.../merge|reviews|comments`) | `ask` | Covers API-level bypass of the `gh` CLI |
| `gh api graphql` with a PR-write mutation name (`resolveReviewThread`, `unresolveReviewThread`, `addPullRequestReviewThreadReply`, `addPullRequestReview`, `submitPullRequestReview`, `mergePullRequest`) | `ask` | GraphQL PR mutations post to `/graphql` without `-X` flag — not matched by the REST pattern above; read-only `reviewThreads` listing queries stay ungated |
| `curl`/`wget` with mutating method against `api.github.com` | `ask` | Covers binary-level bypass |
| ClickUp MCP outward writes (`mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`) | `ask` | Outward write to external service |
| Any non-covered call (Edit/Write/NotebookEdit payloads; benign Bash) | no decision (exit 0, empty stdout) | Defer to the operator's normal permission flow |

**What `ask` means:** `permissionDecision: "ask"` causes the Claude Code runtime to prompt the OPERATOR interactively for that specific call. The agent CANNOT auto-approve an `ask`. There is NO authorisation marker file — the authorisation is human out-of-band. A legitimate delivery push at STAGE-GATE-3 proceeds through this same operator approval, mirroring the preview-and-confirm contract of review-mode (#251/#252).

**Fail-CLOSED for covered actions:** the hook issues `ask` for every covered outward action, unconditionally. This is the intentional fail-mode: the consequences of an unauthorised merge to main are irreversible; the consequences of an over-zealous `ask` are a minor friction.

**Default → no-decision for non-covered calls:** when the command is not a covered outward action, the hook emits **no permissionDecision** — exit 0, empty stdout — and defers to the operator's normal permission flow. A permission gate must never widen permissions on its fail-safe path.

**No authorisation file.** A file that the agent can write with `echo authorized > ...` is forgeable by the same subject the gate protects — it is not a control. The authorisation is `ask` (human), not a file.

**Residual limit (documented honesty):** obfuscation via `eval`/`base64`/alias/heredoc is a known limit of any string-matching gate (parity with `policy-block.sh`). The threat model is disposition that rationalises the readable path — not an adversary who actively obfuscates.

---

## Inline Orchestration Permit (SEC-DR-2)

**Re-founded in v2.89.0.** Executing the orchestrator role inline at top level is the CC native architecture — the general agent IS the orchestrator. No filesystem marker is required. The condition for inline orchestration is:

- The session is a top-level CC session (level 0 — `Task` is available), AND
- The request is a development task that belongs in the pipeline.

This condition is satisfied in every normal CC session. No separate activation step, no marker write, no mode toggle.

**Prohibited case:** executing orchestration inline is PROHIBITED only when the top-level agent is itself running as a subagent inside another orchestrator. In that case, the nested-handoff/takeover machinery in `docs/subagent-orchestration.md` is the FALLBACK (opencode/legacy path).

**Previous framing (retired):** before v2.89.0, SEC-DR-2 required `~/.claude/.dev-mode-active` to contain `dev_mode: true`. That observable was retired when the foundational premise (nested orchestrator loses `Task`) was disproven by the M1 empirical probe. The gate — `hooks/dev-guard.sh` — is now unconditional.

---

## Disposition mechanism: output-style replaces the base (persistent strong floor)

**Why output-style, not a skill.** A prior implementation used a `/dev-mode` skill (commit 18ea492). A live test proved that mechanism structurally insufficient: the skill LAYERED the orchestrator contract OVER the base "make-progress" disposition of the general agent, and the base won — the agent operated inline, merged a PR to main without a pipeline, and rationalised the skip. A skill superposes; the base built-in beats it.

The correction is a change of MECHANISM, not of content. The `developer-mode` output style with `keep-coding-instructions: false` REPLACES the built-in software engineering instructions (how to scope changes, write comments, verify work) instead of layering over them. There is no base to beat — it is gone. The orchestrator contract (routing Step 6 + Discover + reasoning-checkpoint + anti-rushing/triage) becomes the governing set of instructions for the session.

**What `keep-coding-instructions: false` discards — and why its loss is not a security gap (AC-18).**

The Claude Code docs describe this flag precisely: *"Custom output styles leave out Claude Code's built-in software engineering instructions, such as how to scope changes, write comments, and verify work."* And the framing: *"Output styles change how Claude responds, not what Claude knows."*

This distinction is load-bearing:
- **What is discarded:** SWE WORKFLOW guidance (how to scope, comment, verify). This is disposition of process, NOT a security control. Its absence degrades workflow tidiness, not safety. The orchestrator contract loaded by the style replaces this guidance with a more explicit version: the SDD pipeline IS scoping + verification.
- **What is NOT discarded:** The model's harm-rejection and safety layer ("what Claude knows" — Anthropic's constitutional training). An output style adjusts the system prompt; it does NOT disarm the model's refusal to produce harmful outputs, exfiltrate data, or follow malicious instructions. That layer does not live in the "software engineering instructions" block.
- **Security floors are PROMPT-INDEPENDENT (hooks, not prompt):** the security guarantees of this harness are PreToolUse hooks wired by matcher — they fire regardless of which system prompt is active. The enumerated catalogue (Bash-command gates + the new MCP-write gate) is:
  - `hooks/policy-block.sh` — matcher `Bash|Write|Edit|NotebookEdit`. Blocks `rm -rf / ~ $HOME`, `git push --force`, `git reset --hard`, `git clean -f`, `--no-verify`, destructive SQL, and writes to sensitive file paths (`.env`, `.pem`, `.ssh/`, credentials). Survives the output-style swap intact.
  - `hooks/dev-guard.sh` — two dedicated PreToolUse entries: (a) `Bash`-only: gates outward/mutating Bash actions unconditionally (git push, gh pr merge/review/comment, gh api mutating PR endpoints, curl/wget to api.github.com; see § Outward-Action Gate); (b) `mcp__.*__clickup_(update_task|create_task|create_task_comment|attach_task_file)`: gates ClickUp MCP outward writes unconditionally — issues `ask` on any write. Both entries survive the output-style swap intact.
  - `hooks/checkpoint-guard.sh` — matcher `Task`. Gates phase dispatch at reasoning-checkpoint boundaries. Survives intact.

**Conclusion:** `keep-coding-instructions: false` is safe for this harness because the security floors are hooks, not prompt. No security-relevant default lives exclusively in the discarded SWE instructions that the orchestrator contract + hooks do not re-establish.

**Default-on disposition (v2.89.0+):** The `SessionStart` hook (`hooks/session-start.sh`) fires an orchestrator disposition directive at every session start — no marker needed. Operators can optionally select the `developer-mode` output style via `/config` → Output style → `developer-mode` for the strong base-replacement (`keep-coding-instructions: false`).

**`force-for-plugin` is NOT set** on the `developer-mode` output style — it is never applied automatically via the plugin mechanism. The output style is an opt-in strong floor. `force-for-plugin` is intentionally omitted to preserve the per-operator escape hatch.

---

## Security Floor Non-Waivability (SEC-DR-3)

The orchestrator disposition is a **signal of routing topology** — the same category as the intake survey answers and `--fast`. Like those signals, it is NEVER written to `security_sensitive`, `security_gate_status`, or any gate-status field in `00-state.md`.

The following security mechanisms run **input-independent** and are NOT waivable:

- **HI-2 (discover-phase.md §3):** the security floor non-waivability invariant. No disposition signal can bypass the security gate. The gate fires whenever `security_sensitive: true` is set, regardless of session state.
- **Path-pattern auto-escalation (`orchestrator.md` Step 7):** sets `security_sensitive: true` based on file paths touched by the PR. This runs on the diff, not on the session state.
- **Bug-fix forcing rule:** for `type: fix` and `type: hotfix`, `security_sensitive: true` is forced and the security agent always runs at Phase 3.

---

## Triage Safety-Bias (SEC-DR-1)

The general agent's default disposition ("be helpful / make progress") is replaced — not just supplemented — by the output style. Before taking any action:

**TRIAGE INVARIANT — FAIL-CLOSED:** before ANY ambiguity about whether a task requires the pipeline → enter the pipeline or ask for confirmation; NEVER treat ambiguity as a license to handle the task inline without gates.

**Phase Checklist enforcement:** no Phase Checklist item may be marked `[~skipped: reason]` unless the skip is authorised by an operator-declared tier (`[TIER: 0]`, `[TIER: 1]`, `--fast`) or the bug-fix tier system. Marking a gate as skipped without authorisation is a contract violation.

---

## Reasoning Checkpoint Promotion

In standard mode (orchestrator as subagent, `Task` stripped on opencode path), only the Layer-2 self-check (orchestrator's own contract discipline) enforces the reasoning checkpoint at boundaries B1/B2/B3. The Layer-1 hook (`hooks/checkpoint-guard.sh`, `PreToolUse`/matcher `Task`) never fires because there is no `Task` call to intercept.

On the CC foreground path (top-level, `Task` available), the Layer-1 hook fires on every leaf dispatch. B1/B2/B3 are enforced by a harness-level deterministic floor, not just the orchestrator's own discipline. This is a strengthening of the checkpoint. Security floors remain independent of the checkpoint state in both modes (see `docs/reasoning-checkpoint.md § Enforcement`).

---

## Role Adoption

When the orchestrator disposition is active, the top-level agent reads and applies the following files (by pointer — the output style body does not duplicate their content):

- `agents/orchestrator.md` — Step 6 routing, Discover phase, all phase contracts and gate enforcement.
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

The gate does NOT re-implement the review-mode publish gate. It reinforces it with a floor that the agent cannot rationalise through. Where #252 covers review-mode at prompt level, `dev-guard.sh` covers at hook level — and by extension it also protects the "top-level inline execution" site that #252 identified as the highest-risk gap. See `agents/ref-direct-modes.md § Publish Gate` for the review-mode contract.

---

## Installation

`/th:setup` installs the outward-action gate by:
1. Copying `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (makes the `developer-mode` style available in `/config` as an opt-in strong floor).
2. Writing the `orchestrator-dispatch-rule` managed block to `~/.claude/CLAUDE.md` (operator-facing documentation of the feature).

`/th:update` re-synchronizes the output style and managed blocks on every run. It removes any retired `dev-mode`, `nested-dispatch-takeover`, and `dev-mode-entry` blocks from existing `~/.claude/CLAUDE.md` files. No marker is written.
