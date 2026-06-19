// hooks/ts/bodies/worktree-guard.ts
// Canonical body — verbatim port of hooks/worktree-guard.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// PURPOSE: advisory start-gate reminder for agent-issued branch/worktree operations.
// CONTRACT: FAIL-OPEN. On any error → none (no gate action).
// Trigger: git checkout -b / git switch -c / git worktree add.
//
// This hook fires ONLY on commands the agent's Bash tool is about to run.
// It CANNOT intercept human terminal commands.
//
// NEVER imports hook-profile helper (enforcement floor — even though it is
// advisory, it is wired as an enforcement gate and must not import profile).

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

function ask(reason: string): NormalizedDecision {
  return { decision: "ask", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// Trigger pattern — mirrors worktree-guard.sh Step 4
// ---------------------------------------------------------------------------

const TRIGGER_RE = /git\s+(checkout\s+-b|switch\s+-c|worktree\s+add)/;

// ---------------------------------------------------------------------------
// Public evaluate() — the single entry point every runtime calls.
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput): NormalizedDecision {
  const toolName = input.tool?.name ?? "";
  if (toolName !== "Bash") return none();

  const cmd = typeof input.tool?.input?.["command"] === "string"
    ? (input.tool.input["command"] as string)
    : "";

  // Fast-exit: no trigger token → none.
  if (!TRIGGER_RE.test(cmd)) {
    return none();
  }

  // Emit advisory ask with start-gate reminder.
  return ask(
    "worktree-guard: agent-issued branch/worktree operation detected. Before proceeding, confirm the start-gate decision (docs/worktree-discipline.md): (1) run `git status` and `git worktree list`; (2) `git fetch origin main` then `git rev-list --count origin/main..HEAD` — if the tree is clean AND at/behind origin/main (count=0) → branch in place is permitted; if uncommitted changes OR ahead of origin/main (count>0, incl. on a non-main branch) → create a worktree instead; (3) always cut from fresh origin/main (`git worktree add -b feat/<name> <path> origin/main`). NOTE: this hook only sees agent-issued commands — it cannot cover a human's own-terminal git operations (worktree-guard.ts; see docs/worktree-discipline.md)"
  );
}
