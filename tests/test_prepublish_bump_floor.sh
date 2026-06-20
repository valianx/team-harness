#!/usr/bin/env bash
# tests/test_prepublish_bump_floor.sh
# Regression suite for the bump-floor advisory sub-stage of hooks/prepublish-guard.sh.
#
# Covers Check 1 git-state cases that test_prepublish_guard.sh explicitly skips —
# those require a real throwaway git repo with a resolvable origin/main ref and
# committed diffs.  Each case:
#   1. Creates a temp dir and inits a bare remote (origin).
#   2. Clones the remote → establishes origin/main at OLD_VER.
#   3. Makes a feature commit (add/modify/delete/rename under agents|skills|hooks|docs)
#      with NEW_VER set in .claude-plugin/plugin.json + marketplace.json.
#   4. Runs hooks/prepublish-guard.sh with a git-push payload from inside the clone.
#   5. Asserts stdout (nodecision = empty) and stderr (WARN present/absent).
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
HOOK="$REPO_ROOT/hooks/prepublish-guard.sh"

if [ ! -x "$HOOK" ]; then
    chmod +x "$HOOK"
fi

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

# Build a preToolUse Bash payload for git push
_push_payload() {
    printf '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}'
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
    (cd "$dir" && _push_payload | bash "$HOOK" >"$tmpout" 2>"$tmperr") || true
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
# ---------------------------------------------------------------------------
echo
echo "--- AC-1: ADD agents/foo.md + PATCH delta → MINOR WARN ---"

_bare1=$(_new_tmp)
_clone1=$(_new_tmp)
_make_repo "$_bare1" "$_clone1" "2.107.0"

(
    cd "$_clone1"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# new agent" > agents/foo.md
    # PATCH bump (2.107.0 → 2.107.1)
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "add agents/foo.md (patch bump)" -q 2>/dev/null
)

_run_hook "$_clone1"

assert_nodecision "AC-1: ADD agents/foo.md + PATCH delta — stdout empty"
assert_stderr_contains "AC-1: MINOR WARN present in stderr" "WARN"
assert_stderr_contains "AC-1: MINOR WARN mentions MINOR" "MINOR"
assert_stderr_contains "AC-1: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# AC-2: docs/ only touched + MINOR delta → over-bump WARN IS emitted; nodecision
#
# The hook now reads .claude-plugin/plugin.json at both origin/main and HEAD
# on the no-shipped-asset early-exit path and emits an advisory WARN when the
# version bump is >= MINOR. Push is not blocked (nodecision, stdout empty).
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
# Over-bump WARN IS now emitted on the no-shipped-asset path (moved from dead code).
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
# AC-3: MODIFY agents/bar.md + NO version change → DENY (hard block only, no floor WARN)
# ---------------------------------------------------------------------------
echo
echo "--- AC-3: MODIFY agents/bar.md + NO version bump → DENY; no double-message ---"

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
    # Now modify without bumping version
    echo "# existing agent — modified" > agents/bar.md
    git add agents/bar.md
    git commit -m "modify agents/bar.md (no bump)" -q 2>/dev/null
)

_run_hook "$_clone3"

assert_deny "AC-3: MODIFY without bump → hard block (deny)"
# The floor WARN must NOT fire — deny path exits before the floor sub-stage
assert_stderr_not_contains "AC-3: no floor WARN on deny path" "bump-floor"
assert_stderr_not_contains "AC-3: no double WARN message" "WARN"

# ---------------------------------------------------------------------------
# AC-4: DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN; nodecision
# ---------------------------------------------------------------------------
echo
echo "--- AC-4: DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN ---"

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
    # Delete the skill + MINOR bump
    git rm skills/baz/SKILL.md -q 2>/dev/null
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "delete skills/baz/SKILL.md (minor bump)" -q 2>/dev/null
)

_run_hook "$_clone4"

assert_nodecision "AC-4: DELETE + MINOR delta — stdout empty"
assert_stderr_contains "AC-4: MAJOR-candidate WARN present" "WARN"
assert_stderr_contains "AC-4: mentions MAJOR" "MAJOR"
assert_stderr_contains "AC-4: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# AC-5: MODIFY hooks/x.sh (M only) + PATCH delta → NO WARN; nodecision
# ---------------------------------------------------------------------------
echo
echo "--- AC-5: MODIFY hooks/x.sh + PATCH delta → NO WARN (actual meets floor) ---"

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
    # Modify only — PATCH bump
    echo "#!/bin/bash" > hooks/x.sh
    echo "# updated" >> hooks/x.sh
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "modify hooks/x.sh (patch bump)" -q 2>/dev/null
)

_run_hook "$_clone5"

assert_nodecision "AC-5: MODIFY hooks + PATCH delta — stdout empty"
assert_stderr_not_contains "AC-5: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# AC-7: NEW_VER not matching X.Y.Z → skip note in stderr; nodecision; never blocks
# ---------------------------------------------------------------------------
echo
echo "--- AC-7: non-X.Y.Z version → fail-open, skip note ---"

_bare7=$(_new_tmp)
_clone7=$(_new_tmp)
_make_repo "$_bare7" "$_clone7" "2.107.0"

(
    cd "$_clone7"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# agent" > agents/new.md
    # Non-standard version (pre-release)
    _write_plugin_json "2.108.0-alpha.1" .claude-plugin/plugin.json
    _write_market_json "2.108.0-alpha.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "add agent with pre-release version" -q 2>/dev/null
)

_run_hook "$_clone7"

assert_nodecision "AC-7: non-X.Y.Z version → nodecision (fail-open)"
assert_stderr_contains "AC-7: skip note in stderr mentions version" "skipping bump-floor check"

# ---------------------------------------------------------------------------
# Correct case: ADD agents/new.md + MINOR delta → NO WARN (actual meets floor)
# ---------------------------------------------------------------------------
echo
echo "--- Correct case: ADD agents/new.md + MINOR delta → NO WARN ---"

_barec=$(_new_tmp)
_clonec=$(_new_tmp)
_make_repo "$_barec" "$_clonec" "2.107.0"

(
    cd "$_clonec"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# new agent" > agents/new.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "add agents/new.md (minor bump)" -q 2>/dev/null
)

_run_hook "$_clonec"

assert_nodecision "correct: ADD + MINOR delta — stdout empty"
assert_stderr_not_contains "correct: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# Over-bump-not-fired control: docs/ only + PATCH → NO over-bump WARN
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
    # PATCH bump — below the MINOR threshold for over-bump
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "docs only (patch bump)" -q 2>/dev/null
)

_run_hook "$_cloneo"

assert_nodecision "control: docs/ + PATCH — stdout empty"
assert_stderr_not_contains "control: no over-bump WARN for PATCH" "WARN"

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Suite 16 (new cases) — over-bump hard-deny + bump-override escape-hatch
# Functional tests for AC-1..AC-3 (#383 over-bump governance).
#
# Token injection: the hook reads the override token from:
#   1. GIT_COMMIT_MSG environment variable (commit trailer)
#   2. GIT_PUSH_OPTION_COUNT / GIT_PUSH_OPTION_N (push options)
# Both sources are tested below via env-var injection in the run_hook helper.
# ---------------------------------------------------------------------------
echo
echo "--- Suite 16 (AC-1/#383): over-bump DENY — MINOR applied on M-only/PATCH-floor diff, no override ---"

# Scenario: MODIFY agents/bar.md only (M-only) → PATCH floor.
# Applied bump: MINOR (2.107.0 → 2.108.0) → exceeds floor → deny.
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
    # Modify only (M-only → PATCH floor) but apply MINOR bump (over-bump)
    echo "# existing agent — updated" > agents/existing.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "modify agents/existing.md (minor bump — over-bump)" -q 2>/dev/null
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
    # M-only → PATCH floor, apply MINOR (over-bump), but provide valid override token
    echo "# agent two — updated" > agents/two.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "modify agents/two.md (minor bump)" -q 2>/dev/null
)

# Inject the valid override token via GIT_COMMIT_MSG
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2=$(mktemp)
_tmperr_a2=$(mktemp)
(cd "$_clone_a2" && _push_payload | GIT_COMMIT_MSG="bump-override: minor — fix + surface in same PR" bash "$HOOK" >"$_tmpout_a2" 2>"$_tmperr_a2") || true
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
    echo "#!/bin/bash # updated" > hooks/myhook.sh
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "modify hooks/myhook.sh (minor bump)" -q 2>/dev/null
)

# Inject the valid override token via GIT_PUSH_OPTION_*
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2p=$(mktemp)
_tmperr_a2p=$(mktemp)
(cd "$_clone_a2p" && _push_payload \
    | GIT_PUSH_OPTION_COUNT=1 \
      GIT_PUSH_OPTION_0="bump-override: minor — hotfix + new hook surface in same PR" \
      bash "$HOOK" >"$_tmpout_a2p" 2>"$_tmperr_a2p") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2p")
_HOOK_STDERR=$(cat "$_tmperr_a2p")
rm -f "$_tmpout_a2p" "$_tmperr_a2p"
assert_nodecision "Suite16/AC-2b: over-bump WITH valid bump-override (GIT_PUSH_OPTION_0) → nodecision"

echo
echo "--- Suite 16 (AC-2/#383 guard): override token containing control chars → rejected → deny ---"

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
    # M-only → PATCH floor, apply MINOR (over-bump)
    echo "# ctrl agent — updated" > agents/ctrl.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "modify agents/ctrl.md (minor bump)" -q 2>/dev/null
)

# Inject an override token containing a control character (tab = \x09).
# SEC-DR-A: control chars must be rejected → override is treated as absent → deny.
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2c=$(mktemp)
_tmperr_a2c=$(mktemp)
_ctrl_token=$(printf 'bump-override: minor \t— malicious payload')
(cd "$_clone_a2c" && _push_payload \
    | GIT_COMMIT_MSG="$_ctrl_token" bash "$HOOK" >"$_tmpout_a2c" 2>"$_tmperr_a2c") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2c")
_HOOK_STDERR=$(cat "$_tmperr_a2c")
rm -f "$_tmpout_a2c" "$_tmperr_a2c"
assert_deny "Suite16/AC-2c: control-char override token rejected → falls through to deny"

echo
echo "--- Suite 16 (AC-3/#383 regression): under-bump WARN still emitted; no-bump hard-block still fires ---"

# AC-3 regression (a): ADD agents/new.md + PATCH delta → MINOR WARN still present (existing AC-1 case).
# This is already covered by the existing AC-1 fixture in Suite 15. Verify the
# WARN text is present in stderr of _HOOK_STDERR from the Suite-15 AC-1 run, which
# is still in scope here.
# Re-use a fresh fixture to be self-contained and order-independent.
_bare_a3w=$(_new_tmp)
_clone_a3w=$(_new_tmp)
_make_repo "$_bare_a3w" "$_clone_a3w" "2.107.0"

(
    cd "$_clone_a3w"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# regression guard" > agents/rg.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "add agents/rg.md (patch bump — under-bump)" -q 2>/dev/null
)

_run_hook "$_clone_a3w"
assert_nodecision "Suite16/AC-3a: under-bump WARN (ADD + PATCH) → still nodecision (no block)"
assert_stderr_contains "Suite16/AC-3a: under-bump WARN still emitted in stderr" "WARN"

# AC-3 regression (b): MODIFY agent + NO version bump → hard-block still fires.
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
    git commit -m "modify agents/blk.md (no bump — regression guard)" -q 2>/dev/null
)

_run_hook "$_clone_a3d"
assert_deny "Suite16/AC-3b: no-bump hard-block still fires (regression guard)"

# AC-8 structural check: --name-status in hook; no new git show without MSYS guard
# ---------------------------------------------------------------------------
echo
echo "--- AC-8: --name-status and MSYS_NO_PATHCONV structural guard ---"

if grep -q -- '--name-status' "$HOOK" 2>/dev/null; then
    pass "AC-8: hook uses --name-status diff"
else
    fail "AC-8: --name-status diff" "hook does not use --name-status"
fi

# Any git show call must have MSYS_NO_PATHCONV=1 prefix (Windows git-bash guard).
# Extract non-comment, non-blank lines with 'git show' and verify they all carry the prefix.
_git_show_lines=$(grep 'git show' "$HOOK" 2>/dev/null \
    | grep -v '^[[:space:]]*#' \
    | grep -v '^[[:space:]]*$' || true)
_unguarded=$(printf '%s\n' "$_git_show_lines" | grep -v 'MSYS_NO_PATHCONV=1' || true)
if [ -z "$_unguarded" ]; then
    pass "AC-8: all git show calls carry MSYS_NO_PATHCONV=1"
else
    fail "AC-8: MSYS guard" "found git show without MSYS_NO_PATHCONV=1: $_unguarded"
fi

# AC-6 structural: no 'ask' token introduced in floor branches
_ask_in_floor=$(sed -n '/Bump-floor sub-stage/,/nodecision$/p' "$HOOK" 2>/dev/null | grep '"ask"' || true)
if [ -z "$_ask_in_floor" ]; then
    pass "AC-6/AC-8: no 'ask' permissionDecision in floor sub-stage"
else
    fail "AC-6/AC-8: ask token" "floor sub-stage contains 'ask' decision: $_ask_in_floor"
fi

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
