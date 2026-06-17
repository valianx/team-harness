### Changed

- Worktree start-gate re-keyed off `origin/main` position: branch-in-place permitted only when the tree is clean AND at/behind `origin/main`; worktree required when there are uncommitted changes OR the tree is ahead of `origin/main` (closes the "clean-but-ahead" gap that could bundle unrelated local commits into a feature PR; issue #352).
