# Voice and Language Guide — Full Reference

> Extracted from CLAUDE.md §7 to keep the main file under 40 KB. The core rules (§7.1 forbidden/required, §7.2 dev-natural verbs, §7.3 language summary) remain inline in CLAUDE.md. This file contains the full language rules, boundary tables, exceptions, and contributor checklist.

## Language — English-only repo content (§7.3 full)

Every committed artefact is in English: `README.md`, all files under `docs/`, `agents/*.md`, `skills/*.md`, `CLAUDE.md`, `cmd/install/*.go` strings, `bin/install.{sh,ps1,cmd}` echoes, `hooks/*.sh` echoes, `.github/workflows/*.yml`, `CHANGELOG.md`, commit messages, PR titles and bodies.

**Why:** team-harness is open-source and targets an international developer audience. Mixed-language repos are jarring, harder to grep, and force readers through a translation step. Live chat is ephemeral; repo content is the durable artefact that outlives any conversation.

**workspaces are NOT committed artefacts.** `workspaces/` is gitignored — it is local working memory on each operator's machine, not published. The English-only rule does NOT cover session-doc PROSE content. Agent-composed prose inside session-doc bodies follows the **operator's chat language**. Structural elements that must remain machine-readable across operators stay English regardless: section headers (`## TL;DR`, `## Current State`, `## Agent Results`), field names (`status:`, `phase:`, `verdict:`), status-block keys, closed-set enum values (`success`, `pass`, `fail`, `APPROVE`), filenames (`01-architecture.md`), `dispatch_handoff` JSON keys. The boundary is **structure = English, body prose = operator language**.

**Documented exceptions** (committed artefacts where Spanish is allowed):

- **`agents/security.md` report-body template, `04-security.md` report bodies, `agents/reviewer.md` review-body templates, `04-internal-review.md` / `05-internal-review.md` reviewer outputs.** The two agents produce Spanish-language reports per their contracts. The Spanish output is only the body of those session-doc reports (and the GitHub PR-review comment). The agent's system prompt, status-block fields, and framework-level fields remain English.
- **`agents/orchestrator.md` Step 6 intent-detection routing table.** The table lists patterns in both English and Spanish so the operator can chat in either language.

**`agents/translator.md` example glossary tables** are domain illustrations, not operator copy. Out of scope for this guide.

**Live chat is NOT a committed artefact.** The English-only rule does NOT apply to chat replies — the operator may chat in any language and Claude replies in the operator's language.

## Operator-Supplied Content Boundary (§7.4)

The agent never composes Spanish (post-audit, with the §7.3 exceptions). The operator may supply Spanish content, and the agent preserves it verbatim.

| What | Who composes it | Language |
|---|---|---|
| `summary:` field of a status block | Agent | English (machine-parseable surface) |
| `status:` / `verdict:` / `event:` literal values (`success`, `pass`, `APPROVE`) | Agent (closed-set values) | English (literal tokens) |
| `output:` path containing feature-name segment | Operator-supplied feature name passed through | Whatever the operator chose |
| Session-doc filename (e.g. `01-architecture.md`) | Agent (structural) | English |
| Session-doc section headers (`## TL;DR`, `## Current State`, `## Agent Results`, `## Handoff`) | Agent (structural) | English |
| Session-doc table column headers, field labels (`Status:`, `Phase:`, `Last:`, `Next:`) | Agent (structural) | English |
| `dispatch_handoff` JSON keys (`schema_version`, `next_dispatch`, `phase`, `autonomy`) | Agent (machine-parseable surface) | English |
| Feature name (e.g. `exportación-de-facturas`) | Operator-supplied | Whatever the operator chose |
| `00-task-intake.md` Original Description block | Operator-quoted | Whatever the operator said |
| Prose body content inside session-doc sections (analyses, rationales, summaries, insights, narrative verdicts) | Agent | **Operator's chat language** (workspaces are gitignored — see §7.3) |
| Prose body content in committed agent reports — `04-security.md`, `04-internal-review.md`, `05-internal-review.md` | Agent | Spanish (per §7.3 documented exception) |
| Status-block `summary:` of every agent (including security, reviewer) | Agent | English (machine-parseable, always) |
| Prose anywhere else (committed) | Agent | English (per §7.3) |

**Rule of thumb (two-axis):**
- **What is it?** Structural (headers, keys, filenames, closed-set enum values) → English always, regardless of where it lives. Prose → depends on where it lives.
- **Where does it live?** Gitignored workspaces → operator's chat language. Committed repo file → English (with the documented §7.3 exceptions).

## orchestrator as the Canonical Entry Point (§7.5)

When documenting how to invoke the system, treat `@th:orchestrator <natural-language>` as the primary path. Slash commands (`/design`, `/deliver`, `/recover`, `/issue`) are optional shortcuts that route to the same agent under the hood — they are mentioned where they help (deterministic entry, GitHub-issue fetching) but never positioned as the recommended path.

The operator's mental model is: orchestrator is the single front door; slash commands are a fallback for edge cases. Documentation matches that model.

## Application Checklist for Contributors (§7.6)

Before opening a PR that adds or modifies operator-facing copy, walk through this checklist:

- [ ] No enthusiasm markers, no emoji decoration of routine status messages.
- [ ] No first-person personality or anthropomorphic framing.
- [ ] Dev-natural verbs (`plan`, `implement`, `PR`, `validate`, `recover`) in operator-visible status blocks, STOP-block templates, install prompts, error messages, skill help text.
- [ ] Phase numbers and gate identifiers appear only in contributor surfaces (CLAUDE.md, `agents/*.md` instructional sections, session-doc templates). Exception: `/status` and `/trace` output, and STAGE-GATE-{1,2,3} STOP-block header identifiers.
- [ ] All committed copy is in English. Exception: `agents/security.md` and `agents/reviewer.md` report-body templates and their `04-security.md` / `04-internal-review.md` / `05-internal-review.md` outputs; `agents/orchestrator.md` Step 6 routing table.
- [ ] If the change documents how to invoke the system, the example uses `@th:orchestrator <natural-language>` as the primary path; slash commands are positioned as optional shortcuts.

`tests/test_agent_structure.py` Suite 25 enforces a mechanical subset of these rules at CI time. The checklist above covers the human-judgement cases the test suite cannot catch (e.g., tone of a multi-sentence error message).
