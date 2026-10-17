## Context

See proposal.md for motivation and specs/pi-native-runtime/spec.md for behavior. The base is 0bc2d4d8 after Spaces. Pi 1.3.0 exposes native packages, extension hooks/tools, persisted sessions, public RPC and final tool-result usage. Its public RpcClient hardcodes a Node launcher and does not expose all exit/UI-response handling needed here. An isolated installed 1.3.0 baseline already answered public state/command requests without prompts or model calls.

## Goals / Non-Goals

Use the same canonical TH inputs and bound workspace with Pi-native execution. Keep changes to existing runtimes limited to necessary shared selector/projection integration. The non-goals in proposal.md remain unchanged; no unrelated audits or compatibility repairs join this PR.

## Decisions

1. **Native package and generated inputs.** Add an explicit root Pi manifest. Extend the skill projector through a distinct Pi adapter, preserving existing outputs. Generate a worker catalog and prompts from eligible canonical roles; ship canonical references as inert package resources. Reference documents and orchestrator are never workers. A skills-only package would omit the specialist contract.
2. **One bounded public transport.** Implement a small JSONL adapter around public Pi entrypoints, rather than importing private client fields, copying the SDK client or sharing in-process worker authority. Node descriptors resolve the public rpc-entry export; compiled descriptors execute their explicit binary. Invalid/ambiguous descriptors remain unavailable. Use LF-only frames, request IDs, drained streams, backpressure, bounded buffers/deadlines and owned-process cleanup.
3. **Native conversations and state machine.** One active operation per worker; bound pool and follow-up queues. Subscribe before prompt acknowledgement, distinguish handled/started/queued and consume settled plus final error evidence. Keep native session files/IDs, parent owner and cwd; parent-native entries retain only TH references/receipts. Reload replaces contexts safely; uncertain execution is interrupted and never replayed automatically. Cancellation clears native/TH queues before abort and bounded cleanup.
4. **Role authority and accounting.** Disable automatic extensions, MCP and context resources in workers. Select canonical role tools and explicitly required provider resources, then verify active native capabilities. Inherit the primary native model/thinking unless a verified Pi mapping exists. Collect native durable usage once through public final tool results; deduplicate against persisted parent receipts and preserve missing/partial telemetry. No working-directory confinement or billing claim is inferred.
5. **Pi-only preferences and lifecycle.** Add a small native settings module/CLI rather than widening the Codex installation helper or spoofing CODEX_HOME. Resolve PI_CODING_AGENT_DIR consistently, preserve opaque values and use shared document-only workspace selection. Setup/update/reload overrides use Pi ownership. Shared GitHub identity/preflight helpers gain only their Pi route. Space tools/authentication remain native capabilities, not a TH transport.
6. **Bounded proof and review.** Existing Node/Python runners cover transport, settings, projections and lifecycle failures. Native isolated package activation and public RPC checks prove actual discovery without real model requests; deterministic provider/process fixtures cover task behavior. TEA design/review/trace and OpenSpec verify consume the same scoped evidence. Final review covers this PR; corrections cover their delta and reuse valid previous results.

## Ownership and Interfaces

| Surface | Owner and contract |
| --- | --- |
| Pi projector/generator, catalog/prompts and tests | C; generation commands remain Main-owned |
| Pi extension, worker transport/session/usage and tests | E; consume generated catalog and read-only settings API |
| Pi settings, lifecycle overrides, narrow shared runtime routes and tests | D; no changes to existing host installers |
| Spec, integration, docs/release/CI, native evidence and delivery | Main |

The catalog lives at runtime/pi/agents.json with schema_version, runtime, version and an agents array. Each entry declares name, description, canonical source, prompt file, canonical model/effort metadata and native tools/read_only. Prompts live under installer-assets/pi-agents; references retain canonical paths. The orchestrator is coordinator-only and excluded from the agents array.

runtime/pi/settings.mjs exports resolveAgentDir, readSettings and the validated atomic settings operations; extension callers pass Pi's native resolved root. Its CLI provides show, ensure and set with repeated --set KEY=JSON/--remove KEY. Outputs omit secrets. Pi lifecycle overrides live under runtime/pi/skill-overrides and generated skill directories retain canonical names while frontmatter names use th- prefixes.

The explicit extension has a minimal worker-only capability bridge using public getActiveTools/getAllTools/setActiveTools. It registers no TH coordinator in workers. Public get_state/get_commands alone cannot attest active tools. Host SDKs remain peer dependencies; no root module-type change or physical SDK copy is introduced.

## Risks / Trade-offs

- Native process authority is broader than an OS sandbox -> keep capability claims precise, disable implicit resources and validate role tool selection.
- Crash/acknowledgement ambiguity and detached native tools -> retain interrupted/partial evidence, bound owned-process cleanup and never promise orphan-free termination.
- Parent receipt persistence can lag result delivery -> deduplicate from actual native entries and do not advance durable accounting merely because collection began.
- Compiled launches or provider extensions may lack local activation evidence -> use explicit descriptors and report tested platforms/capability gaps rather than guessing.
- Space capability may be absent in Pi -> preserve the binding and unavailable operation; Main's Codex Space access does not prove Pi access.

## Migration Plan

Documentation budget: extended — the new public runtime needs selected-root provider entrypoints; max 50 added lines in upstream-tools.md. The new operator guide remains within 80 total lines; existing entrypoint edits stay concise.

Ship an additive native package in 3.49.0, synchronize existing release sites plus the new package manifest, and document the native Git/local package route. Verification uses isolated roots and consumer fixtures. Pi removes or disables its own TH package for rollback; existing host preferences and installations are untouched.
