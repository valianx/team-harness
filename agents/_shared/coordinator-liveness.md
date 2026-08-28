# Coordinator liveness
<!-- Single source of truth for Main's wait, SLA, probe, interruption,
     continuation, and replacement decisions. Phase contracts point here and
     retain only their phase-specific rotation or evidence rules. -->

## Wait, SLA, and recovery

A `wait_agent` timeout is only a heartbeat that returns control to Main. It
proves neither failure nor terminal state and never stops the specialist.
Resume the directed wait without recap, fresh analysis, interruption, or a
replacement. Use `list_agents` only for live operator status, an actual phase
SLA timeout, or recovery; ordinary heartbeats run no more often than every 60
seconds.

Track the role SLA from dispatch independently of wait timeouts. Project
`## Pipeline Timeouts` may override these defaults:

| Phase | Agent | SLA |
|---|---|---|
| design | architect | 10 min |
| implementation | implementer | 15 min |
| implementation | tester | 10 min |
| implementation | cleaner | 5 min |
| validation | tester | 10 min |
| validation | qa | 5 min |
| validation | security | 10 min |
| delivery | delivery | 5 min |

The architect keeps its operator-owned timeout: at SLA, record and report it,
then keep waiting unless the live operator cancels. For every later role,
evaluate the exact attempt with the packaged
`scripts/specialist-liveness.mjs`; it is the only silence-to-action classifier.

1. At the first SLA exceed, record `agent.sla`, send one token-bound
   `TH-LIVENESS-PROBE`, and grant the helper's fixed two-minute ACK grace.
   Native send acceptance is `probe_delivery_state: unconfirmed` unless an
   explicit delivery/read receipt proves `confirmed`; a matching
   `TH-LIVENESS-ACK` itself proves delivery and renews the lease exactly once.
2. When the helper returns `interrupt`, interrupt and confirm termination
   before auditing only capsule-declared owned and evidence paths. Never start
   a concurrent writer or inspect arbitrary partial artifacts.
3. If delivery was unconfirmed and the audit finds declared progress, send one
   `TH-LIVENESS-RESUME` to the same thread and token with the unchanged
   dispatch/authority. Confirmed-delivery progress, a second continuation,
   operator cancellation, or other progress interruption blocks as the
   helper directs, including `specialist-interrupted-with-progress`.
4. A clean first interruption permits one fresh same-role replacement with
   `fork_turns: none`; a clean second interruption is
   `specialist-retry-exhausted`. Main never performs the specialist role as a
   local fallback.

Persist the helper decision and delivery state in `agent.sla.extra`, then the
interruption cause, continuation count, and declared-path audit in
`agent.close.extra` before resume, replacement, or block. Recovery reconstructs
those durable values and never restarts an expired lease. Attempt start and
mechanical dispatch-reference repair are owned separately by
`agents/_shared/dispatch-contract.md` § "Pipeline specialist reference".
