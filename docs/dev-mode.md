# Dev Mode — Contract

Dev mode is an opt-in session state where the top-level Claude agent adopts the orchestrator role and dispatches leaf agents directly via the `Task` tool — no nested subagent invocation, no `dispatch_handoff` round-trip. Normal mode (general assistant, no pipeline overhead) remains the default.

---

## Disposition mechanism: output-style replaces the base

**Why output-style, not a skill.** A prior implementation used a `/dev-mode` skill (commit 18ea492). A live test proved that mechanism structurally insufficient: the skill LAYERED the orchestrator contract OVER the base "make-progress" disposition of the general agent, and the base won — the agent operated inline, merged a PR to main without a pipeline, and rationalised the skip. A skill superposes; the base built-in beats it.

The correction is a change of MECHANISM, not of content. The `developer-mode` output style with `keep-coding-instructions: false` REPLACES the built-in software engineering instructions (how to scope changes, write comments, verify work) instead of layering over them. There is no base to beat — it is gone. The orchestrator contract (routing Step 6 + Discover + reasoning-checkpoint + anti-rushing/triage) becomes the governing set of instructions for the session.

**What `keep-coding-instructions: false` discards — and why its loss is not a security gap (AC-18).**

The Claude Code docs describe this flag precisely: *"Custom output styles leave out Claude Code's built-in software engineering instructions, such as how to scope changes, write comments, and verify work."* And the framing: *"Output styles change how Claude responds, not what Claude knows."*

This distinction is load-bearing:
- **What is discarded:** SWE WORKFLOW guidance (how to scope, comment, verify). This is disposition of process, NOT a security control. Its absence degrades workflow tidiness, not safety. The orchestrator contract loaded by the style replaces this guidance with a more explicit version: the SDD pipeline IS scoping + verification.
- **What is NOT discarded:** The model's harm-rejection and safety layer ("what Claude knows" — Anthropic's constitutional training). An output style adjusts the system prompt; it does NOT disarm the model's refusal to produce harmful outputs, exfiltrate data, or follow malicious instructions. That layer does not live in the "software engineering instructions" block.
- **Security floors are PROMPT-INDEPENDENT (hooks, not prompt):** the security guarantees of this harness are PreToolUse hooks wired by matcher — they fire regardless of which system prompt is active:
  - `hooks/policy-block.sh` — matcher `Bash|Write|Edit|NotebookEdit`. Blocks `rm -rf / ~ $HOME`, `git push --force`, `git reset --hard`, `git clean -f`, `--no-verify`, destructive SQL, and writes to sensitive file paths (`.env`, `.pem`, `.ssh/`, credentials). Survives the output-style swap intact.
  - `hooks/dev-guard.sh` — matcher `Bash`. Gates outward/mutating actions in dev mode (see § Outward-Action Gate). Survives intact.
  - `hooks/checkpoint-guard.sh` — matcher `Task`. Gates phase dispatch at reasoning-checkpoint boundaries. Survives intact.

**Conclusion:** `keep-coding-instructions: false` is safe for this harness because the security floors are hooks, not prompt. No security-relevant default lives exclusively in the discarded SWE instructions that the orchestrator contract + hooks do not re-establish.

**Honest trade-off (accepted by the operator):** the output style is SESSION-LEVEL. It is read once at session start. Changing modes requires `/clear` or a new session — there is no clean mid-session toggle. The `/output-style` command was removed in Claude Code v2.1.91; activation is via `/config` → Output style, or the `outputStyle` field in a settings file. The trade is accepted: the base-replacement benefit (orchestrator contract as the governing set of instructions) outweighs the session-level toggle cost. Normal mode remains the default; the cost only applies to operators who deliberately enter dev mode.

---

## Activation and the filesystem marker

**Activation:** select the `developer-mode` output style via `/config` → Output style → `developer-mode`. The style is distributed by the plugin (`output-styles/`) and copied to `~/.claude/output-styles/developer-mode.md` by `/th:setup`. Write the filesystem marker:

```bash
echo 'dev_mode: true' > ~/.claude/.dev-mode-active
```

The marker is the observable signal that (a) dev mode is active for this session and (b) the outward-action gate `dev-guard.sh` applies. Takes effect at session start (or after `/clear`).

**Deactivation:** `/config` → Output style → Default (or remove `outputStyle` from settings). Delete the marker:

```bash
rm ~/.claude/.dev-mode-active
```

Takes effect after `/clear` or a new session.

**Normal is the default.** `force-for-plugin` is NOT set on the output style — it is never applied automatically. Every operator enters dev mode by deliberate action.

---

## Outward-Action Gate (`dev-guard.sh`)

The deterministic security layer is the PreToolUse hook `hooks/dev-guard.sh`, wired to matcher `Bash` in both `hooks/config.json` (Go installer, 3 OS) and `.claude-plugin/hooks.json` (plugin runtime). This is the GUARANTEE — not the disposition.

**What it gates (by DESTINATION, not by binary):**

| Covered action | Decision | Rationale |
|---|---|---|
| Push to a remote: `git push` (bare, `git -C <path> push`, `GIT_DIR=... git push`) | `ask` | Any push to a remote is an irreversible outward action |
| `gh pr merge` | `ask` | Merges to main cannot be undone |
| `gh pr review` (including `--dismiss`) | `ask` | Publishes a review on behalf of the operator |
| `gh pr comment` | `ask` | Publishes a comment on behalf of the operator |
| `gh api -X PUT|POST|PATCH|DELETE` against PR endpoints (`/pulls/.../merge|reviews|comments`) | `ask` | Covers API-level bypass of the `gh` CLI |
| `curl`/`wget` with mutating method against `api.github.com` | `ask` | Covers binary-level bypass |
| Write/remove/move `~/.claude/.dev-mode-active` (`rm`/`mv`/`>`/`>>`/`tee`/`cp`) | `deny` | Disabling the gate while dev mode is active is not operator-approvable inline |

**What `ask` means:** `permissionDecision: "ask"` causes the Claude Code runtime to prompt the OPERATOR interactively for that specific call. The agent CANNOT auto-approve an `ask`. There is NO authorisation marker file — the authorisation is human out-of-band. A legitimate delivery push at STAGE-GATE-3 proceeds through this same operator approval, mirroring the preview-and-confirm contract of review-mode (#251/#252).

**Fail-CLOSED for covered actions:** the only allow-path for a covered action is the dev-mode marker being demonstrably ABSENT. If the marker is present (including present-but-empty or present-but-unreadable), the hook treats it as active and issues `ask`. This is the intentional fail-mode: the consequences of an unauthorised merge to main are irreversible; the consequences of an over-zealous `ask` are a minor friction.

**No authorisation file.** A file that the agent can write with `echo authorized > ...` is forjable by the same subject the gate protects — it is not a control. The authorisation is `ask` (human), not a file.

**Residual limit (documented honesty):** obfuscation via `eval`/`base64`/alias/heredoc is a known limit of any string-matching gate (parity with `policy-block.sh`). The threat model is disposition that rationalises the readable path — not an adversary who actively obfuscates.

---

## Inline Orchestration Permit (SEC-DR-2)

Executing the orchestrator role inline at top level is **PERMITTED ONLY** when:

- The `developer-mode` output style is active (signalled by `~/.claude/.dev-mode-active` containing `dev_mode: true`), AND
- The top-level session has the `Task` tool available (it always does at level 0).

**Without the output style active:** executing orchestration inline — including reading `agents/orchestrator.md` "as reference" without the output style loaded — is the ad-hoc improvisation that weakens gate enforcement. It is PROHIBITED. The discriminant is the observable output style + filesystem marker, not a subjective judgment about whether the contract was loaded.

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
2. **Opt-in only** — normal mode loads nothing; cost is zero outside dev mode.
3. **Pointer-based loading** — the output style body references files by pointer; the agent reads them on demand rather than keeping a verbatim copy in the style body itself.

Compared to the prior path (nested orchestrator that fails + dispatch_handoff round-trip + takeover), dev mode is similar or lower cost for sessions that would have triggered the handoff.

---

## Installation

`/th:setup` installs dev mode by:
1. Copying `output-styles/developer-mode.md` from the plugin cache to `~/.claude/output-styles/developer-mode.md` (makes the `developer-mode` style available in `/config`).
2. Writing the `dev-mode` managed block to `~/.claude/CLAUDE.md` (operator-facing documentation of the feature).
3. Offering (opt-in, NOT forced) to activate the style and write the filesystem marker.

`/th:update` re-synchronizes the output style copy on every run and retires the obsolete `/dev-mode` user-level skill (`~/.claude/skills/dev-mode/SKILL.md`) if present.

The Go installer (legacy path) also writes the `dev-mode` managed block via `ensureGlobalClaudeMD()` in `cmd/install/global_claude_md.go` and removes the obsolete `dev-mode-entry` block.
