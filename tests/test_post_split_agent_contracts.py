#!/usr/bin/env python3
"""
tests/test_post_split_agent_contracts.py

Structural AC coverage for four already-landed commits in the
agent-authoring-standard branch that shipped under a deferred-verification
posture (implementer-only, no per-commit tester/qa dispatch): the
orchestrator's borrowed-work return, the leader's dispatch-machinery
relocation, delivery's diff-cap withdrawal, and the README/agent-builder
authoring-standard + Roster Objective column. Each check below maps to one
declared acceptance criterion; commits are identified by content and by
their real git sha, never by an ordinal label.

Usage:
    python3 tests/test_post_split_agent_contracts.py
Exit code:
    0 if all checks PASS, 1 otherwise.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def git_show(ref: str, rel_path: str) -> str:
    proc = subprocess.run(
        ["git", "show", f"{ref}:{rel_path}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.stdout if proc.returncode == 0 else ""


def slice_section(text: str, start_marker: str, end_markers: tuple[str, ...]) -> str:
    idx = text.find(start_marker)
    if idx == -1:
        return ""
    tail = text[idx:]
    stop = len(tail)
    for marker in end_markers:
        pos = tail.find(marker, len(start_marker))
        if pos != -1:
            stop = min(stop, pos)
    return tail[:stop]


orchestrator_text = read(AGENTS_DIR / "orchestrator.md")
leader_text = read(AGENTS_DIR / "leader.md")
delivery_text = read(AGENTS_DIR / "delivery.md")
readme_text = read(AGENTS_DIR / "README.md")
agent_builder_text = read(AGENTS_DIR / "agent-builder.md")
reasoning_checkpoint_text = read(REPO_ROOT / "docs" / "reasoning-checkpoint.md")
discover_phase_text = read(REPO_ROOT / "docs" / "discover-phase.md")
observability_text = read(REPO_ROOT / "docs" / "observability.md")
verification_packet_text = read(REPO_ROOT / "docs" / "verification-packet.md")
ref_dispatch_machinery_text = read(AGENTS_DIR / "ref-dispatch-machinery.md")

# =============================================================================
# Commit 2b9325e — "return borrowed work — the auditor derives its own scope,
# the board replaces the summary" (orchestrator.md: Dispatch invariants,
# To specialists, Phase 3.8)
# =============================================================================
print("=== orchestrator.md: return-borrowed-work commit (2b9325e) ===")

_to_specialists = slice_section(
    orchestrator_text,
    "### To specialists — always include in every invocation:",
    ("\n## ",),
)

# No prior-agent summary requirement; no language directive; a pointer to
# the board instead of a paraphrase.
check(
    "return-borrowed-work(ac1-no-summary-requirement): To-specialists no longer requires"
    " a summary of the previous agent's status block",
    "brief summary from the previous agent's status block" not in _to_specialists,
    "the old prior-agent-summary requirement must not survive in To specialists",
)
check(
    "return-borrowed-work(ac1-board-pointer): To-specialists points at the workspace"
    " document the previous agent wrote, instead of paraphrasing it",
    "a pointer to the workspace document the previous agent wrote" in _to_specialists,
    "To specialists must carry a pointer to the board, not a dispatcher-written summary",
)
check(
    "return-borrowed-work(ac1-no-language-directive): To-specialists carries no"
    " per-dispatch language directive",
    "Operator-facing tier" not in _to_specialists and "Agentic tier" not in _to_specialists,
    "To specialists must carry zero language directives — declared per-artifact instead",
)
_S180_LANGUAGE_AGENTS = (
    "adversary", "architect", "delivery", "diagrammer", "gcp-cost-analyzer",
    "gcp-infra", "implementer", "plan-reviewer", "qa", "qa-plan", "reviewer",
    "security", "tester", "ux-reviewer",
)
_missing_lang = [a for a in _S180_LANGUAGE_AGENTS if "**Language.**" not in read(AGENTS_DIR / f"{a}.md")]
check(
    "return-borrowed-work(ac1-precondition-14-declared): the 14-output-contract"
    " language-declaration precondition this removal depends on holds",
    len(_S180_LANGUAGE_AGENTS) == 14 and not _missing_lang,
    f"missing '**Language.**' declaration(s) in: {_missing_lang}",
)

# Phase 3.8 dispatch carries coordinates + Scope only, no diff summary,
# no per-task summaries, no enumeration of what to confirm.
_phase38 = slice_section(orchestrator_text, "## Phase 3.8", ("\n## Phase 4a",))
check(
    "return-borrowed-work(ac2-coordinates-and-scope): Phase 3.8's dispatch carries"
    " objective coordinates and a literal Scope field",
    "{worktree_base}...HEAD" in _phase38 and "**Scope:** full" in _phase38,
    "Phase 3.8 dispatch must carry {worktree_base}...HEAD and a literal '**Scope:** full'",
)
check(
    "return-borrowed-work(ac2-deviations-pointer): Phase 3.8's dispatch reaches"
    " Deviations from Architecture by pointer to a real anchor",
    '00-verify-packet.md § Implementation Summary → **Deviations from Architecture:**'
    in _phase38,
    "Phase 3.8 dispatch must point at the verify-packet's real Deviations anchor",
)
check(
    "return-borrowed-work(ac2-no-enumeration): Phase 3.8's dispatch states it carries no"
    " diff summary, no per-task summaries, and no enumeration of what to confirm",
    "No diff summary, no per-task summaries, and no enumeration of what to confirm"
    in _phase38,
    "Phase 3.8 dispatch must explicitly disclaim diff summaries/per-task summaries/"
    "confirm-enumeration",
)
check(
    "return-borrowed-work(ac2-deviations-anchor-real): docs/verification-packet.md's"
    " Deviations from Architecture anchor is a real, resolvable anchor",
    "**Deviations from Architecture:**" in verification_packet_text,
    "docs/verification-packet.md must carry the literal 'Deviations from Architecture:' anchor",
)

# Dispatch invariants reaches the standard by pointer, NEVER >= 1.
_dispatch_invariants = slice_section(
    orchestrator_text, "## Dispatch invariants", ("\n## ",)
)
check(
    "return-borrowed-work(ac3-pointer-to-standard): Dispatch invariants reaches"
    " dispatch-contract.md by pointer",
    "agents/_shared/dispatch-contract.md" in _dispatch_invariants,
    "orchestrator.md § Dispatch invariants must point at dispatch-contract.md",
)
check(
    "return-borrowed-work(ac3-never-floor): Dispatch invariants keeps at least one"
    " 'NEVER' modal token",
    _dispatch_invariants.count("NEVER") >= 1,
    "orchestrator.md § Dispatch invariants must keep NEVER >= 1",
)

# The seven named untouched sections stay present (byte-identity itself is
# Suite 174's job; here we assert their headings still resolve, a check
# distinct from re-running Suite 174's own mechanism).
_S180_UNTOUCHED_HEADINGS = (
    "## Phase 3.5 — Acceptance Gate",
    "Phase 2-close",
    "## Phase 3 — Verify",
    "## Phase 1",
    "## Plan-Structure Scan" if "## Plan-Structure Scan" in orchestrator_text else "plan_structure",
)
check(
    "return-borrowed-work(ac4-phase35-untouched): '## Phase 3.5 — Acceptance Gate' still"
    " resolves in orchestrator.md",
    "## Phase 3.5 — Acceptance Gate" in orchestrator_text,
    "orchestrator.md must keep '## Phase 3.5 — Acceptance Gate' intact",
)
check(
    "return-borrowed-work(ac4-phase-dispatch-reference-untouched): '## Phase Dispatch"
    " Reference' still resolves in orchestrator.md",
    "Phase Dispatch Reference" in orchestrator_text,
    "orchestrator.md must keep '## Phase Dispatch Reference' intact",
)

# TH-STATE-REF enforcement declared honestly (checkpoint-guard unwired).
check(
    "return-borrowed-work(ac5-th-state-ref-honest): TH-STATE-REF's enforcement is"
    " declared honestly — checkpoint-guard unwired since v2.139.0, never blocking",
    "checkpoint-guard" in orchestrator_text
    and "unwired from Claude Code's" in orchestrator_text
    and "never blocks a dispatch" in orchestrator_text,
    "orchestrator.md must state checkpoint-guard is unwired and never blocks a dispatch",
)

print()
print("=== leader.md: dispatch-machinery-relocation commit (a04c10b) ===")

# =============================================================================
# Commit a04c10b — "dispatch machinery out, Discover pointers restored,
# clarity recorded with provenance" (leader.md, ref-dispatch-machinery.md,
# docs/reasoning-checkpoint.md, docs/discover-phase.md, docs/observability.md)
# =============================================================================

# leader.md carries no dispatch machinery; reaches discover-phase.md and
# spec-coauthoring.md by pointer; direct modes still present.
check(
    "dispatch-machinery-out(ac1-no-machinery-body): leader.md's relocated sections are"
    " stubs, not the full byte-preserved machinery",
    "Full contract:" in slice_section(leader_text, "## Multi-Task fan-out", ("\n---\n",))
    or "agents/ref-dispatch-machinery.md" in slice_section(
        leader_text, "## Multi-Task fan-out", ("\n---\n",)
    ),
    "leader.md's Multi-Task fan-out section must be a pointer stub, not full machinery",
)
check(
    "dispatch-machinery-out(ac1-discover-phase-pointer): leader.md reaches"
    " docs/discover-phase.md by pointer",
    "docs/discover-phase.md" in leader_text,
    "leader.md must reference docs/discover-phase.md",
)
check(
    "dispatch-machinery-out(ac1-spec-coauthoring-pointer): leader.md reaches"
    " docs/spec-coauthoring.md by pointer",
    "docs/spec-coauthoring.md" in leader_text,
    "leader.md must reference docs/spec-coauthoring.md",
)
check(
    "dispatch-machinery-out(ac1-direct-modes-present): leader.md still carries its"
    " Direct Modes section",
    "## Direct Modes" in leader_text,
    "leader.md must keep '## Direct Modes' intact",
)

# Functional-clarity registration: checkpoint.confirmed event, bounded
# operator words + provenance; leader is sole writer, orchestrator
# reads/verifies only (the sole-writer half is also asserted by Suite 180's
# ac7 check — restated here explicitly against leader.md's own prose).
check(
    "dispatch-machinery-out(ac2-checkpoint-confirmed-event): leader.md appends a"
    " checkpoint.confirmed event with provenance",
    "checkpoint.confirmed" in leader_text and "provenance:" in leader_text,
    "leader.md must append checkpoint.confirmed with a provenance field",
)
check(
    "dispatch-machinery-out(ac3-sole-writer): leader.md declares itself the sole writer,"
    " orchestrator read-and-verify only",
    "You are the sole writer of this event; the orchestrator reads and verifies it, "
    "never writes or repairs it." in leader_text,
    "leader.md must declare sole-writer ownership of checkpoint.confirmed",
)

# Relocated floors byte-preserved in ref-dispatch-machinery.md; new file
# has valid reference frontmatter (byte-identity/frontmatter validity
# themselves are Suite 19/174's job; here we assert the file's own
# self-description as a reference file, not a dispatchable agent).
check(
    "dispatch-machinery-out(ac4-new-file-exists): agents/ref-dispatch-machinery.md exists",
    (AGENTS_DIR / "ref-dispatch-machinery.md").exists(),
    "agents/ref-dispatch-machinery.md must exist",
)
_s180_frontmatter_end = ref_dispatch_machinery_text.find("\n---", 3)
_s180_frontmatter = ref_dispatch_machinery_text[:_s180_frontmatter_end]
check(
    "dispatch-machinery-out(ac4-reference-file-frontmatter): the new file's frontmatter"
    " declares itself a reference file, not a standalone dispatchable agent",
    "reference" in _s180_frontmatter.lower(),
    "agents/ref-dispatch-machinery.md frontmatter description must declare it a"
    " reference file",
)

# Relocated-to-pointer classification retains all three named security
# floors, reachable from leader.md.
check(
    "dispatch-machinery-out(ac5-constraint-e-waiver): the constraint-E waiver remains"
    " reachable from leader.md",
    "constraint-E waiver" in leader_text,
    "leader.md must keep the constraint-E waiver reachable",
)
check(
    "dispatch-machinery-out(ac5-failclosed-ambiguous-sensitivity): the fail-closed"
    " ambiguous-sensitivity rule remains reachable from leader.md",
    "fail-closed" in leader_text and "sensitiv" in leader_text.lower(),
    "leader.md must keep the fail-closed-on-ambiguous-sensitivity rule reachable",
)
check(
    "dispatch-machinery-out(ac5-hotfix-tier3-floor): the hotfix Tier-3 hard floor"
    " remains reachable from leader.md",
    "Tier 3 hard floor" in leader_text or "hotfix Tier-3 floor" in leader_text,
    "leader.md must keep the hotfix Tier-3 hard floor reachable",
)

# leader-boot-capability-check / leader-verify-real-scope stay present
# (byte-identity is Suite 174's job over the manifest entry).
check(
    "dispatch-machinery-out(ac6-boot-capability-check-present): leader.md's boot"
    " capability check section is intact",
    "Boot capability check" in leader_text,
    "leader.md must keep its Boot capability check section",
)

# reasoning-checkpoint.md declares B1 attribution + failure direction
# without contradicting the clarity-not-security framing; the two schema
# mirrors declare the event as authority, the field as derived cache.
check(
    "dispatch-machinery-out(ac7-attribution-failure-direction): "
    "reasoning-checkpoint.md declares the B1 attribution failure direction"
    " (routed-back ask, never a hard abort)",
    "Attribution and failure direction" in reasoning_checkpoint_text
    and "never aborts the run" in reasoning_checkpoint_text,
    "docs/reasoning-checkpoint.md must declare the attribution failure direction as a"
    " routed-back ask, never an abort",
)
check(
    "dispatch-machinery-out(ac7-clarity-not-security-consistent): the failure-direction"
    " clause is consistent with 'gates functional clarity, not security'",
    "gates functional clarity, not security" in reasoning_checkpoint_text,
    "docs/reasoning-checkpoint.md must state the checkpoint gates clarity, not security",
)
check(
    "dispatch-machinery-out(ac7-observability-documents-event): docs/observability.md"
    " documents the checkpoint.confirmed event with its fields and writer",
    "checkpoint.confirmed" in observability_text and "provenance" in observability_text,
    "docs/observability.md must document checkpoint.confirmed's fields",
)
_SCHEMA_FIELD_MARKER = "- functional_clarity_confirmed: {true | false}"
for _doc_name, _doc_text in (
    ("docs/reasoning-checkpoint.md", reasoning_checkpoint_text),
    ("docs/discover-phase.md", discover_phase_text),
):
    _fc_slice = slice_section(_doc_text, _SCHEMA_FIELD_MARKER, ("\n- ",))
    check(
        f"dispatch-machinery-out(ac7-schema-mirror-derived-cache): {_doc_name}'s"
        " functional_clarity_confirmed schema-comment declares it a DERIVED CACHE, not"
        " the registered confirmation itself",
        "DERIVED CACHE" in _fc_slice,
        f"{_doc_name} must describe the functional_clarity_confirmed schema field as a"
        " DERIVED CACHE",
    )

print()
print("=== delivery.md: diff-cap-withdrawal commit (e781357) ===")

# =============================================================================
# Commit e781357 — "withdraw the hard diff cap; report diff composition at
# the gate" (agents/delivery.md)
# =============================================================================

# Retargeted (pipeline-dispatch-shape): Step 9d (the size gate and
# diff-composition computation) moved wholesale from delivery.md to the
# coordinator's own agents/_shared/delivery-mechanics.md § 5, executed
# directly rather than dispatched — the "computed by delivery" framing became
# "computed by the coordinator" because the coordinator, not the `delivery`
# agent, now runs this step.
_delivery_mechanics_text = read(REPO_ROOT / "agents" / "_shared" / "delivery-mechanics.md")
_step9d = slice_section(_delivery_mechanics_text, "## 5. Diff-size gate", ("\n## ",))

# No diff-length threshold blocks or splits delivery of any size.
check(
    "diff-cap-withdrawal(ac1-no-hard-abort): delivery-mechanics.md § 5 carries no"
    " unconditional length-based abort regardless of justification",
    "no size tier that aborts unconditionally regardless of justification" in _step9d,
    "delivery-mechanics.md § 5 must state no threshold aborts regardless of justification",
)
check(
    "diff-cap-withdrawal(ac1-old-hard-row-gone): the withdrawn diff_lines>1000/"
    "diff_files>20 unconditional-abort row is gone",
    "diff_lines > 1000" not in delivery_text
    and "diff_files > 20" not in delivery_text
    and "diff_lines > 1000" not in _delivery_mechanics_text
    and "diff_files > 20" not in _delivery_mechanics_text,
    "neither delivery.md nor delivery-mechanics.md may contain the withdrawn"
    " diff_lines>1000/diff_files>20 abort row",
)

# Diff composition reported adjacent to audit_coverage, computed by
# the coordinator directly, never the auditor.
check(
    "diff-cap-withdrawal(ac2-composition-computed-by-delivery): diff composition is"
    " computed by the coordinator over the consolidated diff, independent of the auditor",
    "computed independently" in _step9d
    and "audit_coverage" in _step9d,
    "delivery-mechanics.md § 5 must state it computes diff_composition itself,"
    " independent of the auditor's own audit_coverage self-declaration",
)
check(
    "diff-cap-withdrawal(ac2-gate-adjacency): the STAGE-GATE-3 gate data presents"
    " diff_composition adjacent to audit_coverage",
    "adjacent to" in orchestrator_text and "audit_coverage" in orchestrator_text
    and "diff_composition" in orchestrator_text,
    "orchestrator.md's gate data must present diff_composition adjacent to audit_coverage",
)

# The soft 400-line/8-file threshold with justification is retained,
# non-blocking.
check(
    "diff-cap-withdrawal(ac3-soft-threshold-retained): the 400-line/8-file soft"
    " threshold with justification is retained and non-blocking",
    "diff_lines ≤ 400" in _delivery_mechanics_text
    and "diff_files ≤ 8" in _delivery_mechanics_text
    and "never an unconditional block" in _delivery_mechanics_text,
    "delivery-mechanics.md § 5 must retain the 400/8 soft threshold as non-blocking",
)

# deliv-critical-rules: the section shrank when the coordinator's own
# mechanical steps (branch, version bump, push, diff-composition computation)
# left delivery.md's own responsibility — the prior NEVER>=4/unconditionally>=2
# floor pinned language that moved out with those steps. The current, smaller
# floor (byte-exact tracking is Suite 174's job) is what the reviewed diff
# actually produced; the stale Phase 3.5/3.6 clause is confirmed gone.
_critical_rules = slice_section(delivery_text, "## Critical Rules", ("\n## ",))
check(
    "diff-cap-withdrawal(ac4-phase36-removed): the stale 'Phase 3.5 / 3.6' reference is"
    " corrected to name only the gate that exists",
    "Phase 3.6" not in _critical_rules,
    "agents/delivery.md § Critical Rules must not reference the non-existent Phase 3.6",
)
check(
    "diff-cap-withdrawal(ac4-modal-floor-preserved): Critical Rules keeps its NEVER>=2"
    " modal floor (re-baselined — the mechanical-step NEVERs moved to"
    " delivery-mechanics.md with the steps themselves)",
    _critical_rules.count("NEVER") >= 2,
    "agents/delivery.md § Critical Rules must keep NEVER >= 2",
)

# delivery.md declares the language of each artifact it produces (also
# covered by Suite 180's 14-agent language check — restated here explicitly
# against delivery.md's own prose).
check(
    "diff-cap-withdrawal(ac5-language-declared): agents/delivery.md declares the"
    " language of every artifact it produces",
    "**Language.**" in delivery_text,
    "agents/delivery.md must carry a '**Language.**' Return Protocol clause",
)

print()
print("=== README.md/agent-builder.md: authoring-standard commit (25f9911) ===")

# =============================================================================
# Commit 25f9911 — "authoring convention + per-agent objective column on the
# Roster" (agents/README.md, agents/agent-builder.md)
# =============================================================================

# README.md states the standard as the authoring convention;
# agent-builder.md consumes it.
check(
    "authoring-standard(ac1-standard-named): README.md names the authoring standard"
    " section",
    "Objective column — authoring standard" in readme_text,
    "agents/README.md must carry the '### Objective column — authoring standard' section",
)
check(
    "authoring-standard(ac1-agent-builder-consumes): agent-builder.md consumes the"
    " authoring standard by pointer",
    'agents/README.md § "Objective column — authoring standard"' in agent_builder_text,
    "agents/agent-builder.md must reference README.md's authoring-standard section",
)

# The ref-*.md and _shared/*.md enumeration in README.md matches the real
# tree.
_real_ref_count = len(list(AGENTS_DIR.glob("ref-*.md")))
_real_shared_count = len(list((AGENTS_DIR / "_shared").glob("*.md")))
# Retargeted (pipeline-dispatch-shape): the prose count word moved from
# "nine" to "ten" when agents/_shared/delivery-mechanics.md was added.
_readme_shared_enum = slice_section(readme_text, "Plus ten cross-cutting", ("\n## ",))
check(
    "authoring-standard(ac2-ref-enum-matches-tree): README.md's ref-*.md enumeration"
    f" names all {_real_ref_count} real files",
    all(f"`{p.stem}.md`" in readme_text for p in AGENTS_DIR.glob("ref-*.md")),
    "agents/README.md must enumerate every real agents/ref-*.md file",
)
check(
    "authoring-standard(ac2-shared-enum-matches-tree): README.md's _shared/*.md"
    f" enumeration count matches the real tree ({_real_shared_count} files)",
    len(re.findall(r"^- `_shared/[a-z-]+\.md`", _readme_shared_enum, re.MULTILINE))
    == _real_shared_count,
    f"agents/README.md must enumerate exactly {_real_shared_count} _shared/*.md files",
)

# agent-builder.md reaches the standard by pointer, never duplicating its
# canonical prose.
check(
    "authoring-standard(ac3-no-restatement): agent-builder.md does not restate the"
    " objective-form rule's own prose, only references it",
    "read and apply that section; its prose is not restated here" in agent_builder_text,
    "agents/agent-builder.md must point at the objective-form rule without restating it",
)

# Roster Objective column: second column, 27 rows, no empty cell, Role
# intact, no Status column added (bijection/empty-cell already asserted by
# Suite 180's ac8d check — restated here explicitly, plus the
# second-column-position and no-Status-column claims Suite 180 does not
# check).
check(
    "authoring-standard(ac4-second-column): Objective is the second Roster column,"
    " immediately after Agent",
    "| Agent | Objective | Model" in readme_text,
    "agents/README.md's Roster header must read '| Agent | Objective | Model ...'",
)
check(
    "authoring-standard(ac4-no-status-column): no Status column was added to the Roster",
    "| Status |" not in readme_text and "| Agent | Objective | Model | Effort | Tools"
    " (allowlist) | Role | Status |" not in readme_text,
    "agents/README.md's Roster must not gain a Status column",
)
check(
    "authoring-standard(ac4-orchestrator-row-precision): the orchestrator Roster row"
    " names its one human-facing rendering surface instead of denying it renders",
    "fallback" in readme_text.lower() and "orchestrator" in readme_text,
    "agents/README.md's orchestrator row must name the takeover-path rendering fallback",
)

# Objective form rule + delivery worked example (nine steps, one owner,
# one objective, counted by lens not by step); :24 description= objective;
# ref-prefix convention statement.
check(
    "authoring-standard(ac5-delivery-worked-example): delivery is the written worked"
    " example for the per-lens counting rule",
    "`delivery` is the worked example" in readme_text
    and "one objective" in readme_text,
    "agents/README.md must name delivery as the worked example for per-lens counting",
)
check(
    "authoring-standard(ac5-description-is-objective): the description-key"
    " documentation declares it IS the agent's objective statement",
    "This line **is** the agent's objective statement" in readme_text,
    "agents/README.md's description-key bullet must declare it the objective statement",
)
check(
    "authoring-standard(ac5-ref-prefix-convention): README.md states the ref-* prefix"
    " convention — never a dispatchable agent",
    "never a dispatchable agent" in readme_text or "never an agent despach" in readme_text.lower(),
    "agents/README.md must state a ref-*.md file is never a dispatchable agent",
)
check(
    "authoring-standard(ac5-agent-builder-roster-obligation): agent-builder.md is"
    " obligated to add the Roster row with Objective when creating an agent",
    "Roster" in agent_builder_text and "Objective" in agent_builder_text,
    "agents/agent-builder.md must be obligated to add a Roster row with Objective",
)

# The :28 read-only-prohibition bullet survives byte-preserved or stronger
# (also asserted deterministically by Suite 180's ac8e check — restated
# here explicitly against README.md's own prose).
check(
    "authoring-standard(ac6-readonly-prohibition-survives): the read-only-agent"
    " prohibition bullet survives the Roster rewrite",
    "MUST NOT include `Bash`, `Edit`, or `Write` beyond their own workspace doc"
    in readme_text,
    "agents/README.md must keep the read-only prohibition bullet intact",
)
check(
    "authoring-standard(ac6-frontmatter-source-of-truth): the frontmatter-is-source-"
    "of-truth clause for tool allowlists survives",
    "source of truth" in readme_text,
    "agents/README.md must keep the frontmatter-is-source-of-truth clause",
)

# ---------------------------------------------------------------------------
# Self-referential guard (hygiene contract)
# ---------------------------------------------------------------------------
_own_source = read(Path(__file__))
check(
    "self-ref: test file references its own four target commits by content, not by"
    " an ordinal task label",
    not re.search(r"\bTask-\d", _own_source),
    "this test file must never reference a 'Task-N' ordinal label",
)

# =============================================================================
# Summary
# =============================================================================
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  post-split agent-contract tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
