## Why

TH needs a way to study existing applications and turn observed behavior and architecture into useful development ideas. REA already supplies maintained analysis methods and standard Evidence, so TH can consume that dependency and adapt its results to the operator's project.

## What Changes

- Add `research-app`, coordinated by the native general agent, for an explicit application, research question and destination-project context.
- Use the official REA skill and public MCP/CLI capabilities, with scoped dependency preparation and native permissions. Let REA determine applicable technology and analysis methods.
- Retain original Evidence and its provenance, limitations and portable artifacts in the selected TH workspace. Produce a concise interpretation with project opportunities and inputs to `design` or `spec`.
- Document REA's owner, invocation and lifecycle in the shared integration reference; expose explicit `setup rea` and `update rea` routes for supported hosts.
- Make the new entry discoverable in canonical catalogs and generated runtime distributions.

## Capabilities

### New Capabilities

- `application-research`: Application research through the REA dependency, preservation of upstream Evidence and adaptation into project ideas.

### Modified Capabilities

- `native-workflow-entry`: Make `research-app` discoverable and coordinated by the current general agent.
- `external-verification-workflows`: Extend the shared provider-ownership and integration-reference contract to REA without selecting it for verification or quality diagnosis.

## Non-Goals

- Reimplementing or packaging REA analyzers, schemas, catalogs, checklists, skills or provider internals.
- Restricting the mode to JavaScript, choosing a first supported technology, or promising coverage beyond the installed dependency.
- Adding REA preparation, invocation or result consumption to `audit`, `find-bugs`, `review-pr`, or ordinary spec/pipeline entry.
- Automatically implementing extracted ideas, installing inactive hosts, or introducing a TH result schema, SDK import, scanner or enforcement layer.

## Impact

Canonical skill, shared integration guidance, explicit setup/update routes, public catalogs, generated Codex/OpenCode skills and living specs. REA remains an external upstream dependency (`rea-agents`, with public `rea` MCP/CLI entry points); TH does not add it to a consumer project's manifest. No agent-role, database or frontend changes are planned. Distribution and installer checks apply; live result handoff requires a selected controlled target and actual provider availability.

The coordinated PR also delivers independently selected direct-mode improvements through `improve-direct-diagnosis`. Those workflows remain independent of REA.
