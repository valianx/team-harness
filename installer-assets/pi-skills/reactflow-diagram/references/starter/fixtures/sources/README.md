# Synthetic source fidelity cases

These sources and independently authored expectations support manual assessment
of an actual agent-authored diagram. They are reusable inputs, not generated
architecture models or evidence that a model understands the sources.

| Case | Give the author | Assesses |
| --- | --- | --- |
| DOC-01 | `documentation.md` | Nested/empty groups, message direction and scoped omissions |
| CODE-01 | `checkout.ts` | Components and directed calls/event delivery read from code |
| CHAT-01 | `conversation.md` | Natural-language entry without a schema |
| IMAGE-01 | `source-image.png` or `source-image.svg` | Clear arrows versus a materially unreadable arrowhead |
| MISSING-01 | `missing-source.md` | Useful partial work while material evidence is inaccessible |
| CONFLICT-01 | `conflicting-overview.md`, `conflicting-a.md`, `conflicting-b.md` | Equally authoritative contradictory directions |
| CORRECTION-01 | `documentation.md`, then `correction.md` | Rename/relation corrections with identity preservation |

Keep `expected-facts.json` with the assessor, separate from the author's initial
input. Its semantic names and source locators are an oracle independent of the
kit's model schema; they do not prescribe generated IDs or geometry. Do not load
it into the viewer as a diagram or count a prefilled model as extraction evidence.

For each assessment, identify the case, actual authored artifact/revision,
assessor, represented/omitted facts, unresolved questions and recorded decisions.
Assess fidelity separately from model integrity, geometry and browser rendering.
Ambiguity, contradiction or missing material evidence keeps the affected output
a draft until clarification or an explicit scope change resolves it. No case
authorizes a live model run, benchmark or network request.

All names, code and documents are synthetic. The missing-source URL uses the
reserved `.invalid` domain and must remain inaccessible; no credentials or raw
customer material are included. The PNG is a rendition of the SVG, not a second
independent source. Its readable arrows and damaged connector carry the same
evidence. The included PNG was rendered with librsvg/Cairo. Use a renderer that
preserves SVG markers; with the librsvg command-line tool available, regenerate
it from this directory with:

```sh
rsvg-convert --width 1400 --height 680 --output source-image.png source-image.svg
```
