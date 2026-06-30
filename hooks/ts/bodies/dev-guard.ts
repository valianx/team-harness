// hooks/ts/bodies/dev-guard.ts
// Canonical body — verbatim port of hooks/dev-guard.sh decision logic.
// Runtime-pure: imports no runtime symbol; reads only NormalizedInput;
// returns only NormalizedDecision. Never branches on `input.runtime`.
//
// Coverage catalogue (mirrors dev-guard.sh header, closed and enumerated):
//   1. Push to a remote: git push (bare, -C, GIT_DIR=)
//   2. PR/issue writes by ANY binary (gh pr create/merge/review/comment,
//      gh issue create/edit/comment, gh api REST PUT/POST/PATCH/DELETE .../pulls,
//      gh api graphql PR-write mutations, curl/wget mutating method to api.github.com)
//   3. ClickUp MCP outward writes (tool.name matches write pattern, no command)
//
// Default: none (no-decision) — ask/deny EXCLUSIVELY for covered actions.
//
// Fail-closed for covered actions: empty-cmd + raw-payload outward token → ask.
// ClickUp branch: gates on tool.name alone (command field absent → null).

import type { NormalizedInput, NormalizedDecision } from "../shim/normalized-v1.js";

// ---------------------------------------------------------------------------
// Decision helpers — mirror dev-guard.sh ask()/nodecision() semantics
// ---------------------------------------------------------------------------

function ask(reason: string): NormalizedDecision {
  return { decision: "ask", reason, mutations: null };
}

function none(): NormalizedDecision {
  return { decision: "none", reason: "", mutations: null };
}

// ---------------------------------------------------------------------------
// ClickUp MCP write-pattern (mirrors _clickup_write_pattern in dev-guard.sh)
// mcp__ + any server segment (including underscores for multi-word server names)
// + __clickup_(write verbs)
// ---------------------------------------------------------------------------
const CLICKUP_WRITE_RE =
  /^mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file|delete_task)$/;

// ---------------------------------------------------------------------------
// Outward-action detection patterns (verbatim from dev-guard.sh sections 2a-2f)
// ---------------------------------------------------------------------------

// 2a. git push (bare, -C <path>, GIT_DIR=...)
// Pattern: (start|space|pipe|semicolon|backtick) git (optional -C path or KEY=VAL)* push (space|end)
const GIT_PUSH_RE =
  /(^|[\s|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)/;

// 2b. gh pr create (mutating verb only — read-only gh pr view/list/status stay ungated)
const GH_PR_CREATE_RE = /(^|[\s|;`])gh\s+pr\s+create(\s|$)/;

// 2c. gh pr merge
const GH_PR_MERGE_RE = /(^|[\s|;`])gh\s+pr\s+merge(\s|$)/;

// 2c. gh pr review (including --dismiss)
const GH_PR_REVIEW_RE = /(^|[\s|;`])gh\s+pr\s+review(\s|$)/;

// 2d. gh pr comment
const GH_PR_COMMENT_RE = /(^|[\s|;`])gh\s+pr\s+comment(\s|$)/;

// 2e. gh api -X PUT|POST|PATCH|DELETE ... /pulls
const GH_API_REST_PR_RE =
  /(^|[\s|;`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls/i;

// 2e-bis. gh api graphql with a PR-write mutation name
// Read-only reviewThreads listing queries carry no mutation name → nodecision.
const GH_GRAPHQL_RE = /(^|[\s|;`])gh\s+api\s+graphql/i;
const GRAPHQL_PR_MUTATIONS_RE =
  /(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)/;

// 2e-ter. gh issue mutating writes (create, edit, comment).
// Read-only gh issue list / gh issue view stay ungated (no outward side-effect).
const GH_ISSUE_WRITE_RE = /(^|[\s|;`])gh\s+issue\s+(create|edit|comment)(\s|$)/;

// 2f. curl/wget mutating method to api.github.com (both forms from dev-guard.sh)
const CURL_WGET_MUTATING_RE =
  /(^|[\s|;`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com/i;
const API_GITHUB_URL_RE = /api\.github\.com/;
const MUTATING_METHOD_RE = /(-X|--request)\s*(PUT|POST|PATCH|DELETE)/i;

// Defence-in-depth (F-016): raw payload scan when cmd is empty (mirrors dev-guard.sh lines 185-189)
const RAW_OUTWARD_SCAN_RE =
  /(git\s+push|gh\s+pr\s+(create|merge|review|comment)|gh\s+issue\s+(create|edit|comment)|gh\s+api.*pulls|api\.github\.com)/;

// ---------------------------------------------------------------------------
// Public evaluate() — the single entry point every runtime calls.
// ---------------------------------------------------------------------------

export function evaluate(input: NormalizedInput): NormalizedDecision {
  // Step 1a — ClickUp MCP outward-write (tool.name match, no command field).
  // This branch runs BEFORE any command extraction so an absent command field
  // does not degrade to none (parity with dev-guard.sh:97-128).
  const toolName = input.tool?.name ?? "";
  if (toolName && CLICKUP_WRITE_RE.test(toolName)) {
    return ask(
      `outward action — ClickUp MCP outward write (${toolName}) requires explicit operator approval; preview the change before confirming (dev-guard.ts; see docs/dev-mode.md)`
    );
  }

  // Extract command from tool.input.command (absent → null, never undefined).
  const cmd = input.tool?.input?.["command"];
  const cmdStr = typeof cmd === "string" ? cmd : null;

  // Defence-in-depth (F-016): if cmd is null/empty on a Bash payload, scan raw
  // payload representation for covered destination patterns → ask (fail-safe direction).
  if (cmdStr === null && toolName === "Bash") {
    // Reconstruct a rough representation of the input for the raw scan.
    const rawRepr = JSON.stringify(input.tool?.input ?? {});
    if (RAW_OUTWARD_SCAN_RE.test(rawRepr)) {
      return ask(
        "outward action detected in raw payload (escape-aware extraction fallback); requires explicit operator approval (dev-guard.ts)"
      );
    }
    // No extractable command and no raw outward token — no decision.
    return none();
  }

  // No command and not a Bash tool — no decision.
  if (cmdStr === null) {
    return none();
  }

  // Step 2 — Detect outward/mutating actions by DESTINATION.

  // 2a. git push
  if (GIT_PUSH_RE.test(cmdStr)) {
    return ask(
      "outward action 'git push' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2b. gh pr create
  if (GH_PR_CREATE_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr create' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2c. gh pr merge
  if (GH_PR_MERGE_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr merge' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2c. gh pr review
  if (GH_PR_REVIEW_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr review' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2d. gh pr comment
  if (GH_PR_COMMENT_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh pr comment' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2e. gh api REST mutating PR endpoint
  if (GH_API_REST_PR_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2e-bis. gh api graphql with PR-write mutation name
  if (GH_GRAPHQL_RE.test(cmdStr) && GRAPHQL_PR_MUTATIONS_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh api graphql' PR-mutating operation requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2e-ter. gh issue mutating writes (create, edit, comment)
  if (GH_ISSUE_WRITE_RE.test(cmdStr)) {
    return ask(
      "outward action 'gh issue write' requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2f. curl/wget mutating method to api.github.com (form 1: adjacent -X and api.github.com)
  if (CURL_WGET_MUTATING_RE.test(cmdStr)) {
    return ask(
      "outward action via curl/wget to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // 2f continued. (form 2: api.github.com URL anywhere + -X/--request anywhere in cmd)
  if (API_GITHUB_URL_RE.test(cmdStr) && MUTATING_METHOD_RE.test(cmdStr)) {
    return ask(
      "outward action to api.github.com with mutating method requires explicit operator approval (dev-guard.ts); see docs/dev-mode.md § Outward-Action Gate"
    );
  }

  // Step 3 — No covered action detected; no decision.
  return none();
}
