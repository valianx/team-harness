#!/usr/bin/env bash
# tests/test_th_update_block_sync.sh
#
# Regression test: five-row decision matrix for /th:update managed-block sync.
# Drives the documented sync algorithm against fixture CLAUDE.md variants in a
# runtime-constructed tmpdir (no committed fixture files).
#
# Five fixtures cover all five matrix rows:
#   (a) block present + correct stamp           → row 2 (already current, true no-op)
#   (b) block present + stamp, stored≠live hash → row 5 (preserved — operator-edited)
#   (c) block present, no stamp, body≠canonical → row 3 (first-run adopt, overwrite+stamp)
#   (d) CLAUDE.md missing block markers         → row 1 (insert/append)
#   (e) block present + stamp, stored==live     → row 4 (harness-update, overwrite+re-stamp)
#
# PRIMARY REGRESSION ASSERTION (row 5 / fixture b):
#   After one sync run the bytes of the managed block are byte-identical to the
#   operator-edited input. This FAILS against the pre-fix destructive algorithm
#   and PASSES after the fix.
#
# Supporting assertions lock rows 1, 3, 4 so "preserve" cannot be faked by
# disabling all writes.
#
# Also covers AC-7: --force-blocks overrides row 5 and reports "force-adopted".
#
# Skips cleanly when python3 is absent (mirrors test_update_models_resolver.sh).
#
# Usage:
#   bash tests/test_th_update_block_sync.sh
# Exit 0 = pass (or skip), 1 = fail.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Skip when python3 absent
# ---------------------------------------------------------------------------
if ! command -v python3 &>/dev/null; then
    echo "SKIP: python3 not found — skipping test_th_update_block_sync"
    exit 0
fi

# ---------------------------------------------------------------------------
# Counters and helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label"
        echo "        expected: $expected"
        echo "        actual:   $actual"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_contains() {
    local label="$1" file="$2" pattern="$3"
    if grep -qF "$pattern" "$file" 2>/dev/null; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label (pattern not found in file)"
        echo "        pattern: $pattern"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_not_contains() {
    local label="$1" file="$2" pattern="$3"
    if ! grep -qF "$pattern" "$file" 2>/dev/null; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label (pattern unexpectedly found in file)"
        echo "        pattern: $pattern"
        FAIL=$((FAIL + 1))
    fi
}

assert_files_identical() {
    local label="$1" file_a="$2" file_b="$3"
    if diff -q "$file_a" "$file_b" >/dev/null 2>&1; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label (files differ)"
        diff "$file_a" "$file_b" | head -10
        FAIL=$((FAIL + 1))
    fi
}

# ---------------------------------------------------------------------------
# Temp workspace — cleaned up on exit
# ---------------------------------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MB_DIR="$WORK/managed-blocks"
mkdir -p "$MB_DIR"

# ---------------------------------------------------------------------------
# Canonical block files (minimal, self-contained test content)
# ---------------------------------------------------------------------------
cat > "$MB_DIR/orchestrator-dispatch-rule.md" <<'CANONICAL_ODR'
<!-- orchestrator-dispatch-rule:start -->
Canonical orchestrator dispatch rule content for testing.
Line two of canonical content.
<!-- orchestrator-dispatch-rule:end -->
CANONICAL_ODR

cat > "$MB_DIR/voice-rule.md" <<'CANONICAL_VR'
<!-- voice-rule:start -->
Canonical voice rule content for testing.
<!-- voice-rule:end -->
CANONICAL_VR

# ---------------------------------------------------------------------------
# The sync algorithm — extracted from skills/update/SKILL.md (bash block).
# Changes here must be mirrored there; this is the single source of truth for
# the five-row decision matrix and atomicity contract.
# ---------------------------------------------------------------------------
ALGO_PY="$WORK/sync_algo.py"
cat > "$ALGO_PY" <<'PYEOF'
import os, sys, hashlib, re, tempfile, json, shutil

path     = os.environ["TH_CLAUDE_MD"]
mb_dir   = os.environ["TH_MB_DIR"]
force_blocks = os.environ.get("TH_FORCE_BLOCKS", "0") == "1"

BLOCKS  = ["orchestrator-dispatch-rule", "voice-rule"]
RETIRED = ["dev-mode", "nested-dispatch-takeover", "dev-mode-entry"]
LEGACY  = ["th-orchestrator-inline-rule", "th-orchestrator-dispatch-rule"]

def canon_hash(text):
    norm = text.replace("\r\n", "\n").rstrip()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()

def make_stamp(name, h):
    return "<!-- th-managed: " + name + " sha256=" + h + " -->\n"

def remove_stamps(text, name):
    return re.sub(
        "<!-- th-managed: " + re.escape(name) + " sha256=[0-9a-f]{64} -->\n?",
        "", text
    )

def get_stored_hash(before, name):
    for line in reversed(before.splitlines()):
        s = line.strip()
        if s:
            pfx = "<!-- th-managed: " + name + " sha256="
            sfx = " -->"
            if s.startswith(pfx) and s.endswith(sfx):
                h = s[len(pfx):-len(sfx)]
                if re.fullmatch("[0-9a-f]{64}", h):
                    return h
            break
    return None

try:
    original = open(path, "r", encoding="utf-8").read()
except FileNotFoundError:
    original = ""

content  = original
outcomes = {}

for block in BLOCKS:
    canonical = open(os.path.join(mb_dir, block + ".md"), "r", encoding="utf-8").read().rstrip()
    sm  = "<!-- " + block + ":start -->"
    em  = "<!-- " + block + ":end -->"
    ch  = canon_hash(canonical)
    has_s = sm in content
    has_e = em in content

    if not has_s and not has_e:
        # Row 1: markers absent — append canonical + stamp
        content = content.rstrip("\n") + "\n" + make_stamp(block, ch) + canonical + "\n"
        outcomes[block] = "inserted"
        continue

    if has_s != has_e:
        # Malformed: only one marker present — skip with warning
        outcomes[block] = "WARN:malformed"
        continue

    si = content.find(sm)
    ei = content.find(em, si)
    if ei < si:
        outcomes[block] = "WARN:malformed"
        continue

    ep   = ei + len(em)
    live = content[si:ep]
    lh   = canon_hash(live)
    sh   = get_stored_hash(content[:si], block)

    if lh == ch:
        # Row 2: already canonical — ensure exactly one correct stamp, no body change
        content = remove_stamps(content, block)
        si2     = content.find(sm)
        content = content[:si2] + make_stamp(block, ch) + content[si2:]
        outcomes[block] = "already current"
    elif sh is None:
        # Row 3: no stamp (pre-fix / first-run) — adopt: overwrite + stamp
        content = remove_stamps(content, block)
        si2     = content.find(sm)
        ep2     = content.find(em, si2) + len(em)
        content = content[:si2] + make_stamp(block, ch) + canonical + content[ep2:]
        outcomes[block] = "updated"
    elif sh == lh:
        # Row 4: stamp matches live (harness wrote it), canonical changed — overwrite + re-stamp
        content = remove_stamps(content, block)
        si2     = content.find(sm)
        ep2     = content.find(em, si2) + len(em)
        content = content[:si2] + make_stamp(block, ch) + canonical + content[ep2:]
        outcomes[block] = "updated"
    elif force_blocks:
        # Row 5 with --force-blocks: operator-edited but force-adopt canonical
        content = remove_stamps(content, block)
        si2     = content.find(sm)
        ep2     = content.find(em, si2) + len(em)
        content = content[:si2] + make_stamp(block, ch) + canonical + content[ep2:]
        outcomes[block] = "force-adopted"
    else:
        # Row 5: stored_hash present and != live_hash — operator-edited, preserve
        outcomes[block] = "preserved (operator-edited)"

# Migrate legacy orchestrator markers
for legacy in LEGACY:
    lsm = "<!-- " + legacy + ":start -->"
    lem = "<!-- " + legacy + ":end -->"
    if lsm in content and lem in content:
        ls  = content.find(lsm)
        le  = content.find(lem, ls) + len(lem)
        odr = open(os.path.join(mb_dir, "orchestrator-dispatch-rule.md"), "r", encoding="utf-8").read().rstrip()
        content = content[:ls] + make_stamp("orchestrator-dispatch-rule", canon_hash(odr)) + odr + content[le:]

# Remove retired blocks
for retired in RETIRED:
    rsm   = "<!-- " + retired + ":start -->"
    rem   = "<!-- " + retired + ":end -->"
    if rsm in content and rem in content:
        rs    = content.find(rsm)
        re_end = content.find(rem, rs) + len(rem)
        content = content[:rs] + content[re_end:]

# Verify: each written block has markers (×1 each) and a provenance stamp
errs = []
for block in BLOCKS:
    outcome = outcomes.get(block, "")
    if "WARN" in outcome or outcome == "preserved (operator-edited)":
        continue
    sm   = "<!-- " + block + ":start -->"
    em   = "<!-- " + block + ":end -->"
    if content.count(sm) != 1 or content.count(em) != 1:
        errs.append("marker-count:" + block)
        continue
    si   = content.find(sm)
    pfx  = "<!-- th-managed: " + block + " sha256="
    if pfx not in content[:si]:
        errs.append("stamp-missing:" + block)

if errs:
    sys.stderr.write("VERIFY_FAIL:" + ";".join(errs) + "\n")
    sys.exit(1)

# Atomic write (temp → fsync → os.replace); backup only when file existed and changed
if content != original:
    if original:
        shutil.copy2(path, path + ".bak")
    d   = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except Exception as exc:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        sys.stderr.write("WRITE_FAIL:" + str(exc) + "\n")
        sys.exit(1)

print(json.dumps(outcomes))
PYEOF

# ---------------------------------------------------------------------------
# Helper: run sync algorithm against a CLAUDE.md, return JSON outcomes
# ---------------------------------------------------------------------------
run_sync() {
    local claude_md="$1"
    local force="${2:-0}"
    TH_CLAUDE_MD="$claude_md" TH_MB_DIR="$MB_DIR" TH_FORCE_BLOCKS="$force" \
        python3 "$ALGO_PY"
}

# ---------------------------------------------------------------------------
# Helper: extract managed block body from CLAUDE.md (start:marker through end:marker)
# ---------------------------------------------------------------------------
extract_block() {
    local file="$1"
    local block="$2"
    python3 -c "
import sys
block = sys.argv[1]
sm = '<!-- ' + block + ':start -->'
em = '<!-- ' + block + ':end -->'
content = open(sys.argv[2], 'r', encoding='utf-8').read()
s = content.find(sm)
e = content.find(em, s)
if s == -1 or e == -1:
    sys.exit(1)
print(content[s:e + len(em)], end='')
" "$block" "$file"
}

# ---------------------------------------------------------------------------
# Compute canonical hash (same canonicalization as sync algorithm)
# ---------------------------------------------------------------------------
canon_hash() {
    local text="$1"
    echo -n "$text" | python3 -c "
import sys, hashlib
data = sys.stdin.read().replace('\r\n', '\n').rstrip()
print(hashlib.sha256(data.encode('utf-8')).hexdigest())
"
}

# ---------------------------------------------------------------------------
# Read canonical block content (rstripped, as the algorithm uses it)
# ---------------------------------------------------------------------------
CANONICAL_ODR="$(python3 -c "
import sys
text = open(sys.argv[1], 'r', encoding='utf-8').read().rstrip()
print(text, end='')
" "$MB_DIR/orchestrator-dispatch-rule.md")"

CANONICAL_VR="$(python3 -c "
import sys
text = open(sys.argv[1], 'r', encoding='utf-8').read().rstrip()
print(text, end='')
" "$MB_DIR/voice-rule.md")"

CANONICAL_HASH_ODR="$(echo "$CANONICAL_ODR" | python3 -c "
import sys, hashlib
data = sys.stdin.read().replace('\r\n', '\n').rstrip()
print(hashlib.sha256(data.encode('utf-8')).hexdigest())
")"

CANONICAL_HASH_VR="$(echo "$CANONICAL_VR" | python3 -c "
import sys, hashlib
data = sys.stdin.read().replace('\r\n', '\n').rstrip()
print(hashlib.sha256(data.encode('utf-8')).hexdigest())
")"

echo "=== test_th_update_block_sync: five-row decision matrix ==="
echo ""

# ===========================================================================
# FIXTURE (a) — Row 2: already current, correct stamp → true no-op
# ===========================================================================
echo "--- Fixture (a): row 2 — already current ---"
FIXTURE_A="$WORK/fixture_a.md"

cat > "$FIXTURE_A" <<FIXTURE_EOF
# Operator CLAUDE.md
Some operator content above.

<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->
${CANONICAL_ODR}

<!-- th-managed: voice-rule sha256=${CANONICAL_HASH_VR} -->
${CANONICAL_VR}

Some operator content below.
FIXTURE_EOF

cp "$FIXTURE_A" "$WORK/fixture_a_before.md"
RESULT_A="$(run_sync "$FIXTURE_A")"

OUTCOME_A_ODR="$(echo "$RESULT_A" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_A_VR="$(echo "$RESULT_A" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "row2: orchestrator-dispatch-rule outcome" "already current" "$OUTCOME_A_ODR"
assert_eq "row2: voice-rule outcome" "already current" "$OUTCOME_A_VR"
assert_files_identical "row2: CLAUDE.md unchanged (true no-op)" "$WORK/fixture_a_before.md" "$FIXTURE_A"
echo ""

# ===========================================================================
# FIXTURE (b) — Row 5: operator-edited block → preserved (PRIMARY REGRESSION)
# ===========================================================================
echo "--- Fixture (b): row 5 — operator-edited, preserved [PRIMARY REGRESSION] ---"
FIXTURE_B="$WORK/fixture_b.md"

# Operator-edited block body (different from canonical, but wrapped in the same markers)
OPERATOR_BLOCK="<!-- orchestrator-dispatch-rule:start -->
Operator custom content — this should not be clobbered.
Extra operator line.
<!-- orchestrator-dispatch-rule:end -->"

OPERATOR_HASH="$(echo "$OPERATOR_BLOCK" | python3 -c "
import sys, hashlib
data = sys.stdin.read().replace('\r\n', '\n').rstrip()
print(hashlib.sha256(data.encode('utf-8')).hexdigest())
")"

# The stamp records what the harness LAST wrote (canonical hash), but the live
# block content has been edited by the operator → stored_hash ≠ current_hash → row 5.
cat > "$FIXTURE_B" <<FIXTURE_EOF
# Operator CLAUDE.md

<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->
${OPERATOR_BLOCK}

<!-- th-managed: voice-rule sha256=${CANONICAL_HASH_VR} -->
${CANONICAL_VR}

FIXTURE_EOF

# Snapshot the operator-edited block BEFORE sync
extract_block "$FIXTURE_B" "orchestrator-dispatch-rule" > "$WORK/block_b_before.txt"

RESULT_B="$(run_sync "$FIXTURE_B")"

OUTCOME_B_ODR="$(echo "$RESULT_B" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_B_VR="$(echo "$RESULT_B" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

# Extract block AFTER sync
extract_block "$FIXTURE_B" "orchestrator-dispatch-rule" > "$WORK/block_b_after.txt"

assert_eq "row5: orchestrator-dispatch-rule outcome" "preserved (operator-edited)" "$OUTCOME_B_ODR"
assert_eq "row5: voice-rule outcome (still updated)" "already current" "$OUTCOME_B_VR"
assert_files_identical "row5: operator-edited block preserved byte-identical" \
    "$WORK/block_b_before.txt" "$WORK/block_b_after.txt"
assert_file_not_contains "row5: canonical body NOT written over operator edit" \
    "$FIXTURE_B" "Canonical orchestrator dispatch rule content for testing."
echo ""

# ===========================================================================
# FIXTURE (c) — Row 3: pre-fix block (no stamp, body≠canonical) → first-run adopt
# ===========================================================================
echo "--- Fixture (c): row 3 — no stamp, body differs → first-run adopt ---"
FIXTURE_C="$WORK/fixture_c.md"

cat > "$FIXTURE_C" <<'FIXTURE_EOF'
# Operator CLAUDE.md

<!-- orchestrator-dispatch-rule:start -->
Old unstamped orchestrator dispatch rule content.
<!-- orchestrator-dispatch-rule:end -->

<!-- voice-rule:start -->
Old unstamped voice rule content.
<!-- voice-rule:end -->
FIXTURE_EOF

RESULT_C="$(run_sync "$FIXTURE_C")"

OUTCOME_C_ODR="$(echo "$RESULT_C" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_C_VR="$(echo "$RESULT_C" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "row3: orchestrator-dispatch-rule outcome" "updated" "$OUTCOME_C_ODR"
assert_eq "row3: voice-rule outcome" "updated" "$OUTCOME_C_VR"
assert_file_contains "row3: canonical body written to file" \
    "$FIXTURE_C" "Canonical orchestrator dispatch rule content for testing."
assert_file_contains "row3: provenance stamp written" \
    "$FIXTURE_C" "<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->"
assert_file_not_contains "row3: old content removed" \
    "$FIXTURE_C" "Old unstamped orchestrator dispatch rule content."
echo ""

# ===========================================================================
# FIXTURE (d) — Row 1: markers absent → inserted/appended
# ===========================================================================
echo "--- Fixture (d): row 1 — markers absent → inserted ---"
FIXTURE_D="$WORK/fixture_d.md"

cat > "$FIXTURE_D" <<'FIXTURE_EOF'
# Operator CLAUDE.md
Some existing content with no managed blocks.
FIXTURE_EOF

RESULT_D="$(run_sync "$FIXTURE_D")"

OUTCOME_D_ODR="$(echo "$RESULT_D" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_D_VR="$(echo "$RESULT_D" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "row1: orchestrator-dispatch-rule outcome" "inserted" "$OUTCOME_D_ODR"
assert_eq "row1: voice-rule outcome" "inserted" "$OUTCOME_D_VR"
assert_file_contains "row1: start marker appended" \
    "$FIXTURE_D" "<!-- orchestrator-dispatch-rule:start -->"
assert_file_contains "row1: end marker appended" \
    "$FIXTURE_D" "<!-- orchestrator-dispatch-rule:end -->"
assert_file_contains "row1: provenance stamp written" \
    "$FIXTURE_D" "<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->"
assert_file_contains "row1: original content preserved" \
    "$FIXTURE_D" "Some existing content with no managed blocks."
echo ""

# ===========================================================================
# FIXTURE (e) — Row 4: stamp == live hash, canonical changed → harness-update
# ===========================================================================
echo "--- Fixture (e): row 4 — harness-update (stamp matches live, canonical changed) ---"
FIXTURE_E="$WORK/fixture_e.md"

# Simulate: harness last wrote STALE_BODY and stored its hash.
# Now canonical has changed (to current canonical). stored_hash == live_hash → row 4.
STALE_BODY="<!-- orchestrator-dispatch-rule:start -->
Stale harness-written content (v1).
<!-- orchestrator-dispatch-rule:end -->"

STALE_HASH="$(echo "$STALE_BODY" | python3 -c "
import sys, hashlib
data = sys.stdin.read().replace('\r\n', '\n').rstrip()
print(hashlib.sha256(data.encode('utf-8')).hexdigest())
")"

cat > "$FIXTURE_E" <<FIXTURE_EOF
# Operator CLAUDE.md

<!-- th-managed: orchestrator-dispatch-rule sha256=${STALE_HASH} -->
${STALE_BODY}

<!-- th-managed: voice-rule sha256=${CANONICAL_HASH_VR} -->
${CANONICAL_VR}
FIXTURE_EOF

RESULT_E="$(run_sync "$FIXTURE_E")"

OUTCOME_E_ODR="$(echo "$RESULT_E" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_E_VR="$(echo "$RESULT_E" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "row4: orchestrator-dispatch-rule outcome" "updated" "$OUTCOME_E_ODR"
assert_eq "row4: voice-rule outcome (already current)" "already current" "$OUTCOME_E_VR"
assert_file_contains "row4: new canonical written" \
    "$FIXTURE_E" "Canonical orchestrator dispatch rule content for testing."
assert_file_contains "row4: new stamp written" \
    "$FIXTURE_E" "<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->"
assert_file_not_contains "row4: stale content removed" \
    "$FIXTURE_E" "Stale harness-written content (v1)."
echo ""

# ===========================================================================
# AC-7: --force-blocks overrides row 5 → force-adopted
# ===========================================================================
echo "--- AC-7: --force-blocks on operator-edited block → force-adopted ---"
FIXTURE_F="$WORK/fixture_f.md"

cat > "$FIXTURE_F" <<FIXTURE_EOF
# Operator CLAUDE.md

<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->
<!-- orchestrator-dispatch-rule:start -->
Operator custom content that would normally be preserved.
<!-- orchestrator-dispatch-rule:end -->

<!-- th-managed: voice-rule sha256=${CANONICAL_HASH_VR} -->
${CANONICAL_VR}
FIXTURE_EOF

RESULT_F="$(run_sync "$FIXTURE_F" "1")"   # force_blocks=1

OUTCOME_F_ODR="$(echo "$RESULT_F" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"

assert_eq "ac7: outcome with --force-blocks" "force-adopted" "$OUTCOME_F_ODR"
assert_file_contains "ac7: canonical written despite operator edit" \
    "$FIXTURE_F" "Canonical orchestrator dispatch rule content for testing."
assert_file_not_contains "ac7: operator content removed" \
    "$FIXTURE_F" "Operator custom content that would normally be preserved."
assert_file_contains "ac7: backup written" \
    "$WORK/fixture_f.md.bak" "Operator custom content that would normally be preserved." 2>/dev/null || \
    assert_file_contains "ac7: backup written" "$FIXTURE_F.bak" "Operator custom content that would normally be preserved."
echo ""

# ===========================================================================
# Idempotency: run twice on fixture (c) result → second run is true no-op
# ===========================================================================
echo "--- Idempotency: second run on already-synced file ---"
FIXTURE_IDEM="$WORK/fixture_idem.md"
cp "$FIXTURE_C" "$FIXTURE_IDEM"
cp "$FIXTURE_IDEM" "$WORK/fixture_idem_before.md"

RESULT_IDEM="$(run_sync "$FIXTURE_IDEM")"

OUTCOME_IDEM_ODR="$(echo "$RESULT_IDEM" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_IDEM_VR="$(echo "$RESULT_IDEM" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "idempotency: orchestrator-dispatch-rule outcome" "already current" "$OUTCOME_IDEM_ODR"
assert_eq "idempotency: voice-rule outcome" "already current" "$OUTCOME_IDEM_VR"
assert_files_identical "idempotency: CLAUDE.md byte-identical (no write)" \
    "$WORK/fixture_idem_before.md" "$FIXTURE_IDEM"
echo ""

# ===========================================================================
# FIXTURE (g) — Row 5 × 2: both blocks operator-edited → both preserved
# (Strengthens row-5 coverage: prior fixtures only edit ONE block;
#  this verifies both blocks are simultaneously preserved and no write fires.)
# ===========================================================================
echo "--- Fixture (g): row 5×2 — both blocks operator-edited, both preserved ---"
FIXTURE_G="$WORK/fixture_g.md"

OPERATOR_BLOCK_G_ODR="<!-- orchestrator-dispatch-rule:start -->
Operator custom ODR content — must not be clobbered.
<!-- orchestrator-dispatch-rule:end -->"

OPERATOR_BLOCK_G_VR="<!-- voice-rule:start -->
Operator custom VR content — must not be clobbered.
<!-- voice-rule:end -->"

# Stamps record the CANONICAL hash; bodies have been operator-edited → row 5 for both.
cat > "$FIXTURE_G" <<FIXTURE_EOF
# Operator CLAUDE.md

<!-- th-managed: orchestrator-dispatch-rule sha256=${CANONICAL_HASH_ODR} -->
${OPERATOR_BLOCK_G_ODR}

<!-- th-managed: voice-rule sha256=${CANONICAL_HASH_VR} -->
${OPERATOR_BLOCK_G_VR}
FIXTURE_EOF

cp "$FIXTURE_G" "$WORK/fixture_g_before.md"
RESULT_G="$(run_sync "$FIXTURE_G")"

OUTCOME_G_ODR="$(echo "$RESULT_G" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_G_VR="$(echo "$RESULT_G" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "row5x2: ODR outcome both-edited" "preserved (operator-edited)" "$OUTCOME_G_ODR"
assert_eq "row5x2: VR outcome both-edited" "preserved (operator-edited)" "$OUTCOME_G_VR"
# When both blocks hit row 5 the algorithm makes no content changes → no write → file byte-identical.
assert_files_identical "row5x2: full CLAUDE.md byte-identical (no write when both blocks preserved)" \
    "$WORK/fixture_g_before.md" "$FIXTURE_G"
assert_file_not_contains "row5x2: canonical ODR body absent from file" \
    "$FIXTURE_G" "Canonical orchestrator dispatch rule content for testing."
assert_file_not_contains "row5x2: canonical VR body absent from file" \
    "$FIXTURE_G" "Canonical voice rule content for testing."
echo ""

# ===========================================================================
# FIXTURE (h) — Malformed marker: start present, end absent → defensive WARN
# (Covers the malformed-marker defensive case; also verifies the other block
#  is still processed normally — a WARN on one block must not block the other.)
# ===========================================================================
echo "--- Fixture (h): malformed — start marker present, end absent → WARN:malformed ---"
FIXTURE_H="$WORK/fixture_h.md"

cat > "$FIXTURE_H" <<'FIXTURE_EOF'
# Operator CLAUDE.md

<!-- orchestrator-dispatch-rule:start -->
Incomplete block — no end marker present.
FIXTURE_EOF

RESULT_H="$(run_sync "$FIXTURE_H")"

OUTCOME_H_ODR="$(echo "$RESULT_H" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('orchestrator-dispatch-rule','MISSING'))")"
OUTCOME_H_VR="$(echo "$RESULT_H" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('voice-rule','MISSING'))")"

assert_eq "malformed: ODR outcome is WARN:malformed" "WARN:malformed" "$OUTCOME_H_ODR"
# Voice-rule has no markers in this fixture → row 1 (inserted), proving a WARN on
# one block does not prevent the other block from being processed.
assert_eq "malformed: voice-rule still inserted despite malformed ODR" "inserted" "$OUTCOME_H_VR"
assert_file_contains "malformed: original incomplete content preserved in file" \
    "$FIXTURE_H" "Incomplete block — no end marker present."
# Canonical ODR body must NOT be appended/written when its block is malformed.
assert_file_not_contains "malformed: canonical ODR body NOT written on WARN" \
    "$FIXTURE_H" "Canonical orchestrator dispatch rule content for testing."
echo ""

# ===========================================================================
# Summary
# ===========================================================================
echo "============================================================"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
    echo "test_th_update_block_sync: PASS ($PASS/$TOTAL assertions)"
    exit 0
else
    echo "test_th_update_block_sync: FAIL ($FAIL/$TOTAL assertions failed)"
    exit 1
fi
