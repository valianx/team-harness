<!-- dev-mode:start -->
## dev mode

**What it is:** An opt-in session mode where the top-level agent adopts the orchestrator role and dispatches leaf agents directly via Task — no nested subagent, no dispatch_handoff round-trip. Normal mode (general assistant) is the default; developer mode is the precondition for the orchestrated pipeline.

**Start it (in-session, no reload):** run `/dev-mode`. The skill starts developer mode in the current session immediately — it writes the marker `~/.claude/.dev-mode-active` (`dev_mode: true`), prints the DEVELOPER MODE banner, and adopts the orchestrator operating contract. No `/clear` is required.

**Auto-resume on new sessions:** while the marker is present, the `SessionStart` hook (`hooks/dev-mode-session-start.sh`) loads the disposition into context at the start of every new session, so each chat opens in developer mode and shows the banner on its first reply. The marker is the single source of truth. The determination is loaded silently — the agent never narrates it or re-inspects the marker.

**Stop it:** run `/dev-mode off`. The skill removes the marker (`dev-guard.sh` intercepts the removal with `permissionDecision: "ask"` — the operator confirms) and returns to normal mode; new sessions then open in normal mode.

**Persistent alternative (optional):** the `developer-mode` output style — `/config` -> Output style -> `developer-mode` to enable, `/config` -> Output style -> Default to disable — replaces the built-in software engineering instructions with the orchestrator contract (`keep-coding-instructions: false`) and applies on reload. It is equivalent; the marker remains the observable flag either way.

**What dev mode does:** development tasks route through the full pipeline (architect -> implementer -> tester + qa + security -> delivery) with all gates enforced. Outward actions (git push, gh pr merge/review/comment, GitHub API writes) require explicit operator approval via the deterministic gate `hooks/dev-guard.sh`. Security floors are non-waivable — dev mode is a disposition signal, not a stage-switch. Full contract: `docs/dev-mode.md`.

**What dev mode does NOT do:** it does not skip stages, waive gates, or relax security checks. Ambiguous tasks are routed to the pipeline or confirmed — never handled inline without gates. Outward actions cannot be executed inline by rationalisation — the gate escalates them to operator approval.
<!-- dev-mode:end -->
