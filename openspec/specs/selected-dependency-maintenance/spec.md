# Selected dependency maintenance

## Purpose
Keep dependencies used by selected TH integrations current without maintaining
unrelated software or installing every optional provider.

## Requirements

### Requirement: Selection-bound maintenance
TH update SHALL install missing or update existing dependencies selected for the
active project/host. It SHALL establish selection, owner, manager, scope, path
and version policy before mutation. PATH presence alone SHALL NOT select a tool.

#### Scenario: Optional catalog entry
An unselected provider remains untouched, even when its executable is on PATH.

#### Scenario: Selected missing dependency
The official supported installation is prepared within the authorized scope.
Missing prerequisite runtimes are reported, not installed implicitly.

### Requirement: Preserve ownership and pins
Maintenance SHALL preserve explicit pins, unrelated installations, manifests,
application lockfiles and runtime configuration. Provider-owned installer locks
may change through the selected official lifecycle. Shared/global mutations require scope that
expressly includes them. Official on-demand CLI routes may prepare exact versions
without global installs and SHALL be reported as such.

### Requirement: Independent outcomes
Each dependency SHALL have a receipt identifying selection, owner, scope,
manager, path, before/target/after versions, status, verification and failure.
One failure SHALL NOT halt unrelated authorized work. Uncertain results SHALL be
verified before retry; permission denial SHALL NOT be bypassed.

#### Scenario: Partial maintenance
One dependency fails while another succeeds. Both outcomes are reported and TH
installation/convergence evidence remains separate from dependency evidence.

#### Scenario: Google CLI verification
Modern Web Guidance runs with telemetry disabled and synthetic probe inputs;
its optional upstream skill and automatic updater are not installed implicitly.
