# Baseline fixture — medium-feature

**Class:** medium feature. A new operator-facing surface with a public
compatibility dimension, no security control.

## Request text

```text
Add `/th:pipelines --json` so a script can read pipeline status. Emit one JSON
object per workspace with feature name, phase, stage, and last event timestamp.
The human table stays the default and its columns do not change.
```

## Expected touched surface

| Path | Kind |
|---|---|
| `skills/pipelines/SKILL.md` | production |
| `docs/observability.md` | documentation |
| `tests/` (one new suite) | test |

Public compatibility applies: the flag becomes a contract a script depends on.
No security control changes.

## Expected pipeline shape

One architect pass authoring the change delta, Gate 1, one implementer
dispatch, one tester dispatch derived from the public-compatibility impact, and
the `qa` lens. No security lens. One quality run.
