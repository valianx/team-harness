# Implementation assembly (v5)

Main derives a capability lease from the current dependency-ready coherent
OpenSpec batch. It may combine compatible same-owner tasks in one worktree.
Each writing lease binds the clean Git `HEAD` that existed immediately
before dispatch. Independent readers may overlap; committing ownership of a
canonical worktree never overlaps. An implementer owns production paths and
ordinary tests; a separate tester owns only risk-required independent evidence;
a cleaner receives only the non-empty deterministic safe hygiene allowlist.
Main accepts a result only when the actual baseline-to-HEAD
diff, dirty paths, and contiguous commit list exactly match its reported paths
and remain inside the lease. It integrates accepted results after their control
events commit.

Pre-implementation runs prerequisites only. There is no universal per-task RED
or complete suite. Complete quality is bound to the immutable candidate
identity and runs once at Freeze, then only after that identity changes.
