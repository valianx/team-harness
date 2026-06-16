### Added

- `/th:apply-review <PR>` direct mode: explicit, on-demand entry point into the orchestrator's author-side apply-review handling — pulls PR comments (gh / gh-fallback) and applies the conservative `apply-review-disposition.md` to each comment, identical to the automatic lifecycle-bound path. Complement to, not a replacement of, the automatic trigger.
