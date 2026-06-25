# Comment-Rot Lens

**Purpose:** Detect comments that have decayed — `TODO`/`FIXME` markers with no owner or
timeline, doc-comment param lists that no longer match the function signature, and inline comments
that actively contradict the code they annotate.

## When this lens fires

Load this file when the diff contains any of:
- `TODO`, `FIXME`, or `HACK` markers (especially without an owner, issue reference, or timeline)
- JSDoc / TSDoc / docstring param lists (`@param`, `:param:`, `Args:`) where parameter names or
  counts diverge from the function signature
- Inline comments that describe behavior different from what the code actually does
- Commented-out code blocks (`// old implementation`, `/* deprecated path */`)
- Return type annotations in doc-comments that differ from the actual return type
- Work-narration or session-cruft patterns: `// fix for issue`, `// fix for #`, `// per Step`,
  `// workspace note`, `// per phase`, `// per stage`, `// added in this`, `// per orchestrator`,
  phase or stage references inside code comments, pipeline-step references inside code comments

## What to look for

### Stale TODO and FIXME markers

```ts
// Smell — no owner, no issue, no timeline; will never be resolved
// TODO: fix this

// Also a smell — FIXME with no context on what is broken
// FIXME: this sometimes crashes

// Acceptable — has an issue reference and is recent
// TODO(#1234): remove this after the migration is complete (target: v3.0)
```

A bare `TODO` or `FIXME` in new code signals incomplete work being merged. Every marker added in
this diff should carry:
1. An issue/ticket reference or assignee.
2. A condition under which it will be resolved.

Pre-existing TODO markers in untouched code are out of scope.

### Doc-comment / signature mismatch

```ts
/**
 * Fetches a user by ID.
 * @param id - The user identifier
 * @param includeDeleted - Whether to include soft-deleted users
 * @returns The user record or null if not found
 */
async function fetchUser(id: string): Promise<User> { ... }
// Smell — @param includeDeleted and `| null` in @returns are stale; signature changed
```

When a PR modifies a function signature but does not update the doc-comment, callers reading the
comment receive false information. The doc-comment param list must match the actual parameters
exactly.

### Comment contradicts code

```python
# Returns the first matching item or raises ValueError
def find_item(items, key):
    for item in items:
        if item.key == key:
            return item
    return None  # Smell — comment says raises, code returns None
```

A comment that contradicts the code is worse than no comment — it actively misleads the reader.
When the code is correct and the comment is stale, the fix is to update or remove the comment.
When both the code and the comment are wrong, classify as CRITICAL.

### Commented-out code

```ts
// function oldApproach(x: number) {
//   return x * 2;
// }
```

Commented-out code should be removed, not left as dead reference. Version control preserves
history — the comment serves no informational purpose for future readers.

### Work-narration and session cruft

Work-narration comments are comments that describe the authoring session rather than the code.
They leak internal pipeline mechanics into shipped code and mislead future readers.

```ts
// Smell — references an issue ID; issue linkage belongs in the commit and PR
// fix for issue #430

// Smell — references a pipeline step; reader has no context for what "Step 6" means
// per Step 6

// Smell — references pipeline mechanics
// added in this workspace session

// Smell — references an orchestrator phase
// per orchestrator Phase 2
```

**What to look for:**

- Comments containing `fix for issue`, `fix for #`, `per Step`, `per Phase`, `per Stage`,
  `workspace note`, `added in this`, `per orchestrator`, or any reference to pipeline
  phase/stage/step numbers.
- A comment that explains what was done during authoring rather than why the code exists.
- Mid-body issue references (`// resolves #N`) — issue linkage belongs in the commit message
  and PR body, not in source comments.

**Documented exception.** A single top-of-file commit-shaped provenance header (one per file,
at the very top) is tolerated. Example: `dev-guard.sh:3` carries `fix(dev-guard): … (F-016,
#304)` — this is a file-provenance marker, not inline work-narration. Raise a finding only
when the reference appears mid-body, not at the very top of the file.

**Scope note.** Pre-existing work-narration comments in untouched code are out of scope for
this lens. Raise findings only for comments the diff introduced or modified.

## Severity guidance

| Pattern | Severity |
|---------|----------|
| Comment contradicts code in a way that would mislead a caller about safety, error handling, or return values | SUGGESTION |
| Doc-comment `@param` list diverges from signature (callers receive wrong information) | SUGGESTION |
| Bare `TODO`/`FIXME` in new code with no issue reference or resolution condition | SUGGESTION |
| Work-narration / session-cruft comment (issue ID, phase/stage/step reference, workspace note) introduced or modified in this diff | SUGGESTION |
| Commented-out code block (dead reference, version control has history) | NITPICK |
| `HACK` marker with no explanation of why the hack is necessary | NITPICK |
| Stale `// Returns X` comment where the return type changed but the behavior is correct | NITPICK |

## Scope discipline

Raise findings only for comments the diff **introduced or modified** (see `## Scope Discipline` in
`reviewer.md`). Pre-existing stale comments in untouched code go in `## Fuera de alcance` at most
once — they do not affect the verdict. Do not duplicate a finding already raised under
`### SOLID / Clean Code` in the main review.
