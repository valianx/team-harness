---
name: save-session
description: Save a confirmation-gated session handoff (what worked / what NOT to retry / next step) to 00-session-handoff.md.
---

Save the state of an in-flight effort into a single workspace handoff artifact so a
later session can resume without re-deriving context. This skill runs directly and
does NOT invoke the orchestrator or any other agent. It writes exactly one file —
`00-session-handoff.md` — and only after the operator explicitly confirms.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`,
use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name`
is the basename of the current working directory). If `logs-mode` is `"local"` or
the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/`
references below with the resolved path.

---

## Step 1 — Locate the target workspace

- Feature name provided via $ARGUMENTS → use `{resolved-path}/{feature}/`.
- No feature name → scan `{resolved-path}/*/00-state.md` for the most recently
  updated incomplete workspace (status != complete). If exactly one is found,
  use it. If multiple are found or none exist, ask the operator to specify.

---

## Step 2 — Gather the three handoff fields

Read `00-state.md` and `00-execution-events.{md,jsonl}` (read-only) from the
target workspace for context. Prompt the operator for any field not already
inferable from those files:

- **What Worked** — confirmed-good approaches and decisions safe to keep.
- **What NOT to Retry** — dead-ends, failed approaches, and ruled-out options.
  This is the field that distinguishes a handoff from a plain recovery: it records
  what must NOT be re-attempted.
- **Next Step** — the single concrete next action for the resuming session.

Use the operator's language when prompting.

---

## Step 3 — Confirmation gate (mandatory)

Render the assembled handoff to the operator and ask for explicit confirmation
before writing. Present the full three-field content so the operator can review it.

**No write happens without an affirmative response from the operator.**

On decline: write nothing. Report: "Handoff not saved — no changes made."

---

## Step 4 — Write (the ONLY write in this skill)

On affirmative confirmation, overwrite
`{resolved-path}/{feature}/00-session-handoff.md` with the template below.

In obsidian mode, prepend YAML frontmatter (repo, feature, date) for parity with
peer workspace artifacts (`00-execution-events.md`, `00-decision-ledger.md`).

---

## Handoff template

```markdown
# Session Handoff: {feature}

### What Worked
- {item}

### What NOT to Retry
- {item}

### Next Step
- {concrete next action}
```

---

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following
rules apply to every response — chat replies, prompts, confirmations, and error
messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "That makes sense".
- Filler closings: "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: regional slang, "shippeo", "bakeado", "wrappear".
- Marketing tone: superlatives, "potente", "innovador".

**Required:**
- Declarative statements of fact: "The handoff has been saved to {path}."
- Direct action descriptions: "Confirmation required before writing."
- Concise output: confirmation prompt, then one-line result. No padding.

---

## Output Discipline

Silent on file reads and path resolution. Present only:
1. The assembled handoff for review (Step 3 confirmation prompt).
2. On confirmation: one-line "Handoff saved to {path}."
3. On decline: one-line "Handoff not saved — no changes made."

No intermediate status narration, no tool-call commentary.

**No secrets or tokens in the handoff.** The `What Worked` / `What NOT to Retry` /
`Next Step` fields must contain only task-narrative content — never API keys,
tokens, credentials, user-path identifiers, or personal data. Apply the same
prohibition that governs `00-decision-ledger` and `operation.*` events.
