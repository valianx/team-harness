# Coordinator liveness facts (v5)

Liveness reports only delivery, acknowledgement, terminality, declared progress,
and interruption cause for an identity-bound lease/session. Main collects those
facts from the native status query and the control log; liveness never chooses a
wait, interruption, continuation, replacement, correction, or terminal route.

Wait timeouts and project SLAs are operator-visible telemetry. Main may use a
bounded native status query to collect facts, but elapsed time and observation
counts do not grant authority. Every non-success goes to the causal recovery
contract after safe ownership and preserved progress are established.
