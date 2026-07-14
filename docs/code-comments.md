# Code Comments — Contract and Guide

> Single source of truth for when and how to comment code across all surfaces in this repo.
> Sibling to `docs/voice-guide.md`. See `CLAUDE.md §6.5` for the anti-pattern prohibition
> and `CLAUDE.md §9` for the positive-pattern pointer.

---

## 1. Purpose & the one rule

**Self-documenting code first.** A comment is a last resort, not a first draft.

The axis that determines whether a comment belongs is **audience visibility**:

- A reader of an **exported / public surface** (a Go exported function, a hook contract, a
  doc-comment that `godoc` renders) cannot see the implementation. Here a WHY/contract comment
  is load-bearing — it is the *only* documentation that reader has.
- A reader of an **internal body** can see every line. A WHAT comment ("this loop iterates
  over the list") restates what the code already says, adds no information, and will eventually
  drift into a lie.

The one rule: **comment WHY, not WHAT**. If a comment can be removed without confusing a
future reader, remove it.

---

## 2. Self-explanatory code first

Before writing a comment, ask whether the code can be clarified instead:

- Choose a name that makes the purpose obvious (`parseUserClaims`, not `process`).
- Extract a small function whose name is the comment (`validateTokenExpiry(t)`, not
  `// check if token is expired`).
- Restructure branching so the intent is readable top-to-bottom.

If a comment still seems necessary after those options are exhausted, it belongs. If the
comment only explains *what* the code does and the code is clear, delete the comment and leave
the code alone.

---

## 3. When a comment IS warranted

Four cases justify a comment:

1. **Non-obvious WHY** — a hidden constraint, a business rule not in the code, or a decision
   whose rationale would surprise a future reader.
2. **Hidden constraint or cross-file invariant** — behavior that cannot be inferred from a
   single function; the reader needs context from another file or from a spec.
3. **Tricky regex or algorithm** — the intent of a complex pattern is genuinely opaque; state
   what it matches and why.
4. **Public-surface doc-comment** — every exported identifier requires a doc comment because
   the reader has no other documentation (Go `godoc`, TSDoc, Bash function headers in
   shared scripts).

These four cases are the gate. A comment that does not clear any of them does not belong.

---

## 4. What never appears in a comment

The following are **forbidden** in any committed comment, regardless of surface:

- References to `workspaces/` paths, pipeline phases/stages/steps, or task/issue IDs.
  (Exception: the file-header provenance line — see below.)
- Session context (`// added in this run`, `// per operator instruction`).
- Commented-out code. Version control preserves history; a dead code block serves no reader.
- Ownerless `TODO` or `FIXME` with no issue reference and no resolution condition.

**File-header provenance line (documented exception).** A single top-of-file commit-shaped
header (e.g., `dev-guard.sh:3` — `fix(dev-guard): … (F-016, #304)`) is tolerated as a
provenance marker. It sits at the very top of the file, one occurrence only. Inline mid-body
comments referencing issues or steps (`// fix for issue #430`, `// per Step 6`) are
forbidden without exception.

---

## 5. Per-surface rules

### 5a. Go installer — `cmd/install/`

| | Guidance |
|---|---|
| **KEEP** | Doc comments on every exported type, const, function, and package. Full sentence, begins with the element name (Go `godoc` convention). WHY-comments on non-obvious invariants. Cross-file provenance (`// Source of truth: …`). |
| **CUT** | WHAT-comments on unexported bodies where well-named identifiers already express the intent. Session/issue-reference cruft. Commented-out code. |
| **EXCEPTION — never strip** | The `modes.go` invariants block and its "Source of truth" provenance header. These encode a cross-file contract (`lowCostMatrix` is the single source of truth for model rewriting; invariants verified at test time by `TestLowCostMatrixInvariants`) that a reader of one function cannot infer. The `preservation.go` clobber-avoidance comments encode non-obvious, non-local behavior. |

**Exemplar:** `cmd/install/modes.go` lines 12–37 — package/type/const doc comments plus an
invariants block. This is the correct authoring style for Go installer code.

### 5b. Hooks — `hooks/`

> New hooks ship in TypeScript per the cross-harness authoring mandate
> (`docs/opencode-distribution-roadmap.md § Cross-Harness Authoring Mandate`). TypeScript hooks
> use TSDoc/JSDoc rather than Bash `#` headers. The guidance below covers both existing Bash
> hooks and new TypeScript hooks; the substance is the same, only the syntax differs.

| | Guidance |
|---|---|
| **KEEP** | Security-floor rationale and threat-model explanation. Deterministic-gate behavior (`fail-CLOSED` vs `fail-OPEN` asymmetry). Non-obvious regex — state what it matches and why. Coverage catalogues (what the gate DOES and DOES NOT cover). Cross-hook fail-mode comparisons. |
| **CUT** | Comments that restate an obvious shell builtin or a standard flag. Session/workspace narration. |
| **EXCEPTION — never strip** | The entire security-floor rationale block, coverage catalogues, regex-intent comments, and cross-hook fail-mode comparison in `dev-guard.sh`. Every line of that header is load-bearing. Portability-rationale comments that explain why a construct works on Git Bash, macOS, and Linux simultaneously. |

**Exemplar:** `hooks/dev-guard.sh` lines 13–50 — the SEC-DR-2 rationale, coverage catalogue,
and fail-mode asymmetry vs `checkpoint-guard.sh`. This is the highest-value WHY-comment block
in the repo and MUST survive any "fewer comments" cleanup.

### 5c. Agent and skill Markdown — `agents/`, `skills/`

The prompt body IS the code. The analog of a WHY comment is inline rationale that tells a
future editor *why a rule exists* — not what the rule says (the rule text already does that).

| | Guidance |
|---|---|
| **KEEP** | Inline rationale explaining why a rule or constraint exists, when the reason is non-obvious. Cross-references to `docs/` files that supply the full contract. |
| **CUT** | Stale phase/task/session cruft: `(added for issue #N)`, `// TODO: revisit after v2.x` with no owner, version-marker mid-body (`## Approach v2`), strikethrough, "previously decided X now Y" rewrite history. These are the direct Markdown analog of inline work-narration comments. |
| **EXCEPTION — never strip** | Provenance bullets in `docs/knowledge.md` that carry `(vX.Y.Z)` stamps — those are a deliberate dated-decision log, not session cruft (see §6). |

**Exemplar:** `agents/architect.md § Forbidden output patterns` — the inline rationale
explaining why each output type is prohibited. This is the correct form for prompt-file
commentary.

**Note:** the `comment-rot` review lens applies to prompt files, not only to source-code
diffs. Stale cruft in a prompt body is subject to the same SUGGESTION-severity finding as
stale cruft in code.

---

## 6. Rationale goes to /docs

The repo has three rationale homes. Route into them; do NOT create a parallel bucket.

```
Need to capture a rationale / decision / constraint / non-obvious trade-off?
│
├─ Is it a one-line rule a future contributor must respect, with no extended argument?
│     └─ YES → docs/knowledge.md tag-line:
│              [decision] / [pattern] / [constraint] / [stack]
│              (the pre-read file every agent loads; cheapest, most discoverable)
│
├─ Was it an open question RESOLVED at the operator gate
│   (architect proposed a default; operator accepted or overrode),
│   OR a single significant choice with trade-offs worth a page?
│     └─ YES → docs/decisions/{slug}.md  (Nygard-style ADR)
│              + add a row to docs/decisions/README.md index
│
├─ Is it a cross-cutting, recurring rule/contract that multiple agents or
│   skills must follow (more than a page, with sub-rules / tables)?
│     └─ YES → a docs/*.md contract file
│              (e.g., voice-guide.md, conventions.md, worktree-discipline.md);
│              add the one-line pointer + tag-line to CLAUDE.md + knowledge.md
│
└─ Is it purely local — a single non-obvious line of code, a regex,
    a security-floor reason a reader of THIS file needs?
      └─ YES → an inline WHY-comment at the code (the ONLY case an inline
               comment is the right home — and even then, WHY not WHAT)
```

**Disambiguation rules:**

- A tag-line and an ADR are not mutually exclusive. A substantial decision earns an ADR *and*
  a one-line `[decision]` pointer in `knowledge.md` so it surfaces in the pre-read.
- The `(vX.Y.Z)` stamp on a `knowledge.md` tag-line is **deliberate** — it dates the decision.
  It is NOT the session cruft that the comment rule forbids. The forbidden thing is a
  session/issue reference inside shipped source code, not inside the dated decision log.
- Default bias: prefer the tag-line. Escalate to ADR only when the trade-off needs a
  paragraph; escalate to a contract file only when multiple agents must obey it.

---

## 7. Exceptions — load-bearing comments (never strip these)

The following categories are exempt from "minimize comments." Stripping them causes harm.

| Category | Why load-bearing | Example location |
|---|---|---|
| Security-floor / threat-model / fail-mode comments in hooks | Encodes why the gate behaves as it does; a future simplification could break the security property without this anchor | `hooks/dev-guard.sh:13–50` |
| Non-obvious regex intent | A regex is genuinely opaque; the intent comment is the only documentation | Any hook or lens trigger block |
| Cross-file installer invariants | Non-local contract; a reader of one function cannot reconstruct it | `cmd/install/modes.go` invariants block |
| Cross-platform portability rationale | "Works on Git Bash AND macOS AND Linux because X" — a future edit could break one OS silently | Hooks, bootstrap scripts |
| Go doc-comments on exported identifiers | Mandated by Go convention and by `godoc`; the public surface has no other documentation | All `cmd/install/*.go` exported symbols |
| Dated `knowledge.md` version stamps | Deliberate, dated-decision log — not cruft | `docs/knowledge.md` `(vX.Y.Z)` entries |
| File-header provenance line | One-per-file, top-of-file; tolerated as a provenance marker (see §4) | `hooks/dev-guard.sh:3` |

---

## 8. Enforcement

**Authors** — the implementer applies this guide while writing code. The forbidden-cruft list
in §4 is the authoring checklist; the per-surface tables in §5 are the positive guide.

**Reviewers** — the `comment-rot` review lens catches violations for comments introduced or
modified in a diff. Scope discipline applies: pre-existing stale comments in untouched code go
to `## Fuera de alcance` and do not affect the review verdict. This guide does not mandate a
sweep of existing load-bearing comments — it governs new comments authored in a PR.

Severity of work-narration / session-cruft violations: **SUGGESTION** (misleads and leaks
internal mechanics into shipped code, but does not affect correctness).

**Stage-2 enforcement (mechanical + judgment).** The `comment-rot` lens above runs at Stage-3
review (advisory, non-blocking). `docs/code-hygiene-gate.md` documents the Stage-2 enforcement
layer that turns this guide's §4 forbidden-cruft list into a blocking gate: a deterministic
pre-verify scan (`agents/orchestrator.md § Phase 2.6`) plus a judgment audit
(`agents/qa.md § Code Hygiene`) — see that file for the canonical pattern set and the full
execution-site enumeration.

---

## 9. Pointers

- `CLAUDE.md §6.5` — prohibition bullet (anti-pattern floor)
- `CLAUDE.md §9` — positive-pattern pointer
- `docs/voice-guide.md` — sibling guide (how we write prose in operator-facing surfaces)
- `agents/review-lenses/comment-rot.md` — the lens that enforces this guide at review time
- `docs/code-hygiene-gate.md` — the Stage-2 enforcement contract (deterministic scan + qa audit)
  that turns this guide's §4 forbidden-cruft list into a blocking gate, before the advisory
  Stage-3 `comment-rot` lens ever runs
