# Review Lenses — Manifest

> Read by the `reviewer` agent Reference Router. Maps trigger keyword / diff signal → lens file.
> The router loads only the matched lens file(s); it never bulk-loads all lenses.

| Lens | File | Trigger keywords / diff signals |
|------|------|--------------------------------|
| silent-failure | silent-failure.md | empty `catch {}`, `.catch(() =>`, `except: pass`, `_ = err`, ignored return codes, swallowed promises, discarded `Result`/`Either` |
| type-design | type-design.md | `\| null \| undefined` sprawl, primitive-typed ids/enums/money, boolean params, stringly-typed state, missing discriminated unions |
| comment-rot | comment-rot.md | `TODO`, `FIXME`, `HACK`, doc-comment param lists diverging from signature, comments contradicting code |
| loosening-impact | loosening-impact.md | removed `if (`/`guard`/`assert`/`validate`/`whitelist`/`allowlist`/`require`/`check`; removed `try`/`catch`/error-handling; removed test cases; removed gate conditions; deleted or short-circuited flag reads; removed early-return guards |

## Path convention

`agents/review-lenses/{lens}.md`

## Fallback

If a lens file is absent or this manifest is unreadable: log
`review-lenses unavailable` and fall back to the reviewer's general
posture. Never fabricate lens guidance.
