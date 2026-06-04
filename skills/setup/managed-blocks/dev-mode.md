<!-- dev-mode:start -->
## dev mode

**What it is:** An opt-in session mode where the top-level agent adopts the orchestrator role and dispatches leaf agents directly via Task — no nested subagent, no dispatch_handoff round-trip. Normal mode (general assistant) remains the default.

**Mechanism:** Dev mode is activated by selecting the `developer-mode` output style. The output style replaces the built-in software engineering instructions with the Team Harness orchestrator operating contract (`keep-coding-instructions: false`). This replacement — not just layering — ensures the orchestrator contract governs the session.

**How to activate:** `/config` -> Output style -> `developer-mode`. This saves the setting to `.claude/settings.local.json`. Write the filesystem marker to enable the outward-action gate: `echo 'dev_mode: true' > ~/.claude/.dev-mode-active`. Takes effect at session start (or after `/clear`).

**How to deactivate:** `/config` -> Output style -> Default (or remove `outputStyle` from settings). Delete the marker: `rm ~/.claude/.dev-mode-active`. Takes effect after `/clear` or a new session.

**What dev mode does:** Development tasks are routed through the full pipeline (architect -> implementer -> tester + qa + security -> delivery) with all gates enforced. Outward actions (git push, gh pr merge/review/comment, and equivalent API calls) require explicit operator approval via the deterministic gate `hooks/dev-guard.sh`. Security floors (HI-2, path-pattern auto-escalation, bug-fix forcing rule) are non-waivable — dev mode is a disposition signal, not a stage-switch. Full contract: `docs/dev-mode.md`.

**What dev mode does NOT do:** It does not skip stages, waive gates, or relax security checks. Ambiguous tasks are routed to the pipeline or confirmed — never handled inline without gates. Outward actions cannot be executed inline by rationalisation — the gate escalates them to operator approval.
<!-- dev-mode:end -->
