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
# Under the release-time model, version bumps only happen on release/vX.Y.Z branches.
# This test uses a release branch so the bump-floor sub-stage runs.
# ---------------------------------------------------------------------------
echo
echo "--- AC-1: release/v2.107.1 + ADD agents/foo.md + PATCH delta → MINOR WARN ---"

_bare1=$(_new_tmp)
_clone1=$(_new_tmp)
_make_repo "$_bare1" "$_clone1" "2.107.0"

(
    cd "$_clone1"
    git config user.email "test@test.com"
    git config user.name "Test"
    # Switch to release branch before making the release commit
    git checkout -b release/v2.107.1 -q 2>/dev/null
    mkdir -p agents
    echo "# new agent" > agents/foo.md
    # PATCH bump (2.107.0 → 2.107.1) — under-bump for ADD (minor floor)
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.107.1 — add agents/foo.md (patch bump, under-bump for ADD)" -q 2>/dev/null
)

_run_hook "$_clone1"

assert_nodecision "AC-1: release/v2.107.1 + ADD agents/foo.md + PATCH delta — stdout empty"
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
# AC-3 (new model): MODIFY agents/bar.md + NO version bump + NO fragment/marker → DENY
#
# Under the release-time model the deny reason changed: "no bump" → "no fragment or marker".
# The test still expects a deny (the direction is the same).
# ---------------------------------------------------------------------------
echo
echo "--- AC-3: MODIFY agents/bar.md + NO bump + NO fragment/marker → DENY ---"

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
    # Modify shipped asset without a bump AND without a changelog.d/ or version.d/ marker
    echo "# existing agent — modified" > agents/bar.md
    git add agents/bar.md
    git commit -m "modify agents/bar.md (no bump, no fragment)" -q 2>/dev/null
)

_run_hook "$_clone3"

assert_deny "AC-3: MODIFY without bump and without fragment/marker → deny"
assert_stderr_not_contains "AC-3: no WARN on feature-path deny" "WARN"

# ---------------------------------------------------------------------------
# AC-5 (new): MODIFY agents + changelog.d/ fragment + NO bump → nodecision (ALLOW)
#
# Feature push that touches shipped assets AND carries a changelog.d/ fragment
# but does NOT bump any version site → guard must allow (nodecision).
# This is the primary new positive case introduced by the release-time model.
# ---------------------------------------------------------------------------
echo
echo "--- AC-5 (new model): MODIFY agents + changelog.d/ fragment + NO bump → nodecision ---"

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
    # Modify shipped asset, write a changelog.d/ fragment, do NOT bump version
    echo "# feature agent — updated" > agents/feature.md
    mkdir -p changelog.d
    printf '### Changed\n- Updated feature agent behavior\n' > changelog.d/feat-feature-agent.md
    git add agents/feature.md changelog.d/feat-feature-agent.md
    git commit -m "feat: update feature agent (deferred bump via changelog.d/)" -q 2>/dev/null
)

_run_hook "$_clone_ac5"

assert_nodecision "AC-5: MODIFY + changelog.d/ fragment + no bump → nodecision (feature-mode allow)"

# ---------------------------------------------------------------------------
# AC-5 variant: MODIFY agents + version.d/ marker + NO bump → nodecision (ALLOW)
#
# Feature push with a version.d/ marker (for internal bumps with no changelog entry).
# ---------------------------------------------------------------------------
echo
echo "--- AC-5 variant: MODIFY agents + version.d/ marker + NO bump → nodecision ---"

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
    # Internal refactor: shipped asset touched, version.d/ marker written, no changelog.d/
    echo "# internal agent — refactored" > agents/internal.md
    mkdir -p version.d
    printf 'patch\n' > version.d/refactor-internal-agent.bump
    git add agents/internal.md version.d/refactor-internal-agent.bump
    git commit -m "refactor: internal agent (version.d/ marker; no changelog)" -q 2>/dev/null
)

_run_hook "$_clone_ac5m"

assert_nodecision "AC-5 variant: MODIFY + version.d/ marker + no bump → nodecision (feature-mode allow)"

# ---------------------------------------------------------------------------
# AC-6 (stray-bump deny): feature branch + shipped asset + stray bump → DENY
#
# A feature branch must NOT bump any version site (single-bump invariant).
# Stray bump detected → deny regardless of fragment presence.
# ---------------------------------------------------------------------------
echo
echo "--- AC-6 (stray-bump deny): feature branch + stray bump → DENY ---"

_bare_ac6s=$(_new_tmp)
_clone_ac6s=$(_new_tmp)
_make_repo "$_bare_ac6s" "$_clone_ac6s" "2.107.0"

(
    cd "$_clone_ac6s"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# stray agent" > agents/stray.md
    git add agents/stray.md
    git commit -m "base: add agents/stray.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Feature branch: modify shipped asset AND stray-bump (single-bump invariant violation)
    echo "# stray agent — modified" > agents/stray.md
    mkdir -p changelog.d
    printf '### Changed\n- Updated stray agent\n' > changelog.d/feat-stray.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "feat: stray-bump on feature branch (should be denied)" -q 2>/dev/null
)

_run_hook "$_clone_ac6s"

assert_deny "AC-6 stray-bump: feature branch with version bump → deny (single-bump invariant)"

# ---------------------------------------------------------------------------
# AC-7 (release path positive): release/vX.Y.Z branch + all-three bumped + matching → nodecision
#
# A release branch with all three version sites bumped and matching the branch
# version must be allowed (nodecision) on the release path.
# ---------------------------------------------------------------------------
echo
echo "--- AC-7 (release path positive): release/v2.108.0 + all-three bumped → nodecision ---"

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
    # Switch to a release branch and bump all three sites to 2.108.0
    git checkout -b release/v2.108.0 -q 2>/dev/null
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    # CLAUDE.md §3 simulation: create a minimal CLAUDE.md with a version line
    printf '**Current version:** `2.108.0`\n' > CLAUDE.md
    git add .
    git commit -m "release: v2.108.0 — bump all three version sites" -q 2>/dev/null
)

_run_hook "$_clone_ac7p"

assert_nodecision "AC-7 release-positive: release/v2.108.0 + all-three bumped → nodecision"

# ---------------------------------------------------------------------------
# AC-7 (partial-bump deny): release/vX.Y.Z branch + only plugin.json bumped → DENY
# ---------------------------------------------------------------------------
echo
echo "--- AC-7 (partial-bump deny): release/v2.108.0 + only plugin.json bumped → DENY ---"

_bare_ac7d=$(_new_tmp)
_clone_ac7d=$(_new_tmp)
# Seed agents/partial.md in origin/main so the release branch can MODIFY it
# (a file pushed to origin/main before branching does not appear in origin/main...HEAD
# unless it is changed on the branch — the fixture must modify it on the release branch).
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
    # Release branch: MODIFY the shipped asset, bump plugin.json but NOT marketplace.json
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# partial agent — modified on release branch" > agents/partial.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    # marketplace.json stays at 2.107.0 (partial bump — should deny)
    git add agents/partial.md .claude-plugin/plugin.json
    git commit -m "release: v2.108.0 — only plugin.json bumped (partial, should deny)" -q 2>/dev/null
)

_run_hook "$_clone_ac7d"

assert_deny "AC-7 partial-bump: release branch with only plugin.json bumped → deny"

# ---------------------------------------------------------------------------
# AC-7 (version-mismatch deny): release/v2.109.0 branch + bumped to 2.108.0 → DENY
# ---------------------------------------------------------------------------
echo
echo "--- AC-7 (version-mismatch deny): release/v2.109.0 branch + version 2.108.0 → DENY ---"

_bare_ac7mm=$(_new_tmp)
_clone_ac7mm=$(_new_tmp)
# Seed agents/mismatch.md in origin/main alongside version files, then MODIFY on branch.
git init --bare "$_bare_ac7mm" -q 2>/dev/null
git clone "$_bare_ac7mm" "$_clone_ac7mm" -q 2>/dev/null
(
    cd "$_clone_ac7mm"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p .claude-plugin agents
    _write_plugin_json "2.107.0" .claude-plugin/plugin.json
    _write_market_json "2.107.0" .claude-plugin/marketplace.json
    echo "# mismatch agent" > agents/mismatch.md
    git add .
    git commit -m "initial: version 2.107.0 + mismatch agent" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Release branch v2.109.0: MODIFY shipped asset AND bump both sites, but to 2.108.0 not 2.109.0
    git checkout -b release/v2.109.0 -q 2>/dev/null
    echo "# mismatch agent — modified on release branch" > agents/mismatch.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: mismatched version (branch v2.109.0 but files 2.108.0)" -q 2>/dev/null
)

_run_hook "$_clone_ac7mm"

assert_deny "AC-7 version-mismatch: release branch version != file versions → deny"

# ---------------------------------------------------------------------------
# AC-4: DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN; nodecision
#
# Uses a release branch so the bump-floor sub-stage runs (version bumps are
# only allowed on release/vX.Y.Z branches in the release-time model).
# ---------------------------------------------------------------------------
echo
echo "--- AC-4: release/v2.108.0 + DELETE skills/baz/SKILL.md + MINOR delta → MAJOR-candidate WARN ---"

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
    # Release branch: delete the skill + MINOR bump (under-bump for DELETE, major floor)
    git checkout -b release/v2.108.0 -q 2>/dev/null
    git rm skills/baz/SKILL.md -q 2>/dev/null
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "release: v2.108.0 — delete skills/baz/SKILL.md (minor bump — under-bump for DELETE)" -q 2>/dev/null
)

_run_hook "$_clone4"

assert_nodecision "AC-4: release/v2.108.0 + DELETE + MINOR delta — stdout empty"
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
echo "--- AC-4b (#6): release/v2.108.0 + RENAME agents/rn.md -> docs/rn.md + MINOR delta → MAJOR-candidate WARN ---"

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
    # Release branch: rename the shipped asset OUT of agents/ into docs/
    # (non-shipped) + MINOR bump (under-bump for a removed public surface).
    git checkout -b release/v2.108.0 -q 2>/dev/null
    mkdir -p docs
    git mv agents/rn.md docs/rn.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "release: v2.108.0 — rename agents/rn.md to docs/rn.md (minor bump — under-bump for RENAME-OUT)" -q 2>/dev/null
)

_run_hook "$_clone4b"

assert_nodecision "AC-4b: release/v2.108.0 + RENAME shipped->non-shipped + MINOR delta — stdout empty"
assert_stderr_contains "AC-4b: MAJOR-candidate WARN present" "WARN"
assert_stderr_contains "AC-4b: mentions MAJOR" "MAJOR"
assert_stderr_contains "AC-4b: advisory note present" "advisory"

# ---------------------------------------------------------------------------
# Suite 15 AC-5: MODIFY hooks/x.sh (M only) + PATCH delta → NO WARN; nodecision
#
# Uses a release branch — version bumps only on release/vX.Y.Z in the new model.
# Note: this is Suite 15 AC-5 (hooks modify, patch bump); the new feature-mode
# positive case for "no bump + fragment → nodecision" is AC-5 (new model) above.
# ---------------------------------------------------------------------------
echo
echo "--- Suite15/AC-5: release/v2.107.1 + MODIFY hooks/x.sh + PATCH delta → NO WARN ---"

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
    # Release branch: modify only — PATCH bump (meets floor)
    git checkout -b release/v2.107.1 -q 2>/dev/null
    echo "#!/bin/bash" > hooks/x.sh
    echo "# updated" >> hooks/x.sh
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.107.1 — modify hooks/x.sh (patch bump)" -q 2>/dev/null
)

_run_hook "$_clone5"

assert_nodecision "Suite15/AC-5: release/v2.107.1 + MODIFY hooks + PATCH delta — stdout empty"
assert_stderr_not_contains "Suite15/AC-5: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# Suite15/AC-7: release path + OLD version was non-X.Y.Z → semver_delta unknown → fail-open
#
# semver_delta(non-X.Y.Z-old, X.Y.Z-new) returns "unknown" → bump-floor compare
# is skipped → nodecision (fail-open). Uses a release branch where the HEAD
# version matches the branch name (passes the version-mismatch check) but the
# OLD version at origin/main was non-standard.
# ---------------------------------------------------------------------------
echo
echo "--- Suite15/AC-7: release/v2.108.0 + old version non-X.Y.Z at origin → fail-open, skip note ---"

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

    # Release branch: bump to X.Y.Z (matches branch name)
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# agent — updated" > agents/new.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — old version was non-X.Y.Z" -q 2>/dev/null
)

_run_hook "$_clone7"

assert_nodecision "Suite15/AC-7: release path + old-version non-X.Y.Z → semver_delta=unknown → nodecision (fail-open)"
assert_stderr_contains "Suite15/AC-7: skip note in stderr mentions version" "skipping bump-floor check"

# ---------------------------------------------------------------------------
# Correct case: release/v2.108.0 + ADD agents/new.md + MINOR delta → NO WARN
#
# Release-path correct case: ADD a new agent with MINOR bump (meets floor).
# ---------------------------------------------------------------------------
echo
echo "--- Correct case: release/v2.108.0 + ADD agents/new.md + MINOR delta → NO WARN ---"

_barec=$(_new_tmp)
_clonec=$(_new_tmp)
_make_repo "$_barec" "$_clonec" "2.107.0"

(
    cd "$_clonec"
    git config user.email "test@test.com"
    git config user.name "Test"
    # Release branch
    git checkout -b release/v2.108.0 -q 2>/dev/null
    mkdir -p agents
    echo "# new agent" > agents/new.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — add agents/new.md (minor bump)" -q 2>/dev/null
)

_run_hook "$_clonec"

assert_nodecision "correct: release/v2.108.0 + ADD + MINOR delta — stdout empty"
assert_stderr_not_contains "correct: no WARN when actual meets floor" "WARN"

# ---------------------------------------------------------------------------
# Over-bump-not-fired control: docs/ only + PATCH → NO over-bump WARN
# (no-shipped-asset early-exit path; unaffected by the release-time model)
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
echo "--- Suite 16 (AC-1/#383): over-bump DENY — release path + MINOR applied on M-only/PATCH-floor diff, no override ---"

# Scenario: release/v2.108.0 branch, MODIFY agents/existing.md only (M-only) → PATCH floor.
# Applied bump: MINOR (2.107.0 → 2.108.0) → exceeds floor → deny (no bump-override token).
# Note: on a feature branch this would deny because of stray-bump; on a release branch
# it reaches the bump-floor sub-stage and denies because of over-bump.
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
    # Release branch: Modify only (M-only → PATCH floor) but apply MINOR bump (over-bump)
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# existing agent — updated" > agents/existing.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — modify agents/existing.md (minor bump — over-bump, no override)" -q 2>/dev/null
)

_run_hook "$_clone_a1"
assert_deny "Suite16/AC-1: release-path MINOR applied on M-only (PATCH floor) without override → deny"

echo
echo "--- Suite 16 (AC-2/#383): over-bump ALLOWED on release path — valid bump-override token via GIT_COMMIT_MSG ---"
echo "    (bump-override is only evaluated on the release/vX.Y.Z path; feature branches deny on stray-bump)"

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
    # Release branch: M-only → PATCH floor, apply MINOR (over-bump on release path),
    # bump-override token will suppress the over-bump deny on the release path.
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# agent two — updated" > agents/two.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — modify agents/two.md (minor bump on M-only/PATCH floor)" -q 2>/dev/null
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
assert_nodecision "Suite16/AC-2a: release-path over-bump WITH valid bump-override (GIT_COMMIT_MSG) → nodecision"

echo
echo "--- Suite 16 (AC-2/#383): over-bump ALLOWED on release path — valid bump-override token via GIT_PUSH_OPTION_* ---"

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
    # Release branch: M-only → PATCH floor, apply MINOR (over-bump), provide override via push option
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "#!/bin/bash # updated" > hooks/myhook.sh
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — modify hooks/myhook.sh (minor bump on M-only/PATCH floor)" -q 2>/dev/null
)

# Inject the valid override token via GIT_PUSH_OPTION_*
_HOOK_STDOUT=""
_HOOK_STDERR=""
_tmpout_a2p=$(mktemp)
_tmperr_a2p=$(mktemp)
(cd "$_clone_a2p" && _push_payload \
    | GIT_PUSH_OPTION_COUNT=1 \
      GIT_PUSH_OPTION_0="bump-override: minor — hotfix + new hook surface in same release PR" \
      _exec_hook >"$_tmpout_a2p" 2>"$_tmperr_a2p") || true
_HOOK_STDOUT=$(cat "$_tmpout_a2p")
_HOOK_STDERR=$(cat "$_tmperr_a2p")
rm -f "$_tmpout_a2p" "$_tmperr_a2p"
assert_nodecision "Suite16/AC-2b: release-path over-bump WITH valid bump-override (GIT_PUSH_OPTION_0) → nodecision"

echo
echo "--- Suite 16 (AC-2/#383 guard): release path + control-char override token → rejected → deny ---"

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
    # Release branch: M-only → PATCH floor, apply MINOR (over-bump); control-char token is rejected
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# ctrl agent — updated" > agents/ctrl.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — modify agents/ctrl.md (minor bump, over-bump)" -q 2>/dev/null
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
assert_deny "Suite16/AC-2c: release-path control-char override token rejected → falls through to over-bump deny"

echo
echo "--- Suite 16 (AC-3/#383 regression): under-bump WARN still emitted (release path); feature-path deny still fires ---"

# AC-3 regression (a): on the release path, ADD agents/new.md + PATCH delta → MINOR WARN still present.
# Release branch (release/vX.Y.Z) with all-three bumped and matching, but ADD (minor floor) with PATCH
# applied → UNDER-BUMP WARN emitted. Verifies the bump-floor sub-stage still runs on the release path.
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
    # Release branch: ADD a new agent with only PATCH bump → under-bump WARN expected
    git checkout -b release/v2.107.1 -q 2>/dev/null
    echo "# new regression-guard agent" > agents/rg2.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    git add agents/rg2.md .claude-plugin/
    git commit -m "release: v2.107.1 — ADD rg2 with PATCH bump (under-bump regression)" -q 2>/dev/null
)

_run_hook "$_clone_a3w"
assert_nodecision "Suite16/AC-3a: release-path under-bump WARN (ADD + PATCH) → still nodecision (no block)"
assert_stderr_contains "Suite16/AC-3a: under-bump WARN still emitted in stderr (release path)" "WARN"

# AC-3b regression: MODIFY agent + NO bump + NO fragment/marker → hard-block still fires (feature path).
# Under the new model the deny fires because of missing fragment/marker (not missing bump).
# The test still asserts deny — the direction is the same. Guard is not toothless.
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
    git commit -m "modify agents/blk.md (no bump, no fragment — regression guard)" -q 2>/dev/null
)

_run_hook "$_clone_a3d"
assert_deny "Suite16/AC-3b: no fragment + no marker hard-block still fires (regression guard — guard is not toothless)"

# ---------------------------------------------------------------------------
# Suite 17: SEC-001 closure — third-site (CLAUDE.md §3) enforcement
#
# These cases were missing before SEC-001 was fixed. They close the gap between
# the guard's declared contract (three sites) and its prior two-site reality.
#
# Fixture discipline: origin/main must carry CLAUDE.md with the old version so
# that the guard can read _claude_origin and detect divergence. The release-path
# cases also commit agents/ + manifests together in origin/main before branching
# (following the AC-7 partial/mismatch pattern established by the tester).
# ---------------------------------------------------------------------------

echo
echo "=== Suite 17: SEC-001 — CLAUDE.md §3 third-site enforcement ==="

# ---------------------------------------------------------------------------
# SEC-001-A: feature branch that stray-bumps ONLY CLAUDE.md §3 → DENY
#
# plugin.json and marketplace.json are unchanged vs origin/main.
# Only CLAUDE.md §3 is bumped on the feature branch.
# The single-bump invariant must catch this → deny.
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-A: feature branch + stray-bump ONLY on CLAUDE.md §3 → DENY ---"

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
    # Feature branch: modify shipped asset + carry a changelog.d/ fragment,
    # but stray-bump ONLY CLAUDE.md §3 (plugin.json + marketplace.json unchanged).
    echo "# base agent — updated" > agents/sec001.md
    mkdir -p changelog.d
    printf '### Changed\n- Updated sec001 agent\n' > changelog.d/feat-sec001.md
    printf '**Current version:** `2.108.0`\n' > CLAUDE.md
    git add agents/sec001.md changelog.d/feat-sec001.md CLAUDE.md
    git commit -m "feat: stray-bump only CLAUDE.md §3 on feature branch (should deny)" -q 2>/dev/null
)

_run_hook "$_clone_s17a"
assert_deny "SEC-001-A: feature branch stray-bump only CLAUDE.md §3 → deny (single-bump invariant)"

# ---------------------------------------------------------------------------
# SEC-001-B: release branch with plugin.json + marketplace.json bumped+matching
# but CLAUDE.md §3 left stale (partial-bump) → DENY
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-B: release/v2.108.0 + plugin.json + marketplace.json bumped but CLAUDE.md §3 stale → DENY ---"

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
    # Release branch: bump plugin.json + marketplace.json to 2.108.0,
    # MODIFY shipped asset, but leave CLAUDE.md §3 stale at 2.107.0.
    git checkout -b release/v2.108.0 -q 2>/dev/null
    echo "# release agent — updated on release branch" > agents/sec001b.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    # CLAUDE.md stays at 2.107.0 — stale, partial-bump should deny
    git add agents/sec001b.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
    git commit -m "release: v2.108.0 — partial-bump (CLAUDE.md §3 stale)" -q 2>/dev/null
)

_run_hook "$_clone_s17b"
assert_deny "SEC-001-B: release branch partial-bump (CLAUDE.md §3 stale) → deny"

# ---------------------------------------------------------------------------
# SEC-001-C: release branch with all THREE sites bumped+matching → nodecision (ALLOW)
#
# This is the true three-site positive case: plugin.json, marketplace.json,
# AND CLAUDE.md §3 all set to 2.108.0 on a release/v2.108.0 branch.
# The existing AC-7 positive case also passes but its CLAUDE.md was added fresh
# (no origin/main counterpart); this fixture seeds CLAUDE.md at origin/main
# to exercise the full three-site compare path.
# ---------------------------------------------------------------------------
echo
echo "--- SEC-001-C: release/v2.107.1 + all THREE sites bumped+matching → nodecision ---"

# Use a PATCH bump (2.107.0 → 2.107.1) to stay within the M-only (PATCH) floor
# and avoid the over-bump hard-deny. This case verifies that the guard reaches
# nodecision when all three sites are bumped, matching, and not over-bumped.
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
    # Release branch: MODIFY shipped asset (M-only → PATCH floor) and bump ALL
    # THREE sites to 2.107.1 (PATCH bump = meets floor, no over-bump deny).
    git checkout -b release/v2.107.1 -q 2>/dev/null
    echo "# release agent — updated on release branch" > agents/sec001c.md
    _write_plugin_json "2.107.1" .claude-plugin/plugin.json
    _write_market_json "2.107.1" .claude-plugin/marketplace.json
    printf '**Current version:** `2.107.1`\n' > CLAUDE.md
    git add .
    git commit -m "release: v2.107.1 — bump all three version sites (PATCH)" -q 2>/dev/null
)

_run_hook "$_clone_s17c"
assert_nodecision "SEC-001-C: release/v2.107.1 + all three sites bumped+matching → nodecision (ALLOW)"

# AC-8 structural check: --name-status in the git invocation; every git show
# call carries the MSYS_NO_PATHCONV Windows git-bash guard. Checked against
# the TS entry (hooks/ts/entry/prepublish-guard.cc.ts) — the single source of
# these invariants post-cutover; the retired Bash source these checks used to
# grep no longer exists.
# ---------------------------------------------------------------------------
_TS_ENTRY="$REPO_ROOT/hooks/ts/entry/prepublish-guard.cc.ts"

echo
echo "--- AC-8: --name-status and MSYS_NO_PATHCONV structural guard ---"

if grep -q -- '--name-status' "$_TS_ENTRY" 2>/dev/null; then
    pass "AC-8: hook uses --name-status diff"
else
    fail "AC-8: --name-status diff" "hook does not use --name-status"
fi

# Every git show/diff invocation must set MSYS_NO_PATHCONV=1 (Windows git-bash
# guard). The TS entry sets it once via execFileSync's env option per call —
# assert the token appears once per git invocation site.
_git_calls=$(grep -c 'execFileSync("git"' "$_TS_ENTRY" 2>/dev/null || echo 0)
_msys_guards=$(grep -c 'MSYS_NO_PATHCONV' "$_TS_ENTRY" 2>/dev/null || echo 0)
if [ "$_msys_guards" -ge "$_git_calls" ] && [ "$_git_calls" -gt 0 ]; then
    pass "AC-8: all $_git_calls git invocation(s) carry MSYS_NO_PATHCONV=1 ($_msys_guards guard(s) found)"
else
    fail "AC-8: MSYS guard" "found $_git_calls git invocation(s) but only $_msys_guards MSYS_NO_PATHCONV guard(s)"
fi

# AC-6 structural: no 'ask' token anywhere in the TS body or entry — the
# block-on-condition / open-on-fault contract never emits ask.
_TS_BODY="$REPO_ROOT/hooks/ts/bodies/prepublish-guard.ts"
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
# NEW-1: clean worktree A passes even when B strays a shipped-asset with no fragment
# NEW-2: clean worktree A passes even when B strays a version-site bump
# NEW-3: a real bump-floor violation IN A (release path) still denies — floor not weakened
# NEW-4: empty/omitted cwd → backward-compat (falls back to process CWD)
# NEW-5: control-char cwd → SEC-DR-A reject, fail-open, no deny
# NEW-6: non-existent cwd dir → fail-open, no deny
# ---------------------------------------------------------------------------
echo
echo "=== Suite 18: worktree-scope (guard reads payload cwd, not process CWD) ==="

# ---------------------------------------------------------------------------
# NEW-1: clean worktree A passes even when session-root B is dirty
#         (shipped asset changed in B but no changelog.d/ fragment)
#
# Without the fix: hook inspects B → sees shipped-asset change with no fragment
# → deny. With the fix: hook inspects A → no shipped-asset change → nodecision.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-1: clean worktree A passes even when B strays shipped-asset with no fragment ---"

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

# Build B: session root — DIRTY: strays a shipped-asset change with no fragment
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
    # Stray shipped-asset change with no fragment/marker → would deny if evaluated
    echo "# dirty agent — modified" > agents/dirty.md
    git add agents/dirty.md
    git commit -m "feat: dirty shipped-asset change, no fragment (should be bypassed by cwd)" -q 2>/dev/null
)

# Run: process CWD = B (dirty), payload cwd = A (clean)
_run_hook_from "$_clone_n1b" "$_clone_n1a"
assert_nodecision "NEW-1: process-CWD=B(dirty) payload-cwd=A(clean) → evaluates A → nodecision"

# ---------------------------------------------------------------------------
# NEW-2: clean worktree A passes even when session-root B strays a version bump
#
# Without the fix: hook inspects B → sees version-site bump on a feature branch
# → stray-bump deny. With the fix: hook inspects A → no bump → nodecision.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-2: clean worktree A passes even when B strays a version-site bump ---"

# Build A: clean feature branch — ships a changelog.d/ fragment, no bump
_bare_n2a=$(_new_tmp)
_clone_n2a=$(_new_tmp)
_make_repo "$_bare_n2a" "$_clone_n2a" "2.107.0"
(
    cd "$_clone_n2a"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents changelog.d
    echo "# n2 agent" > agents/n2.md
    printf '### Changed\n- n2 update\n' > changelog.d/feat-n2.md
    git add agents/n2.md changelog.d/feat-n2.md
    git commit -m "feat: n2 agent with fragment, no bump (clean feature branch)" -q 2>/dev/null
)

# Build B: session root — DIRTY: stray version-site bump on a feature branch
_bare_n2b=$(_new_tmp)
_clone_n2b=$(_new_tmp)
_make_repo "$_bare_n2b" "$_clone_n2b" "2.107.0"
(
    cd "$_clone_n2b"
    git config user.email "test@test.com"
    git config user.name "Test"
    mkdir -p agents
    echo "# b2 agent" > agents/b2.md
    git add agents/b2.md
    git commit -m "base: add agents/b2.md" -q 2>/dev/null
    git push origin HEAD:main -q 2>/dev/null
    # Stray version bump + no shipped-asset change → stray-bump deny if evaluated
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .claude-plugin/
    git commit -m "feat: stray version-site bump on session-root B (should be bypassed by cwd)" -q 2>/dev/null
)

# Run: process CWD = B (stray-bump), payload cwd = A (clean)
_run_hook_from "$_clone_n2b" "$_clone_n2a"
assert_nodecision "NEW-2: process-CWD=B(stray-bump) payload-cwd=A(clean) → evaluates A → nodecision"

# ---------------------------------------------------------------------------
# NEW-3: real bump-floor violation IN worktree A still denies — floor not weakened
#
# Payload cwd = A, and A itself has a release-path over-bump violation.
# The guard must still deny → the floor is re-targeted, not bypassed.
# ---------------------------------------------------------------------------
echo
echo "--- NEW-3: real bump-floor violation in worktree A still denies (floor not weakened) ---"

# Build A: release branch with MINOR bump on a M-only (PATCH floor) diff → over-bump deny
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
    git checkout -b release/v2.108.0 -q 2>/dev/null
    # Modify only (M-only → PATCH floor) but apply MINOR bump (over-bump)
    echo "# n3 agent — updated" > agents/n3.md
    _write_plugin_json "2.108.0" .claude-plugin/plugin.json
    _write_market_json "2.108.0" .claude-plugin/marketplace.json
    git add .
    git commit -m "release: v2.108.0 — modify agents/n3.md (minor bump on M-only — over-bump)" -q 2>/dev/null
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
