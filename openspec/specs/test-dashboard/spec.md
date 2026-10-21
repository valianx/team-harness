# test-dashboard Specification

## Purpose
Provide a simple consumer-owned dashboard for functional API and frontend cases,
with documented batches, execution selection and per-case evidence.

## Requirements

### Requirement: Functional dashboards belong to consumer projects
TH SHALL offer `test-dashboard` to create or adapt a simple dashboard in a named
consumer project after development is ready for functional validation. It SHALL
reuse project context, stack and runners, group cases by functionality and service,
and support real API requests and existing frontend automation. Suite authoring
SHALL remain outside its default scope.

#### Scenario: An API and frontend feature is ready
- **WHEN** the operator requests a dashboard for Login and Registration
- **THEN** the workflow prepares a consumer-owned interface for the available API
  and frontend cases without requiring a new application test suite

### Requirement: Interface work reuses UI design
Creating or materially changing the dashboard interface SHALL invoke `ui-design`
under its existing product, preview and rendered-verification contracts. The
default interface SHALL prioritize a flow filter, readable case table, selection
and execution controls, text statuses and case details. Ordinary execution SHALL
reuse the established interface without restarting visual design.

#### Scenario: The dashboard is created
- **WHEN** interface implementation begins
- **THEN** the workflow uses the consumer's design context and a structural preview
  for a simple case-centered screen and verifies its actual rendered behavior

### Requirement: Batches have a documented portable contract
The skill SHALL include a versioned JSON batch guide and API, frontend and mixed
examples. Cases SHALL have stable identities, flow, service, type and optional
dependencies. API cases SHALL define HTTP requests and explicit expectations;
frontend cases SHALL identify existing tests through registered runner profiles.
The offline validator SHALL reject malformed shapes, duplicate identities,
unknown or cyclic dependencies and unsupported case payloads without executing
requests, commands or environment substitutions.

#### Scenario: A mixed batch is prepared
- **WHEN** an API readiness case precedes a frontend case
- **THEN** the guide explains their dependency and the validator accepts the valid
  document while rejecting unknown dependency IDs or a cycle

### Requirement: Submission preserves selection and actual evidence
The workflow SHALL define a consumer-side submission and result interface with
validated selected case IDs, dependency handling, environment and a unique run ID.
Trusted server-side configuration SHALL own service origins and runner commands.
Execution SHALL be bounded and return per-case results and sanitized evidence;
unexecuted, blocked, skipped or unavailable results SHALL NOT be counted as passed.

#### Scenario: The user selects a case whose prerequisite is absent
- **WHEN** the selection omits a required dependency
- **THEN** the dashboard identifies the prerequisite before execution and requires
  its inclusion rather than silently running an incomplete flow

#### Scenario: A runner exits successfully without collecting the selected test
- **WHEN** execution produces no matching per-case evidence
- **THEN** the dashboard reports the case as unverified rather than passed

### Requirement: Resources are distributed across supported runtimes
TH SHALL generate the skill and its linked resources for Codex, OpenCode and Pi
from canonical inputs while retaining the canonical Claude workflow. Discovery
and installation SHALL include the batch examples and validator without
requiring a checkout of Team Harness in a consumer project.

#### Scenario: A consumer installs the distributed skill
- **WHEN** the skill is invoked in a supported runtime
- **THEN** its UI design reference, batch guide, examples and validator resolve
  from the installed package
