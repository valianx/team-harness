# Testing Conventions — Extended Reference

> Overflow from `CLAUDE.md §11`. See `CLAUDE.md §11` for the inline pointer and the suite-literal list. Full detail for each suite is below.

## Test files — scope and coverage

- **`tests/test_policy_block.sh`** — functional tests for `hooks/policy-block.sh`. Each case feeds a tool-call JSON payload and asserts the output (deny → JSON with `permissionDecision: "deny"`; allow → empty stdout). ~48 cases: `rm` destructive vs safe (`/`, `~`, `$HOME`, `--`, wildcard), git destructive vs safe (`--force`, `--no-verify`, `reset --hard`, `clean -f`), SQL DROP/TRUNCATE, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`, `secrets.*`), allow-list variants (`.env.example`/`.sample`/`.template`), malformed payloads (fail-open).
- **`tests/test_agent_structure.py`** — structural tests across `agents/`, `skills/`, `hooks/`. Assertions across all suites: tool allowlists, 5-column Roster matrix, pipeline phases (1.5 / 1.6 / 2.5 / 3.5 / 3.6 / 4.5), per-agent contract sections, workspaces hygiene guardrails, inviolable Phase 1.6 gate + inline fallback, task-list Status + AC checkbox mirror, `PreToolUse` wiring, README cross-references, observability stack (Suite 20), KG hygiene (Suite 21), stage-end notifications + SEC guards (Suite 22), plan-review panel centralization contract (Suite 34), KG MCP tool-name contract (Suite 35), KG write-integrity beacon contract (Suite 36), KG write-policy `_shared` snippet consolidation (Suite 37).
- **`tests/test_agent_frontmatter.py`** — YAML frontmatter validity for every `agents/*.md`. Uses PyYAML via `uv run --with PyYAML python` to catch the silent-agent-drop class of bug (an unquoted `": "` inside a description breaks YAML parsing; Claude Code then silently drops the agent from the registered `subagent_type` list with no error surfaced). Currently validates all agent files in `agents/`.
- **`tests/run-all.sh`** — wrapper that runs all three suites and exits 0 if all pass.

## Named suites — per-suite scope

### Suite 34 — plan-review panel centralization

34 checks. Asserts the plan-review panel centralization contract structurally: up to 3 reviewers (qa ratify-plan → security design-review conditional → plan-reviewer last) fold findings into ONE `01-plan.md`; zero side-files; one `## Plan Review` section with `**Substance (qa):**`, `**Security design-review (security):**`, and `**Combined verdict:**` as bold inline labels (not `###` headings); `plan-reviewer` is the sole writer of the header + combined verdict. Self-referential guard asserts `Suite 34` literal in `CLAUDE.md §11`.

### Suite 35 — KG MCP tool-name contract

6 checks. Asserts that every `mcp__memory__<tool>` reference in `agents/*.md` is a subset of the canonical context-harness-mcp tool set, and that bare deprecated tokens (`create_entities`, `delete_*`) appear zero times across all agent files. Also asserts orchestrator frontmatter grants only canonical KG tools. Self-referential guard asserts `Suite 35` literal in `CLAUDE.md §11`.

### Suite 36 — KG write-integrity beacon

11 checks. Asserts the write-integrity beacon contract: `kg_write` event schema in `docs/observability.md` (event, attempted, succeeded, reason codes), emission rules in `agents/orchestrator.md` § "Emitting kg_write events" (all 3 sites + 4 reason codes), delivery § "kg_write site:delivery-passive-capture" (passive-capture naming + ok/skipped:mcp-down), rollup in `skills/trace/SKILL.md` § "KG write-integrity rollup" (format-agnostic: jsonl + .md fence extraction), and resilience clauses (best-effort / never-fail language). All checks are anchor-scoped to resist false-greens. Self-referential guard asserts `Suite 36` literal in `CLAUDE.md §11`.

### Suite 37 — KG write-policy `_shared` snippet consolidation

7 checks. Asserts the existence and structure of `agents/_shared/kg-write-policy.md`, the two KG writer agents' references to it (orchestrator Phase 6 + delivery Step 11.5), the non-reference by read-only agents (qa, tester, security, architect — scope-creep guard), and the CLAUDE.md §11 self-referential guard. Checks are anchor-scoped (anti-false-green dispatch); the read-only and self-referential checks are intentionally file-wide (same precedent as Suite 35 check 6 and Suite 36 check 11). Self-referential guard asserts `Suite 37` literal in `CLAUDE.md §11` and `KG write-policy _shared snippet` marker in the test file itself.

## When to add a test

Any new pattern in `policy-block.sh` (new denylist or allowlist case) MUST be backed by an `assert_deny` / `assert_allow` line. Any new pipeline phase, new agent contract field, or new mandatory section MUST be backed by a `check(...)` line in the appropriate suite of `test_agent_structure.py`. Any new agent file in `agents/` is picked up automatically by `test_agent_frontmatter.py` — no manual addition needed; the test fails immediately if its YAML does not parse. All three files are append-only by design — refactor an assertion only when the assertion itself is wrong.

## What the tests do NOT cover

Agent prompt behaviour (whether Claude actually applies the implementer's `Reviewability self-check` is a behavioural question), hook integration with Claude Code (whether the harness invokes `policy-block.sh` on every Bash/Write/Edit/NotebookEdit depends on `~/.claude/settings.json`), and live pipeline runs (Phase 2.5 / 4.5 only fire inside a real pipeline). For those, restart Claude Code and smoke-test by hand.
