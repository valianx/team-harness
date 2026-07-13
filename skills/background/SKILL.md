---
name: background
description: Dispatch a task to a background Claude session.
---
name: background

Dispatch a small, well-scoped task to a separate Claude session so the current session keeps moving. Designed for fire-and-forget work the developer would otherwise context-switch to handle: a typo fix, a version bump, a dependency upgrade, a one-line config change, a doc update, a missing `loading.tsx` for an App Router segment.

**This is NOT** a way to outsource an unbounded feature. The pipeline (leader + orchestrator + agents) exists for that — `/th:issue`, `/th:plan`, or just typing the feature description routes through the full SDD pipeline with verification gates. `/th:background` is the opposite: it accepts that the gates are too heavy for a 30-second change and offers a structured fast-path.

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

**Correct form for a self-correction:** `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

**Incorrect form (forbidden):** `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

---
name: background

## Phase 1 — Eligibility check (MANDATORY)

Read `$ARGUMENTS`. Reject the task and stop if any of these is true. Print one line per failed criterion in the rejection message and ask the user to either run it in the foreground or split it.

| Criterion | Eligible | Not eligible |
|---|---|---|
| Scope | one concrete change in a single file or two tightly-related files | "fix the auth flow", "improve performance", any vague verb |
| Reversibility | trivially reversible (one commit, one file) | adds a new component / migration / breaking change |
| Verification cost | obvious from the description (typo, version bump, copy change, missing import) | requires running tests to know if it worked |
| AC complexity | 0 implicit AC (the change IS the AC) | needs `/th:define-ac` to make explicit |
| Security surface | none | touches auth, secrets, request validation, CORS, CSP, dependencies with known CVEs |
| State changes | local only | publishes a package, deploys, sends a message, deletes data |
| Estimated time in foreground | ≤ 5 minutes | longer means there's hidden complexity that the gates would catch |

If all rows in the right column are clear and at least the first three rows in the left column are clear, the task is eligible. Otherwise, abort with a one-line explanation.

**Examples that pass:**
- "bump @opentelemetry/sdk-node to 1.27.0 in services/api/package.json and align the rest of the @opentelemetry/* family"
- "rename `getInvoice` to `fetchInvoice` in src/lib/billing.ts and its three call sites"
- "add a `loading.tsx` skeleton to app/(dashboard)/transactions/[id]/"
- "fix typo 'recieved' → 'received' across docs/"

**Examples that fail:**
- "fix the bug where the dropdown closes on hover" — needs verification, ambiguous scope
- "upgrade Next.js to 16" — security surface (auth middleware deprecation), breaking change
- "add a settings page" — full feature, needs the pipeline
- "speed up the report" — vague verb, no concrete change

---
name: background

## Phase 2 — Build the dispatch command

Once eligible, prepare a single shell command the user can paste into a new terminal (or a tmux pane). The command runs Claude Code in headless mode against the current repository, with the task as the prompt and a tight permission set.

**Command template:**

```bash
claude -p "{task description}" \
  --output-format stream-json \
  --permission-mode acceptEdits \
  --allowedTools "Read,Edit,Write,Bash(git:*,npm:*,pnpm:*,uv:*,python:*),Glob,Grep" \
  > "/tmp/background-{slug}.log" 2>&1 &
```

Replace:
- `{task description}` — `$ARGUMENTS` verbatim, escaped for the shell
- `{slug}` — kebab-case derivative of the first 4-6 words of the task (max 40 chars)

**What the flags do:**
- `--output-format stream-json` keeps the log structured for later inspection.
- `--permission-mode acceptEdits` auto-approves edits within the allowlist. Bash invocations not in the allowlist still prompt — this prevents runaway destructive commands.
- `--allowedTools` is a tight surface (Read/Edit/Write/Glob/Grep + scoped Bash). The harness's `policy-block.sh` PreToolUse hook (see `hooks/`) is a separate hard guardrail that always runs.
- `> /tmp/background-{slug}.log 2>&1 &` runs the process in the background of the user's shell, redirects all output to a log, and returns control immediately.

---
name: background

## Phase 3 — Present + log

Print three blocks to the user, in this order:

1. **The task you understood**, in one line, plus the eligibility verdict.
2. **The single command to run**, in a code fence. State the directory it must run from (the repo root) and the log path.
3. **How to check on it later:**
   - `tail -f /tmp/background-{slug}.log` to stream output.
   - `jobs` to see the running process.
   - `kill %1` (or the appropriate job number) to stop it.

Then **stop**. Do NOT run the command yourself — the user owns the dispatch. The point of `/th:background` is that the user is in control of when it actually fires; the skill only validates and prepares.

---
name: background

## Phase 4 — On completion (manual, by the user)

The user runs the command, the dispatched Claude session executes the task, and the log captures the result. The user reads the log when convenient:

- If the task succeeded → review the diff (`git diff` from the repo root) and commit / push as usual. Per project convention, open a PR.
- If the task failed → read the log for the failure, decide whether to retry in the foreground (with the full pipeline) or amend the prompt and re-dispatch.

OS-native notification on completion is OPT-IN: if the user has the `Stop` hook enabled (see `hooks/README.md` § "Opt-in: notify when Claude finishes a turn"), the dispatched session will fire it. If not, the user polls the log.

---
name: background

## Mode 2 — No input provided

Ask the user: "What would you like to dispatch in the background? Provide a one-sentence task description. The skill will check whether it qualifies for the fast-path; tasks that need verification, security review, or the full pipeline will be rejected."

---
name: background

## Important

- **`/th:background` does NOT invoke the leader.** This is a deliberately different surface — the orchestrator and its gates exist precisely because most tasks are not eligible for fast-path. If you find yourself wanting to bypass the gates often, the cost is the gates being too heavy, not the gates being wrong; raise it as a `team-harness` issue instead of widening `/th:background`'s eligibility criteria.
- **`/th:background` does NOT run the dispatched command.** The user owns the actual fire. The skill only validates eligibility, builds the command, and explains how to monitor it.
- **The dispatched session inherits the user's `~/.claude/` config**, including the `policy-block.sh` PreToolUse hook. Destructive commands stay blocked even in the background session.
- For multiple parallel tasks, `/th:tmux` is the right tool — it manages tmux panes, dependency analysis, and aggregates results. `/th:background` is for a single fire-and-forget.
