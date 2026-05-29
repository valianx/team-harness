# Testing Conventions — Extended Reference

> Overflow from `CLAUDE.md §11`. See `CLAUDE.md §11` for the inline bullet list and the pointer back here.

## When to add a test

Any new pattern in `policy-block.sh` (new denylist or allowlist case) MUST be backed by an `assert_deny` / `assert_allow` line. Any new pipeline phase, new agent contract field, or new mandatory section MUST be backed by a `check(...)` line in the appropriate suite of `test_agent_structure.py`. Any new agent file in `agents/` is picked up automatically by `test_agent_frontmatter.py` — no manual addition needed; the test fails immediately if its YAML does not parse. All three files are append-only by design — refactor an assertion only when the assertion itself is wrong.

## What the tests do NOT cover

Agent prompt behaviour (whether Claude actually applies the implementer's `Reviewability self-check` is a behavioural question), hook integration with Claude Code (whether the harness invokes `policy-block.sh` on every Bash/Write/Edit/NotebookEdit depends on `~/.claude/settings.json`), and live pipeline runs (Phase 2.5 / 4.5 only fire inside a real pipeline). For those, restart Claude Code and smoke-test by hand.
