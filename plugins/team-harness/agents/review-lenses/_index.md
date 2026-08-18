# Review Lenses — Manifest

> Read by the `reviewer` agent Reference Router. Maps trigger keyword / diff signal → lens file.
> The router loads only the matched lens file(s); it never bulk-loads all lenses.

| Lens | File | Trigger keywords / diff signals |
|------|------|--------------------------------|
| silent-failure | silent-failure.md | empty `catch {}`, `.catch(() =>`, `except: pass`, `_ = err`, ignored return codes, swallowed promises, discarded `Result`/`Either` |
| type-design | type-design.md | `\| null \| undefined` sprawl, primitive-typed ids/enums/money, boolean params, stringly-typed state, missing discriminated unions |
| comment-rot | comment-rot.md | `TODO`, `FIXME`, `HACK`, doc-comment param lists diverging from signature, comments contradicting code, work-narration patterns (`fix for issue`, `fix for #`, `per Step`, `per Phase`, `per Stage`, `workspace note`, pipeline-step/phase/stage references in comments) |
| loosening-impact | loosening-impact.md | removed `if (`/`guard`/`assert`/`validate`/`whitelist`/`allowlist`/`require`/`check`; removed `try`/`catch`/error-handling; removed test cases; removed gate conditions; deleted or short-circuited flag reads; removed early-return guards |

## Shared lens contract

**Severity mapping.** `agents/reviewer.md § "Evidence standard"` defines the only public
severities: `blocking` and `suggestion`. Lens tables grade in three indicative tiers that map
deterministically:

| Lens tier | Reviewer severity |
|---|---|
| CRITICAL | `blocking` — only when the reviewer's evidence standard is met |
| SUGGESTION | `suggestion` |
| NITPICK | omit |

**Precedence.** A lens is additive guidance. Where a lens and `agents/reviewer.md` disagree,
the reviewer contract wins.

**Scope and channel.** A lens raises findings only for patterns the diff introduced or
modified (`reviewer.md § "Review boundary"`); pre-existing instances in untouched code are not
published and never affect the verdict. Lens findings use the reviewer's normal channels — an
anchored finding once in `inline_findings`, a cross-file finding once in the body — and are
de-duplicated by the reviewer's fingerprint. Lenses never add body sections.

## Path convention

`agents/review-lenses/{lens}.md`

## Fallback

If a lens file is absent or this manifest is unreadable: log
`review-lenses unavailable` and fall back to the reviewer's general
posture. Never fabricate lens guidance.
