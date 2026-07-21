#!/bin/bash
# tests/test_gate_guard.sh
# Functional tests for hooks/ts/bodies/gate-guard.ts (compiled to
# hooks/ts/dist/gate-guard.cjs) — the deterministic outward-action-order
# floor introduced by the deterministic-gate-release-enforcement plan
# (issues #491/#495, Task-2). Mirrors the structure of
# test_checkpoint_guard.sh (real 00-state.md fixtures + real `git
# worktree` topology, per that file's own anti-fabricated-basename
# rationale) and test_prepublish_guard.sh (the compiled-artifact /
# permissionDecision assertion helpers).
#
# Regression test, authored before the fix, for hooks/ts/bodies/gate-guard.ts
# and its compiled hooks/ts/dist/gate-guard.cjs, which do not exist yet at
# authoring time — Task-2 of the plan creates them. The existence check below
# is therefore the CURRENT failing state (module/artifact not found -> exit
# 1); it flips to running the real case matrix once Task-2 lands the hook and
# its build.
#
# Covers (Task-2 AC references):
#   AC-1  — lane resolved (mtime-selection + branch/worktree correlation),
#           gate3_release: ship -> none (permits, cross-fire-resistant).
#   AC-2  — lane resolved, gate3_release not in {ship} (null/amend/abort) ->
#           deny (fail-closed within a resolved context, F-5).
#   AC-3  — no governing lane resolves -> none (defers to dev-guard; no DOS
#           to a manual push or an unrelated repo).
#   AC-7  — branch-in-place topology (worktree: null, working_branch
#           correlation only) -> same deny/none contract as worktree (F-1).
#   AC-9  — force-push, BOTH sub-forms (flags AND `+refspec`), deny
#           INCONDITIONAL over gate3_release, but ONLY in-lane; no lane
#           resolved -> defers (dev-guard/policy-block remain the floor
#           outside a detected pipeline lane).
#   AC-10 — decision set is {none, deny} ONLY — implicitly asserted by every
#           case below (an unexpected "ask"/"allow" output fails the
#           targeted assert_deny/assert_nodecision check, since neither
#           matches the expected literal).
#
# Usage:
#   ./tests/test_gate_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise (including the current
#   artifact-not-found pre-fix state).

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/ts/dist/gate-guard.cjs"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build' (requires Task-2's hooks/ts/bodies/gate-guard.ts + build:gate-guard script to exist first)"
    exit 1
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# make_lane_state DIR FIELDS_TEXT — writes DIR/<session-notes-dir>/x/00-state.md.
make_lane_state() {
    local dir="$1" content="$2"
    mkdir -p "$dir/workspaces/x"
    printf '%s\n' "$content" > "$dir/workspaces/x/00-state.md"
}

# Build a synthetic 00-state.md body: gate3_release / working_branch /
# worktree, matching the repo's `- field: value` line convention.
lane_fields() {
    local release="$1" working_branch="$2" worktree="$3"
    cat <<EOF
- gate3_release: ${release}
- working_branch: ${working_branch}
- worktree: ${worktree}
- status: in-progress
EOF
}

# make_branch_in_place_repo DIR BRANCH — a real git repo checked out on
# BRANCH, at DIR (no `git worktree add` involved — this IS the branch-in-
# place topology per docs/worktree-discipline.md: the pipeline works
# directly on a feature branch of the primary checkout, `worktree: null`).
make_branch_in_place_repo() {
    local dir="$1" branch="$2"
    mkdir -p "$dir"
    git -C "$dir" init -q
    git -C "$dir" config user.email "th-test@example.com"
    git -C "$dir" config user.name "th-test"
    git -C "$dir" commit -q --allow-empty -m init
    git -C "$dir" checkout -q -b "$branch"
}

# make_worktree_pair BASE — a main repo at BASE/main plus a real
# `git worktree add` checkout at a MISMATCHED basename (BASE/th-wt-sim),
# mirroring checkpoint-guard.sh's make_worktree_cwd rationale: a fabricated
# `$(mktemp -d)/<name>` directory would mask realpath-correlation bugs a
# genuine worktree topology exposes. Prints "MAIN_REPO WORKTREE_DIR
# WORKTREE_BRANCH".
make_worktree_pair() {
    local base="$1"
    local main_repo="$base/main"
    mkdir -p "$main_repo"
    git -C "$main_repo" init -q
    git -C "$main_repo" config user.email "th-test@example.com"
    git -C "$main_repo" config user.name "th-test"
    git -C "$main_repo" commit -q --allow-empty -m init
    local wt_dir="$base/th-wt-gate-guard-sim"
    local wt_branch="th-wt-gate-guard-sim-branch"
    git -C "$main_repo" worktree add -q -b "$wt_branch" "$wt_dir" >/dev/null 2>&1
    echo "$main_repo $wt_dir $wt_branch"
}

# push_payload COMMAND — a Bash tool_input JSON payload.
push_payload() {
    node -e '
        const [cmd] = process.argv.slice(1);
        process.stdout.write(JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } }));
    ' "$1"
}

run_hook() {
    local cwd="$1" payload="$2"
    (cd "$cwd" && node "$HOOK") <<< "$payload" 2>&1
}

assert_deny() {
    local name="$1" cwd="$2" payload="$3"
    local out
    out=$(run_hook "$cwd" "$payload")
    if echo "$out" | grep -qE '"permissionDecision":[[:space:]]*"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected but got other: $name | output: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_nodecision() {
    local name="$1" cwd="$2" payload="$3"
    local out
    out=$(run_hook "$cwd" "$payload")
    if [ -z "$out" ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] NONE: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NONE expected but got output: $name | output: $out")
        echo "  [FAIL] NONE: $name (got: $out)"
    fi
}

# assert_never_ask NAME CWD PAYLOAD — the decision set for gate-guard is
# {none, deny} ONLY (AC-10); this asserts the literal "ask" permissionDecision
# never appears, independent of whichever of the two the case otherwise expects.
assert_never_ask() {
    local name="$1" cwd="$2" payload="$3"
    local out
    out=$(run_hook "$cwd" "$payload")
    if echo "$out" | grep -qE '"permissionDecision":[[:space:]]*"ask"'; then
        FAIL=$((FAIL + 1))
        FAILURES+=("ask must never be returned: $name | output: $out")
        echo "  [FAIL] NEVER-ASK: $name (got: $out)"
    else
        PASS=$((PASS + 1))
        echo "  [PASS] NEVER-ASK: $name"
    fi
}

# ---------------------------------------------------------------------------
# AC-1 — lane resolved (branch-in-place: branch correlation), ship -> none
# ---------------------------------------------------------------------------
echo "=== AC-1: lane resolved, gate3_release: ship -> none (push permitted) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_nodecision "AC-1: ship + branch correlation -> none (git push)" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
assert_nodecision "AC-1: ship + branch correlation -> none (gh pr create)" \
    "$TMP" "$(push_payload 'gh pr create --title x --body y')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-2 — lane resolved, gate3_release not in {ship} -> deny (fail-closed)
# ---------------------------------------------------------------------------
echo
echo "=== AC-2: lane resolved, gate3_release in {null,amend,abort} -> deny ==="
for release in null amend abort; do
    TMP=$(mktemp -d)
    make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
    make_lane_state "$TMP" "$(lane_fields "$release" feat/deterministic-gate-release-enforcement null)"
    assert_deny "AC-2: gate3_release: $release -> deny" \
        "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
    rm -rf "$TMP"
done

# F-5 — lane resolved but gate3_release field itself is absent (a field-read
# fault post-resolution) -> deny, never a silent none.
echo
echo "=== AC-2 (F-5): lane resolved, gate3_release field missing -> deny ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(cat <<'EOF'
- working_branch: feat/deterministic-gate-release-enforcement
- worktree: null
- status: in-progress
EOF
)"
assert_deny "AC-2 (F-5): gate3_release field absent -> deny (fail-closed, not none)" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-3 — no governing lane resolves -> none (defer, no cross-fire / no DOS)
# ---------------------------------------------------------------------------
echo
echo "=== AC-3: no lane resolves -> none ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "totally-unrelated-branch"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_nodecision "AC-3: branch does not correlate to any candidate -> none" \
    "$TMP" "$(push_payload 'git push origin totally-unrelated-branch')"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/x"
assert_nodecision "AC-3: no 00-state.md found anywhere -> none" \
    "$TMP" "$(push_payload 'git push origin feat/x')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-7 (SEC-AC-1) — branch-in-place topology (worktree: null), null->deny,
# ship->none. Same repo shape as AC-1/AC-2 above; restated explicitly here
# as the dedicated branch-in-place regression case (F-1).
# ---------------------------------------------------------------------------
echo
echo "=== AC-7: branch-in-place topology (worktree: null) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-7: branch-in-place, gate3_release: null -> deny" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_nodecision "AC-7: branch-in-place, gate3_release: ship -> none" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Worktree topology — correlation via realpath(cwd()) -> `worktree` field.
# The lane declares NO working_branch (its pre-branch window), so only the
# worktree-realpath path can resolve it (F-1 companion path). A declared
# working_branch that mismatches the current branch now defers instead — see
# the branch-scoped correlation case below.
# ---------------------------------------------------------------------------
echo
echo "=== Worktree topology: cwd realpath correlates to \`worktree\` field ==="
if ! command -v git >/dev/null 2>&1; then
    echo "  [SKIP] worktree topology: git not found on PATH"
else
    BASE=$(mktemp -d)
    read -r MAIN_REPO WT_DIR WT_BRANCH <<< "$(make_worktree_pair "$BASE")"
    # working_branch absent (literal null) — only worktree-realpath correlates.
    make_lane_state "$WT_DIR" "$(lane_fields null null "$WT_DIR")"
    assert_deny "worktree topology: cwd realpath matches \`worktree\` field (pre-branch lane), gate3_release: null -> deny" \
        "$WT_DIR" "$(push_payload "git push origin $WT_BRANCH")"
    rm -rf "$BASE"
fi

# ---------------------------------------------------------------------------
# Branch-scoped correlation — a lane that DECLARES a working_branch owns
# exactly that branch. Non-pipeline (inline-posture) work on a different
# branch in the same directory must defer to dev-guard, not be captured by
# an order gate it can never satisfy (regression: /th:inline ship blocked
# by a stale non-terminal lane state).
# ---------------------------------------------------------------------------
echo
echo "=== Branch-scoped correlation: declared working_branch mismatch defers ==="
if ! command -v git >/dev/null 2>&1; then
    echo "  [SKIP] branch-scoped correlation: git not found on PATH"
else
    BASE=$(mktemp -d)
    read -r MAIN_REPO WT_DIR WT_BRANCH <<< "$(make_worktree_pair "$BASE")"
    # worktree realpath matches cwd, but the lane's declared branch is another
    # branch entirely — the current work is not the lane's delivery.
    make_lane_state "$WT_DIR" "$(lane_fields null unrelated-working-branch "$WT_DIR")"
    assert_nodecision "branch-scoped: worktree matches but declared working_branch differs, gate3_release: null -> none (defer to dev-guard)" \
        "$WT_DIR" "$(push_payload "git push origin $WT_BRANCH")"
    # Control: same lane state, current branch equals the declared branch ->
    # the order gate still denies (the lane's own delivery stays gated).
    git -C "$WT_DIR" checkout -q -b unrelated-working-branch
    assert_deny "branch-scoped (control): declared working_branch checked out, gate3_release: null -> deny" \
        "$WT_DIR" "$(push_payload 'git push origin unrelated-working-branch')"
    rm -rf "$BASE"
fi

# ---------------------------------------------------------------------------
# AC-9 (invariant E) — force-push deny is UNCONDITIONAL over gate3_release,
# in-lane only; both sub-forms (flags AND `+refspec`).
# ---------------------------------------------------------------------------
echo
echo "=== AC-9: force-push deny unconditional over gate3_release, in-lane only ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "AC-9: in-lane, ship, --force flag -> deny (unconditional)" \
    "$TMP" "$(push_payload 'git push --force origin feat/deterministic-gate-release-enforcement')"
assert_deny "AC-9: in-lane, ship, -f flag -> deny (unconditional)" \
    "$TMP" "$(push_payload 'git push -f origin feat/deterministic-gate-release-enforcement')"
assert_deny "AC-9: in-lane, ship, --force-with-lease flag -> deny (unconditional)" \
    "$TMP" "$(push_payload 'git push --force-with-lease origin feat/deterministic-gate-release-enforcement')"
assert_deny "AC-9: in-lane, ship, '+refspec' form -> deny (unconditional; policy-block does not match this sub-form)" \
    "$TMP" "$(push_payload 'git push origin +feat/deterministic-gate-release-enforcement:main')"
assert_nodecision "AC-9 (control): in-lane, ship, NO force -> none (ordinary git handling stays frictionless)" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

echo
echo "--- AC-9: no lane resolved, force-push still defers (dev-guard/policy-block remain the floor) ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "unrelated-manual-branch"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_nodecision "AC-9: no lane resolves, --force -> none (defers; no DOS to a manual push)" \
    "$TMP" "$(push_payload 'git push --force origin unrelated-manual-branch')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-10 — decision set is {none, deny} ONLY. AC-1/2/3/7/9 above already imply
# this per-case (an "ask" would fail their targeted assert), but this section
# asserts it explicitly and independently across the representative deny/none
# cases, per Task-7 AC-2.
# ---------------------------------------------------------------------------
echo
echo "=== AC-10: decision set is {none, deny} only — 'ask' is never returned ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_never_ask "AC-10: resolved lane, non-ship -> never ask (deny only)" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
assert_never_ask "AC-10: resolved lane, force-push -> never ask (deny only)" \
    "$TMP" "$(push_payload 'git push --force origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "unrelated-manual-branch"
assert_never_ask "AC-10: no lane resolves -> never ask (none only)" \
    "$TMP" "$(push_payload 'git push origin unrelated-manual-branch')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Task-8 AC-9 (pre-fix regression, deterministic-gate-release-enforcement) —
# gate-guard.ts carries the byte-identical GIT_PUSH_RE/GH_PR_CREATE_RE router
# pattern as dev-guard.ts (module header, line 63-64) and manifests the SAME
# quoted-literal boundary-class false positive, WORSE: `deny`, in-lane, for a
# benign read-only search. Authored BEFORE hooks/ts/bodies/command-lexer.ts
# (Task-8's shared prepareRoutableCommand pre-pass) exists — see 01-plan.md
# § Task-8, AC-4/AC-5.
#
# Fixture-by-concatenation discipline (mirrors Suite 152 in
# tests/test_agent_structure.py, same as tests/test_dev_guard.sh Suite 83f):
# every covered-action literal below is assembled from separate word tokens
# at runtime so this file's own source never carries a contiguous "git push"
# / "gh pr create" substring inside a search-pattern payload.
# ---------------------------------------------------------------------------
echo
echo "=== Task-8 AC-9: quoted-literal router false-positive (pre-fix, deny direction) ==="

_t8_git="git"; _t8_push="push"; _t8_gh="gh"; _t8_pr="pr"; _t8_create="create"
_t8_lit_git_push="${_t8_git} ${_t8_push}"
_t8_lit_gh_pr_create="${_t8_gh} ${_t8_pr} ${_t8_create}"
_t8_dq='"'

# --- (a) FAILS TODAY (expected) — quoted-literal read-only command, inside a
# DETECTED pipeline lane with gate3_release non-ship. Live repro mirrors
# tests/test_dev_guard.sh Suite 83f case (a): a read-only grep searching for
# two covered-action literals separated by "|" inside a double-quoted
# pattern satisfies the router's leading boundary class, so the SECOND
# literal is treated as though it opened a real invocation. Asserting
# `none` (the REQUIRED/intended behavior) — this currently FAILS because the
# actual decision today is `deny` (the WORSE manifestation the architect
# flagged: a benign in-pipeline grep would be silently blocked).
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
_t8_case_a="grep -rnE ${_t8_dq}${_t8_lit_gh_pr_create}|${_t8_lit_git_push}${_t8_dq} tests/test_gate_guard.sh"
assert_nodecision "Task-8 AC-4 (PRE-FIX, expected FAIL): quoted grep search, in-lane non-ship -> must be none, currently deny" \
    "$TMP" "$(push_payload "$_t8_case_a")"
rm -rf "$TMP"

# --- (b) PASSES TODAY (baseline) — true positives preserved, in the same
# in-lane non-ship fixture, literal fully OUTSIDE quotes: the order gate
# (a real unquoted git push) and force-push denial (BOTH sub-forms),
# UNCONDITIONAL on gate3_release (Invariant E). Must remain PASS after
# Task-8 lands (AC-5).
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"

assert_deny "Task-8 AC-5 (baseline, must stay PASS): real unquoted git push, in-lane non-ship -> deny (order gate)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-8 AC-5 (baseline, must stay PASS): real unquoted force-push '+main' refspec, in-lane -> deny (unconditional, Invariant E)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin +main")"
assert_deny "Task-8 AC-5 (baseline, must stay PASS): real unquoted -f force flag, in-lane -> deny (unconditional, Invariant E)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} -f origin feat/deterministic-gate-release-enforcement")"
rm -rf "$TMP"

# --- (c) FORMERLY a preserved-but-open bypass under the boundary-class
# router: a command-executing wrapper whose inner command is realistically
# QUOTED (the only way bash -c/eval actually take a multi-word argument)
# puts the covered-action verb immediately after the wrapper's opening quote
# character, which no router boundary class admitted — GIT_PUSH_RE/
# GH_PR_CREATE_RE never matched at all, and evaluate() fell through to
# none(), not deny. The command-analyzer rewrite (AC-3.1) closes this: the
# wrapper's statically-resolvable payload is recursively re-tokenized into
# its own effective command, which classifyCoveredAction then classifies
# identically to a bare invocation — so a resolvable wrapper-embedded push
# now reaches the same order-gate deny a bare one does.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-3.1: bash -c QUOTED git push, in-lane non-ship -> deny (order gate; closed bypass, was none)" \
    "$TMP" "$(push_payload "bash -c ${_t8_dq}${_t8_lit_git_push} origin main${_t8_dq}")"
assert_deny "AC-3.1: eval QUOTED git push, in-lane non-ship -> deny (order gate; closed bypass, was none)" \
    "$TMP" "$(push_payload "eval ${_t8_dq}${_t8_lit_git_push} origin main${_t8_dq}")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Phase-3 adversary finding C3 — Task-8's OWN quote-blanking pre-pass, reused
# as isForcePush()'s input, silently erased a QUOTED force flag or QUOTED
# force refspec, defeating Invariant E's unconditional deny. A quoted force
# signal must still deny, in the same ship-lane fixture AC-9 already uses to
# prove the deny is unconditional on gate3_release.
# ---------------------------------------------------------------------------
echo
echo "=== Fix (adversary C3): QUOTED force-flag / QUOTED force-refspec still deny ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "C3 fix: QUOTED --force flag, in-lane, ship -> deny (unconditional; must survive quote-blanking)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} ${_t8_dq}--force${_t8_dq} origin feat/deterministic-gate-release-enforcement")"
assert_deny "C3 fix: QUOTED '+refspec' form, in-lane, ship -> deny (unconditional; must survive quote-blanking)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin ${_t8_dq}+feature:main${_t8_dq}")"
rm -rf "$TMP"

# Original Task-8 false-positive (an inert quoted covered-action VERB, no
# force signal at all, in a read-only search) must still resolve to none —
# the C3 fix must not reopen the hole Task-8 closed. Same construction as
# case (a) above, restated here to pin it against this specific fix.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
_c3_case="grep -rnE ${_t8_dq}${_t8_lit_gh_pr_create}|${_t8_lit_git_push}${_t8_dq} tests/test_gate_guard.sh"
assert_nodecision "C3 fix (no regression): inert quoted covered-verb in a read-only grep -> still none" \
    "$TMP" "$(push_payload "$_c3_case")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Phase-3 remediation round 2 (adversary finding) — the round-2 fix
# (de-quote via space-replacement, then test isForcePush) closed the
# whole-token quoted-flag case above but left a MID-TOKEN quote-splice
# (`--fo"rce"`) open: bash concatenates split-quoted segments into ONE
# token, but replacing the quote with a SPACE re-splits the token instead
# of merging it, hiding the force signal again. The round-3 fix replaces
# de-quote-and-test with a conservative rule: ANY quote character anywhere
# in a confirmed push denies outright, regardless of whether it actually
# hides a force flag.
# ---------------------------------------------------------------------------
echo
echo "=== Fix (round 2/3): mid-token quote-splice + conservative any-quote rule ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "round 2/3: QUOTED --force flag (whole-token), in-lane, ship -> deny" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} ${_t8_dq}--force${_t8_dq} origin feat/deterministic-gate-release-enforcement")"
assert_deny "round 2/3: QUOTED '+refspec' form (whole-token), in-lane, ship -> deny" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin ${_t8_dq}+feature:main${_t8_dq}")"
assert_deny "round 2/3: MID-TOKEN quote-splice --fo\"rce\", in-lane, ship -> deny (round-2 adversary finding)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} --fo${_t8_dq}rce${_t8_dq} origin main")"
assert_deny "round 2/3: MID-TOKEN quote-splice on refspec +\"feature:main\", in-lane, ship -> deny" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin +${_t8_dq}feature:main${_t8_dq}")"
rm -rf "$TMP"

# SUPERSEDED (INVARIANT B, AC-3.4) — the retired raw-string char-gate denied
# ANY quoting in a confirmed push, even a legitimate quoted-but-non-force
# destination. The argv-based grammar resolves a quoted-but-literal token
# to its clean value (untainted) exactly like an unquoted one, so a quoted
# destination with no force signal now matches the benign shape and is no
# longer over-denied — the order gate is the only thing left to decide.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "main"
make_lane_state "$TMP" "$(lane_fields ship main null)"
assert_nodecision "AC-3.4 (INVARIANT B, no over-deny): quoted-but-literal branch name, NO force signal, in-lane, ship -> none (argv resolves the quoted literal)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin ${_t8_dq}main${_t8_dq}")"
rm -rf "$TMP"

# Original Task-8 false-positive fix is UNAFFECTED by this change — the
# inert quoted covered-verb mention never reaches isGitPush=true (it is
# blanked in `routable` before the router runs), so it never reaches the
# force-push check at all.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
_r2_case="grep -rnE ${_t8_dq}${_t8_lit_gh_pr_create}|${_t8_lit_git_push}${_t8_dq} tests/test_gate_guard.sh"
assert_nodecision "round 2/3 (no regression): inert quoted covered-verb in a read-only grep -> still none" \
    "$TMP" "$(push_payload "$_r2_case")"
rm -rf "$TMP"

# Genuinely unquoted, non-force push still returns the normal order-gate
# decision (deny if not-ship, none if ship) — unaffected, no quote
# characters present at all.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_nodecision "round 2/3 (unaffected): unquoted non-force push, ship -> none" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin feat/deterministic-gate-release-enforcement")"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_deny "round 2/3 (unaffected): unquoted non-force push, non-ship -> deny (order gate)" \
    "$TMP" "$(push_payload "${_t8_git} ${_t8_push} origin feat/deterministic-gate-release-enforcement")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Phase-3 remediation round 3 (operator directive, same iteration) — the
# round-2/3 any-quote rule closed quote-based obfuscation but left the wider
# shell-reconstruction FAMILY open: a backslash-escape (`--fo\rce` resolves
# to the literal `--force`, no quote character involved) or a `$`-triggered
# construction (parameter expansion, command substitution, ANSI-C quoting
# `$'...'`) can each reconstruct a force signal without using a quote at
# all. The fix broadens the predicate to ANY of quote/backslash/`$`.
# ---------------------------------------------------------------------------
echo
echo "=== Fix (round 3): broadened shell-reconstruction-char family (quote, backslash, \$) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "round 3: backslash-escape reconstruction --fo\\rce (resolves to --force, no quotes), in-lane, ship -> deny" \
    "$TMP" "$(push_payload 'git push --fo\rce origin main')"
assert_deny "round 3: ANSI-C-quoted string \$'--force' (uses \$'...' not a plain quote), in-lane, ship -> deny" \
    "$TMP" "$(push_payload "git push \$'--force' origin main")"
assert_deny "round 3: parameter/variable expansion \$BRANCH (presence of \$ alone triggers conservative deny), in-lane, ship -> deny" \
    "$TMP" "$(push_payload 'git push origin $BRANCH')"
rm -rf "$TMP"

# Negative-space assertion (the most important one in this fix): a plain
# push with NONE of quote/backslash/$ present is completely unaffected by
# the broadened predicate — normal order-gate behavior only.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_nodecision "round 3 (legitimate population unaffected): plain 'git push origin main', ship, no quote/backslash/\$ -> none" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
assert_nodecision "round 3 (legitimate population unaffected): plain 'git push -u origin main', ship, no quote/backslash/\$ -> none" \
    "$TMP" "$(push_payload 'git push -u origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_deny "round 3 (legitimate population, non-ship lane): plain 'git push origin main', no quote/backslash/\$ -> deny (order gate only, not force-ambiguity)" \
    "$TMP" "$(push_payload 'git push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

# Original Task-8 false-positive fix is UNAFFECTED by this broader
# predicate either — the inert quoted covered-verb mention never reaches
# isGitPush=true (blanked in `routable` before the router runs), so it
# never reaches the force-ambiguity check at all.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
_r3_case="grep -rnE ${_t8_dq}${_t8_lit_gh_pr_create}|${_t8_lit_git_push}${_t8_dq} tests/test_gate_guard.sh"
assert_nodecision "round 3 (no regression): inert quoted covered-verb in a read-only grep -> still none" \
    "$TMP" "$(push_payload "$_r3_case")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# dev-guard's `gh pr create` autogate opt-in predates gate-guard and is
# preserved unchanged; its regression coverage already lives in
# tests/test_dev_guard.sh (assert_allow "gh pr create with
# autogate.pr_create=true -> ALLOW"). Not duplicated here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Routing sanity — non-push/non-pr-create commands and a non-git directory
# never trip the hook (mirrors test_prepublish_guard.sh's routing suite).
# ---------------------------------------------------------------------------
echo
echo "=== Routing sanity: unrelated commands / non-git directory -> none ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_nodecision "routing: git status -> none" "$TMP" "$(push_payload 'git status')"
assert_nodecision "routing: git commit -> none" "$TMP" "$(push_payload 'git commit -m msg')"
assert_nodecision "routing: gh pr view -> none" "$TMP" "$(push_payload 'gh pr view 123')"
rm -rf "$TMP"

_tmp_non_git=$(mktemp -d)
_result=$(cd "$_tmp_non_git" && echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | node "$HOOK" 2>/dev/null)
rm -rf "$_tmp_non_git"
if [ -z "$_result" ]; then
    PASS=$((PASS + 1))
    echo "  [PASS] NONE: git push from non-git dir (no lane can resolve)"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("git push from non-git dir must resolve to none | output: $_result")
    echo "  [FAIL] NONE: git push from non-git dir (got: $_result)"
fi

# ---------------------------------------------------------------------------
# Task-9 (pre-fix regression, positive-grammar replacement) —
# deterministic-gate-release-enforcement, AC-1/AC-2/AC-6/AC-9/AC-10/AC-11
# (01-plan.md § Task-9). Authored BEFORE matchBenignPushGrammar /
# isLiteralSafeCommand exist in hooks/ts/bodies/command-lexer.ts — Task-9
# REPLACES gate-guard.ts's character-denylist force-push detection
# (isForcePush/hasShellReconstructionChar) with a positive-grammar matcher.
# Every assertion below states the REQUIRED post-Task-9 behavior (deny
# in-lane for anything that is not the exact benign push form) — never
# today's actual output.
#
# Ground truth verified empirically against today's compiled gate-guard.cjs
# before authoring (pre-fix-regression Step 4), not assumed from the design
# narrative:
#   FAIL-FIRST      — today: none (UNSAFE); must become deny post-Task-9.
#   REGRESSION-LOCK — today: ALREADY deny (via the round-1/2/3 char-denylist
#     fixes, or an incidental FORCE_FLAG_RE anywhere-in-string match); must
#     STAY deny post-Task-9 (guards against an accidental reopening).
#   LEGITIMATE POPULATION — today: none in ship-lane / deny via the order
#     gate in non-ship-lane; unaffected by the force-detection mechanism,
#     must stay that way post-Task-9.
#
# Fixture-by-concatenation discipline (Suite-152 pattern, mirrors the
# Task-8 section above): every covered-action/force literal below is
# assembled from separate word tokens at runtime so this file's own source
# never carries a contiguous "git push" / "--force" / "-f" /
# "--force-with-lease" / "--delete" substring.
# ---------------------------------------------------------------------------
echo
echo "=== Task-9: positive-grammar replacement for force-push detection (pre-fix, fail-first) ==="

_t9_git="git"; _t9_push="push"
_t9_f1="-f"; _t9_force="--force"; _t9_fwl="--force-with-lease"; _t9_delete="--delete"
_t9_dq='"'; _t9_bt='`'

# ---------------------------------------------------------------------------
# AC-2/AC-10(a) FAIL-FIRST — round-3-class (brace, backtick) + the remaining
# obfuscation-family members that the round-3 char-denylist (quote/backslash/
# $) does not cover (glob, process substitution) + AC-11's --delete CWE-88
# positional (not a recognized force flag under the old denylist at all).
# Verified today: all ten return NONE (unsafe) in a ship-lane, where the
# order gate alone would otherwise pass them.
# ---------------------------------------------------------------------------
echo
echo "--- AC-2/AC-10(a) fail-first: brace/backtick/glob/process-sub + AC-11 --delete ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): brace-expansion force flag --for{c,c}e, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --for{c,c}e origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): brace-expansion double-force refspec {+,+}main:main, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin {+,+}main:main")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): backtick command substitution supplying the force flag, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} ${_t9_bt}echo ${_t9_force}${_t9_bt} origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): backtick command substitution inline (--\`echo force\`), in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --${_t9_bt}echo force${_t9_bt} origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): glob star --for*e, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --for*e origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): glob bracket-class --f[o]rce, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --f[o]rce origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-2 (PRE-FIX, expected FAIL): process substitution <(echo x) as an argument, in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} <(echo x) origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-11 (PRE-FIX, expected FAIL, CWE-88): dash-prefixed positional origin ${_t9_delete} main, in-lane ship -> deny, currently none (not a recognized force flag under the old denylist)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin ${_t9_delete} main")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-1 (G-3) FAIL-FIRST — a bare `git push` / `git push origin` (no
# positional refspec/branch at all) is the ONE form that consults
# push.default/remote.origin.push, so it must NOT be treated as the benign
# form. Verified today: both return NONE in a ship-lane (the old code has no
# concept of "positional required" at all — it only ever checked for a force
# flag/refspec, and neither is present here).
# ---------------------------------------------------------------------------
echo
echo "--- AC-1 (G-3) fail-first: bare push / push-with-no-refspec, positional required ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "Task-9 AC-1/G-3 (PRE-FIX, expected FAIL): bare 'git push' (no positional at all), in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push}")"
assert_deny "Task-9 AC-1/G-3 (PRE-FIX, expected FAIL): 'git push origin' (remote only, no refspec), in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-10(b) REGRESSION-LOCK — rounds 1/2/3's own fixes (whole-token quote,
# mid-token quote-splice, backslash-escape, ANSI-C quoting, $-expansion/
# substitution) plus their refspec analogues, plus the two AC-11 CWE-88
# positional cases the old FORCE_FLAG_RE already caught incidentally
# (anywhere-in-string, not position-aware). Verified today: all eleven
# ALREADY deny — must STILL deny post-Task-9 (guard against a reopening).
# ---------------------------------------------------------------------------
echo
echo "--- AC-10(b) regression-lock: rounds 1/2/3 fixes + refspec analogues + AC-11 (already-caught) ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "Task-9 AC-10(b) (regression-lock): \$() command substitution supplying the force flag, in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} \$(echo ${_t9_force}) origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(b) (regression-lock): variable expansion \$BRANCH as the destination, in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin \$BRANCH")"
assert_deny "Task-9 AC-10(b) (regression-lock): parameter expansion \${F} as the destination, in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin \${F}")"
assert_deny "Task-9 AC-10(b) (regression-lock): backslash-escape reconstruction --fo\\rce, in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --fo\\rce origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(b) (regression-lock): ANSI-C-quoted \$'--force', in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} \$'${_t9_force}' origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(b) (regression-lock): whole-token quoted flag \"--force\", in-lane ship -> deny (round-1 fix, already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} ${_t9_dq}${_t9_force}${_t9_dq} origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(b) (regression-lock): mid-token quote-splice --fo\"rce\", in-lane ship -> deny (round-2 fix, already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} --fo${_t9_dq}rce${_t9_dq} origin main")"
assert_deny "Task-9 AC-10(b) (regression-lock, refspec analogue): whole-token quoted refspec origin \"+feature:main\", in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin ${_t9_dq}+feature:main${_t9_dq}")"
assert_deny "Task-9 AC-10(b) (regression-lock, refspec analogue): mid-token quote-splice refspec origin +\"feature:main\", in-lane ship -> deny (already deny today)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin +${_t9_dq}feature:main${_t9_dq}")"
assert_deny "Task-9 AC-11 (regression-lock, CWE-88): dash-prefixed positional origin -f, in-lane ship -> deny (already deny today — old FORCE_FLAG_RE matches -f anywhere in the string, not just after 'push')" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin ${_t9_f1}")"
assert_deny "Task-9 AC-11 (regression-lock, CWE-88): trailing positional origin main --force, in-lane ship -> deny (already deny today — same anywhere-in-string match)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin main ${_t9_force}")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-10(c) LEGITIMATE POPULATION — unaffected by the force-detection
# mechanism, in BOTH lane states. Verified today: none in a ship-lane, deny
# (order gate only, not force-ambiguity) in a non-ship-lane.
# ---------------------------------------------------------------------------
echo
echo "--- AC-10(c) legitimate population: unaffected by force-detection, both lane states ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_nodecision "Task-9 AC-10(c): plain kebab-branch push, in-lane ship -> none (unaffected)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin feat/deterministic-gate-release-enforcement")"
assert_nodecision "Task-9 AC-10(c): -u kebab-branch push, in-lane ship -> none (unaffected)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} -u origin feat/deterministic-gate-release-enforcement")"
rm -rf "$TMP"

# SUPERSEDED — the shared argv-based grammar (command-lexer.ts,
# matchBenignPushGrammar) now rejects a tag-like destination as part of its
# closed positive shape (the same rejection dev-guard.ts's own recognizer
# already applied), so a semver-tag push is a grammar mismatch and denies
# unconditionally on gate3_release, same as a force push — not an
# order-gate-only case anymore.
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-1.4 (grammar, no longer unaffected): semver tag push, in-lane ship -> deny (tag-like destination fails the shared grammar, unconditional)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin v2.130.1")"
rm -rf "$TMP"

TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"

assert_deny "Task-9 AC-10(c): plain kebab-branch push, in-lane non-ship -> deny (order gate only, unaffected)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(c): -u kebab-branch push, in-lane non-ship -> deny (order gate only, unaffected)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} -u origin feat/deterministic-gate-release-enforcement")"
assert_deny "Task-9 AC-10(c): semver tag push, in-lane non-ship -> deny (order gate only, unaffected)" \
    "$TMP" "$(push_payload "${_t9_git} ${_t9_push} origin v2.130.1")"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Adversary round-4 finding (G2) — ref-namespace-qualified destinations must
# be denied, not silently accepted as a "plain branch name". Before this
# fix, matchBenignPushGrammar's isPlainBranchName check had no ref-namespace
# exclusion, so a fully-qualified or abbreviated ref path satisfied it and
# fell through to none() in a shipped lane — a real gap between the module's
# stated "denies everything else" claim and its actual acceptance set (bounded
# to dev-guard's own ask ceiling, since dev-guard's isPlainBranchDestination
# already excluded these forms independently). Fixture-by-concatenation
# discipline unaffected here (no covered-action literal needs splitting).
# ---------------------------------------------------------------------------
echo
echo "--- Adversary round-4 (G2) fail-first: ref-namespace-qualified destinations must deny, not none ---"
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"

assert_deny "G2 (PRE-FIX, expected FAIL): fully-qualified ref destination 'refs/heads/main', in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "git push origin refs/heads/main")"
assert_deny "G2 (PRE-FIX, expected FAIL): abbreviated ref-namespace destination 'heads/main', in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "git push origin heads/main")"
assert_deny "G2 (PRE-FIX, expected FAIL): remote-tracking-shaped destination 'remotes/origin/main', in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "git push origin remotes/origin/main")"
assert_deny "G2 (PRE-FIX, expected FAIL): abbreviated tag-namespace destination 'tags/x', in-lane ship -> deny, currently none" \
    "$TMP" "$(push_payload "git push origin tags/x")"

# Unaffected sibling: an ordinary feature branch whose first `/`-segment is
# NOT a reserved ref-namespace word must stay accepted (no false positive
# introduced by the ref-namespace exclusion).
assert_nodecision "G2 (no regression): ordinary branch 'feature/my-branch' (non-reserved first segment), in-lane ship -> none (unaffected)" \
    "$TMP" "$(push_payload "git push origin feature/my-branch")"
rm -rf "$TMP"

# Marker: deterministic-gate-release-enforcement

# ---------------------------------------------------------------------------
# AC-3.1 — per-subcommand-binary invocation of a covered push, in-lane
# non-ship -> deny (order gate; INVARIANT A, basename equivalence closes the
# dispatcher-vs-per-subcommand-binary bypass by construction).
# ---------------------------------------------------------------------------
echo
echo "=== AC-3.1: per-subcommand-binary push, in-lane -> deny (order gate) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields null feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-3.1: per-subcommand-binary push (git-push), in-lane non-ship -> deny (was none)" \
    "$TMP" "$(push_payload 'git-push origin feat/deterministic-gate-release-enforcement')"
assert_deny "AC-3.1: dynamic-prefix per-subcommand-binary push (\$(git --exec-path)/git-push), in-lane non-ship -> deny (was none)" \
    "$TMP" "$(push_payload '$(git --exec-path)/git-push origin feat/deterministic-gate-release-enforcement')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-3.2 — force push, wrapper-embedded, in-lane ship -> deny unconditional
# on gate3_release (hard point extended to the wrapped form).
# ---------------------------------------------------------------------------
echo
echo "=== AC-3.2: wrapper-embedded force push, in-lane ship -> deny (unconditional) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-3.2: bash -c QUOTED force push, in-lane ship -> deny (unconditional; was none)" \
    "$TMP" "$(push_payload 'bash -c "git push --force origin main"')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-3.4 — colon-refspec destination, in-lane ship -> none (INVARIANT B, the
# argv-based grammar no longer over-denies a legitimate colon refspec).
# ---------------------------------------------------------------------------
echo
echo "=== AC-3.4: colon-refspec push, in-lane ship -> none (INVARIANT B) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_nodecision "AC-3.4: colon-refspec 'origin HEAD:feat/x', in-lane ship -> none (was deny)" \
    "$TMP" "$(push_payload 'git push origin HEAD:feat/x')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# AC-3.7 (SEC-DR-13) — env-assignment prefix / -c config override on a force
# push still deny, in-lane, unconditional on gate3_release. The shared
# analyzer resolves argv[0]/subcommand past the prefix/option once for all
# three hooks, so the statically-visible --force token still reaches this
# hook's deny without a per-hook re-implementation.
# ---------------------------------------------------------------------------
echo
echo "=== AC-3.7: env-prefix / -c config override on a force push -> deny (unconditional) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "AC-3.7: GIT_DIR=/x git push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'GIT_DIR=/x git push --force origin main')"
assert_deny "AC-3.7: git -c k=v push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'git -c k=v push --force origin main')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case-insensitive binary resolution — a mixed-case `git` invocation (Git,
# GIT) must still classify as a covered push, so the force-push deny floor
# is unconditional regardless of case (symmetric to dev-guard.ts's own
# case-insensitive resolution).
# ---------------------------------------------------------------------------
echo
echo "=== Case-insensitive git binary: force push still denies unconditionally ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "case-insensitive: Git push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'Git push --force origin main')"
assert_deny "case-insensitive: GIT push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'GIT push --force origin main')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Case-insensitive per-subcommand-binary form, `.exe` suffix, and a
# command-runner prefix — all resolved by the shared, centralized
# classifyCoveredAction (command-lexer.ts), not a per-hook fallback.
# ---------------------------------------------------------------------------
echo
echo "=== Centralized resolution: per-subcommand-binary case-variant, .exe, command-runner prefix ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "Git-push --force origin main (case-variant per-subcommand-binary), in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'Git-push --force origin main')"
assert_deny "git.exe push --force origin main (.exe-suffixed binary), in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'git.exe push --force origin main')"
assert_deny "timeout 5 git push --force origin main (command-runner prefix), in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'timeout 5 git push --force origin main')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# The combined worst case: an UNENUMERATED runner prefix (not in
# RUNNER_MODELS) combined with the per-subcommand-binary dispatcher form, on
# a force push — the shape that achieves a full none()/none()/none()
# triple-bypass of this unconditional deny when the runner-prefix layer only
# resolves past a closed, named list. The structural forward-scan (not a
# growing enumeration) closes it.
# ---------------------------------------------------------------------------
echo
echo "=== Combined worst finding: unenumerated runner + dispatcher form + force -> deny ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny "flock /tmp/x \$(git --exec-path)/git-push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'flock /tmp/x $(git --exec-path)/git-push --force origin main')"
assert_deny "unshare -n \$(git --exec-path)/git-push --force origin main, in-lane ship -> deny (unconditional)" \
    "$TMP" "$(push_payload 'unshare -n $(git --exec-path)/git-push --force origin main')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# env -S/--split-string — the embedded command is extracted as a wrapper
# payload (same shape as a shell's -c), so the resolved force push still
# reaches this hook's unconditional deny.
# ---------------------------------------------------------------------------
echo
echo "=== env -S/--split-string embedded force push -> deny (unconditional) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny 'env -S "git push --force origin main", in-lane ship -> deny (unconditional)' \
    "$TMP" "$(push_payload 'env -S "git push --force origin main"')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Redesign addendum (AC-R3/AC-R4/AC-R6) — shell-name-plus-`-c` dispatcher
# recognizer: any dispatcher basename piping through a recognized shell name
# still reaches this hook's unconditional force-push deny, including with an
# intervening shell flag before `-c` (SEC-DR-A2) and for a dispatcher basename
# not named "busybox"/"toybox" (no enumeration), and for the newly-extended
# shell basenames.
# ---------------------------------------------------------------------------
echo
echo "=== Redesign addendum: dispatcher recognizer force push -> deny (unconditional) ==="
TMP=$(mktemp -d)
make_branch_in_place_repo "$TMP" "feat/deterministic-gate-release-enforcement"
make_lane_state "$TMP" "$(lane_fields ship feat/deterministic-gate-release-enforcement null)"
assert_deny 'busybox sh -c "git push --force origin main" (AC-R3), in-lane ship -> deny (unconditional)' \
    "$TMP" "$(push_payload 'busybox sh -c "git push --force origin main"')"
assert_deny 'busybox sh -x -c "git push --force origin main" (intervening flag, SEC-DR-A2), in-lane ship -> deny' \
    "$TMP" "$(push_payload 'busybox sh -x -c "git push --force origin main"')"
assert_deny 'sbase sh -c "git push --force origin main" (dispatcher not named busybox/toybox, AC-R4), in-lane ship -> deny' \
    "$TMP" "$(push_payload 'sbase sh -c "git push --force origin main"')"
assert_deny 'ash -c "git push --force origin main" (extended shell set, AC-R6), in-lane ship -> deny' \
    "$TMP" "$(push_payload 'ash -c "git push --force origin main"')"
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  gate-guard tests: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"
if [ "$FAIL" -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]+"${FAILURES[@]}"}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
