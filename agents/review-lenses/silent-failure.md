# Silent-Failure Lens

**Purpose:** Detect patterns where errors are swallowed, suppressed, or discarded rather than
propagated or logged — the diff compiles cleanly but failures silently vanish at runtime.

## When this lens fires

Load this file when the diff contains any of:
- Empty `catch {}` or `catch (_e) {}` blocks
- `.catch(() => {})` or `.catch((_err) => undefined)` promise handlers that discard the error
- `except: pass` or `except Exception: pass` (Python)
- `_ = someCallThatReturnsError(...)` (Go / Rust discarded error return)
- Ignored return codes from calls that signal failure via return value (e.g., `write()`, `send()`)
- Swallowed promises — `void asyncFn()` or `asyncFn()` with no `await` and no `.catch`
- Discarded `Result`/`Either`/`Option` — calling `.ok()` or `.unwrap_or_default()` without inspecting the
  error variant when the error path matters

## What to look for

### Empty or stub catch blocks

```ts
// Smell — error disappears; caller has no idea the operation failed
try {
  await db.save(record);
} catch {}

// Also a smell — caught, but discarded
try {
  await db.save(record);
} catch (e) {
  // TODO handle
}
```

Ask: does the caller need to know this failed? If yes, the error must be re-thrown, returned, or
logged with enough context to diagnose the failure.

### Swallowed promise rejections

```ts
// Smell — rejection is silently dropped; no error surface
sendEmail(user).catch(() => {});

// Also a smell — fire-and-forget without any rejection handler
void notifyWebhook(payload);
```

When a background operation can fail in a way the system must know about, attach a rejection handler
that at minimum logs the failure.

### Discarded error returns (Go / Rust / C)

```go
// Smell — if Write fails, the caller continues as if it succeeded
f.Write(data)

// Also a smell — blank-identifier discard
_, _ = conn.Write(packet)
```

For I/O operations and anything that signals failure via return value, the return must be inspected
unless there is an explicit documented reason it is safe to ignore.

### `except: pass` (Python)

```python
# Smell — any exception, including unexpected ones, is silently dropped
try:
    process(item)
except:
    pass

# Narrow exception with pass is also a smell when the failure matters
try:
    cache.invalidate(key)
except KeyError:
    pass  # Does the business logic actually require this to be silent?
```

## Severity guidance

| Pattern | Severity |
|---------|----------|
| Swallowed error on a critical path (auth, payment, data mutation, network I/O that must succeed) | CRITICAL |
| Lost stack trace — error caught and re-thrown without the original cause (`throw new Error("failed")` instead of `throw err`) | CRITICAL |
| Ignored error return from an I/O call with no documented rationale | SUGGESTION |
| Empty catch with a TODO comment on a non-critical background path | SUGGESTION |
| Swallowed promise on a best-effort notification (analytics ping, non-critical webhook) where documented intent is fire-and-forget | NITPICK |

## Scope discipline

Raise findings only for patterns the diff **introduced or modified** (see `## Scope Discipline` in
`reviewer.md`). Pre-existing swallowed errors in untouched code go in `## Fuera de alcance` at most
once — they do not affect the verdict. Do not duplicate a finding already raised under
`### Error Handling` in the main review.
