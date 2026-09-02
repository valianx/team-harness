### Changed

- OpenSpec specs describe only the v5 control plane: the multi-repository requirements record one content identity per writable service instead of bindings, snapshots, and overlay hashes; the administrative close of a workspace without a control log is a requirement; the content identity covers the sorted relative paths of the change; checkbox-only progress is limited to authorized pending-to-complete transitions.
- `control-plane.mjs` gains `openspecContentIdentity` and `taskProgressDelta` so both identity rules are executable.
- An already-merged OpenSpec change may archive inside the next pull request; the archive never rides the change's own pull request.

### Removed

- The completed one-time backfill requirement in `openspec-archive-lifecycle`.
