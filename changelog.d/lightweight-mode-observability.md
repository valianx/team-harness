### Fixed
- `docs/observability.md`: added "Lightweight direct-mode exemptions" section declaring `diagram` and `spike` as named observability exemptions (no `00-state.md`, no events file by design); `translate` noted as non-exempt (now fully instrumented).
- `agents/ref-direct-modes.md`: added observability-exemption notice to Diagram mode header; added events-file init step (Step 1.3) to Translate flow so its workspace produces a trace alongside the existing state file.
- `agents/ref-special-flows.md`: added observability-exemption notice to Spike flow header.
- `skills/pipelines/SKILL.md`: added "Workspace folders without 00-state.md" section — diagram/spike workspaces are reported as `untracked (diagram/spike)` rather than silently omitted.
- `skills/recover/SKILL.md`: Mode 1 now distinguishes "folder exists, no state file" (diagram/spike — no recovery needed) from "folder absent" (unknown feature) before falling through to generic guidance.
