#!/usr/bin/env bash
# tests/test_prepublish_bump_floor.sh
# Regression suite for the bump-floor advisory sub-stage of
# hooks/ts/bodies/prepublish-guard.ts (compiled to
# hooks/ts/dist/prepublish-guard.cjs — the single source of gate logic
# post-cutover, issue #446).
#
# Covers Check 1 git-state cases that test_prepublish_guard.sh explicitly skips —
# those require a real throwaway git repo with a resolvable origin/main ref and
# committed diffs.  Each case:
#   1. Creates a temp dir and inits a bare remote (origin).
#   2. Clones the remote → establishes origin/main at OLD_VER.
#   3. Makes a feature commit (add/modify/delete/rename under agents|skills|hooks|docs)
#      with NEW_VER set in .claude-plugin/plugin.json + marketplace.json.
#   4. Runs the hook with a git-push payload from inside the clone.
#   5. Asserts stdout (nodecision = empty) and stderr (WARN present/absent).
#
# Universal-path model: the guard enforces ONE invariant on ANY branch that
# touches a distributed asset (agents/|skills/|hooks/) — all three version
# sites (.claude-plugin/plugin.json, .claude-plugin/marketplace.json,
# CLAUDE.md §3) must be bumped vs origin/main and mutually matching, then the
# mechanical SemVer floor applies. There is no branch-name discriminator, no
# release-cut marker/trailer, and no changelog.d/version.d fragment escape
# hatch — fixtures below use ordinary `feat/*` branch names (or no branch at
# all) to demonstrate the branch name carries no meaning.
#
# Version pins (AC-9 floor pattern — never exact ==):
#   Both manifests must have version >= (2, 108, 0) after the implementer's
#   MINOR bump (2.108.1 on feat/prepublish-bump-floor at time of authoring).
#   The _ver_ge() helper mirrors the _s59_ver_tuple floor pattern.
#
# Usage:
#   bash tests/test_prepublish_bump_floor.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.
#
# Marker: prepublish-bump-floor

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/ts/dist/prepublish-guard.cjs"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build'"
    exit 1
fi

_exec_hook() {
    node "$HOOK"
}

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# _ver_ge VER MAJOR MINOR PATCH
# Returns 0 (true) if VER >= MAJOR.MINOR.PATCH, 1 otherwise.
# Mirrors the _s59_ver_tuple floor pattern — NEVER an exact == pin.
_ver_ge() {
    local ver="$1" req_maj="$2" req_min="$3" req_p="$4"
    python3 -c "
import sys
v = '$ver'.split('.')
try:
    t = (int(v[0]), int(v[1]), int(v[2]))
except Exception:
    sys.exit(1)
floor = ($req_maj, $req_min, $req_p)
sys.exit(0 if t >= floor else 1)
" 2>/dev/null
}

# Build a preToolUse Bash payload for git push (no cwd field — backward compat)
_push_payload() {
    printf '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}'
}

# Build a preToolUse Bash payload for git push WITH an explicit cwd field.
# Usage: _push_payload_with_cwd /path/to/worktree
_push_payload_with_cwd() {
    local cwd_dir="$1"
    printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"git push origin HEAD"}}' "$cwd_dir"
}

# Run hook from inside a given directory.
# Outputs: sets _HOOK_STDOUT and _HOOK_STDERR in the caller.
_run_hook() {
    local dir="$1"
    _HOOK_STDOUT=""
    _HOOK_STDERR=""
    local tmpout tmperr
    tmpout=$(mktemp)
    tmperr=$(mktemp)
    (cd "$dir" && _push_payload | _exec_hook >"$tmpout" 2>"$tmperr") || true
    _HOOK_STDOUT=$(cat "$tmpout")
    _HOOK_STDERR=$(cat "$tmperr")
    rm -f "$tmpout" "$tmperr"
}

# Run hook with PROCESS CWD = session_dir but payload cwd = cwd_dir.
# This simulates: hook launched from session_dir (dirty/wrong tree), but payload
# tells the hook that the actual push originates from cwd_dir (the clean worktree).
# Outputs: sets _HOOK_STDOUT and _HOOK_STDERR in the caller.
_run_hook_from() {
    local session_dir="$1" cwd_dir="$2"
    _HOOK_STDOUT=""
    _HOOK_STDERR=""
    local tmpout tmperr
    tmpout=$(mktemp)
    tmperr=$(mktemp)
    (cd "$session_dir" && _push_payload_with_cwd "$cwd_dir" | _exec_hook >"$tmpout" 2>"$tmperr") || true
    _HOOK_STDOUT=$(cat "$tmpout")
    _HOOK_STDERR=$(cat "$tmperr")
    rm -f "$tmpout" "$tmperr"
}

pass() {
    local name="$1"
    PASS=$((PASS + 1))
    printf "  [PASS] %s\n" "$name"
}

fail() {
    local name="$1" reason="$2"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name — $reason")
    printf "  [FAIL] %s: %s\n" "$name" "$reason"
}

# assert_nodecision NAME
assert_nodecision() {
    local name="$1"
    if [ -z "$_HOOK_STDOUT" ]; then
        pass "$name (nodecision: stdout empty)"
    else
        fail "$name" "expected empty stdout (nodecision) but got: $_HOOK_STDOUT"
    fi
}

# assert_deny NAME
assert_deny() {
    local name="$1"
    if printf '%s' "$_HOOK_STDOUT" | grep -q '"permissionDecision": "deny"' 2>/dev/null || \
       printf '%s' "$_HOOK_STDOUT" | python3 -c "import sys,json; d=json.load(sys.stdin); o=d.get('hookSpecificOutput',d); assert o.get('permissionDecision')=='deny'" 2>/dev/null; then
        pass "$name (deny)"
    else
        fail "$name" "expected deny but got stdout: ${_HOOK_STDOUT:-<empty>}"
    fi
}

# assert_deny_reason_contains NAME NEEDLE
assert_deny_reason_contains() {
    local name="$1" needle="$2"
    if printf '%s' "$_HOOK_STDOUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d.get('hookSpecificOutput', d)
reason = o.get('permissionDecisionReason', '')
sys.exit(0 if '$needle' in reason else 1)
" 2>/dev/null; then
        pass "$name (deny reason contains: $needle)"
    else
        fail "$name" "expected deny reason to contain '$needle' but stdout was: ${_HOOK_STDOUT:-<empty>}"
    fi
}

# assert_stderr_contains NAME NEEDLE
assert_stderr_contains() {
    local name="$1" needle="$2"
    if printf '%s' "$_HOOK_STDERR" | grep -qF "$needle" 2>/dev/null; then
        pass "$name (stderr contains: $needle)"
    else
        fail "$name" "expected stderr to contain '$needle' but stderr was: ${_HOOK_STDERR:-<empty>}"
    fi
}

# assert_stderr_not_contains NAME NEEDLE
assert_stderr_not_contains() {
    local name="$1" needle="$2"
    if ! printf '%s' "$_HOOK_STDERR" | grep -qF "$needle" 2>/dev/null; then
        pass "$name (stderr absent: $needle)"
    else
        fail "$name" "expected stderr NOT to contain '$needle' but it did. stderr: $_HOOK_STDERR"
    fi
}

# ---------------------------------------------------------------------------
# Fixture factory
#
# _make_repo BARE_DIR CLONE_DIR OLD_VER
#   - inits a bare repo at BARE_DIR (origin)
#   - clones it into CLONE_DIR
#   - commits .claude-plugin/plugin.json + marketplace.json with OLD_VER
#     as the initial main commit (this is origin/main)
# ---------------------------------------------------------------------------
_make_repo() {
    local bare="$1" clone="$2" old_ver="$3"

    git init --bare "$bare" -q 2>/dev/null
    git clone "$bare" "$clone" -q 2>/dev/null

    (
        cd "$clone"
        git config user.email "test@test.com"
        git config user.name "Test"

        mkdir -p .claude-plugin
        _write_plugin_json "$old_ver" .claude-plugin/plugin.json
        _write_market_json "$old_ver" .claude-plugin/marketplace.json

        git add .claude-plugin/
        git commit -m "initial: version $old_ver" -q 2>/dev/null
        git push origin HEAD:main -q 2>/dev/null
    )
}

_write_plugin_json() {
    local ver="$1" path="$2"
    python3 -c "
import json
d = {'name': 'th', 'version': '$ver', 'description': 'test'}
with open('$path', 'w') as f:
    json.dump(d, f)
"
}

_write_market_json() {
    local ver="$1" path="$2"
    python3 -c "
import json
d = {'plugins': [{'name': 'th', 'version': '$ver'}]}
with open('$path', 'w') as f:
    json.dump(d, f)
"
}

# _bump_version CLONE_DIR NEW_VER
#   Updates .claude-plugin/{plugin,marketplace}.json to NEW_VER in the clone.
_bump_version() {
    local clone="$1" new_ver="$2"
    _write_plugin_json "$new_ver" "$clone/.claude-plugin/plugin.json"
    _write_market_json "$new_ver" "$clone/.claude-plugin/marketplace.json"
    (cd "$clone" && git add .claude-plugin/)
}

# Cleanup registry
declare -a _TMPDIRS

_new_tmp() {
    local d
    d=$(mktemp -d)
    _TMPDIRS+=("$d")
    printf '%s' "$d"
}

_cleanup_all() {
    for d in "${_TMPDIRS[@]+"${_TMPDIRS[@]}"}"; do
        rm -rf "$d"
    done
}
trap _cleanup_all EXIT

# ---------------------------------------------------------------------------
# Suite 15: bump-floor advisory — table-driven cases
# ---------------------------------------------------------------------------

echo "=== Suite 15: prepublish-bump-floor advisory (real git fixture) ==="

# ---------------------------------------------------------------------------
# Version pin checks (AC-9 floor pattern — must run BEFORE the git-fixture cases)
# ---------------------------------------------------------------------------
echo
echo "--- Version floor pins (AC-9) ---"

_plugin_ver=$(cd "$REPO_ROOT" && python3 -c "import json; d=json.load(open('.claude-plugin/plugin.json')); print(d.get('version',''))" 2>/dev/null || true)
_market_ver=$(cd "$REPO_ROOT" && python3 -c "import json; d=json.load(open('.claude-plugin/marketplace.json')); print(d['plugins'][0].get('version',''))" 2>/dev/null || true)

if _ver_ge "$_plugin_ver" 2 108 0; then
    pass "plugin.json version >= 2.108.0 (floor: MINOR bump for new advisory surface)"
else
    fail "plugin.json version floor" "version '$_plugin_ver' is below 2.108.0"
fi

if _ver_ge "$_market_ver" 2 108 0; then
    pass "marketplace.json version >= 2.108.0"
else
    fail "marketplace.json version floor" "version '$_market_ver' is below 2.108.0"
fi

# ---------------------------------------------------------------------------
# AC-1: ADD agents/foo.md + PATCH delta → under-bump MINOR WARN; nodecision
#
# Universal path: any branch touching a shipped asset must bump all version
# sites vs origin/main. This fixture bumps both plugin.json and
# marketplace.json (CLAUDE.md is absent from the fixture entirely, so the
# third site is fail-open/exempt) to a PATCH delta while ADDing a new file —
# under the mechanical floor an ADD warrants MINOR, so a WARN is expected.
# ---------------------------------------------------------------------------
echo
echo "--- AC-1: feat branch + ADD agents/foo.md + PATCH delta (both sites bumped+matching) → MINOR WARN ---"

_bare1=$(_new_tmp)
_clone1=$(_new_tmp)
_make_repo "$_bare1" "$_clone1" "2.107.0"

(
    cd "$_clone1"
    git config user.email "test@test.com"
    git config user.name "Test"
    git checkout -b feat/ac1-under-bump -q 2>/dev/null
    mkdir -p agents
    echo "# new agent" > agents/foo.md
    # PATCH bump (2.107.0 → 2.107.1) — under-bump for ADD (minor floor)
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: add agents/foo.md (patch bump, under-bump for ADD)" -q 2>/dev/null
)

_run_hook "$_clone1"

assert_nodecision "AC-1: feat branch + ADD agents/foo.md + PATCH delta — stdout empty"
assert_stderr_contains "AC-1: MINOR WARN present in stderr" "WARN"
assert_stderr_contains "AC-1: MINOR WARN mentions MINOR" "MINOR"
assert_stderr_contains "AC-1: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# AC-2: docs/ only touched + MINOR delta → over-bump WARN IS emitted; nodecision
#
# The hook reads .claude-plugin/plugin.json at both origin/main and HEAD on
# the no-shipped-asset early-exit path and emits an advisory WARN when the
# version bump is >= MINOR. Push is not blocked (nodecision, stdout empty).
# This path is unaffected by the universal-invariant collapse — it is a
# pure early-exit that runs before the version-site check.
# ---------------------------------------------------------------------------
echo
echo "--- AC-2: docs/ only + MINOR delta → over-bump WARN in stderr; nodecision ---"

_bare2=$(_new_tmp)
_clone2=$(_new_tmp)
_make_repo "$_bare2" "$_clone2" "2.107.0"

(
    cd "$_clone2"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p docs
    echo "# Some docs" > docs/guide.md
    # MINOR bump (2.107.0 → 2.108.0) — no shipped asset changed
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "docs update (minor bump)" -q 2>/dev/null
)

_run_hook "$_clone2"

# No shipped asset → early exit → nodecision (stdout empty, push not blocked).
assert_nodecision "AC-2: docs/ only + MINOR delta — nodecision (push proceeds)"
# Over-bump WARN IS emitted on the no-shipped-asset path.
assert_stderr_contains "AC-2: over-bump WARN present in stderr" "WARN"
assert_stderr_contains "AC-2: WARN mentions MINOR or higher" "MINOR"

# ---------------------------------------------------------------------------
# AC-2 fail-open: docs/ only + MINOR delta + .claude-plugin/plugin.json ABSENT
# at origin (generic repo) → NO WARN; nodecision silently.
#
# The over-bump advisory is skipped when either git show fails (file absent at
# origin/main) or the working-tree file is absent. The hook must fail-open.
# ---------------------------------------------------------------------------
echo
echo "--- AC-2 fail-open: docs/ only + MINOR delta + plugin.json absent → NO WARN; nodecision ---"

_bare2f=$(_new_tmp)
_clone2f=$(_new_tmp)

# Build a bare repo with NO .claude-plugin/ at all (simulates a generic repo
# that has no plugin manifest on origin/main).
git init --bare "$_bare2f" -q 2>/dev/null
git clone "$_bare2f" "$_clone2f" -q 2>/dev/null

(
    cd "$_clone2f"
    git config user.email "test@test.com"
    git config user.name "Test"
    # Initial commit: no .claude-plugin/ directory
    echo "# readme" > README.md
    git add README.md
    git commit -m "initial (no plugin manifest)" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null

    # HEAD commit: docs only + create .claude-plugin/plugin.json fresh (no origin counterpart)
    mkdir -p docs
    echo "# guide" > docs/guide.md
    mkdir -p .claude-plugin
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "docs + add plugin manifest (minor bump, absent at origin)" -q 2>/dev/null
)

_run_hook "$_clone2f"

# .claude-plugin/plugin.json absent at origin/main → git show fails → fail-open.
# No over-bump WARN; stdout empty; push not blocked.
assert_nodecision "AC-2 fail-open: plugin.json absent at origin — nodecision"
assert_stderr_not_contains "AC-2 fail-open: no over-bump WARN when origin file absent" "WARN"

# ---------------------------------------------------------------------------
# AC-3 (universal model): MODIFY agents/bar.md + NO version bump anywhere → DENY
#
# Under the universal-path model, any branch touching a shipped asset must
# bump all three version sites — the deny reason names the three-site bump
# requirement, not a changelog.d/version.d fragment (that escape hatch is
# retired).
# ---------------------------------------------------------------------------
echo
echo "--- AC-3: MODIFY agents/bar.md + NO bump anywhere → DENY (three-site bump required) ---"

_bare3=$(_new_tmp)
_clone3=$(_new_tmp)
_make_repo "$_bare3" "$_clone3" "2.107.0"

(
    cd "$_clone3"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# existing agent" > agents/bar.md
    git add agents/bar.md
    git commit -m "base: add agents/bar.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Modify shipped asset without bumping any version site
    echo "# existing agent — modified" > agents/bar.md
    git add agents/bar.md
    git commit -m "modify agents/bar.md (no bump anywhere)" -q 2>/dev/null
)

_run_hook "$_clone3"

assert_deny "AC-3: MODIFY without any version bump → deny"
assert_deny_reason_contains "AC-3: deny reason names the three-site bump requirement" "all three version sites"
assert_stderr_not_contains "AC-3: no WARN alongside the deny" "WARN"

# ---------------------------------------------------------------------------
# AC-2/AC-3 regression (inverted): a changelog.d/ fragment no longer bypasses
# the guard. Under the retired feature-path model, MODIFY + fragment + NO
# bump was ALLOWED (nodecision). Under the universal model the fragment
# carries no special meaning — the push is DENIED for missing the mandatory
# three-site bump. This is a deliberate verdict inversion (see Work Plan
# Notes, Task-1 §6).
# ---------------------------------------------------------------------------
echo
echo "--- (inverted) MODIFY agents + changelog.d/ fragment + NO bump → now DENY (fragment retired) ---"

_bare_ac5=$(_new_tmp)
_clone_ac5=$(_new_tmp)
_make_repo "$_bare_ac5" "$_clone_ac5" "2.107.0"

(
    cd "$_clone_ac5"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# feature agent" > agents/feature.md
    git add agents/feature.md
    git commit -m "base: add agents/feature.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Modify shipped asset, write a changelog.d/ fragment, do NOT bump version.
    # The fragment is a fossil of the retired escape hatch — it must no
    # longer suppress the deny.
    echo "# feature agent — updated" > agents/feature.md
    mkdir -p changelog.d
    printf '### Changed\n- Updated feature agent behavior\n' > changelog.d/feat-feature-agent.md
    git add agents/feature.md changelog.d/feat-feature-agent.md
    git commit -m "feat: update feature agent (changelog.d/ fragment, no bump)" -q 2>/dev/null
)

_run_hook "$_clone_ac5"

assert_deny "(inverted) MODIFY + changelog.d/ fragment + no bump → deny (fragment does not bypass the guard)"

# ---------------------------------------------------------------------------
# (inverted variant): MODIFY agents + version.d/ marker + NO bump → now DENY
# ---------------------------------------------------------------------------
echo
echo "--- (inverted) MODIFY agents + version.d/ marker + NO bump → now DENY (marker retired) ---"

_bare_ac5m=$(_new_tmp)
_clone_ac5m=$(_new_tmp)
_make_repo "$_bare_ac5m" "$_clone_ac5m" "2.107.0"

(
    cd "$_clone_ac5m"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# internal agent" > agents/internal.md
    git add agents/internal.md
    git commit -m "base: add agents/internal.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Internal refactor: shipped asset touched, version.d/ marker written
    # (fossil of the retired escape hatch), no version bump.
    echo "# internal agent — refactored" > agents/internal.md
    mkdir -p version.d
    printf 'patch\n' > version.d/refactor-internal-agent.bump
    git add agents/internal.md version.d/refactor-internal-agent.bump
    git commit -m "refactor: internal agent (version.d/ marker, no bump)" -q 2>/dev/null
)

_run_hook "$_clone_ac5m"

assert_deny "(inverted) MODIFY + version.d/ marker + no bump → deny (marker does not bypass the guard)"

# ---------------------------------------------------------------------------
# AC-3 (mutual-mismatch deny): feature branch + both sites bumped but to
# DIFFERENT values → DENY naming the mutual-match requirement.
#
# Without a branch-name discriminator, mismatch between the version sites
# must be checked directly (plugin.json vs marketplace.json), not
# transitively via a release/vX.Y.Z branch name.
# ---------------------------------------------------------------------------
echo
echo "--- AC-3 (mutual-mismatch deny): feature branch + plugin/marketplace bumped to DIFFERENT values → DENY ---"

_bare_ac6s=$(_new_tmp)
_clone_ac6s=$(_new_tmp)
_make_repo "$_bare_ac6s" "$_clone_ac6s" "2.107.0"

(
    cd "$_clone_ac6s"
    git config user.email "test@test.com"
    git config user.name "Test"
    git checkout -b feat/ac3-mismatch -q 2>/dev/null
    mkdir -p agents
    echo "# stray agent" > agents/stray.md
    # Both sites bumped (neither stale) but to DIFFERENT values — the
    # mutual-match check must catch this independently of the bump-floor.
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.109.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: add agents/stray.md with mismatched version sites" -q 2>/dev/null
)

_run_hook "$_clone_ac6s"

assert_deny "AC-3: plugin.json and marketplace.json bumped to different values → deny (mutual-match)"
assert_deny_reason_contains "AC-3: deny reason names the mismatch" "do not match"

# ---------------------------------------------------------------------------
# AC-1 (positive): feature branch + all-three sites bumped+matching → nodecision
#
# A feature branch with all three version sites bumped and mutually matching
# must be allowed (nodecision) — the branch name carries no meaning.
# ---------------------------------------------------------------------------
echo
echo "--- AC-1 (positive): feat/ac-positive + all-three bumped+matching → nodecision ---"

_bare_ac7p=$(_new_tmp)
_clone_ac7p=$(_new_tmp)
_make_repo "$_bare_ac7p" "$_clone_ac7p" "2.107.0"

(
    cd "$_clone_ac7p"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# release agent" > agents/release.md
    git add agents/release.md
    git commit -m "base: add agents/release.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Ordinary feature branch, bump all three sites to a matching X.Y.Z.
    git checkout -b feat/ac-positive -q 2>/dev/null
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    # CLAUDE.md §3 simulation: create a minimal CLAUDE.md with a version line
    printf '**Current version:** `2.108.0`\n' > CLAUDE.md
    git add .
    git commit -m "feat: bump all three version sites" -q 2>/dev/null
)

_run_hook "$_clone_ac7p"

assert_nodecision "AC-1 positive: feat/ac-positive + all-three bumped → nodecision"

# ---------------------------------------------------------------------------
# AC-4 (partial-bump deny): feature branch + only plugin.json bumped → DENY
# ---------------------------------------------------------------------------
echo
echo "--- AC-4 (partial-bump deny): feat/ac4-partial + only plugin.json bumped → DENY ---"

_bare_ac7d=$(_new_tmp)
_clone_ac7d=$(_new_tmp)
# Seed agents/partial.md in origin/main so the feature branch can MODIFY it
# (a file pushed to origin/main before branching does not appear in origin/main...HEAD
# unless it is changed on the branch — the fixture must modify it on the branch).
git init --bare "$_bare_ac7d" -q 2>/dev/null
git clone "$_bare_ac7d" "$_clone_ac7d" -q 2>/dev/null
(
    cd "$_clone_ac7d"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    echo "# partial agent" > agents/partial.md
    git add .
    git commit -m "initial: version 2.107.0 + partial agent" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: MODIFY the shipped asset, bump plugin.json but NOT marketplace.json
    git checkout -b feat/ac4-partial -q 2>/dev/null
    echo "# partial agent — modified on feature branch" > agents/partial.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    # marketplace.json stays at 2.107.0 (partial bump — should deny)
    git add agents/partial.md .claude-plugin/plugin.json
    git commit -m "feat: only plugin.json bumped (partial, should deny)" -q 2>/dev/null
)

_run_hook "$_clone_ac7d"

assert_deny "AC-4: feature branch with only plugin.json bumped → deny (partial three-site bump)"

# ---------------------------------------------------------------------------
# AC-4: DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN; nodecision
# ---------------------------------------------------------------------------
echo
echo "--- AC-4: feat branch + DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN ---"

_bare4=$(_new_tmp)
_clone4=$(_new_tmp)
_make_repo "$_bare4" "$_clone4" "2.107.0"

(
    cd "$_clone4"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p skills/baz
    echo "# SKILL" > skills/baz/SKILL.md
    git add skills/baz/
    git commit -m "base: add skills/baz/SKILL.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: delete the skill + MINOR bump (under-bump for DELETE, major floor)
    git checkout -b feat/ac4-delete -q 2>/dev/null
    git rm skills/baz/SKILL.md -q 2>/dev/null
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "feat: delete skills/baz/SKILL.md (minor bump — under-bump for DELETE)" -q 2>/dev/null
)

_run_hook "$_clone4"

assert_nodecision "AC-4: feat branch + DELETE + MINOR delta — stdout empty"
assert_stderr_contains "AC-4: MAJOR-candidate WARN present" "WARN"
assert_stderr_contains "AC-4: mentions MAJOR" "MAJOR"
assert_stderr_contains "AC-4: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# AC-4b (CodeRabbit #6): RENAME agents/rn.md -> docs/rn.md (shipped -> non-
# shipped) + MINOR delta → MAJOR-candidate WARN; nodecision
#
# git records a rename as R<score>\t<src>\t<dst>. The diff parser used to
# keep only the destination path, so a rename OUT of a shipped path into a
# non-shipped location (docs/) never matched SHIPPED_PATH_RE and silently
# skipped the major bump-floor for a removed public surface. This asserts
# the source side of the rename is also evaluated.
# ---------------------------------------------------------------------------
echo
echo "--- AC-4b (#6): feat branch + RENAME agents/rn.md -> docs/rn.md + MINOR delta → MAJOR-candidate WARN ---"

_bare4b=$(_new_tmp)
_clone4b=$(_new_tmp)
_make_repo "$_bare4b" "$_clone4b" "2.107.0"

(
    cd "$_clone4b"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# renamed agent" > agents/rn.md
    git add agents/rn.md
    git commit -m "base: add agents/rn.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: rename the shipped asset OUT of agents/ into docs/
    # (non-shipped) + MINOR bump (under-bump for a removed public surface).
    git checkout -b feat/ac4b-rename -q 2>/dev/null
    mkdir -p docs
    git mv agents/rn.md docs/rn.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "feat: rename agents/rn.md to docs/rn.md (minor bump — under-bump for RENAME-OUT)" -q 2>/dev/null
)

_run_hook "$_clone4b"

assert_nodecision "AC-4b: feat branch + RENAME shipped->non-shipped + MINOR delta — stdout empty"
assert_stderr_contains "AC-4b: MAJOR-candidate WARN present" "WARN"
assert_stderr_contains "AC-4b: mentions MAJOR" "MAJOR"
assert_stderr_contains "AC-4b: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# Suite 15 AC-5: MODIFY hooks/x.sh (M only) + PATCH delta → NO WARN; nodecision
# ---------------------------------------------------------------------------
echo
echo "--- Suite15/AC-5: feat branch + MODIFY hooks/x.sh + PATCH delta → NO WARN ---"

_bare5=$(_new_tmp)
_clone5=$(_new_tmp)
_make_repo "$_bare5" "$_clone5" "2.107.0"

(
    cd "$_clone5"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p hooks
    echo "#!/bin/bash" > hooks/x.sh
    git add hooks/x.sh
    git commit -m "base: add hooks/x.sh" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: modify only — PATCH bump (meets floor)
    git checkout -b feat/ac5-patch -q 2>/dev/null
    echo "#!/bin/bash" > hooks/x.sh
    echo "# updated" >> hooks/x.sh
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify hooks/x.sh (patch bump)" -q 2>/dev/null
)

_run_hook "$_clone5"

assert_nodecision "Suite15/AC-5: feat branch + MODIFY hooks + PATCH delta — stdout empty"
assert_stderr_not_contains "Suite15/AC-5: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# Suite15/AC-7: old version was non-X.Y.Z → semver_delta unknown → fail-open
#
# semver_delta(non-X.Y.Z-old, X.Y.Z-new) returns "unknown" → bump-floor
# compare is skipped → nodecision (fail-open).
# ---------------------------------------------------------------------------
echo
echo "--- Suite15/AC-7: feat branch + old version non-X.Y.Z at origin → fail-open, skip note ---"

_bare7=$(_new_tmp)
_clone7=$(_new_tmp)

# Create a bare repo with a non-X.Y.Z version at origin/main
git init --bare "$_bare7" -q 2>/dev/null
git clone "$_bare7" "$_clone7" -q 2>/dev/null

(
    cd "$_clone7"
    git config user.email "test@test.com"
    git config user.name "Test"

    mkdir -p .claude-plugin agents
    # Initial commit at origin/main: non-X.Y.Z version (pre-release)
    _write_plugin_json "1.0.0-beta" .claude-plugin/plugin.json
    _write_market_json "1.0.0-beta" .claude-plugin/marketplace.json
    echo "# base agent" > agents/base.md
    git add .
    git commit -m "initial: version 1.0.0-beta (non-X.Y.Z)" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null

    # Feature branch: bump to X.Y.Z
    git checkout -b feat/ac7-nonsemver -q 2>/dev/null
    echo "# agent — updated" > agents/new.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: bump — old version was non-X.Y.Z" -q 2>/dev/null
)

_run_hook "$_clone7"

assert_nodecision "Suite15/AC-7: old-version non-X.Y.Z → semver_delta=unknown → nodecision (fail-open)"
assert_stderr_contains "Suite15/AC-7: skip note in stderr mentions version" "skipping bump-floor check"

# ---------------------------------------------------------------------------
# Correct case: ADD agents/new.md + MINOR delta → NO WARN
# ---------------------------------------------------------------------------
echo
echo "--- Correct case: feat branch + ADD agents/new.md + MINOR delta → NO WARN ---"

_barec=$(_new_tmp)
_clonec=$(_new_tmp)
_make_repo "$_barec" "$_clonec" "2.107.0"

(
    cd "$_clonec"
    git config user.email "test@test.com"
    git config user.name "Test"
    git checkout -b feat/ac-correct -q 2>/dev/null
    mkdir -p agents
    echo "# new agent" > agents/new.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: add agents/new.md (minor bump)" -q 2>/dev/null
)

_run_hook "$_clonec"

assert_nodecision "correct: feat branch + ADD + MINOR delta — stdout empty"
assert_stderr_not_contains "correct: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# Over-bump-not-fired control: docs/ only + PATCH → NO over-bump WARN
# (no-shipped-asset early-exit path; unaffected by the universal-path model)
# ---------------------------------------------------------------------------
echo
echo "--- Control: docs/ only + PATCH → NO over-bump WARN ---"

_bareo=$(_new_tmp)
_cloneo=$(_new_tmp)
_make_repo "$_bareo" "$_cloneo" "2.107.0"

(
    cd "$_cloneo"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p docs
    echo "# doc" > docs/README.md
    # PATCH bump — below the MINOR threshold; docs-only path (no shipped asset)
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "docs only (patch bump)" -q 2>/dev/null
)

_run_hook "$_cloneo"

assert_nodecision "control: docs/ + PATCH — stdout empty"
assert_stderr_not_contains "control: no over-bump WARN for PATCH" "WARN"

# ---------------------------------------------------------------------------
# Suite 16 (over-bump hard-deny + bump-override escape-hatch)
# Functional tests for the #383 over-bump governance sub-stage.
#
# Token injection: the hook reads the override token from:
#   1. GIT_COMMIT_MSG environment variable (commit trailer)
#   2. GIT_PUSH_OPTION_COUNT / GIT_PUSH_OPTION_N (push options)
# Both sources are tested below via env-var injection in the run_hook helper.
# ---------------------------------------------------------------------------
echo
echo "--- Suite 16 (AC-1/#383): over-bump DENY — MINOR applied on M-only/PATCH-floor diff, no override ---"

# Scenario: feat branch, MODIFY agents/existing.md only (M-only) → PATCH floor.
# Applied bump: MINOR (2.107.0 → 2.108.0) → exceeds floor → deny (no bump-override token).
_bare_a1=$(_new_tmp)
_clone_a1=$(_new_tmp)
_make_repo "$_bare_a1" "$_clone_a1" "2.107.0"

(
    cd "$_clone_a1"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# existing agent" > agents/existing.md
    git add agents/existing.md
    git commit -m "base: add agents/existing.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: Modify only (M-only → PATCH floor) but apply MINOR bump (over-bump)
    git checkout -b feat/s16-ac1 -q 2>/dev/null
    echo "# existing agent — updated" > agents/existing.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify agents/existing.md (minor bump — over-bump, no override)" -q 2>/dev/null
)

_run_hook "$_clone_a1"
assert_deny "Suite16/AC-1: MINOR applied on M-only (PATCH floor) without override → deny"

echo
echo "--- Suite 16 (AC-2/#383): over-bump ALLOWED — valid bump-override token via GIT_COMMIT_MSG ---"

_bare_a2=$(_new_tmp)
_clone_a2=$(_new_tmp)
_make_repo "$_bare_a2" "$_clone_a2" "2.107.0"

(
    cd "$_clone_a2"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# agent two" > agents/two.md
    git add agents/two.md
    git commit -m "base: add agents/two.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # M-only → PATCH floor, apply MINOR (over-bump); bump-override token will
    # suppress the over-bump deny.
    git checkout -b feat/s16-ac2a -q 2>/dev/null
    echo "# agent two — updated" > agents/two.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify agents/two.md (minor bump on M-only/PATCH floor)" -q 2>/dev/null
)

# Inject the valid override token via GIT_COMMIT_MSG
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2=$(mktemp)
_tmperr_a2=$(mktemp)
(cd "$_clone_a2" && _push_payload | GIT_COMMIT_MSG="bump-override: minor — fix + surface in same PR" _exec_hook >"$_tmpout_a2" 2>"$_tmperr_a2") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2")
_HOOK_STDERR=$(cat "$_tmperr_a2")
rm -f "$_tmpout_a2" "$_tmperr_a2"
assert_nodecision "Suite16/AC-2a: over-bump WITH valid bump-override (GIT_COMMIT_MSG) → nodecision"

echo
echo "--- Suite 16 (AC-2/#383): over-bump ALLOWED — valid bump-override token via GIT_PUSH_OPTION_* ---"

_bare_a2p=$(_new_tmp)
_clone_a2p=$(_new_tmp)
_make_repo "$_bare_a2p" "$_clone_a2p" "2.107.0"

(
    cd "$_clone_a2p"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p hooks
    echo "#!/bin/bash" > hooks/myhook.sh
    git add hooks/myhook.sh
    git commit -m "base: add hooks/myhook.sh" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # M-only → PATCH floor, apply MINOR (over-bump), provide override via push option
    git checkout -b feat/s16-ac2b -q 2>/dev/null
    echo "#!/bin/bash # updated" > hooks/myhook.sh
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify hooks/myhook.sh (minor bump on M-only/PATCH floor)" -q 2>/dev/null
)

# Inject the valid override token via GIT_PUSH_OPTION_*
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2p=$(mktemp)
_tmperr_a2p=$(mktemp)
(cd "$_clone_a2p" && _push_payload \
    | GIT_PUSH_OPTION_COUNT=1 \
      GIT_PUSH_OPTION_0="bump-override: minor — hotfix + new hook surface in same PR" \
      _exec_hook >"$_tmpout_a2p" 2>"$_tmperr_a2p") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2p")
_HOOK_STDERR=$(cat "$_tmperr_a2p")
rm -f "$_tmpout_a2p" "$_tmperr_a2p"
assert_nodecision "Suite16/AC-2b: over-bump WITH valid bump-override (GIT_PUSH_OPTION_0) → nodecision"

echo
echo "--- Suite 16 (AC-2/#383 guard): control-char override token → rejected → deny ---"

_bare_a2c=$(_new_tmp)
_clone_a2c=$(_new_tmp)
_make_repo "$_bare_a2c" "$_clone_a2c" "2.107.0"

(
    cd "$_clone_a2c"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# ctrl agent" > agents/ctrl.md
    git add agents/ctrl.md
    git commit -m "base: add agents/ctrl.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # M-only → PATCH floor, apply MINOR (over-bump); control-char token is rejected
    git checkout -b feat/s16-ac2c -q 2>/dev/null
    echo "# ctrl agent — updated" > agents/ctrl.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify agents/ctrl.md (minor bump, over-bump)" -q 2>/dev/null
)

# Inject an override token containing a control character (tab = \x09).
# SEC-DR-A: control chars must be rejected → override is treated as absent → over-bump deny.
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2c=$(mktemp)
_tmperr_a2c=$(mktemp)
_ctrl_token=$(printf 'bump-override: minor \t— malicious payload')
(cd "$_clone_a2c" && _push_payload \
    | GIT_COMMIT_MSG="$_ctrl_token" _exec_hook >"$_tmpout_a2c" 2>"$_tmperr_a2c") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2c")
_HOOK_STDERR=$(cat "$_tmperr_a2c")
rm -f "$_tmpout_a2c" "$_tmperr_a2c"
assert_deny "Suite16/AC-2c: control-char override token rejected → falls through to over-bump deny"

echo
echo "--- Suite 16 (AC-3/#383 regression): under-bump WARN still emitted; hard-block still fires ---"

# AC-3 regression (a): ADD agents/new.md + PATCH delta → MINOR WARN still present.
# All-three sites bumped and matching, but ADD (minor floor) with PATCH
# applied → UNDER-BUMP WARN emitted. Verifies the bump-floor sub-stage still runs.
_bare_a3w=$(_new_tmp)
_clone_a3w=$(_new_tmp)
_make_repo "$_bare_a3w" "$_clone_a3w" "2.107.0"

(
    cd "$_clone_a3w"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# regression guard" > agents/rg.md
    git add agents/rg.md
    git commit -m "base: add agents/rg.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: ADD a new agent with only PATCH bump → under-bump WARN expected
    git checkout -b feat/s16-ac3a -q 2>/dev/null
    echo "# new regression-guard agent" > agents/rg2.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add agents/rg2.md .claude-plugin/
    git commit -m "feat: ADD rg2 with PATCH bump (under-bump regression)" -q 2>/dev/null
)

_run_hook "$_clone_a3w"
assert_nodecision "Suite16/AC-3a: under-bump WARN (ADD + PATCH) → still nodecision (no block)"
assert_stderr_contains "Suite16/AC-3a: under-bump WARN still emitted in stderr" "WARN"

# AC-3b regression: MODIFY agent + NO bump anywhere → hard-block still fires.
_bare_a3d=$(_new_tmp)
_clone_a3d=$(_new_tmp)
_make_repo "$_bare_a3d" "$_clone_a3d" "2.107.0"

(
    cd "$_clone_a3d"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# block agent" > agents/blk.md
    git add agents/blk.md
    git commit -m "base: add agents/blk.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    echo "# block agent — modified" > agents/blk.md
    git add agents/blk.md
    git commit -m "modify agents/blk.md (no bump anywhere — regression guard)" -q 2>/dev/null
)

_run_hook "$_clone_a3d"
assert_deny "Suite16/AC-3b: no bump anywhere → hard-block still fires (regression guard — guard is not toothless)"

# ---------------------------------------------------------------------------
# AC-12: worst-case under-bump — DELETE a distributed asset (MAJOR floor) with
# only a PATCH bump → still WARN, NEVER deny.
#
# This locks in the under-bump advisory-only contract as an explicit, tested
# case rather than an untested implicit gap: the widest possible floor/actual
# gap (MAJOR floor vs PATCH applied) must still resolve to nodecision with a
# WARN-level signal, on an ordinary feature branch. The bump-floor sub-stage
# (runBumpFloorSubstage) never denies on under-bump — only over-bump governance
# (Suite 16 above) can deny. See the accepted residual documented in
# 01-plan.md § Security Assessment (under-bump exposure) and § Adversarial
# Findings Remediation (A2): the level check stays advisory by design.
# ---------------------------------------------------------------------------
echo
echo "--- AC-12: feat branch + DELETE skills/qux/SKILL.md (MAJOR floor) + PATCH-only bump → WARN, never deny ---"

_bare_ac12=$(_new_tmp)
_clone_ac12=$(_new_tmp)
_make_repo "$_bare_ac12" "$_clone_ac12" "2.107.0"

(
    cd "$_clone_ac12"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p skills/qux
    echo "# SKILL" > skills/qux/SKILL.md
    git add skills/qux/
    git commit -m "base: add skills/qux/SKILL.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: DELETE the distributed asset (MAJOR floor via
    # sawRemovedOrRenamed) but bump only PATCH — the widest possible
    # under-bump gap.
    git checkout -b feat/ac12-worst-under-bump -q 2>/dev/null
    git rm skills/qux/SKILL.md -q 2>/dev/null
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "feat: delete skills/qux/SKILL.md (patch-only bump — worst-case under-bump)" -q 2>/dev/null
)

_run_hook "$_clone_ac12"

assert_nodecision "AC-12: DELETE (MAJOR floor) + PATCH-only bump → nodecision (never deny)"
assert_stderr_contains "AC-12: WARN present for worst-case under-bump" "WARN"
assert_stderr_contains "AC-12: WARN names MAJOR floor" "MAJOR"
assert_stderr_contains "AC-12: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# Suite 17: SEC-001 closure — third-site (CLAUDE.md §3) enforcement
#
# These cases close the gap between the guard's declared contract (three
# sites) and a two-site reality. Fixture discipline: origin/main must carry
# CLAUDE.md with the old version so that the guard can read _claude_origin
# and detect divergence.
# ---------------------------------------------------------------------------

echo
echo "=== Suite 17: SEC-001 — CLAUDE.md §3 third-site enforcement ==="

# ---------------------------------------------------------------------------
# SEC-001-A: feature branch bumps ONLY CLAUDE.md §3, leaves plugin.json and
# marketplace.json stale → DENY (missing mandatory three-site bump)
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-A: feature branch + bump ONLY CLAUDE.md §3, plugin/market stale → DENY ---"

_bare_s17a=$(_new_tmp)
_clone_s17a=$(_new_tmp)

git init --bare "$_bare_s17a" -q 2>/dev/null
git clone "$_bare_s17a" "$_clone_s17a" -q 2>/dev/null

(
    cd "$_clone_s17a"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    # CLAUDE.md §3 at origin/main: old version
    printf '**Current version:** `2.107.0`\n' > CLAUDE.md
    echo "# base agent" > agents/sec001.md
    git add .
    git commit -m "initial: version 2.107.0" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: modify shipped asset, bump ONLY CLAUDE.md §3
    # (plugin.json + marketplace.json unchanged — mandatory bump missing).
    echo "# base agent — updated" > agents/sec001.md
    printf '**Current version:** `2.108.0`\n' > CLAUDE.md
    git add agents/sec001.md CLAUDE.md
    git commit -m "feat: bump only CLAUDE.md §3, leaving plugin/market stale (should deny)" -q 2>/dev/null
)

_run_hook "$_clone_s17a"
assert_deny "SEC-001-A: bump only CLAUDE.md §3, plugin.json/marketplace.json stale → deny"

# ---------------------------------------------------------------------------
# SEC-001-B: feature branch with plugin.json + marketplace.json bumped+matching
# but CLAUDE.md §3 left stale (partial-bump) → DENY
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-B: feat branch + plugin.json + marketplace.json bumped but CLAUDE.md §3 stale → DENY ---"

_bare_s17b=$(_new_tmp)
_clone_s17b=$(_new_tmp)

git init --bare "$_bare_s17b" -q 2>/dev/null
git clone "$_bare_s17b" "$_clone_s17b" -q 2>/dev/null

(
    cd "$_clone_s17b"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    # CLAUDE.md §3 at origin/main: old version
    printf '**Current version:** `2.107.0`\n' > CLAUDE.md
    echo "# release agent" > agents/sec001b.md
    git add .
    git commit -m "initial: version 2.107.0" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: bump plugin.json + marketplace.json to 2.108.0,
    # MODIFY shipped asset, but leave CLAUDE.md §3 stale at 2.107.0.
    git checkout -b feat/sec001b -q 2>/dev/null
    echo "# release agent — updated" > agents/sec001b.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    # CLAUDE.md stays at 2.107.0 — stale, partial-bump should deny
    git add agents/sec001b.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
    git commit -m "feat: partial-bump (CLAUDE.md §3 stale)" -q 2>/dev/null
)

_run_hook "$_clone_s17b"
assert_deny "SEC-001-B: feature branch partial-bump (CLAUDE.md §3 stale) → deny"

# ---------------------------------------------------------------------------
# SEC-001-C: feature branch with all THREE sites bumped+matching → nodecision (ALLOW)
#
# This is the true three-site positive case: plugin.json, marketplace.json,
# AND CLAUDE.md §3 all set to 2.107.1 on an ordinary feature branch. This
# fixture seeds CLAUDE.md at origin/main to exercise the full three-site
# compare path (the AC-1-positive fixture above creates CLAUDE.md fresh, with
# no origin/main counterpart).
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-C: feat branch + all THREE sites bumped+matching → nodecision ---"

# Use a PATCH bump (2.107.0 → 2.107.1) to stay within the M-only (PATCH) floor
# and avoid the over-bump hard-deny.
_bare_s17c=$(_new_tmp)
_clone_s17c=$(_new_tmp)

git init --bare "$_bare_s17c" -q 2>/dev/null
git clone "$_bare_s17c" "$_clone_s17c" -q 2>/dev/null

(
    cd "$_clone_s17c"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    # CLAUDE.md §3 at origin/main: old version (seeded so the full compare runs)
    printf '**Current version:** `2.107.0`\n' > CLAUDE.md
    echo "# release agent" > agents/sec001c.md
    git add .
    git commit -m "initial: version 2.107.0" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: MODIFY shipped asset (M-only → PATCH floor) and bump ALL
    # THREE sites to 2.107.1 (PATCH bump = meets floor, no over-bump deny).
    git checkout -b feat/sec001c -q 2>/dev/null
    echo "# release agent — updated on feature branch" > agents/sec001c.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    printf '**Current version:** `2.107.1`\n' > CLAUDE.md
    git add .
    git commit -m "feat: bump all three version sites (PATCH)" -q 2>/dev/null
)

_run_hook "$_clone_s17c"
assert_nodecision "SEC-001-C: feat/sec001c + all three sites bumped+matching → nodecision (ALLOW)"

# ---------------------------------------------------------------------------
# AC-7 structural check: --name-status in the git invocation; every git show
# call carries the MSYS_NO_PATHCONV Windows git-bash guard. Checked against
# the TS entry (hooks/ts/entry/prepublish-guard.cc.ts) — the single source of
# these invariants post-cutover; the retired Bash source these checks used to
# grep no longer exists. Also verifies the retired symbols/methods are gone.
# ---------------------------------------------------------------------------
_TS_ENTRY="$REPO_ROOT/hooks/ts/entry/prepublish-guard.cc.ts"
_TS_OPENCODE_ENTRY="$REPO_ROOT/hooks/ts/entry/prepublish-guard.opencode.ts"
_TS_BODY="$REPO_ROOT/hooks/ts/bodies/prepublish-guard.ts"

echo
echo "--- AC-7: retired symbols/methods are gone from the source (not commented out) ---"

_retired_pattern='RELEASE_BRANCH_RE|resolveBranch|BranchInfo|RELEASE_CUT_|resolveReleaseCut|ReleaseCutSignal|FRAGMENT_RE|MARKER_RE|hasFragmentOrMarker|runFeaturePath'
if grep -Eq "$_retired_pattern" "$_TS_BODY" 2>/dev/null; then
    fail "AC-7: retired symbols" "one or more retired symbols still present in $_TS_BODY"
else
    pass "AC-7: no retired branch/marker/trailer symbols in the body"
fi

if grep -q 'gitCurrentBranch' "$_TS_BODY" "$_TS_ENTRY" "$_TS_OPENCODE_ENTRY" 2>/dev/null; then
    fail "AC-7: gitCurrentBranch" "gitCurrentBranch still present in body or entry modules"
else
    pass "AC-7: gitCurrentBranch removed from body and both entry modules"
fi

echo
echo "--- AC-8: --name-status and MSYS_NO_PATHCONV structural guard ---"

if grep -q -- '--name-status' "$_TS_ENTRY" 2>/dev/null; then
    pass "AC-8: hook uses --name-status diff"
else
    fail "AC-8: --name-status diff" "hook does not use --name-status"
fi

# Every git show/diff invocation must set MSYS_NO_PATHCONV=1 (Windows git-bash
# guard). The TS entry sets it once via execFileSync's env option per call —
# assert the token appears at least once per git invocation site.
_git_calls=$(grep -c 'execFileSync("git"' "$_TS_ENTRY" 2>/dev/null || echo 0)
_msys_guards=$(grep -c 'MSYS_NO_PATHCONV' "$_TS_ENTRY" 2>/dev/null || echo 0)
if [ "$_msys_guards" -ge "$_git_calls" ] && [ "$_git_calls" -gt 0 ]; then
    pass "AC-8: all $_git_calls git invocation(s) carry MSYS_NO_PATHCONV=1 ($_msys_guards guard(s) found)"
else
    fail "AC-8: MSYS guard" "found $_git_calls git invocation(s) but only $_msys_guards MSYS_NO_PATHCONV guard(s)"
fi

# AC-6/AC-8 structural: no 'ask' token anywhere in the TS body or entry — the
# block-on-condition / open-on-fault contract never emits ask.
_ask_in_floor=$(grep -h '"ask"' "$_TS_BODY" "$_TS_ENTRY" 2>/dev/null || true)
if [ -z "$_ask_in_floor" ]; then
    pass "AC-6/AC-8: no 'ask' permissionDecision anywhere in the TS source"
else
    fail "AC-6/AC-8: ask token" "TS source contains 'ask' decision: $_ask_in_floor"
fi

# ---------------------------------------------------------------------------
# Suite 18: Worktree-scope fix — guard reads payload cwd, not process CWD
#
# Each test sets up two git repos: a "session root" (dirty/wrong tree, B) and
# a "clean worktree" (A). The hook runs with its PROCESS CWD pointing at B,
# but the payload carries cwd pointing at A. After the fix the guard must
# evaluate A, not B.
#
# NEW-1: clean worktree A passes even when B strays a shipped-asset with no bump
# NEW-2: clean worktree A passes even when B strays a mismatched version bump
# NEW-3: a real bump-floor violation IN A (universal path) still denies — floor not weakened
# NEW-4: empty/omitted cwd → backward-compat (falls back to process CWD)
# NEW-5: control-char cwd → SEC-DR-A reject, fail-open, no deny
# NEW-6: non-existent cwd dir → fail-open, no deny
# ---------------------------------------------------------------------------
echo
echo "=== Suite 18: worktree-scope (guard reads payload cwd, not process CWD) ==="

# ---------------------------------------------------------------------------
# NEW-1: clean worktree A passes even when session-root B is dirty
#         (shipped asset changed in B but no version bump anywhere)
#
# Without the fix: hook inspects B → sees shipped-asset change with no bump
# → deny. With the fix: hook inspects A → no shipped-asset change → nodecision.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-1: clean worktree A passes even when B strays shipped-asset with no bump ---"

# Build A: clean worktree — no shipped-asset changes vs origin/main
_bare_n1a=$(_new_tmp)
_clone_n1a=$(_new_tmp)
_make_repo "$_bare_n1a" "$_clone_n1a" "2.107.0"
(
    cd "$_clone_n1a"
    git config user.email "test@test.com"
    git config user.name "Test"
    # Add only a docs file — no shipped-asset change, no version bump
    mkdir -p docs
    echo "# notes" > docs/notes.md
    git add docs/notes.md
    git commit -m "docs: add notes.md (no asset, no bump)" -q 2>/dev/null
)

# Build B: session root — DIRTY: strays a shipped-asset change with no bump
_bare_n1b=$(_new_tmp)
_clone_n1b=$(_new_tmp)
_make_repo "$_bare_n1b" "$_clone_n1b" "2.107.0"
(
    cd "$_clone_n1b"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# base agent" > agents/dirty.md
    git add agents/dirty.md
    git commit -m "base: add agents/dirty.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Stray shipped-asset change with no version bump → would deny if evaluated
    echo "# dirty agent — modified" > agents/dirty.md
    git add agents/dirty.md
    git commit -m "feat: dirty shipped-asset change, no bump (should be bypassed by cwd)" -q 2>/dev/null
)

# Run: process CWD = B (dirty), payload cwd = A (clean)
_run_hook_from "$_clone_n1b" "$_clone_n1a"
assert_nodecision "NEW-1: process-CWD=B(dirty) payload-cwd=A(clean) → evaluates A → nodecision"

# ---------------------------------------------------------------------------
# NEW-2: clean worktree A passes even when session-root B strays a mismatched
#        version bump
#
# Without the fix: hook inspects B → sees plugin.json/marketplace.json bumped
# to DIFFERENT values on a shipped-asset change → mutual-mismatch deny. With
# the fix: hook inspects A → shipped asset change with all three sites
# bumped and matching → nodecision.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-2: clean worktree A passes even when B strays a mismatched version bump ---"

# Build A: clean feature branch — shipped-asset change with a valid,
# matching three-site bump (well-formed universal-path push).
_bare_n2a=$(_new_tmp)
_clone_n2a=$(_new_tmp)
_make_repo "$_bare_n2a" "$_clone_n2a" "2.107.0"
(
    cd "$_clone_n2a"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# n2 base agent" > agents/n2.md
    git add agents/n2.md
    git commit -m "base: add agents/n2.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    git checkout -b feat/new2-clean -q 2>/dev/null
    echo "# n2 agent — updated" > agents/n2.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: n2 agent update, all three sites bumped+matching (patch)" -q 2>/dev/null
)

# Build B: session root — DIRTY: shipped-asset change with plugin/market
# bumped to MISMATCHED values (would deny if evaluated).
_bare_n2b=$(_new_tmp)
_clone_n2b=$(_new_tmp)
_make_repo "$_bare_n2b" "$_clone_n2b" "2.107.0"
(
    cd "$_clone_n2b"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# b2 base agent" > agents/b2.md
    git add agents/b2.md
    git commit -m "base: add agents/b2.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Shipped-asset change + mismatched version bump → mutual-mismatch deny if evaluated
    echo "# b2 agent — modified" > agents/b2.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.109.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: b2 agent update, mismatched version sites (should be bypassed by cwd)" -q 2>/dev/null
)

# Run: process CWD = B (mismatched bump), payload cwd = A (clean)
_run_hook_from "$_clone_n2b" "$_clone_n2a"
assert_nodecision "NEW-2: process-CWD=B(mismatch) payload-cwd=A(clean) → evaluates A → nodecision"

# ---------------------------------------------------------------------------
# NEW-3: real bump-floor violation IN worktree A still denies — floor not weakened
#
# Payload cwd = A, and A itself has a universal-path over-bump violation.
# The guard must still deny → the floor is re-targeted, not bypassed.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-3: real bump-floor violation in worktree A still denies (floor not weakened) ---"

# Build A: feature branch with MINOR bump on a M-only (PATCH floor) diff → over-bump deny
_bare_n3a=$(_new_tmp)
_clone_n3a=$(_new_tmp)
_make_repo "$_bare_n3a" "$_clone_n3a" "2.107.0"
(
    cd "$_clone_n3a"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# n3 agent" > agents/n3.md
    git add agents/n3.md
    git commit -m "base: add agents/n3.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    git checkout -b feat/new3-violation -q 2>/dev/null
    # Modify only (M-only → PATCH floor) but apply MINOR bump (over-bump)
    echo "# n3 agent — updated" > agents/n3.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: modify agents/n3.md (minor bump on M-only — over-bump)" -q 2>/dev/null
)

# Build B: clean unrelated repo (process CWD should not matter here)
_bare_n3b=$(_new_tmp)
_clone_n3b=$(_new_tmp)
_make_repo "$_bare_n3b" "$_clone_n3b" "2.107.0"

# Run: process CWD = B (clean), payload cwd = A (has real violation)
_run_hook_from "$_clone_n3b" "$_clone_n3a"
assert_deny "NEW-3: payload-cwd=A(over-bump violation) → evaluates A → deny (floor not weakened)"

# ---------------------------------------------------------------------------
# NEW-4: empty/omitted cwd field → backward-compat (falls back to process CWD)
#
# Uses _push_payload (no cwd field) with process CWD on a clean branch.
# Existing suite tests (15-17) already cover this via _run_hook; here we
# verify explicitly that the worktree-scope block is a no-op when cwd is absent.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-4: empty/omitted cwd → backward-compat (evaluates process CWD) ---"

_bare_n4=$(_new_tmp)
_clone_n4=$(_new_tmp)
_make_repo "$_bare_n4" "$_clone_n4" "2.107.0"
(
    cd "$_clone_n4"
    git config user.email "test@test.com"
    git config user.name "Test"
    # Docs-only change: no shipped asset, no version bump → nodecision
    mkdir -p docs
    echo "# doc n4" > docs/n4.md
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "docs: n4.md (no asset, no bump)" -q 2>/dev/null
)

# Use _run_hook (no cwd in payload); process CWD = clean docs-only branch
_run_hook "$_clone_n4"
assert_nodecision "NEW-4: no cwd in payload → evaluates process CWD (backward-compat) → nodecision"

# ---------------------------------------------------------------------------
# NEW-5: control-char cwd → SEC-DR-A reject, fail-open, no deny
#
# The hook must reject a cwd containing a control character, skip the cd,
# emit a SEC-DR-A/control-char warning to stderr, and NOT deny on that basis.
# Process CWD is the clean repo from NEW-4, so the guard will pass (nodecision).
# ---------------------------------------------------------------------------
echo
echo "--- NEW-5: control-char cwd → SEC-DR-A reject, fail-open, no deny ---"

_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_n5=$(mktemp)
_tmperr_n5=$(mktemp)

# Inject a tab into the cwd value via JSON escape \t (single backslash + t in
# the JSON string). The JSON parser decodes \t to a real tab character (0x09),
# which is a control character. A literal tab byte in JSON is invalid and causes
# a parse failure (returning empty cwd), so we must use the JSON escape form so
# the parser extracts a real tab before the SEC-DR-A control-char guard fires.
# Note: bash single-quoting preserves \t as the two characters backslash + t,
# which is the correct JSON escape for a tab.
(cd "$_clone_n4" && printf '%s' \
    '{"tool_name":"Bash","cwd":"/tmp/clean\tdevil","tool_input":{"command":"git push origin HEAD"}}' \
    | _exec_hook >"$_tmpout_n5" 2>"$_tmperr_n5") || true
_HOOK_STDOUT=$(cat "$_tmpout_n5")
_HOOK_STDERR=$(cat "$_tmperr_n5")
rm -f "$_tmpout_n5" "$_tmperr_n5"

assert_nodecision "NEW-5: control-char cwd → rejected (SEC-DR-A), no deny (fail-open)"
assert_stderr_contains "NEW-5: SEC-DR-A warning in stderr" "control"

# ---------------------------------------------------------------------------
# NEW-6: non-existent cwd dir → fail-open, no deny
#
# When cwd is a syntactically valid string but points at a non-existent directory,
# the hook must skip the cd, emit a warning, and NOT deny. Process CWD is the
# clean repo from NEW-4 so the guard passes (nodecision) after skipping the cd.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-6: non-existent cwd dir → fail-open, no deny ---"

_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_n6=$(mktemp)
_tmperr_n6=$(mktemp)

_nonexistent_cwd="/tmp/nonexistent-worktree-guard-test-$$"
(cd "$_clone_n4" && printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"git push origin HEAD"}}' \
    "$_nonexistent_cwd" | _exec_hook >"$_tmpout_n6" 2>"$_tmperr_n6") || true
_HOOK_STDOUT=$(cat "$_tmpout_n6")
_HOOK_STDERR=$(cat "$_tmperr_n6")
rm -f "$_tmpout_n6" "$_tmperr_n6"

assert_nodecision "NEW-6: non-existent cwd → skipped, no deny (fail-open)"
assert_stderr_contains "NEW-6: non-existent-dir warning in stderr" "does not exist"

# ---------------------------------------------------------------------------
# Suite 19 (retired-mechanism regression guard): the release-cut marker
# (version.d/.release-cut) and the release-cut: commit trailer carried no
# meaning after the universal-path collapse — the guard no longer reads
# either signal. This is the deliberate inversion of the old Suite 19: under
# the retired model a malformed marker/trailer would hard-deny even when all
# three version sites were bumped and matching; under the universal model
# only the version sites and the bump floor matter, so the same push is
# nodecision.
# ---------------------------------------------------------------------------

echo
echo "=== Suite 19 (retired-mechanism regression guard): marker/trailer are inert ==="

_bare_m1=$(_new_tmp)
_clone_m1=$(_new_tmp)

git init --bare "$_bare_m1" -q 2>/dev/null
git clone "$_bare_m1" "$_clone_m1" -q 2>/dev/null

(
    cd "$_clone_m1"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    printf '**Current version:** `2.107.0`\n' > CLAUDE.md
    echo "# marker agent" > agents/marker-a.md
    git add .
    git commit -m "initial: version 2.107.0" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: modify shipped asset, bump all three sites, and write a
    # version.d/.release-cut file with MALFORMED (non-semver) content — under
    # the retired model this would have hard-denied regardless of the valid
    # three-site bump. The universal model never reads this file.
    git checkout -b feat/s19-retired-marker -q 2>/dev/null
    echo "# marker agent — updated" > agents/marker-a.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    printf '**Current version:** `2.107.1`\n' > CLAUDE.md
    mkdir -p version.d
    printf 'not-a-version\n' > version.d/.release-cut
    git add .
    git commit -m "feat: marker present with malformed content (should be inert now)" -q 2>/dev/null
)

# Also inject a malformed release-cut: trailer alongside the marker to prove
# both retired signals are inert.
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_m1=$(mktemp)
_tmperr_m1=$(mktemp)
(cd "$_clone_m1" && _push_payload \
    | GIT_COMMIT_MSG="release-cut: not-a-version" _exec_hook >"$_tmpout_m1" 2>"$_tmperr_m1") || true
_HOOK_STDOUT=$(cat "$_tmpout_m1")
_HOOK_STDERR=$(cat "$_tmperr_m1")
rm -f "$_tmpout_m1" "$_tmperr_m1"

assert_nodecision "Suite19 (retired): malformed marker + malformed trailer + valid three-site bump → nodecision (both signals inert)"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo
echo "============================================================"
echo "  prepublish-bump-floor: $PASS passed / $((PASS + FAIL)) total"
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
