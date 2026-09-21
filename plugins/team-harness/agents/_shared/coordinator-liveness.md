# Coordinator liveness facts

Use native task status to observe delivery, progress, terminality and interruption.
Timeouts and missing messages alone do not prove work failed. Preserve completed
results and use a bounded status query when needed.

Before replacing a writer, confirm it stopped and preserve its changes. Diagnose
the concrete cause through the recovery guidance. TH requires no liveness lease,
control event or separate authorization handshake.
