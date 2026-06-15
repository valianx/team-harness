---
name: resume-session
description: Brief from a saved session handoff (REPORT-only — reads and reports, touches no files, dispatches no agent).
---

Produce a briefing from a saved session handoff so the operator can decide how to
continue. This skill runs directly and does NOT invoke the orchestrator or any other
agent. It writes NO file and dispatches NO agent. It reads the handoff and reports;
the operator acts.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`,
use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name`
is the basename of the current working directory). If `logs-mode` is `"local"` or
the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/`
references below with the resolved path.

---

## Step 1 — Read the handoff (read-only)

Read `{resolved-path}/{feature}/00-session-handoff.md` (read-only).

Also read `{resolved-path}/{feature}/00-state.md` (read-only) for phase and status
context.

If no handoff file exists, report: "No session handoff found at {path}. Run
`/th:save-session {feature}` to create one." Then stop — do not write anything.

The three required field anchors in a valid handoff are:
- `### What Worked`
- `### What NOT to Retry`
- `### Next Step`

If any of these anchors is absent from the handoff file, note the missing field in
the briefing and continue.

---

## Step 2 — Emit the briefing (REPORT-only)

Render the three fields for the operator:

```
=== Session Handoff: {feature} ===

Phase / Status (from 00-state.md): {phase} / {status}

What Worked
-----------
{content}

What NOT to Retry
-----------------
{content}

Next Step
---------
{content}
```

Touch no files during or after this step.

---

## Step 3 — Tell the operator how to act

End the briefing with the explicit options, for example:

> To continue the pipeline, run `/th:recover {feature}`. To implement the Next Step
> yourself, proceed directly. This skill made no changes to any file.

The operator decides and acts. This skill does not.

---

## REPORT-only Boundary

**HARD boundary:** `resume-session` never writes a file. It never dispatches the
orchestrator or any agent. There is no `--apply` path, no `--fix` path, and no
auto-write path of any kind. The skill reads `00-session-handoff.md` and
`00-state.md` (both read-only) and emits the briefing. Nothing else happens until
the operator acts.

If a future request asks this skill to write a file, dispatch an agent, or resume
the pipeline automatically, that request falls outside this skill's scope and must
be declined.

---

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following
rules apply to every response — chat replies, briefings, and error messages. There
is no informal-chat-mode loophole.

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
- Declarative statements of fact: "The handoff was last saved on {date}."
- Direct action descriptions: "No handoff file found at {path}."
- Concise output: one briefing block + one "how to act" line. No padding.

---

## Output Discipline

Silent on file reads and path resolution. Present only:
1. The briefing block (Step 2).
2. The "how to act" line (Step 3).

No intermediate status narration, no tool-call commentary, no internal chatter.
