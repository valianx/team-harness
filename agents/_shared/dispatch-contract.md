# Specialist dispatch contract (v5)

## Pipeline specialist reference

Main dispatches one existing immutable work capsule containing exactly one
closed `capability_lease`. The lease binds its identity, logical role, live
authority event, approved intent/scope/security identities, canonical worktree,
writable paths, immutable input references, context identity, and lifecycle.

The prompt may point to the capsule and state the immediate objective. It must
not duplicate normative authority, scope, ownership, artifact hashes, roots, or
control-log cursor. A duplicate normative copy makes capsule certification fail.

One canonical worktree has at most one committing writer. Before issue,
continuation, transfer, revocation, or close, Main revalidates authority,
identities, immutable inputs, context, canonical paths, symlink containment, and
exclusive ownership. Same-agent continuation reuses the lease while all remain
unchanged and sends only delta evidence. An identity or ownership change revokes
or replaces it before another writer begins.

Specialists independently validate the lease, remain inside writable paths, and
cannot write coordinator workspace projections. Native sandbox and permission
policy remain an additional floor and are never weakened by a lease.
Each specialist returns one result envelope through native terminal transport;
Main validates and accepts it before projection.
