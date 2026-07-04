### Changed

- `/th:release` now continues past the release tag with a `Step 4 — Apply the release to local runtimes (post-tag)`: an immediate Claude Code leg (catalog refresh + `claude plugin update`) and a publication-gated opencode leg (bounded poll of the published `VERSION` asset, then the OS-appropriate `update-opencode.{sh,ps1}`), each with per-leg failure isolation and a single final per-runtime report. Both activations (`/reload-plugins`, opencode restart) remain operator-driven; the skill never states the new version is active.
