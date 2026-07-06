#!/usr/bin/env python3
"""
tests/test_permission_disjointness.py

Suite 147 — permission-disjointness-invariant

Mechanical enforcement of the #18312 floor for the read-only allowlist class
(`docs/permission-provisioning.md § "Read-only allowlist — disjointness
invariant"`): a Claude Code `permissions.allow` rule that string-prefix-matches
a tool call is granted WITHOUT invoking any hook for that call, so an offered
allow-rule that happens to be a prefix of an outward-action command silently
defeats `dev-guard`'s `ask`/`deny` for that command.

Catalogue-driven, not example-driven:

  (a) the outward-action catalogue is DERIVED from the live regex constants in
      `hooks/ts/bodies/dev-guard.ts` (every `*_RE` declaration), not a
      hand-maintained example list;
  (b) the offered read-only allowlist is DERIVED from the canonical doc's own
      "Offered set" section, not duplicated as a second hardcoded list that
      could drift from the doc;
  (c) for every offered allow-prefix `P` and every outward-command sample `O`,
      asserts `not O.startswith(P)`;
  (d) a canary (`git`, `gh` — the unwrapped form of `Bash(git:*)`/`Bash(gh:*)`)
      is asserted to trigger a violation under this test's own detection
      logic, so the suite cannot pass vacuously;
  (e) fails if `dev-guard.ts` gains a new `*_RE` pattern with no corresponding
      outward-command sample registered here (coupling to the catalogue).

Usage:
    python3 tests/test_permission_disjointness.py
Exit code:
    0 if all assertions pass, 1 otherwise.

Marker: permission-disjointness-invariant
"""

from __future__ import annotations

import io
import re
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
DEV_GUARD_TS = REPO_ROOT / "hooks" / "ts" / "bodies" / "dev-guard.ts"
PERM_DOC = REPO_ROOT / "docs" / "permission-provisioning.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, name))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def slice_section(text: str, start_marker: str, stop_markers: tuple[str, ...]) -> str:
    """Return the substring from start_marker to the first stop_marker found after it."""
    idx = text.find(start_marker)
    if idx == -1:
        return ""
    tail = text[idx:]
    end = len(tail)
    for stop in stop_markers:
        pos = tail.find(stop, len(start_marker))
        if pos != -1 and pos < end:
            end = pos
    return tail[:end]


# ---------------------------------------------------------------------------
# Suite 147 — permission-disjointness-invariant
# ---------------------------------------------------------------------------
print("=== Suite 147: permission-disjointness-invariant ===")
print()

dev_guard_exists = DEV_GUARD_TS.exists()
perm_doc_exists = PERM_DOC.exists()
check("hooks/ts/bodies/dev-guard.ts exists", dev_guard_exists)
check("docs/permission-provisioning.md exists", perm_doc_exists)

if not (dev_guard_exists and perm_doc_exists):
    print()
    print("Cannot proceed without both source files — aborting.")
    sys.exit(1)

dev_guard_src = read(DEV_GUARD_TS)
perm_doc_src = read(PERM_DOC)

# ---------------------------------------------------------------------------
# (a) Derive the outward-action catalogue from dev-guard.ts's own regex
# constants — every `const XXX_RE = /pattern/flags;` declaration, single- or
# two-line form. This is the mechanism the doc calls "catalogue-driven": a
# future pattern added to dev-guard.ts is picked up automatically here.
# ---------------------------------------------------------------------------
_PATTERN_DECL_RE = re.compile(
    r"const\s+(\w+_RE)\s*=\s*\n?\s*/((?:\\.|[^/\\])*)/([a-z]*)\s*;",
    re.MULTILINE,
)

extracted_patterns: dict[str, re.Pattern[str]] = {}
for name, body, flags in _PATTERN_DECL_RE.findall(dev_guard_src):
    py_flags = re.IGNORECASE if "i" in flags else 0
    extracted_patterns[name] = re.compile(body, py_flags)

check(
    "suite147(extraction): at least one outward-action regex constant "
    "extracted from dev-guard.ts",
    len(extracted_patterns) > 0,
    "the extraction regex found zero '*_RE' constants — dev-guard.ts source "
    "shape may have changed",
)

# One or more real-world command/token samples per regex constant found in
# dev-guard.ts. Every name discovered above MUST have an entry here — this is
# the coupling floor: a new dev-guard.ts pattern with no
# registered sample fails check "suite147(coupling)" below rather than being
# silently invisible to the disjointness assertion.
OUTWARD_SAMPLES: dict[str, list[str]] = {
    "GIT_PUSH_RE": [
        "git push origin main",
        "git push origin feature-branch",
        "git push --force origin feature-branch",
        "git push origin +feature-branch",
    ],
    "GH_PR_CREATE_RE": ["gh pr create --title x --body y"],
    "GH_PR_MERGE_RE": ["gh pr merge 123 --squash"],
    "GH_PR_REVIEW_RE": ["gh pr review 123 --approve"],
    "GH_PR_COMMENT_RE": ["gh pr comment 123 --body hi"],
    "GH_API_REST_PR_RE": ["gh api -X POST /repos/o/r/pulls/1/merge"],
    "GH_GRAPHQL_RE": [
        "gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'"
    ],
    "GRAPHQL_PR_MUTATIONS_RE": [
        "gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'"
    ],
    "GH_ISSUE_WRITE_RE": [
        "gh issue create --title x",
        "gh issue edit 5 --body y",
        "gh issue comment 5 --body z",
    ],
    "CURL_WGET_MUTATING_RE": [
        "curl -X POST https://api.github.com/repos/o/r/pulls/1/merge",
        "wget --request POST https://api.github.com/repos/o/r/issues",
    ],
    "API_GITHUB_URL_RE": [
        "some-wrapper --request POST https://api.github.com/repos/o/r/pulls/1/merge",
    ],
    "MUTATING_METHOD_RE": [
        "some-wrapper --request POST https://api.github.com/repos/o/r/pulls/1/merge",
    ],
    "RAW_OUTWARD_SCAN_RE": [
        "raw payload mentions api.github.com endpoint",
    ],
    "CLICKUP_WRITE_RE": [
        "mcp__clickup__clickup_update_task",
        "mcp__clickup__clickup_create_task",
    ],
    "TAG_LIKE_RE": ["v1.2.3"],
    "SHELL_COMPOSITION_RE": [
        "git push origin feat/x && git push origin main",
        "git push origin feat/x; git push origin main",
    ],
    "TREE_OR_ENV_REDIRECT_RE": [
        "git -C /tmp/other push origin feat/x",
        "GIT_DIR=/tmp/x/.git git push origin feat/x",
    ],
    "SHELL_QUOTING_OR_EXPANSION_RE": [
        'git push origin "main"',
        "git push origin $BR",
    ],
    "GIT_PUSH_EXACT_RE": ["git push origin feat/x"],
    "BENIGN_PUSH_FLAG_RE": ["-u", "--set-upstream"],
}

missing_samples = sorted(set(extracted_patterns) - set(OUTWARD_SAMPLES))
check(
    "suite147(coupling): every '*_RE' constant found in dev-guard.ts has a "
    "registered outward-command sample",
    len(missing_samples) == 0,
    f"dev-guard.ts gained pattern(s) with no matching sample: {missing_samples} "
    "— register a sample in OUTWARD_SAMPLES so the disjointness invariant "
    "actually covers the new pattern",
)

# Every declared sample must actually match the pattern it is registered
# under — otherwise the catalogue is fictitious and the disjointness check
# below would be testing against samples that are not real outward actions.
mismatched: list[str] = []
for pattern_name, patt in extracted_patterns.items():
    for sample in OUTWARD_SAMPLES.get(pattern_name, []):
        if not patt.search(sample):
            mismatched.append(f"{pattern_name} !~ {sample!r}")
check(
    "suite147(sample-fidelity): every registered sample actually matches its "
    "own dev-guard.ts pattern",
    len(mismatched) == 0,
    f"sample(s) that do not match the pattern they are registered under: {mismatched}",
)

all_outward_samples = sorted(
    {sample for samples in OUTWARD_SAMPLES.values() for sample in samples}
)
check(
    "suite147(catalogue-nonempty): the flattened outward-command catalogue is "
    "non-empty",
    len(all_outward_samples) > 0,
)

# ---------------------------------------------------------------------------
# (b) Derive the offered read-only allowlist from the canonical doc's own
# "Offered set" subsection — not a second hand-maintained list. Scoping to
# this subsection (bounded to the next "### " heading) excludes the
# "Excluded — every form of `gh api`" subsection's own example tokens.
# ---------------------------------------------------------------------------
offered_section = slice_section(perm_doc_src, "### Offered set", ("\n### ",))
check(
    "suite147(doc-anchor): docs/permission-provisioning.md § 'Offered set' "
    "resolves to a non-empty slice",
    offered_section != "",
    "the '### Offered set' anchor was not found in "
    "docs/permission-provisioning.md — has the section been renamed?",
)

_backticked = re.findall(r"`([^`]+)`", offered_section)
offered_rules = sorted({t for t in _backticked if t.startswith("Bash(") or t.startswith("mcp__")})

check(
    "suite147(offered-nonempty): at least one offered allow-rule was derived "
    "from the canonical doc",
    len(offered_rules) >= 10,
    f"only found {len(offered_rules)} offered rule(s): {offered_rules}",
)


def strip_rule_to_prefix(rule: str) -> str:
    if rule.startswith("Bash(") and rule.endswith(":*)"):
        return rule[len("Bash(") : -len(":*)")]
    if rule.endswith("*"):
        return rule[:-1]
    return rule


offered_prefixes = sorted({strip_rule_to_prefix(rule) for rule in offered_rules})

# ---------------------------------------------------------------------------
# (c) The core disjointness assertion: no offered allow-prefix may be a
# string-prefix of any outward-command sample.
# ---------------------------------------------------------------------------
violations: list[str] = []
for prefix in offered_prefixes:
    for sample in all_outward_samples:
        if sample.startswith(prefix):
            violations.append(f"offered prefix {prefix!r} is a prefix of outward sample {sample!r}")

check(
    "suite147(disjointness): no offered allow-prefix is a string-prefix of any "
    "outward-action command sample derived from dev-guard.ts",
    len(violations) == 0,
    f"disjointness violated: {violations}",
)

# ---------------------------------------------------------------------------
# (d) Canary — a broad prefix that MUST NOT be offered (and, if it somehow
# were, MUST be caught) is asserted to trigger a violation under this same
# detection logic. Proves the assertion above is not vacuously true.
# ---------------------------------------------------------------------------
CANARY_PREFIXES = ("git", "gh")


def find_violations(prefix: str, samples: list[str]) -> list[str]:
    return [s for s in samples if s.startswith(prefix)]


for canary in CANARY_PREFIXES:
    canary_hits = find_violations(canary, all_outward_samples)
    check(
        f"suite147(canary-{canary}): the broad prefix '{canary}' (unwrapped "
        f"form of Bash({canary}:*)) IS detected as a disjointness violation "
        "by this test's own logic",
        len(canary_hits) > 0,
        f"canary prefix {canary!r} matched zero outward samples — the "
        "detection logic itself is broken (the suite could pass vacuously)",
    )

check(
    "suite147(canary-not-offered): neither canary prefix ('git', 'gh') is "
    "itself present in the real offered-prefix set",
    "git" not in offered_prefixes and "gh" not in offered_prefixes,
    f"a bare 'git' or 'gh' prefix is present in the offered set: {offered_prefixes}",
)

# ---------------------------------------------------------------------------
# (e) `gh api` (every form) must never appear in the offered set — the
# governing exclusion this whole invariant exists to enforce.
# ---------------------------------------------------------------------------
gh_api_hits = [p for p in offered_prefixes if p == "gh api" or p.startswith("gh api ")]
check(
    "suite147(no-gh-api): no offered rule is any form of 'gh api'",
    len(gh_api_hits) == 0,
    f"found gh api form(s) in the offered set: {gh_api_hits}",
)

# ---------------------------------------------------------------------------
# (f) The four prefix-safe gh read verbs are present, proving the offered set
# was not narrowed to nothing by an over-broad exclusion.
# ---------------------------------------------------------------------------
expected_gh_read_verbs = {"gh pr view", "gh pr list", "gh issue view", "gh issue list"}
check(
    "suite147(gh-read-verbs-present): all four prefix-safe gh read verbs are "
    "in the offered set",
    expected_gh_read_verbs.issubset(set(offered_prefixes)),
    f"missing: {expected_gh_read_verbs - set(offered_prefixes)}",
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total = len(results)
print(f"Results: {passed}/{total} passed, {failed} failed")

if failed:
    print()
    print("FAILING assertions:")
    for ok, name in results:
        if not ok:
            print(f"  - {name}")
    sys.exit(1)

print("All assertions passed.")
sys.exit(0)
