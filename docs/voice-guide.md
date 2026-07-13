# Voice and Language Guide — Full Reference

> Extracted from CLAUDE.md §7 to keep the main file under 40 KB. The core rules (§7.1 forbidden/required, §7.2 dev-natural verbs, §7.3 language summary) remain inline in CLAUDE.md. This file contains the full language rules, boundary tables, exceptions, and contributor checklist.

## Voice §7.1 — full examples and rationale

The four guidelines in CLAUDE.md §7 evolved from observed friction with the pre-2026-05 voice (enthusiasm markers in status blocks, phase-number jargon leaking into operator copy, Spanish prose in skill files). The rules are deliberately tight — a tool that speaks like a professional instrument frees the operator to focus on the actual work, which is designing solutions and solving problems.

**Why the OUT list matters.** The items in the CLAUDE.md §7.1 OUT list are not style preferences — each has a documented failure mode observed in production runs:

- **Enthusiasm markers** (the markers listed in the CLAUDE.md §7.1 OUT section) — operators reported them as patronizing and they buried the actual status signal in visual noise.
- **First-person personality** (`Creo que…`, `My recommendation…`) — conflated agent analysis with personal preference, making it harder to challenge the output as a technical decision vs a recommendation.
- **Anthropomorphic framing** (`Yo voy a…`, `I'm going to…`) — implied agency and intent; correct framing is "The system performs X" or "Next: X".
- **Marketing tone** — obscures capability boundaries; a feature described as "potente" but that fails silently is harder to debug than one described accurately.
- **Affirmations** (`Buena pregunta`, `That makes sense`) — consumed tokens without adding information; operators found them condescending over repeated interactions.
- **Filler closings** — same: consumed tokens, added no signal, implied the operator needed permission to continue.
- **Colloquialisms** — untranslatable across the international audience; formal equivalents are always available.

**Full Bad/Good contrast:**

Example — agent reporting the close of a verification phase (the Bad variant uses a prohibited enthusiasm marker; the Good variant uses dev-natural verbs and status literals):

```
Bad:  Phase 3/7 — Verify — completed
        Agent: tester [ok] | qa [ok] | security [ok]
        [enthusiasm-marker], todo limpio. Lista para la siguiente fase.

Good: Verify complete.
        tester: pass | qa: pass | security: clean
        Next: acceptance gate.
```

The Good variant: (a) uses dev-natural stage vocabulary (`Verify`), not phase numbers; (b) uses status literals (`pass`, `clean`) not emoji or enthusiasm markers; (c) ends with the next action, not a filler closing.

---

## Language — English-only repo content (§7.3 full)

Every committed artefact is in English: `README.md`, all files under `docs/`, `agents/*.md`, `skills/*.md`, `CLAUDE.md`, `cmd/install/*.go` strings, `bin/install.{sh,ps1,cmd}` echoes, `hooks/*.sh` echoes, `.github/workflows/*.yml`, `CHANGELOG.md`, commit messages, PR titles and bodies.

**Why:** team-harness is open-source and targets an international developer audience. Mixed-language repos are jarring, harder to grep, and force readers through a translation step. Live chat is ephemeral; repo content is the durable artefact that outlives any conversation.

**workspaces are NOT committed artefacts.** `workspaces/` is gitignored — it is local working memory on each operator's machine, not published. The English-only rule does NOT cover workspace doc PROSE content. Agent-composed prose inside workspace doc bodies follows the **operator's chat language**. Structural elements that must remain machine-readable across operators stay English regardless: section headers (`## TL;DR`, `## Current State`, `## Agent Results`), field names (`status:`, `phase:`, `verdict:`), status-block keys, closed-set enum values (`success`, `pass`, `fail`, `APPROVE`), filenames (`01-architecture.md`), `dispatch_handoff` JSON keys. The boundary is **structure = English, body prose = operator language**.

**Language source precedence — configured-default vs detection vs session-override.** The operator's language is resolved via a 4-level chain. This matters when the language of chat and workspace prose differs from `en`:

| Priority | Source | Description | Persistence |
|----------|--------|-------------|-------------|
| 1 (highest) | Session override | `operator_language` already in `00-state.md` from a mid-session request | Ephemeral (session only) |
| 2 | Config default | `language` key in `~/.claude/.team-harness.json` | Persistent (all sessions) |
| 3 | Detection | Inferred from operator's first message | Per-pipeline |
| 4 (lowest) | Fallback | `en` | — |

**Setting a configured default from chat.** An explicit persistence marker (`por defecto`, `siempre`, `default`, `permanente`, `de aquí en adelante`) in a language-change request routes to the persistent-default-set path with a Y/n confirmation gate before any config write. Without that marker — including temporality markers like `por ahora`, `esta vez`, `now` — the change is always ephemeral (session override). The config JSON is NEVER written without an explicit persistence signal.

**Scope of the configured language.** Chat responses and workspace prose follow the configured language. Committed artefacts (repo files, KG nodes, commits, PR bodies, docs) stay in English regardless of the configured language. This scope rule is unchanged by the `language` feature.

**Documented exceptions** (committed artefacts where Spanish is allowed):

- **`agents/security.md` report-body template, `reviews/04-security.md` report bodies, `agents/reviewer.md` review-body templates, `reviews/04-internal-review.md` reviewer outputs.** The two agents produce Spanish-language reports per their contracts. The Spanish output is only the body of those workspace doc reports (and the GitHub PR-review comment). The agent's system prompt, status-block fields, and framework-level fields remain English.
- **`agents/leader.md` Step 6 intent-detection routing table.** The table lists patterns in both English and Spanish so the operator can chat in either language.

**`agents/translator.md` example glossary tables** are domain illustrations, not operator copy. Out of scope for this guide.

**Live chat is NOT a committed artefact.** The English-only rule does NOT apply to chat replies — the operator may chat in any language and Claude replies in the operator's language.

## Operator-Supplied Content Boundary (§7.4)

The agent never composes Spanish (post-audit, with the §7.3 exceptions). The operator may supply Spanish content, and the agent preserves it verbatim.

| What | Who composes it | Language |
|---|---|---|
| `summary:` field of a status block | Agent | English (machine-parseable surface) |
| `status:` / `verdict:` / `event:` literal values (`success`, `pass`, `APPROVE`) | Agent (closed-set values) | English (literal tokens) |
| `output:` path containing feature-name segment | Operator-supplied feature name passed through | Whatever the operator chose |
| Workspace doc filename (e.g. `01-architecture.md`) | Agent (structural) | English |
| Workspace doc section headers (`## TL;DR`, `## Current State`, `## Agent Results`, `## Handoff`) | Agent (structural) | English |
| Workspace doc table column headers, field labels (`Status:`, `Phase:`, `Last:`, `Next:`) | Agent (structural) | English |
| `dispatch_handoff` JSON keys (`schema_version`, `next_dispatch`, `phase`, `autonomy`) | Agent (machine-parseable surface) | English |
| Feature name (e.g. `exportación-de-facturas`) | Operator-supplied | Whatever the operator chose |
| `00-task-intake.md` Original Description block | Operator-quoted | Whatever the operator said |
| Prose body content inside workspace doc sections (analyses, rationales, summaries, insights, narrative verdicts) | Agent | **Operator's chat language** (workspaces are gitignored — see §7.3) |
| Prose body content in committed agent reports — `reviews/04-security.md`, `reviews/04-internal-review.md` | Agent | Spanish (per §7.3 documented exception) |
| Status-block `summary:` of every agent (including security, reviewer) | Agent | English (machine-parseable, always) |
| Prose anywhere else (committed) | Agent | English (per §7.3) |

**Rule of thumb (two-axis):**
- **What is it?** Structural (headers, keys, filenames, closed-set enum values) → English always, regardless of where it lives. Prose → depends on where it lives.
- **Where does it live?** Gitignored workspaces → operator's chat language. Committed repo file → English (with the documented §7.3 exceptions).

## Internal Chatter — IN/OUT table (§7.1.1 full)

The table below defines which operations are **silent** vs **operator-facing**. Agents enforce this split at every step: internal mechanics (config, connectivity, init) produce no output on success; operator-facing events (decisions, results, STOP blocks, stage transitions) always surface.

| Category | On success | On failure | Rationale |
|----------|-----------|------------|-----------|
| Config load (read `.team-harness.json`, resolve paths) | SILENT — log `operation.*` event | one-line error + suggestion | The operator does not need to see each config read |
| MCP verify (memory / context7 connectivity probe) | SILENT — log `operation.*` event | one-line error + suggestion | Connectivity OK is noise; failure is actionable |
| Initialization / boot sequence | SILENT | one-line error + suggestion | Already the established pattern for the leader boot |
| Phase-transition status blocks | PERMITTED (operator-facing) | PERMITTED | The operator needs to know which stage is active |
| Tool error (any tool call fails) | n/a | SURFACE one-line summary + next-step; full output → events | Errors are always reported — never raw dumps |

**Internal chatter** = mechanical progress on steps the operator did not ask to see (config, connectivity, init). **Operator-facing** = decisions, plans, results, STOP blocks, and stage transitions. When uncertain: output that answers something the operator asked is operator-facing; output that narrates how the system reaches that answer is internal chatter.

---

## leader as the Canonical Entry Point (§7.5)

When documenting how to invoke the system, treat `@th:leader <natural-language>` as the primary path. Slash commands (`/design`, `/deliver`, `/recover`, `/issue`) are optional shortcuts that route to the same agent under the hood — they are mentioned where they help (deterministic entry, GitHub-issue fetching) but never positioned as the recommended path.

The operator's mental model is: leader is the single front door; slash commands are a fallback for edge cases. Documentation matches that model.

## Application Checklist for Contributors (§7.6)

Before opening a PR that adds or modifies operator-facing copy, walk through this checklist:

- [ ] No enthusiasm markers, no emoji decoration of routine status messages.
- [ ] No first-person personality or anthropomorphic framing.
- [ ] Dev-natural verbs (`plan`, `implement`, `PR`, `validate`, `recover`) in operator-visible status blocks, STOP-block templates, install prompts, error messages, skill help text.
- [ ] Phase numbers and gate identifiers appear only in contributor surfaces (CLAUDE.md, `agents/*.md` instructional sections, workspace doc templates). Exception: `/th:pipelines` and `/trace` output, and STAGE-GATE-{1,2,3} STOP-block header identifiers.
- [ ] All committed copy is in English. Exception: `agents/security.md` and `agents/reviewer.md` report-body templates and their `reviews/04-security.md` / `reviews/04-internal-review.md` outputs; `agents/leader.md` Step 6 routing table.
- [ ] If the change documents how to invoke the system, the example uses `@th:leader <natural-language>` as the primary path; slash commands are positioned as optional shortcuts.

`tests/test_agent_structure.py` Suite 25 enforces a mechanical subset of these rules at CI time. The checklist above covers the human-judgement cases the test suite cannot catch (e.g., tone of a multi-sentence error message).
