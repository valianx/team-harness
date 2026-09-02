# Baseline fixture — small-fix

**Class:** small fix. One defect on one readable path, no public surface, no
security control.

## Request text

```text
The authoring-budget suite prints its advisory count before its own PASS line,
so a run with zero advisories reads as if a signal were suppressed. Print the
count after the signals and say "no advisory signals" when there are none.
```

## Expected touched surface

| Path | Kind |
|---|---|
| `tests/test_authoring_budgets.py` | production |

No `agents/**`, no `skills/**`, no installer, no hook, no outward surface.

## Expected pipeline shape

Valid OpenSpec is authored by the operator, so no architect dispatch. One
implementer dispatch owns the change and its ordinary test. No tester, no
cleaner, no security lens. One quality run.
