## Context

See [proposal.md](proposal.md). The spec text lags the code in two directions: it still names retired multi-repository artifacts, and it omits behavior the code already has (the administrative close). Two identity rules are stated in prose only and have no helper behind them.

## Decisions

### 1. Identity covers paths, not only bytes

`openspecContentIdentity({ change_root })` walks the change directory, sorts relative POSIX paths, and hashes the sequence of `path\0bytes` pairs; `tasks.md` is hashed with every `- [ ]`/`- [x]` marker normalized to `- [ ]`. Hashing bytes alone was rejected because renaming or adding a spec file would preserve the identity.

### 2. Checkbox transitions are classified, not trusted

`taskProgressDelta({ pinned, current })` compares the two `tasks.md` texts. It returns `none`, `progress` (only pending-to-complete on coordinates present in the pinned text), `regression` (any complete-to-pending), or `structural` (any other difference). The requirement maps `progress` to continue, `regression` to the recorded re-lease already specified, and `structural` to pause. A pure text comparison was rejected because it cannot tell an authorized tick from an added task line.

### 3. Multi-repository wording keeps the shape, drops the artifacts

The two multi-repository requirements keep their scenarios and ordering guarantees; the binding collection, snapshot, overlay hash, and aggregate hash are replaced by one recorded content identity per writable service plus the ordered service list in the Gate-1 event. No helper is added for multi-repository runs; the identity function is per change root and is called once per service.

### 4. Archive vehicle

The archive requirement keeps confirmed merge and the Y/n offer as preconditions and states the vehicle as any ordinary branch-and-pull-request that is not the archived change's own pull request. The completed one-time backfill requirement is removed rather than kept as history.

## Risks

- A repository that pins an identity computed before this change compares against a different formula. Mitigation: no persisted pipeline is active on the tree; the migration note in `docs/pipeline-v5-migration.md` states the formula change.
