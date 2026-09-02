# Baseline fixture — security-sensitive-fix

**Class:** security-sensitive fix. A defect on a control surface, so the
security floor derives from the changed surface rather than from the request.

## Request text

```text
Add regression coverage proving `dev-guard` asks before a push to the default
branch when the remote is spelled with a trailing slash (`origin/`), a URL, or
an uppercase name, and fix the check if any spelling resolves to `allow`.
```

## Expected touched surface

| Path | Kind |
|---|---|
| `hooks/ts/bodies/dev-guard.ts` | production, security control |
| `hooks/ts/dist/**` | generated |
| `tests/test_dev_guard.sh` | test |

The changed surface is an outward-action gate, so the derived security floor
applies and is not waivable by the request's size.

## Expected pipeline shape

One architect pass, Gate 1, one implementer dispatch, one tester dispatch with
reason `security_control`, and both the `qa` and `security`/`adversary` lenses
over the frozen diff. One quality run.
