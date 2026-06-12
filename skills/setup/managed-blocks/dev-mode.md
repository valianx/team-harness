<!-- dev-mode:start -->
## dev mode

**What it is:** The default session disposition for Team Harness. Developer mode activates automatically on install and update — the top-level agent adopts the orchestrator role and dispatches leaf agents directly via Task (no nested subagent, no dispatch_handoff round-trip). To exit: run `/dev-mode off` — the choice persists so future updates respect it.

**Start it (in-session, no reload):** run `/dev-mode`. The skill writes the marker `~/.claude/.dev-mode-active` (`dev_mode: true`), prints the DEVELOPER MODE banner, adopts the orchestrator operating contract, and persists `dev_mode_choice: "on"` in `~/.claude/.team-harness.json`. No `/clear` is required.

**Auto-resume on new sessions:** while the marker is present, the unified `SessionStart` hook (`hooks/session-start.sh`) loads the disposition into context at the start of every new session, so each chat opens in developer mode and shows the banner on its first reply. The marker is the single source of truth. The determination is loaded silently — the agent never narrates it or re-inspects the marker.

**Stop it:** run `/dev-mode off`. The skill removes the marker (`dev-guard.sh` intercepts the removal with `permissionDecision: "ask"` — the operator confirms), returns to normal mode, and persists `dev_mode_choice: "off"` in `~/.claude/.team-harness.json` so future `/th:update` runs respect the opt-out.

**Persistent alternative (optional):** the `developer-mode` output style — `/config` -> Output style -> `developer-mode` to enable, `/config` -> Output style -> Default to disable — replaces the built-in software engineering instructions with the orchestrator contract (`keep-coding-instructions: false`) and applies on reload. It is equivalent; the marker remains the observable flag either way. `force-for-plugin` is intentionally NOT set (see `docs/dev-mode.md § Default-on disposition`).

**What dev mode does:** development tasks route through the full pipeline (architect -> implementer -> tester + qa + security -> delivery) with all gates enforced. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) require explicit operator approval via the deterministic gate `hooks/dev-guard.sh`. Security floors are non-waivable — dev mode is a disposition signal, not a stage-switch. Full contract: `docs/dev-mode.md`.

**What dev mode does NOT do:** it does not skip stages, waive gates, or relax security checks. Ambiguous tasks are routed to the pipeline or confirmed — never handled inline without gates. Outward actions cannot be executed inline by rationalisation — the gate escalates them to operator approval.
<!-- dev-mode:end -->
