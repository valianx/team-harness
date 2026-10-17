# pi-native-runtime Specification

## Purpose
Provide Team Harness workflows and bounded specialist coordination through Pi's native package, extension, session and RPC interfaces while preserving existing workspace and delivery authority.

## Requirements

### Requirement: Pi owns package installation and maintenance
TH SHALL ship a native Pi package compatible with Pi 1.3.0 and its supported Node runtime. Pi SHALL own installation, update, reload and removal. Package resources SHALL be explicitly declared and SHALL NOT install another host's configuration or alter unrelated Pi packages, authentication or model selection.

#### Scenario: An operator installs and removes TH in Pi
- **WHEN** the native package owner installs or removes TH in an isolated selected scope
- **THEN** TH resources become discoverable or are unregistered through Pi while unrelated configuration remains preserved

#### Scenario: An operator updates or reloads the package
- **WHEN** Pi performs its supported package maintenance
- **THEN** TH uses that owner and reports actual activation separately from file presence without running another runtime's installer

### Requirement: Pi discovers generated workflows and eligible roles
TH SHALL generate Pi workflow projections and its worker registry from canonical inputs. Skill names SHALL use the TH namespace, packaged relative resources SHALL resolve, and reference-only documents SHALL remain inert. Only eligible specialist roles SHALL be dispatchable; the current primary Pi session SHALL remain the coordinator. Canonical model metadata SHALL be preserved without treating another host's aliases as Pi model identifiers.

#### Scenario: Pi loads the generated distribution
- **WHEN** Pi loads the declared package resources
- **THEN** canonical workflows are discoverable under their Pi names and their required resources are available without a Claude, Codex or OpenCode installation

#### Scenario: A caller selects a reference or coordinator as a worker
- **WHEN** dispatch names a document outside the eligible role registry
- **THEN** TH rejects it before launching a process

#### Scenario: A worker needs a model
- **WHEN** no verified Pi-specific mapping was selected
- **THEN** it inherits the active native model and thinking selection without changing the primary session or inventing a mapping

### Requirement: Pi preferences preserve workspace continuity
TH SHALL store its preferences only in the selected Pi agent directory's .team-harness.json. Reads SHALL be non-mutating; writes SHALL preserve unrelated values and validate the complete requested preference change before atomic publication. The existing local, Obsidian and gpt-space contracts, legacy selection and bound-effort precedence SHALL apply. Missing native Space capability SHALL preserve the locator and report unavailable without another context home or credential store.

#### Scenario: Setup or maintenance encounters existing preferences
- **WHEN** Pi setup explicitly changes preferences or maintenance ensures defaults
- **THEN** explicit valid changes are applied atomically and maintenance preserves existing selectors, conflicts and unrelated opaque values

#### Scenario: A custom Pi agent directory is selected
- **WHEN** the operator provides PI_CODING_AGENT_DIR
- **THEN** extension and helper reads/writes agree on that native root and leave the default and other hosts' roots untouched

#### Scenario: A retained Space is unavailable in Pi
- **WHEN** the configured Space operation has no actual native capability
- **THEN** TH reports its precise unavailable operation, retains the same binding and creates no local substitute

### Requirement: Worker transport uses public bounded RPC
Workers SHALL use public Pi RPC through a validated absolute launcher, literal arguments and no shell. Supported Node and compiled-binary launch descriptors SHALL be distinct. Startup/version and state checks, request correlation, LF framing, stream draining, frame/diagnostic limits, timeouts and unsupported UI responses SHALL remain bounded. Ambiguous or invalid launchers SHALL fail before accepting work.

#### Scenario: A valid launcher contains spaces or Unicode
- **WHEN** TH starts a worker with that explicit launcher
- **THEN** literal executable and argument boundaries are preserved and a successful public handshake precedes acceptance

#### Scenario: A child exits or emits invalid protocol data
- **WHEN** EOF, process exit, malformed or oversized data prevents a trustworthy response
- **THEN** pending operations terminate with bounded diagnostics and no false success

### Requirement: Specialist work has bounded observable coordination
TH SHALL bound worker concurrency and follow-up queues and allow one active operation per worker. Accepted, handled and queued prompt dispositions SHALL remain distinct from task completion. Completion SHALL consume native settling and final error/abort evidence. Status, follow-up, wait, collect and cancel operations SHALL expose the current state without transferring Main's scope, publication or context-writing authority.

#### Scenario: A prompt is handled without a model run
- **WHEN** Pi returns a handled disposition
- **THEN** TH reports that disposition without waiting indefinitely for an agent run that did not start

#### Scenario: Native retry or compaction follows an agent end
- **WHEN** an intermediate event arrives before native settling
- **THEN** TH waits for the final settled/error evidence instead of completing early

#### Scenario: A follow-up exceeds the queue or concurrency limit
- **WHEN** the corresponding configured bound is reached
- **THEN** TH rejects or reports the pending request explicitly without launching unbounded work

### Requirement: Worker continuity uses owned native sessions
TH SHALL retain native Pi session identifiers and absolute files associated with the owning primary session, role and working directory. Reload/rebind SHALL validate those associations and avoid stale contexts. Uncertain acceptance or crashes SHALL remain interrupted without automatic replay. Cancellation SHALL discard queued work before aborting; shutdown SHALL bound cleanup to owned processes and report incomplete cleanup honestly.

#### Scenario: The primary session reloads and rebinds a worker
- **WHEN** retained native session identity, owner and working directory agree
- **THEN** TH reuses that session through public interfaces without a second conversation format or stale extension context

#### Scenario: A retained session belongs to another owner or directory
- **WHEN** its verified associations differ
- **THEN** TH refuses reuse without guessing the latest session or silently creating a replacement conversation

#### Scenario: Cancellation or shutdown occurs with queued work
- **WHEN** Main cancels the worker or its extension context is replaced
- **THEN** queued work is cleared, abort and process cleanup are bounded, and uncertain tasks are not replayed

### Requirement: Native worker capabilities match their assigned role
TH SHALL select the native tool set for each registered role. Read-only workers SHALL exclude shell, edit/write tools and automatically discovered MCP/extensions; only explicitly selected provider resources SHALL be loaded. Workers SHALL NOT create nested TH coordinators. TH SHALL preserve the host's authority and disclose that working directories and tool selection do not establish an operating-system sandbox or orphan-free termination guarantee.

#### Scenario: A read-only specialist starts
- **WHEN** TH launches its native session
- **THEN** the selected active tool capabilities match the declared read contract and unrelated project resources are not automatically activated

#### Scenario: A provider resource is unavailable
- **WHEN** the selected native model requires an unavailable resource
- **THEN** TH reports that worker capability gap without changing models or enabling unrelated resources

### Requirement: Worker usage is attributed once with native evidence
TH SHALL retain available native input, output, cache-read and cache-write usage, reasoning subsets and estimation limits. Parent attribution SHALL use native final tool-result usage and persisted receipts, with cursor advancement based on confirmed collected evidence. Streaming totals SHALL NOT be summed repeatedly, append-only context entries SHALL NOT masquerade as native charges, and missing or uncollected usage SHALL remain explicit rather than zero or billed cost.

#### Scenario: A result is collected again after reload
- **WHEN** a persisted native parent receipt already accounts for that worker usage range
- **THEN** TH returns the useful result without attributing the same usage again

#### Scenario: A crash leaves uncollected or incomplete usage
- **WHEN** native accounting evidence is incomplete
- **THEN** TH reports the missing/partial range and does not fabricate totals or completion

### Requirement: Provider entrypoints use their actual Pi support
Pi workflow adapters and shared runtime selectors SHALL use each selected provider's supported Pi entrypoint and selected agent/project directories. TH SHALL preserve upstream ownership of OpenSpec, TEA/BMAD and Superpowers methods. Missing support or activation SHALL remain explicit; unrelated providers and other hosts' installations SHALL NOT be installed or repaired as prerequisites.

#### Scenario: A workflow prepares a supported provider for Pi
- **WHEN** that capability is selected in the active Pi context
- **THEN** preparation uses the verified native Pi route and reports installed, discoverable and usable states separately

#### Scenario: A custom root or missing capability prevents discovery
- **WHEN** provider output is not usable in the selected Pi scope
- **THEN** TH reports the specific gap and supported recovery without substituting another runtime's store
