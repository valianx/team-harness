# Native verification

Use Node 22.12+ and Python 3 (`TH_NATIVE_PYTHON` can select its executable).
Copy the complete `references` directory into the selected external workspace.
Inside its `native` directory run `npm ci` and `npx playwright install chromium`.
Run `node verify.mjs /absolute/scene.excalidraw --output-dir /absolute/evidence --edit-id component-id`.
The Python wrapper remains available: `python3 ../render_excalidraw.py /absolute/scene.excalidraw --output /absolute/scene.png`.

The lock pins official `@excalidraw/excalidraw@0.18.0-17d8904`, upstream
[`17d8904f734464847bcef638b636647b85ac1a1d`](https://github.com/excalidraw/excalidraw/tree/17d8904f734464847bcef638b636647b85ac1a1d).
Its native text `labelPosition` follows normalized whole-path arc length;
bindings use `{elementId, fixedPoint, mode}`. Stable `0.18.1` preserves some unknown
fields but does not honor this label placement; `--sdk stable` retains that failure.
The maintained synthetic compatibility case runs with `npm run test:browser`.

The harness loads local fonts before recovery/measurement, mounts the official
editor, retrieves its scene, drags a bound component through real pointer input,
recovers again, and exports SVG/PNG from both recovered states. It leaves the
input untouched. Inspect `editor.png`, `edited-editor.png`, both editable scenes,
exports and `verification.json`. Native/structural checks cannot certify source
fidelity or visual readability; those remain explicitly unassessed in the report.
Connection-free scenes export with native binding verification `not-applicable`.

Before revising approved work, read the current file and compute its SHA-256.
Use `python3 ../render_excalidraw.py APPROVED --patch PATCH.json --expected-sha256 HASH --backup-dir DIR`.
A patch contains `updates: [{id, changes: {...}}]`, optional `additions`, and optional
`removeIds`. Field patches preserve unrelated IDs, unknown metadata and human edits;
stale hashes and broken references fail before replacement. An exact pre-change
backup is retained. Verify the revised file again; historical generators produce drafts.

API boundaries: official [scene recovery](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)
and [exports](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export).
The pinned revision uses `onInitialize` and [`exportScene`](https://github.com/excalidraw/excalidraw/blob/17d8904f734464847bcef638b636647b85ac1a1d/packages/excalidraw/scene/export.ts).
