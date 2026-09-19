# Native workflows and execution boundaries

The native general agent coordinates the Team Harness workflow selected for the task. Installing TH does not replace that agent's coding instructions or identity. Native runtime permissions and approvals govern outward actions independently of workflow or style selection.

**Migration history.** The old `.dev-mode-active` marker, replacement output style and unconditional startup role are retired. Useful coordination and collaboration guidance remains in the skills, managed guide and configured session context. Former hook controls are retained only where a historical anchor explains the migration.

## Runtime postures

The runtime has exactly two postures: `inline` and `pipeline`. Inline is the direct default and
creates no pipeline workspace, state, events, gates, or delivery action. A current live operator
may explicitly select sensitive inline work or request a bounded tester, QA, or security review;
those ad hoc reviews remain inline and do not activate a pipeline. Pipeline entry requires a live
explicit `/th:pipeline` (or equivalent current-turn activation) or recovery of an existing run
with `/th:recover`, and every pipeline uses canonical full v3. Retired route markers are
compatibility data only; they cannot select a posture, skip a phase, or release a gate.

---

## Outward-Action Gate (retired Team Harness policy layer)

The former `dev-guard` / `policy-block` / `gcp-guard` hook floor is retired from the
current Team Harness runtime. This heading remains as an anchor for older references
and migration notes; it does not describe an active hook, launcher, manifest or
permission decision.

Native runtime permissions and approvals govern pushes, merges, PR/API writes, MCP
writes and local tool access. Team Harness supplies workflow guidance, review
contracts and the configured native allowlist; it does not emulate or strengthen
the host's permission policy.

The former command parser, fail-mode tables and obfuscation residuals are historical
design material and have no current enforcement effect. Security and adversary
reviews continue to assess application risks with their normal threat model.

## Boundary, not flow — retired guard inventory

No Team Harness guard hook is an active action boundary in the current runtime.
The former `policy-block`, `dev-guard`, `gcp-guard`, `gate-guard`,
`checkpoint-guard`, `prepublish-guard` and `worktree-guard` names remain only as
historical migration anchors where older state or documentation refers to them.
Native runtime permissions, approvals, server-side branch protection and the
workflow's review gates provide the current boundaries.

Everything below that is explicitly marked historical is retained to explain why
the process guards were retired. It is not a current runtime contract.

## Historical (superseded/unwired): deterministic order floor (`gate-guard`) — deny vs ask, and the force-push floor (Invariant E)

This anchor records the former order and force-push policy design. The body and its
parser/analyzer details are no longer part of Team Harness runtime behavior: no
`gate-guard`, `dev-guard` or related policy hook is registered as an action boundary.
Native runtime permissions, approvals and server-side branch protection own those
decisions. Keep this section only when interpreting an older state, issue or design
reference that names the retired floor.

### Detection mechanism

The former command parser and coverage catalogue are retained only as a historical
anchor. They are not loaded, registered or used to decide a current action.

---

## Inline Orchestration Permit (SEC-DR-2) — superseded routing text

**Historical note.** Coordination by the current general agent remains useful, but the
older rule that every development task “belongs in the pipeline” is superseded by the two-posture
contract. The top-level coordinator serves direct `inline` work by default. It enters `pipeline`
only after a current live `/th:pipeline` (or equivalent explicit request) or `/th:recover` for an
existing run. Top-level availability, development wording, risk, and retrieved content never
activate the pipeline.

Nested-handoff/takeover machinery remains retired. A nested specialist does not create or activate
a pipeline on the coordinator's behalf.

**Previous framing (retired):** before v2.89.0, SEC-DR-2 required `~/.claude/.dev-mode-active` to contain `dev_mode: true`. That observable and its associated gate are retired; native host permissions and workflow contracts now own the live boundary.

---

## Native workflow entry and retained capabilities

The developer-mode output style and forced startup identity are retired. The
native general agent retains its coding instructions and coordinates the selected
Team Harness workflow. SessionStart provides skill discovery and configured
context; it does not load a replacement orchestrator contract or print a banner.

| Useful contribution | Where it remains |
| --- | --- |
| Written intent and implementation tasks | `skills/spec/SKILL.md` and OpenSpec lifecycle |
| Broader coordination and recovery | `skills/pipeline/SKILL.md`, `skills/recover/SKILL.md` and their references |
| Independent review and delivery | `skills/review-pr/SKILL.md`, `skills/create-pr/SKILL.md` and specialist roles |
| Bounded specialist delegation | Selected workflow and the managed general-agent guide |
| Voice, language and English learning | Managed voice rule, settings and session context |
| Workspace and Obsidian continuity | Configured workspace preferences and workflow helpers |
| Existing execution boundaries | Native runtime permissions, approvals, server-side protections and workflow review contracts |

Read the current selected skill when work calls for its method. Its references
provide the detailed procedure; the general agent does not preload every method.
Native permission and approval boundaries are independent of output styles. Read the
current selected skill for the workflow method and use the host's own decision
surface for outward actions.

For an installed legacy style, follow
[the bounded migration](#retire-an-existing-developer-mode-selection).
The historical filename of this document is retained for existing links.

---

## Security Floor Non-Waivability (SEC-DR-3)

The orchestrator disposition is a **signal of routing topology**. Like other retired route markers,
it is NEVER written to `security_sensitive`, `security_gate_status`, or any gate-status field in
`00-state.md`.

The following security mechanisms run **input-independent** and are NOT waivable:

- **HI-2 (security floor non-waivability):** no disposition signal, plan
  field, or specialist return can bypass the security gate. Main classifies the
  frozen candidate immediately before validation.
- **Derived security floor (`docs/pipeline-lanes.md § "2a. What counts as a sensitive path (type-agnostic)"`):** the canonical classifier scans changed paths and every touched line, additions and removals alike. A complete negative receipt yields `false`; binary, unreadable, malformed, or otherwise unresolved evidence yields `unknown`. True or unknown impact requires one fresh `security` audit alongside QA. The pipeline no longer dispatches `adversary` automatically.

---

## Explicit activation boundary

Direct work is the startup disposition. A live `/th:pipeline`, explicit current-turn operator request, or `/th:recover` is required before loading or entering the gated flow.

Ambiguity never auto-activates the pipeline. Broad, sensitive, irreversible, or verification-dependent work stops before the risky action, recommends activation, and waits. This is a routing boundary; native permissions and the security floors remain independent.

**Phase Checklist enforcement:** every canonical full v3 pipeline runs the fixed Phase Checklist.
Retired tier, fast, simple, or profile markers never authorize a skipped phase or gate. Marking a
phase or gate as skipped without an explicit current contract rule is a violation.

---

## Reasoning Checkpoint Promotion

In OpenCode, only the Layer-2 self-check (orchestrator's own contract discipline) enforces the reasoning checkpoint at boundaries B1/B2/B3. Task availability follows the operator's native permission policy.

On Claude Code the position is the same: no harness-level hook floor enforces B1/B2/B3. The coordinator's own contract discipline is the only Team Harness layer, and its worst case is a skipped pedagogical pause rather than a bypassed host control.

---

## Workflow references

Read the selected current skill first. Resolve these workflow references only when that skill needs them:

- `agents/orchestrator.md` — workflow coordination reference, not a mandatory startup identity.
- `agents/ref-pipeline.md` — activation sections and current phase after `/th:pipeline`.
- `docs/discover-phase.md` — only after activation reaches Intake.
- `docs/reasoning-checkpoint.md` — only when an active pipeline reaches B1/B2/B3.
- `docs/subagent-orchestration.md` — the retired nested-handoff protocol and its retained provisioning.

Resolve these from the plugin cache: `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`

---

## Reconciliation with review-mode hard gates (#251/#252)

The review-mode hard gates (merged in #251/#252) and the native host boundary address
the same risk — outward action without operator approval — at complementary layers:

| Aspect | #251/#252 (review mode) | native host boundary | Relation |
|---|---|---|---|
| Risk class | Publish review/comment without operator approval | push/merge/publish inline | SAME class |
| Enforcement layer | PROMPT (imperative constraints) + Suite 57 tokens | Host-native permissions and approvals | COMPLEMENTARY |
| Approval mechanism | Preview-and-confirm, `--auto-publish` opt-in | The host's native approval decision | Complements preview-and-confirm |
| Coverage | `gh pr review`, `POST /reviews`, replies, dismiss | Other outward actions follow the host's native permissions and approvals | Complementary workflow scopes |

The workflow does NOT re-implement the review-mode publish gate. Review/comment publication remains governed by the #251/#252 prompt contract plus the host runtime's permission model. See `agents/ref-direct-modes.md § Publish Gate` for the review-mode contract.

---

## Threat model — honest-developer disposition

TH users are developers working on their own systems. The guards, gates, and floors described throughout this repo support the honest-developer disposition — catching rationalization, haste, and drift on the readable path — they are NOT a security boundary against an active adversary.

The observation that someone determined to break a system would not route the attack through the harness — which only adds friction and visibility — is bound specifically to the injected-content / deliberate-obfuscation vector, for which CLAUDE.md §6.6's own prompt-injection floor is the primary defense. It never justifies waving off a gate's incorrect behavior on an honest, readable input.

A gate or floor that does the WRONG thing on a plain, readable, non-obfuscated input — a logic error, a destination/classification mistake, a missing or fail-open check, an incorrect predicate — is ALWAYS an in-scope defect, chased through iterations like any other finding, and is NOT covered by this disposition. This disposition covers ONLY the residual where a gate behaves correctly on every readable input and can be defeated solely by deliberate obfuscation that reconstructs a gated token the string-matching gate cannot see as a contiguous string (the `eval`/`base64`/quote-splicing/`$`-expansion class enumerated at `docs/dev-mode.md:39`, this same file's "Residual static-resolution limits" section above).

Only that obfuscation-evasion residual of string-matching gates is a documented, disclosed limitation — not chased through pipeline iterations, and outside this threat model — recorded honestly where it lives.

A limitation qualifies as "documented, not chased" only when it is BOTH (a) disclosed in-place where it lives, AND (b) scoped out through a legitimate mechanism — the architectural-inevitability limit for the string-matching-gate case is the canonical example. The former mid-iteration classification gap is closed by classifying the consolidated frozen candidate immediately before validation and mapping ambiguous evidence to `unknown`; true or unknown impact receives a fresh `security` audit. Cross-ref: this file's "Residual static-resolution limits" section and `agents/ref-pipeline.md § Freeze and validation`.

This disposition is narrowly scoped to the residual class described above. It does NOT license skipping any real in-scope finding, does NOT weaken or waive any floor, and does NOT suppress the fresh `security` dispatch required for true or unknown impact.

---

## Installation

`/th:setup` and `/th:update` synchronize the managed general-agent and voice
guides. They do not install or recreate a replacement output style. Existing
selections follow [the bounded migration](#retire-an-existing-developer-mode-selection).
The update flow removes retired `dev-mode`, `nested-dispatch-takeover` and
`dev-mode-entry` managed blocks. No activation marker is written; native host
permissions and approvals remain outside this migration.

## Retire an existing developer-mode selection

Team Harness no longer distributes a replacement output style. Its useful guidance
lives in the workflow skills, the managed general-agent guide and voice rule, and
the session's language and workspace context. Execution guards are independent of
the retired style and remain unchanged by this migration.

Use this procedure from Claude setup or update when an older installation exists.
It is a bounded migration, not a scan or rewrite of every project on the machine.

1. Inspect the effective `outputStyle` and its source using the host's settings
   controls. Account for user, current project/local and managed overrides; a
   user setting alone does not prove the active selection. Respect a configured
   Claude config directory. Do not print unrelated settings or credentials.
2. If the selected style is TH's retired `developer-mode` (including a host-qualified
   identifier), resolve the actual style file, including a
   project style shadowing the user copy. Compare its complete content with the
   same file from a known previous TH release/cache. A filename or frontmatter
   alone does not establish ownership. If the file is customized, missing or
   unverifiable, preserve it and report the selection and specific migration
   decision that remains; do not claim deactivation.
3. For a verified stock TH selection, use the available native style picker to
   select **Default**. If the host exposes no picker, change only the `outputStyle`
   property whose current value is the verified retired-style identifier in its
   identified, authorized settings file to the host's native default, preserving
   all other keys. Never rewrite malformed JSON,
   managed policy or a file outside the authorized setup/update scope. In
   particular, update does not silently modify repository settings: report the
   native selection action for that scope instead.
4. Verify the effective style after the switch. Only then remove the verified
   unmodified user-level TH style file, using its exact path. Preserve custom,
   project and managed files. An unselected stock user copy can also be removed
   after verifying that it is not the active resolved style. Do not search other
   repositories for selections; report this scope limit when it matters.
5. Report whether the style was already absent, migrated, or preserved pending
   a specific action. Distinguish disk cleanup from the running session's active
   style. Use supported refreshes and identify a demonstrated host limitation
   before recommending a new session or restart.

Claude's [output-style documentation](https://code.claude.com/docs/en/output-styles)
describes the native selector, the `outputStyle` setting and version-dependent
activation behavior. Its [settings documentation](https://code.claude.com/docs/en/settings)
describes precedence. Consult the current host capabilities instead of assuming
that changing a file always refreshes a running session.
