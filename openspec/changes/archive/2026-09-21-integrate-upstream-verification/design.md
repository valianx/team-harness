## Context

TH currently calls OpenSpec 1.9 structural validation but does not invoke upstream
implementation verification or integrate Superpowers/TEA. The operator wants
upstream updates to remain available and implementation verification to always
run for completed OpenSpec work. TH must remain a workflow over the native agent.

Research and primary sources are retained in the configured workspace:
C:/Users/mario/obsidian/Work/work-logs/team-harness/2026-09-20_workflow-prose-audit/research/00-research.md.
Research references OpenSpec 1.13.1, Superpowers 6.4.1 and TEA 1.27.2; their joint
compatibility was the research starting point. Implementation probes retain
OpenSpec 1.9.0 and confirm BMAD 6.12.0 with TEA 1.27.2 and Superpowers 6.4.1.
Native installation/generation and model-backed execution are reported separately.

## Goals / Non-Goals

Goals: use maintained upstream capabilities; require OpenSpec implementation
verification; support Claude Code, Codex and OpenCode; reuse the selected workspace,
tests and review context; make actual limitations visible.

Non-goals: another orchestrator, provider forks, blanket installation of all
workflows, new enforcement hooks or approval tokens, replacement of real tests,
a universal dependency framework, or a general repository cleanup.

## Decisions

### 1. Route to installed providers through existing workflows

The shared reference is [External tools](../../../../skills/spec/references/upstream-tools.md), linked from docs/upstream-tools.md. It
documents concrete capability triggers, placement in the existing workflow,
context transfer, results and upstream lifecycle links. This guide describes the
integration and ships with the skill so installed references resolve. Consumer skills link
to it instead of copying provider instructions or reproducing their algorithms.

Extend existing spec/validate/test/create-pr and setup/update guidance at the
points that need each capability. Centralize shared provider discovery and usage
guidance once, referenced by consumers. Prefer prose and existing native discovery;
add a small helper only for demonstrated repeated resolution needs.

Read the currently resolved provider instructions at invocation. Do not cache a
rewritten TH version of their method or infer the active version by selecting the
newest directory. Record only useful source/version, scope and outcome in the
existing workspace note; no required parallel receipt system.

Installation and updates remain upstream-owned. An explicit provider update
request supplies task authority; native permissions still apply. Updating TH does
not implicitly update every provider. Reuse healthy installations.

### 2. Execute upstream methods as spec advances

OpenSpec verify runs for each completed relevant change, independently of optional
TH author review. Project checks produce executable evidence; upstream verify
maps implementation to intent. Main judges findings and fixes real defects.

In spec, execute TEA test-design during design, test-review after implementation
and relevant tests, trace before completion, and Superpowers
verification-before-completion before declaring success. These named capabilities
are integrated stage work, not optional recommendations. Execute the current
upstream method and retain its actual result. A missing provider leaves that work
pending with its recovery action while independent work can continue.

A planning-only request reaches design, not implementation or completion. Do not
run future stages or fabricate their outputs. An executed upstream assessment
may establish that a question has no applicable tests; record the reason without
calling it a passing test run. A resumed stage reuses applicable completed work.
Each newly reached capability consumes prior evidence and executes its own method;
evidence reuse does not stand in for a capability that never ran.

Outside spec, Superpowers and TEA remain selected according to concrete task needs
or explicit requests; all entry points share the same invocation and workspace
methods. OpenSpec verify remains required for relevant completed changes.

An existing native specialist may execute the upstream skill as its method for
the selected question. Its report is the input TH consumes for that lens; do not
repeat the same analysis with a parallel TH implementation. Main shares context,
evaluates recommendations and chooses additional work only for unresolved needs.

### 3. Preserve native installation contracts and disclose limits

| Provider | Claude Code | Codex | OpenCode |
| --- | --- | --- | --- |
| OpenSpec | Generated opsx command/skill | Generated openspec-verify-change skill | Generated flat opsx-verify command |
| Superpowers | Official marketplace plugin; startup bootstrap | Official native plugin; 6.4.1 manifest has no hooks | Official Git plugin; startup bootstrap and documented install restart |
| TEA | BMAD-generated skill; optional supported runner | BMAD-generated skill; optional supported runner | BMAD-generated native pointer; no dedicated test-review CLI adapter documented |

These are researched entry points, not hardcoded future guarantees. First validate
exact installed versions and generation outputs in disposable fixtures.

Superpowers has no confirmed official one-skill installation or no-bootstrap
switch. Use selective invocation after official installation, not a fabricated
partial installer. Do not automatically select its SDD workflow, whose helper
uses a fixed .superpowers/sdd path. Report a concrete conflict rather than patching
the provider or silently promising compatibility.

TEA test-review does not require framework Create. Do not invoke that workflow
or register its hook for this integration. Inspect the exact package engine:
the published 1.27.2 package declares Node >=22.20.0 while CLI docs say 20+;
the implementation probe verified its metadata and installed files. Keep provider prerequisites
separate from TH's own floor. No TH-written OpenCode adapter.

### 4. Make verify available through upstream generation

Use the official profile selection and init/update mechanism to include verify.
Preserve existing workflow and runtime selections rather than replacing a user's
profile with a TH preset. Confirm the generated native entry actually exists and
can be invoked. The host entry is a skill/command, not an `openspec verify`
terminal subcommand.

Retain a tested version/range in the existing OpenSpec policy; choose a baseline
through contract tests, not by blindly upgrading to latest. The implementation
must reconcile current docs and adapters with that policy. Refresh upstream
instructions after CLI updates instead of preserving a stale private snapshot.

### 5. Verify before archive and preserve correction history

For spec, establish test design with TEA, implement and run relevant checks,
execute TEA test-review and trace, execute Superpowers completion verification,
then invoke OpenSpec implementation verification on the active change. Resolve
completion defects, prepare archive, strictly validate archive/living specs,
and assemble the selected review/delivery candidate.

A path-only archive does not invalidate implementation evidence. A behavioral or
code correction invalidates only affected evidence. Upstream verify currently
obtains active status/apply context; do not pass an archive path as if that were
supported. Create or amend durable specs only when requirements, scenarios or
intent change. Such an amendment can be verified and archived in the same PR.

For code-only corrections, first demonstrate a supported context that preserves
the archive and actual candidate identity. A disposable active context populated
from the exact archived sources is a candidate to evaluate, not a proven API or
a new durable spec. The 1.9.0 probe confirmed status, apply context and strict
validation against byte-identical archived artifacts in a temporary active context.
Use the corrected committed candidate in a disposable checkout, bind original
sources and content identity, and never reapply or archive that temporary copy.
If the installed version cannot consume this context, report the
concrete recovery needed and leave verification pending. Do not invent reopen,
silently move history, or manufacture another durable proposal just for verify.
The actual upstream verification report still requires execution on that context;
successful context resolution alone is not a completed verify.

Declining archive does not waive verify. Authorized review or delivery may
continue with accurately described pending work, but cannot be represented as
completed and verified while implementation verification is missing.

For previously archived work with no valid verify evidence, assess the relevant
intent and recover through a supported context; do not label old structural
validation as implementation verification. Cancelled proposals are retirement,
not completed implementation, and do not need a fictitious implementation check.

### 6. Keep one configured workspace and clean distribution boundaries

Pass the same existing absolute local/Obsidian workspace to every provider.
Retain working test designs, coverage analysis and verification/review reports
there as Markdown; when a provider returns only conversational output, Main saves
a faithful concise summary. Link results from the existing plan. Native JSON,
captures and operational formats may remain where needed, including temporary
storage for isolated runs. Do not invent a fixed folder tree or empty reports.

Use TEA output flags or documented configuration after verifying actual destination
resolution on the host, including Windows spaces. Local mode retains that local
home; Obsidian mode retains the effort folder in the configured vault without a
local mirror. Canonical OpenSpec artifacts, product code, maintained tests and
durable documentation stay in the owning repository, linked from workspace notes.
Preserve provider-owned installation metadata at its native path; that does not
establish a second task workspace.

If a required workflow cannot use the configured destination, report the
limitation and concrete recovery; its stage work remains pending rather than
silently skipped. Do not patch installed files, switch workspace mode or create
another plan.

Extend existing packaging ownership/exclusion tests for provider assets.
Specifically cover flat OpenCode opsx-*.md as well as the existing nested pattern.
Generate TH runtime copies from canonical inputs; do not hand-edit projections.

## Risks / Trade-offs

- Provider bootstrap can affect host behavior: document actual installation
  effects, select capabilities narrowly and surface concrete conflicts.
- Provider versions and paths change: test discovery/update against exact
  distributions and preserve a clear unsupported outcome.
- Mandatory verify depends on a runnable upstream workflow: report pending
  completion accurately while continuing independent work.
- Archive corrections need supported verification context: prove the recovery
  without silently rewriting history or adding specs merely to run verification.
- Native reload support varies: distinguish installed version from active
  capability and request restart only for an established limitation.

## Implementation and Validation

Documentation budget: extended — one packaged shared integration reference must
cover five provider capabilities, three host entry points and workspace/ownership
boundaries; max 220 lines. The OpenSpec integration guide replaces obsolete current
flow prose; max 110 lines. Provider methods remain upstream.

Start with disposable contract checks of installation/discovery, required workflow
generation, native invocation, output routing and updates. Cover all three hosts
with runnable tests where supported and clearly label static or unavailable host
evidence. Do not claim end-to-end coverage from file fixtures alone.

Then implement minimal routing/prose and packaging changes. Regressions cover:
healthy/missing/stale providers; preserved configuration; stage execution and
planning-only boundaries; required verify despite declined optional review;
execution failure versus an evidenced inapplicable assessment; archive relocation
and correction; no-OpenSpec work; actual retained outputs in both workspace modes,
path spaces and no local Obsidian mirror; provider ownership; real update
resolution; and no new hook/adapter or unrequested provider workflow.

Run focused repository suites and generated-copy freshness checks. Exercise the
upstream verify workflow on this implemented change, archive it with the code,
and obtain selected independent review before authorized publication.

## Compatibility evidence and limits

The probes establish OpenSpec 1.9.0, BMAD 6.12.0 with TEA 1.27.2 (Node >=22.20.0),
and the official Superpowers 6.4.1 source. OpenSpec generation/update preserves
existing native files; TEA runners accept local and Obsidian paths with spaces.
All three hosts' generated entries were inspected. Execution through this Codex
agent is reported separately from native plugin activation; Claude/OpenCode
session activation remains untested. Archive recovery uses the exact disposable
active context described above, with a fresh verification report for corrections.
