# Dev Mode — Contract

Dev mode is the **default disposition** delivered by `/th:setup` and `/th:update`. A fresh install or an update activates dev mode (orchestrator role + armed `dev-guard.sh`) automatically — unless the operator has explicitly opted out. The operator can exit at any time with `/dev-mode off`, and that choice persists so future updates respect it.

---

## Default-on disposition

**Mechanism — marker-write.** Setup and update write `dev_mode: true` to `~/.claude/.dev-mode-active` when the operator has not explicitly opted out. This arms `dev-guard.sh` and triggers the existing `SessionStart` injection — no hook change is needed.

**Durable decision — `dev_mode_choice` sentinel in `~/.claude/.team-harness.json`.** Tri-state: absent (never decided → default-on applies), `"on"` (explicit), `"off"` (explicit opt-out). Written ONLY by the operator via `/dev-mode` on/off. Read by setup and update. The sentinel uses the **merge-write-whole-document** contract: read the full JSON, replace only `dev_mode_choice`, write the whole document back — never clobber `logs-mode`, `language`, `files`, `clickup`, `pricing`, or other keys.

**Decision table (`dev_mode_choice` × action → marker outcome):**

| `dev_mode_choice` | `/th:setup` (install) | `/th:update` |
|---|---|---|
| absent (never decided) | write marker `dev_mode: true` | write marker `dev_mode: true` |
| `"on"` (explicit on) | write marker `dev_mode: true` | write marker `dev_mode: true` |
| `"off"` (explicit opt-out) | do NOT write marker | do NOT write marker; never remove an existing one |

**Skill writes (explicit operator actions):**

| Action | Marker | Sentinel |
|---|---|---|
| `/dev-mode` (on) | write `dev_mode: true` | merge-write `dev_mode_choice: "on"` |
| `/dev-mode off` | rm (gated `ask`, unchanged) | merge-write `dev_mode_choice: "off"` |

**Invariants:**
- Setup and update NEVER remove a marker — removal stays operator-driven via `/dev-mode off` (gated `ask`). They only conditionally WRITE one.
- The gate (`dev-guard.sh`) NEVER reads `dev_mode_choice`. The sentinel influences only the setup/update marker-write decision; within an active session the gate fires on outward actions regardless of the sentinel value. This is why the sentinel cannot be a gate-disable bypass.
- `force-for-plugin` is deliberately `false` on the `developer-mode` output style. Setting it would decouple the orchestrator disposition from the marker that arms `dev-guard.sh` (disposition could stay forced-on while `/dev-mode off` disarms the gate — a security regression), and would remove the per-operator escape hatch. The marker is the single coupling point.

**Inline orchestration permit (SEC-DR-2) — restated for default-on.** Executing the orchestrator role inline at top level is PERMITTED when `~/.claude/.dev-mode-active` contains `dev_mode: true`. This condition is satisfied by default-on (setup/update write the marker), by `/dev-mode`, and by the `developer-mode` output style — all three routes satisfy the same observable.

**Migration caveat (pre-2.56.0 opt-outs).** The old `/dev-mode off` only removed the marker; it persisted no sentinel. A pre-2.56.0 opt-out is therefore indistinguishable from "never decided" (both: marker absent, sentinel absent). The first `/th:update` after upgrading to 2.56.0 WILL re-activate those operators. Forward (post-2.56.0) opt-outs via `/dev-mode off` persist correctly. Operator communication is the recommended mitigation for the small user base.

---

---

## Disposition mechanism: output-style replaces the base (persistent strong floor)

**Why output-style, not a skill.** A prior implementation used a `/dev-mode` skill (commit 18ea492). A live test proved that mechanism structurally insufficient: the skill LAYERED the orchestrator contract OVER the base "make-progress" disposition of the general agent, and the base won — the agent operated inline, merged a PR to main without a pipeline, and rationalised the skip. A skill superposes; the base built-in beats it.

The correction is a change of MECHANISM, not of content. The `developer-mode` output style with `keep-coding-instructions: false` REPLACES the built-in software engineering instructions (how to scope changes, write comments, verify work) instead of layering over them. There is no base to beat — it is gone. The orchestrator contract (routing Step 6 + Discover + reasoning-checkpoint + anti-rushing/triage) becomes the governing set of instructions for the session.

**What `keep-coding-instructions: false` discards — and why its loss is not a security gap (AC-18).**

The Claude Code docs describe this flag precisely: *"Custom output styles leave out Claude Code's built-in software engineering instructions, such as how to scope changes, write comments, and verify work."* And the framing: *"Output styles change how Claude responds, not what Claude knows."*

This distinction is load-bearing:
- **What is discarded:** SWE WORKFLOW guidance (how to scope, comment, verify). This is disposition of process, NOT a security control. Its absence degrades workflow tidiness, not safety. The orchestrator contract loaded by the style replaces this guidance with a more explicit version: the SDD pipeline IS scoping + verification.
- **What is NOT discarded:** The model's harm-rejection and safety layer ("what Claude knows" — Anthropic's constitutional training). An output style adjusts the system prompt; it does NOT disarm the model's refusal to produce harmful outputs, exfiltrate data, or follow malicious instructions. That layer does not live in the "software engineering instructions" block.
- **Security floors are PROMPT-INDEPENDENT (hooks, not prompt):** the security guarantees of this harness are PreToolUse hooks wired by matcher — they fire regardless of which system prompt is active:
  - `hooks/policy-block.sh` — matcher `Bash|Write|Edit|NotebookEdit`. Blocks `rm -rf / ~ $HOME`, `git push --force`, `git reset --hard`, `git clean -f`, `--no-verify`, destructive SQL, and writes to sensitive file paths (`.env`, `.pem`, `.ssh/`, credentials). Survives the output-style swap intact.
  - `hooks/dev-guard.sh` — dedicated `Bash`-only PreToolUse entry. Gates outward/mutating actions in dev mode (see § Outward-Action Gate). Survives intact.
  - `hooks/checkpoint-guard.sh` — matcher `Task`. Gates phase dispatch at reasoning-checkpoint boundaries. Survives intact.

**Conclusion:** `keep-coding-instructions: false` is safe for this harness because the security floors are hooks, not prompt. No security-relevant default lives exclusively in the discarded SWE instructions that the orchestrator contract + hooks do not re-establish.

**Honest trade-off (accepted by the operator):** the output style is SESSION-LEVEL — read once at session start, so changing it requires `/clear` or a new session. The `/dev-mode` skill avoids that cost: it is the in-session toggle that loads the disposition and writes the marker immediately, with no reload. The output style remains the optional persistent path (strong base-replacement via `keep-coding-instructions: false`), applied on reload via `/config` → Output style. Either way the marker is the observable flag. Default-on means every session pays the orchestrator-contract token cost (mitigated by prompt caching after the first turn — see `§ Token Cost`).

---

## Activation and the filesystem marker

**Default activation (v2.56.0+):** `/th:setup` and `/th:update` write the marker `~/.claude/.dev-mode-active` (`dev_mode: true`) automatically when `dev_mode_choice` is absent or `"on"` in `~/.claude/.team-harness.json`. A fresh install or update leaves the operator in dev mode without any extra command. While the marker is present, the `SessionStart` hook (`hooks/dev-mode-session-start.sh`) auto-resumes dev mode in every new session, surfacing the banner instantly via `systemMessage`. The marker is the single source of truth.

**In-session activation:** run `/dev-mode`. The skill starts developer mode in the current session immediately — it writes the marker, shows the banner, adopts the orchestrator role, and merge-writes `dev_mode_choice: "on"` to `~/.claude/.team-harness.json` so future updates also assert the marker. No `/clear` is required.

**Language directive (dev-mode-independent):** a separate SessionStart hook, `hooks/language-session-start.sh`, runs at every session start regardless of dev mode. When `~/.claude/.team-harness.json` contains a valid `language` key, it injects a one-time `additionalContext` directive instructing the agent to respond in the configured language for the whole session. An explicit per-session override from the operator takes precedence for that session. Both hooks run under the same `startup|resume|clear` matcher and are order-independent.

The marker is the observable signal that (a) dev mode is active for the session and (b) the outward-action gate `dev-guard.sh` applies. `/th:setup` installs the `/dev-mode` skill and the `developer-mode` output style into `~/.claude/`; the plugin's `.claude-plugin/hooks.json` wires the `SessionStart` and `dev-guard` hooks (run from the plugin cache).

**Persistent alternative:** select the `developer-mode` output style via `/config` → Output style → `developer-mode` (replaces the system prompt on reload — `keep-coding-instructions: false`). Equivalent; the marker remains the flag.

**Deactivation (escape hatch):** run `/dev-mode off` — it removes the marker (`dev-guard.sh` intercepts the removal with `permissionDecision: "ask"`; the operator confirms), and merge-writes `dev_mode_choice: "off"` to `~/.claude/.team-harness.json` so future updates respect the opt-out. New sessions then open in normal mode. (Output-style users: `/config` → Output style → Default.)

**`force-for-plugin` is NOT set** on the `developer-mode` output style — it is never applied automatically via the plugin mechanism. The activation path is the marker written by setup/update and by `/dev-mode`, not the output-style auto-apply. See `§ Default-on disposition` above for the rationale (force-for-plugin would decouple the disposition from the marker-armed gate and remove the per-operator escape hatch).

---

## Outward-Action Gate (`dev-guard.sh`)

The deterministic security layer is the PreToolUse hook `hooks/dev-guard.sh`, wired in its own dedicated `Bash`-only PreToolUse entry in both `hooks/config.json` (Go installer, 3 OS) and `.claude-plugin/hooks.json` (plugin runtime). `policy-block.sh` is in a separate entry with matcher `Bash|Write|Edit|NotebookEdit` so it continues to secret-scan write/edit content — dev-guard never fires on Edit/Write/NotebookEdit. This is the GUARANTEE — not the disposition.

**What it gates (by DESTINATION, not by binary):**

| Covered action | Decision | Rationale |
|---|---|---|
| Push to a remote: `git push` (bare, `git -C <path> push`, `GIT_DIR=... git push`) | `ask` | Any push to a remote is an irreversible outward action |
| `gh pr merge` | `ask` | Merges to main cannot be undone |
| `gh pr review` (including `--dismiss`) | `ask` | Publishes a review on behalf of the operator |
| `gh pr comment` | `ask` | Publishes a comment on behalf of the operator |
| `gh api -X PUT|POST|PATCH|DELETE` against PR endpoints (`/pulls/.../merge|reviews|comments`) | `ask` | Covers API-level bypass of the `gh` CLI |
| `curl`/`wget` with mutating method against `api.github.com` | `ask` | Covers binary-level bypass |
| Activation write (`>`/`>>`/`tee`) setting `dev_mode: true` | `allow` | Arming MORE gating is safe; enables `/dev-mode` (re)activation without friction |
| Remove/move/other-write to `~/.claude/.dev-mode-active` (`rm`/`mv`/`cp`, or write not setting `dev_mode: true`) | `ask` | Disabling the gate requires operator confirmation — `/dev-mode off` relies on this |
| Any non-covered call (Edit/Write/NotebookEdit payloads; benign Bash; dev mode OFF or `dev_mode: false`) | no decision (exit 0, empty stdout) | Defer to the operator's normal permission flow — the gate has no basis to act on non-covered calls |

**What `ask` means:** `permissionDecision: "ask"` causes the Claude Code runtime to prompt the OPERATOR interactively for that specific call. The agent CANNOT auto-approve an `ask`. There is NO authorisation marker file — the authorisation is human out-of-band. A legitimate delivery push at STAGE-GATE-3 proceeds through this same operator approval, mirroring the preview-and-confirm contract of review-mode (#251/#252).

**Fail-CLOSED for covered actions:** when dev mode is active (marker present, including present-but-empty or present-but-unreadable), the hook issues `ask` for every covered outward action. This is the intentional fail-mode: the consequences of an unauthorised merge to main are irreversible; the consequences of an over-zealous `ask` are a minor friction.

**Default → no-decision for non-covered calls:** when the command is not a covered outward action (benign Bash, or any call when dev mode is OFF / `dev_mode: false` / marker absent), the hook emits **no permissionDecision** — exit 0, empty stdout — and defers to the operator's normal permission flow. This is the correct default: a permission gate must never widen permissions on its fail-safe path. The only `allow` in the gate is the activation-write path (`dev_mode: true`), which arms MORE gating.

**No authorisation file.** A file that the agent can write with `echo authorized > ...` is forjable by the same subject the gate protects — it is not a control. The authorisation is `ask` (human), not a file.

**Residual limit (documented honesty):** obfuscation via `eval`/`base64`/alias/heredoc is a known limit of any string-matching gate (parity with `policy-block.sh`). The threat model is disposition that rationalises the readable path — not an adversary who actively obfuscates.

---

## Inline Orchestration Permit (SEC-DR-2)

Executing the orchestrator role inline at top level is **PERMITTED ONLY** when:

- `~/.claude/.dev-mode-active` contains `dev_mode: true` (the marker is present and active), AND
- The top-level session has the `Task` tool available (it always does at level 0).

This condition is satisfied by default-on (setup/update write the marker), by `/dev-mode`, and by the `developer-mode` output style — all three routes converge on the same observable (the marker). The discriminant is the **filesystem marker**, not a subjective judgment about whether a particular output style or skill was loaded.

**Without the marker active:** executing orchestration inline — including reading `agents/orchestrator.md` "as reference" — is the ad-hoc improvisation that weakens gate enforcement. It is PROHIBITED.

**FALLBACK:** when dev mode is not active, the canonical invocation is `Agent(subagent_type='th:orchestrator', ...)` and the nested-handoff/takeover machinery in `docs/subagent-orchestration.md` is the safety net.

---

## Security Floor Non-Waivability (SEC-DR-3)

Dev mode is a **signal of disposition** — the same category as the intake survey answers and `--fast`. Like those signals, it is NEVER written to `security_sensitive`, `security_gate_status`, or any gate-status field in `00-state.md`.

The following security mechanisms run **input-independent of dev mode** and are NOT waivable by dev mode:

- **HI-2 (discover-phase.md §3):** the security floor non-waivability invariant. No disposition signal — including dev mode — can bypass the security gate. The gate fires whenever `security_sensitive: true` is set, regardless of session state.
- **Path-pattern auto-escalation (`orchestrator.md` Step 7):** sets `security_sensitive: true` based on file paths touched by the PR. This runs on the diff, not on the session state. Dev mode does not influence it.
- **Bug-fix forcing rule:** for `type: fix` and `type: hotfix`, `security_sensitive: true` is forced and the security agent always runs at Phase 3.

Dev mode is a dial of orchestration topology (top-level vs nested), not a stage-switch. It changes WHERE the orchestrator runs, not WHICH gates run.

---

## Triage Safety-Bias (SEC-DR-1)

The general agent's default disposition ("be helpful / make progress") is replaced — not just supplemented — by the output style. Before taking any action:

**TRIAGE INVARIANT — FAIL-CLOSED:** ante CUALQUIER ambigüedad sobre si una tarea necesita el pipeline → entrar al pipeline o pedir confirmación; NUNCA tratar la ambigüedad como licencia para manejar la tarea inline sin gates.

(Translation: when there is ANY ambiguity about whether a task requires the pipeline, enter the pipeline or ask for confirmation. NEVER treat ambiguity as a license to handle the task inline without gates.)

**Phase Checklist enforcement:** no Phase Checklist item may be marked `[~skipped: reason]` unless the skip is authorised by an operator-declared tier (`[TIER: 0]`, `[TIER: 1]`, `--fast`) or the bug-fix tier system. Marking a gate as skipped without authorisation is a contract violation even in dev mode.

---

## Reasoning Checkpoint Promotion

In standard mode (orchestrator as subagent, `Task` stripped), only the Layer-2 self-check (orchestrator's own contract discipline) enforces the reasoning checkpoint at boundaries B1/B2/B3. The Layer-1 hook (`hooks/checkpoint-guard.sh`, `PreToolUse`/matcher `Task`) never fires because there is no `Task` call to intercept.

In dev mode (top-level, `Task` available), the Layer-1 hook fires on every leaf dispatch. B1/B2/B3 are enforced by a harness-level deterministic floor, not just the orchestrator's own discipline. This is a strengthening of the checkpoint, not a regression. Security floors remain independent of the checkpoint state in both modes (see `docs/reasoning-checkpoint.md § Enforcement`).

---

## Role Adoption

When dev mode is active, the top-level agent reads and applies the following files (by pointer — the output style body does not duplicate their content):

- `agents/orchestrator.md` — Step 6 routing, Discover phase, all phase contracts and gate enforcement.
- `docs/discover-phase.md` — patient intake, advance-signal gate, intake survey.
- `docs/reasoning-checkpoint.md` — B1/B2/B3 boundaries and advance contract.
- `docs/subagent-orchestration.md` — dispatch protocol and Takeover Pipeline Manifest.

Resolve these from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`

---

## Reconciliation with review-mode hard gates (#251/#252)

The review-mode hard gates (merged in #251/#252) and the dev-mode outward-action gate address the SAME class of risk — outward action without operator approval — at complementary layers:

| Aspect | #251/#252 (review mode) | dev-mode gate | Relation |
|---|---|---|---|
| Risk class | Publish review/comment without operator approval | push/merge/publish inline in dev mode | SAME class |
| Enforcement layer | PROMPT (imperative constraints) + Suite 57 tokens | FLOOR deterministic (hook Bash) | COMPLEMENTARY |
| Approval mechanism | Preview-and-confirm, `--auto-publish` opt-in | `permissionDecision: "ask"` (human out-of-band, agent cannot auto-approve) | MIRRORS preview-and-confirm |
| Coverage | `gh pr review`, `POST /reviews`, replies, dismiss | by DESTINATION: push to remote; `pulls/.../merge|reviews|comments` via any binary | SUPERSET of #252 vocabulary |

The dev-mode gate does NOT re-implement the review-mode publish gate. It reinforces it with a floor that the agent cannot rationalise through. Where #252 covers review-mode at prompt level, `dev-guard.sh` covers dev-mode at hook level — and by extension it also protects the "takeover/inline" execution site that #252 identified as the highest-risk gap: when dev mode is active and the top-level session IS the orchestrator, that site now has a deterministic floor. See `agents/ref-direct-modes.md § Publish Gate` for the review-mode contract.

---

## Token Cost

The orchestrator contract is loaded into the top-level context and persists for the session. Mitigants:

1. **Prompt caching** — after the first turn, the stable prefix is billed at the cached rate.
2. **Pointer-based loading** — the output style body references files by pointer; the agent reads them on demand rather than keeping a verbatim copy in the style body itself.
3. **Opt-out available** — `/dev-mode off` exits dev mode and persists the decision. New sessions open in normal mode (zero orchestrator cost). The escape hatch is always available.

Default-on means the cost applies to all sessions where the operator has not explicitly opted out. For operators who rarely use the pipeline, this is a trade-off the operator accepted for the current small user base.

Compared to the prior path (nested orchestrator that fails + dispatch_handoff round-trip + takeover), dev mode is similar or lower cost for sessions that would have triggered the handoff.

---

## Installation

`/th:setup` installs dev mode by:
1. Copying `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (makes the `developer-mode` style available in `/config`).
2. Writing the `dev-mode` managed block to `~/.claude/CLAUDE.md` (operator-facing documentation of the feature).
3. Copying `skills/dev-mode/SKILL.md` to `~/.claude/skills/dev-mode/SKILL.md` (user-level toggle).
4. **Default-on activation:** reading `dev_mode_choice` from `~/.claude/.team-harness.json` (absent/"on" → write marker `dev_mode: true` to `~/.claude/.dev-mode-active`; "off" → leave absent). No explicit `/dev-mode` is required on a fresh install.

`/th:update` re-synchronizes the output style and managed blocks on every run, and applies the same default-on logic (reads `dev_mode_choice`; absent/"on" → assert marker; "off" → skip). The update NEVER removes an existing marker — removal is operator-driven via `/dev-mode off`.

The Go installer (legacy deprecated path) also writes the `dev-mode` managed block via `ensureGlobalClaudeMD()` in `cmd/install/global_claude_md.go` and removes the obsolete `dev-mode-entry` block. The legacy installer does NOT write the activation marker (parity gap — the marker is asserted on the next plugin-runtime session via `/th:update`, or the operator can run `/dev-mode` manually).
