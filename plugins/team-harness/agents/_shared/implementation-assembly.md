# Implementation assembly (v5)

Main issues file-scoped capability leases from the approved OpenSpec execution
items. Each writing lease binds the clean Git `HEAD` that existed immediately
before dispatch. Independent readers may overlap; committing ownership of a
canonical worktree never overlaps. An implementer owns production paths, a
tester owns test paths, and a cleaner receives only the deterministic safe
hygiene allowlist. Main accepts a result only when the actual baseline-to-HEAD
diff, dirty paths, and contiguous commit list exactly match its reported paths
and remain inside the lease. It integrates accepted results after their control
events commit.

Pre-implementation runs prerequisites and each task's RED proof only. It does
not claim final quality. Complete quality is bound to the immutable candidate
identity and runs once at Freeze, then only after that identity changes.
