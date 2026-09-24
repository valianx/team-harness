## Context

See proposal.md. Python 3.13 translates directory mode 0700 into a protected Windows DACL. The coordinator can create a snapshot which a restricted reviewer process cannot read.

## Goals / Non-Goals

Use normal filesystem creation permissions without adding a TH permission manager. Preserve operator-managed permissions and the existing review lifecycle.

## Decisions

Remove the three explicit directory modes on every platform. Windows inherits its parent ACL; POSIX honors the process umask. A Windows-only exception would retain an unnecessary TH directory policy elsewhere. Do not replace this with broad ACL grants or a new runtime-specific access list.

Existing directories are not rewritten automatically: their ACLs may be operator-managed. Snapshot guidance explains that updating the helper does not repair old ACLs, uses scoped native recovery, and checks readability before resuming reviewers. Hashes, unique runs, ownership markers and cleanup remain workflow integrity mechanisms.

## Risks / Trade-offs

- Existing owner-only directories remain restricted until scoped recovery; document the distinction from new captures.
- Unit tests cannot prove every host's sandbox setup; test Windows ACL inheritance and separately record the available restricted-reader smoke evidence.

## Migration Plan

Ship regenerated runtime copies with the shared patch version. No automatic ACL migration. For an affected existing workspace, use the native host's scoped read-access mechanism or an explicitly authorized repair. Rollback is a code revert; do not retroactively rewrite folder permissions.
