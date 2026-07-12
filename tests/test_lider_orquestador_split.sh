#!/bin/bash
# tests/test_lider_orquestador_split.sh
# Structural (spec-derived) regression suite for Task-2 of the
# nested-orchestrator-lanes plan: "Split orchestrator.md -> lider.md +
# orquestador.md".
#
# AUTHORED TEST-FIRST, INDEPENDENT of any implementation: every assertion
# below is derived only from
#   - workspaces plan 01-plan.md, Task List -> Task-2 (AC-2.1..AC-2.13)
#   - research/00-test-plan.md, section A (GBL-*) and B (WS-*)
#   - agents/_shared/gate-contract.md (Task-1, already merged) as the
#     REFERENCED interface, never copied content
# It does NOT read agents/lider.md or agents/orquestador.md as a source of
# truth for what to assert -- those files do not exist yet at authoring time.
#
# What this suite checks (deterministic-test scenarios only; GBL-2/3/4,
# WS-1/2/5, MO-*, RD-* are behavioral-scenario/probe and belong to
# tests/run-behavioral.sh / tests/probe_nested_dispatch.md, not here):
#   - SPLIT COMPLETENESS: orchestrator.md removed, lider.md + orquestador.md
#     present.
#   - GATE-MEDIATION LIDER (GBL-1, GBL-5, GBL-6, GBL-7; AC-2.1/2.8/2.10/2.11/2.12):
#     lider.md carries zero dual-record schema tokens (it never records a
#     release), declares its gate role as present-inline + relay-with-attribution
#     (lider-relayed-operator), references gate-contract.md for the STOP-block
#     templates it presents, restricts its write surface to overview.md +
#     00-lider-roster.md, treats pending_gate as advisory-only, and defines
#     lider-recover as coarse-phase/status-only.
#   - PREPARE+RECORD SEAM (AC-2.2/2.5): orquestador.md references (never copies)
#     gate-contract.md, prepares and records all three STAGE-GATEs with the
#     dual-record tokens present, is sole-writer of its own 00-state.md, accepts
#     a th:lider-relayed decision ONLY with operator-verbatim + lider-relayed-operator
#     attribution, and rejects a synthesized/unattributed relay.
#   - LEGIBILITY (AC-2.3): orquestador dispatches specialists only.
#   - MODEL ALLOCATION (AC-2.13): lider = opus/xhigh, orquestador =
#     sonnet/xhigh.
#   - CAPABILITY FLOOR (AC-2.6): boot check literal + no-fallback hard STOP.
#
# Assertions test CONTRACT properties (presence/absence of authority),
# not exact prose -- a reasonable implementation of the plan passes; only a
# real deviation (a lider that emits/records a gate, an orquestador that
# copies the contract instead of referencing it, a dispatched second
# orquestador, a wrong frontmatter model) fails.
#
# Every file-scoped assertion FAILS (never silently passes) when its target
# file does not exist -- this is what keeps the RED state honest: with
# agents/lider.md and agents/orquestador.md absent, every assertion in this
# suite must report "file not found", not a false PASS.
#
# Usage:
#   ./tests/test_lider_orquestador_split.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIDER="$REPO_ROOT/agents/lider.md"
ORQUESTADOR="$REPO_ROOT/agents/orquestador.md"
ORCHESTRATOR_LEGACY="$REPO_ROOT/agents/orchestrator.md"
GATE_CONTRACT="$REPO_ROOT/agents/_shared/gate-contract.md"

PASS=0
FAIL=0
declare -a FAILURES

pass() {
    local id="$1" desc="$2"
    PASS=$((PASS + 1))
    echo "  [PASS] $id: $desc"
}

fail() {
    local id="$1" desc="$2"
    FAIL=$((FAIL + 1))
    FAILURES+=("$id: $desc")
    echo "  [FAIL] $id: $desc"
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

frontmatter_block() {
    # Prints only the YAML frontmatter body (between the two `---` markers).
    awk '/^---$/{c++; next} c==1' "$1"
}

assert_file_exists() {
    local id="$1" file="$2" desc="$3"
    if [ -f "$file" ]; then
        pass "$id" "$desc"
    else
        fail "$id" "$desc — file not found: $file"
    fi
}

assert_file_absent() {
    local id="$1" file="$2" desc="$3"
    if [ ! -e "$file" ]; then
        pass "$id" "$desc"
    else
        fail "$id" "$desc — file still present: $file"
    fi
}

# assert_contains: PASS only if $file exists AND matches $pattern (ERE, -i).
# A missing file always FAILs (never a silent pass for a "must contain" check).
assert_contains() {
    local id="$1" file="$2" pattern="$3" desc="$4"
    if [ ! -f "$file" ]; then
        fail "$id" "$desc — file not found: $file"
        return
    fi
    if grep -qiE -- "$pattern" "$file"; then
        pass "$id" "$desc"
    else
        fail "$id" "$desc — required pattern not found: /$pattern/"
    fi
}

# assert_not_contains: PASS only if $file exists AND does NOT match $pattern.
# A missing file always FAILs too -- absence of a file is "not yet
# implemented", never evidence that the forbidden content is correctly
# absent. This is what prevents a false-green RED state.
assert_not_contains() {
    local id="$1" file="$2" pattern="$3" desc="$4"
    if [ ! -f "$file" ]; then
        fail "$id" "$desc — file not found: $file"
        return
    fi
    if grep -qiE -- "$pattern" "$file"; then
        fail "$id" "$desc — forbidden pattern found: /$pattern/"
    else
        pass "$id" "$desc"
    fi
}

assert_frontmatter_field() {
    local id="$1" file="$2" field="$3" pattern="$4" desc="$5"
    if [ ! -f "$file" ]; then
        fail "$id" "$desc — file not found: $file"
        return
    fi
    local value
    value=$(frontmatter_block "$file" | grep -E "^${field}:" | head -1)
    if [ -n "$value" ] && echo "$value" | grep -qiE -- "$pattern"; then
        pass "$id" "$desc (found: $value)"
    else
        fail "$id" "$desc — expected ${field} matching /$pattern/, got: ${value:-<missing>}"
    fi
}

# assert_no_unhedged_claim: fails if $file has a line mentioning $anchor
# together with one of the $verb_words, UNLESS that same line also carries a
# negation marker (never/not/no/nunca/sin/excluded/...). Used to detect an
# UNHEDGED authority claim (e.g. "creates a 00-state.md") while tolerating
# the expected NEGATED form ("never creates/owns a 00-state.md").
assert_no_unhedged_claim() {
    local id="$1" file="$2" anchor="$3" verb_words="$4" desc="$5"
    if [ ! -f "$file" ]; then
        fail "$id" "$desc — file not found: $file"
        return
    fi
    local hits
    hits=$(grep -inE -- "$anchor" "$file" \
        | grep -iE -- "$verb_words" \
        | grep -viE '\b(never|not|no|nunca|sin|non-owner|non-writer|excluded|does NOT|NEVER)\b')
    if [ -z "$hits" ]; then
        pass "$id" "$desc"
    else
        fail "$id" "$desc — unhedged claim: $(echo "$hits" | head -1 | cut -c1-160)"
    fi
}

echo "============================================================"
echo "  Task-2 split: lider.md / orquestador.md — structural suite"
echo "============================================================"

# ---------------------------------------------------------------------------
# Group 0 — SPLIT COMPLETENESS
# ---------------------------------------------------------------------------
echo
echo "-- Group 0: split completeness --"
assert_file_absent  "SPLIT-1" "$ORCHESTRATOR_LEGACY" "agents/orchestrator.md removed (Task-2 Notes)"
assert_file_exists  "SPLIT-2" "$LIDER"                "agents/lider.md created"
assert_file_exists  "SPLIT-3" "$ORQUESTADOR"          "agents/orquestador.md created"

# ---------------------------------------------------------------------------
# Group A — GATE-MEDIATION LIDER (GBL-1, GBL-5, GBL-6, GBL-7)
# AC-2.1 / AC-2.8 / AC-2.10 / AC-2.11 / AC-2.12 / AC-1.5(SEC-DR-F)
# ---------------------------------------------------------------------------
echo
echo "-- Group A: gate-mediation lider --"

# AC-2.1(b/c) + AC-2.8 + AC-1.5: the dual-record schema tokens (field names
# and event name) must be COMPLETELY absent from lider.md — not even inside
# a prohibition sentence, per gate-contract.md § "Notification-scoped
# boundary" ("Nothing else ... never includes the field names ... or the
# stage.gate.release event shape"). This single check covers most of
# GBL-1(b,c,d), GBL-5 (lider cannot read what it never names), and the
# capability-leak closure of AC-1.5/SEC-DR-F for the schema half.
assert_not_contains "AC-2.8a" "$LIDER" 'gate1_release|gate2_release_last|gate3_release' \
    "lider.md never names a gateN_release field (dual-record schema absent)"
assert_not_contains "AC-2.8b" "$LIDER" 'stage\.gate\.release' \
    "lider.md never names the stage.gate.release event (dual-record schema absent)"

# AC-1.5 (SEC-DR-F): under lider-mediation the lider REFERENCES gate-contract.md
# for the STOP-block templates + allowlists it presents inline. The capability
# floor is NOT schema-ignorance (that framing is retired): the lider may name the
# contract file, but must still never carry the dual-record SCHEMA TOKENS
# (gateN_release / stage.gate.release) in its own writes -- enforced by AC-2.8a/b.
assert_contains "AC-1.5" "$LIDER" 'gate-contract\.md' \
    "lider.md references agents/_shared/gate-contract.md for the STOP-block templates it presents"

# AC-2.1(a): lider.md contains no instruction to EMIT a STAGE-GATE STOP
# block that clears a gate — the literal STOP-block banner titles from
# gate-contract.md's STOP-block templates must not appear (their presence
# would mean lider.md duplicated/emits the release-capable STOP itself).
assert_not_contains "AC-2.1a" "$LIDER" 'Plan ready for human review|Delivery ready for human approval|Round \{?R\}?/\{?total_rounds\}?' \
    "lider.md does not carry the STAGE-GATE STOP-block banner text"

# AC-2.1(d): lider.md must not claim to create/write/own an orquestador
# pipeline 00-state.md (it may legitimately READ coarse phase/status from
# one — that is AC-2.12 — so only the unhedged write/own claim is forbidden).
assert_no_unhedged_claim "AC-2.1d" "$LIDER" '00-state\.md' \
    '\b(creates?|writes?|owns?|writing)\b' \
    "lider.md carries no unhedged create/write/own claim on any 00-state.md"

# AC-2.1: self-declaration of the gate-MEDIATION role (present inline + relay).
# The word "gate-blind" still appears in lider.md ONLY as retired-model
# supersession context, so this asserts the POSITIVE role, not the absence of a word.
assert_contains "AC-2.1-self" "$LIDER" 'gate mediation|present.{0,40}relay|gate presentation protocol' \
    "lider.md declares its gate role as present-inline + relay"

# AC-2.1: at a gate the lider PRESENTS the gate to the operator inline (in its
# own conversation) -- the reachable channel -- rather than recording anything.
assert_contains "AC-2.1-present" "$LIDER" 'present.*inline' \
    "lider.md defines a present-the-gate-inline role"

# AC-2.5 (gate presentation protocol): the lider PRESENTS the gate and RELAYS the
# operator's decision verbatim, tagged lider-relayed-operator (the retired
# "bounce a misdirected reply" rule is replaced by present/relay/clarify).
assert_contains "AC-2.5-protocol" "$LIDER" 'gate presentation protocol|present.{0,60}relay' \
    "lider.md defines the gate presentation protocol (present + relay + clarify)"
# AC-2.5 (relay REQUIRED, with attribution): under lider-mediation the lider DOES
# relay the operator's decision -- verbatim, tagged lider-relayed-operator.
assert_contains "AC-2.5-relay" "$LIDER" 'lider-relayed-operator' \
    "lider.md relays the operator's decision tagged lider-relayed-operator"
assert_contains "AC-2.5-verbatim" "$LIDER" 'verbatim' \
    "lider.md relays the operator's decision verbatim (never synthesized)"

# AC-2.10 (GAP 1, durable roster): 00-lider-roster.md is declared as a REAL,
# durable file (not in-context memory).
assert_contains "AC-2.10-file" "$LIDER" '00-lider-roster\.md' \
    "lider.md declares 00-lider-roster.md as its roster file"
assert_contains "AC-2.10-durable" "$LIDER" 'durable|real file' \
    "lider.md declares the roster as durable / a real file (not in-context memory)"
assert_not_contains "AC-2.10-not-context-only" "$LIDER" 'roster.{0,60}(kept|held|stored).{0,20}in.context|in.context memory.{0,40}roster' \
    "lider.md does not describe the roster as in-context-only memory"

# AC-2.10 (write-surface restriction): the lider's write surface is limited
# to overview.md + 00-lider-roster.md.
assert_contains "AC-2.10-write-overview" "$LIDER" 'overview\.md' \
    "lider.md declares overview.md as (one of) its write targets"

# AC-2.11 (GAP 1, advisory pending_gate): pending_gate is advisory, never a
# gate-clear.
assert_contains "AC-2.11-field" "$LIDER" 'pending_gate' \
    "lider.md defines a pending_gate roster field"
assert_contains "AC-2.11-advisory" "$LIDER" 'advisory' \
    "lider.md declares pending_gate advisory (never a gate-clear)"

# AC-2.12 (GAP 1, lider-recover): reads only coarse phase/status, defines a
# lider-recover procedure distinct from orquestador-recover, and never reads
# the dual-record (already covered globally by AC-2.8a/b above).
assert_contains "AC-2.12-proc" "$LIDER" 'lider-recover|l.der-recover' \
    "lider.md defines a lider-recover procedure"
assert_contains "AC-2.12-coarse" "$LIDER" 'coarse' \
    "lider.md scopes lider-recover reads to coarse phase/status fields"
assert_not_contains "AC-2.12-no-dual" "$LIDER" 'lider-recover.{0,400}(gate1_release|gate2_release_last|gate3_release|stage\.gate\.release)' \
    "lider.md's lider-recover section never names the dual-record fields"

# ---------------------------------------------------------------------------
# Group B — PREPARE+RECORD SEAM inside orquestador.md (AC-2.2, AC-2.5)
# ---------------------------------------------------------------------------
echo
echo "-- Group B: prepare+record seam (orquestador.md) --"

# AC-2.2: references (never copies) the single-sourced gate contract.
assert_contains "AC-2.2-ref" "$ORQUESTADOR" 'gate-contract\.md' \
    "orquestador.md references agents/_shared/gate-contract.md"
assert_not_contains "AC-2.2-no-copy-a" "$ORQUESTADOR" '## Integrity model' \
    "orquestador.md does not copy gate-contract.md's Integrity-model section verbatim"
assert_not_contains "AC-2.2-no-copy-b" "$ORQUESTADOR" '## Record-based recover backstop' \
    "orquestador.md does not copy gate-contract.md's recover-backstop section verbatim"
assert_not_contains "AC-2.2-no-copy-c" "$ORQUESTADOR" '## .agents/lider\.md' \
    "orquestador.md does not copy gate-contract.md's lider-boundary section verbatim"

# AC-2.2: owns all three STAGE-GATEs.
assert_contains "AC-2.2-g1" "$ORQUESTADOR" 'STAGE-GATE-1' "orquestador.md owns STAGE-GATE-1"
assert_contains "AC-2.2-g2" "$ORQUESTADOR" 'STAGE-GATE-2' "orquestador.md owns STAGE-GATE-2"
assert_contains "AC-2.2-g3" "$ORQUESTADOR" 'STAGE-GATE-3' "orquestador.md owns STAGE-GATE-3"

# AC-2.2: emits/witnesses/records the dual-record — the schema tokens that
# were forbidden in lider.md must be PRESENT in orquestador.md (the seam is
# welded here, not absent everywhere).
assert_contains "AC-2.2-field1" "$ORQUESTADOR" 'gate1_release' "orquestador.md writes gate1_release"
assert_contains "AC-2.2-field2" "$ORQUESTADOR" 'gate2_release_last' "orquestador.md writes gate2_release_last"
assert_contains "AC-2.2-field3" "$ORQUESTADOR" 'gate3_release' "orquestador.md writes gate3_release"
assert_contains "AC-2.2-event" "$ORQUESTADOR" 'stage\.gate\.release' "orquestador.md appends stage.gate.release"

# AC-2.2: sole-writer of its own 00-state.md.
assert_contains "AC-2.2-sole-writer" "$ORQUESTADOR" 'sole.writer|.nico escritor|only writer' \
    "orquestador.md declares itself sole-writer of its own 00-state.md"

# AC-2.2: the orquestador is PREPARER + RECORDER (th:lider is presenter + relayer).
# The old presenter==witness==recorder identity is retired by the lider-mediated pivot.
assert_contains "AC-2.2-identity" "$ORQUESTADOR" 'prepare.{0,40}record|you prepare and record|preparer.{0,10}recorder' \
    "orquestador.md carries the preparer+recorder identity (th:lider presents + relays)"

# AC-2.5: under lider-mediation the "lider presents / orquestador records" cut IS
# the model -- the orquestador ACCEPTS a relayed decision only with attribution
# (operator-verbatim + lider-relayed-operator) and REJECTS a synthesized/unattributed
# one. The retired model prohibited the cut outright; that framing is inverted.
assert_contains "AC-2.5-attribution" "$ORQUESTADOR" 'attribution is required|lider-relayed-operator' \
    "orquestador.md requires operator-attributed relay (lider-relayed-operator)"
assert_contains "AC-2.5-reject-synth" "$ORQUESTADOR" 'synthesis is rejected|reject.{0,40}(synthes|unattributed)|not a valid gate decision' \
    "orquestador.md rejects a synthesized/unattributed relay"
assert_contains "AC-2.5-relay-path" "$ORQUESTADOR" 'th:lider.{0,40}relay|relay.{0,40}(operator|decision)' \
    "orquestador.md states the gate decision reaches it via th:lider relay of the operator's decision"

# ---------------------------------------------------------------------------
# Group C — LEGIBILITY (AC-2.3)
# ---------------------------------------------------------------------------
echo
echo "-- Group C: legibility rule --"

assert_contains "AC-2.3-specialists" "$ORQUESTADOR" 'architect' \
    "orquestador.md's dispatch target set names specialists (architect present)"
assert_contains "AC-2.3-specialists2" "$ORQUESTADOR" 'implementer' \
    "orquestador.md's dispatch target set names specialists (implementer present)"
assert_not_contains "AC-2.3-no-self-nest" "$ORQUESTADOR" 'dispatch(es|ing)? (another|a second|a nested) orquestador' \
    "orquestador.md does not claim to dispatch another orquestador"
assert_contains "AC-2.3-only-lider-multiplies" "$ORQUESTADOR" 'lider' \
    "orquestador.md acknowledges the lider as the sole multiplier of orquestadores"

# ---------------------------------------------------------------------------
# Group D — MODEL ALLOCATION (AC-2.13)
# ---------------------------------------------------------------------------
echo
echo "-- Group D: model allocation --"

assert_frontmatter_field "AC-2.13-lider-model"  "$LIDER"       "model"  '"?opus"?'   "lider.md frontmatter model: opus"
assert_frontmatter_field "AC-2.13-lider-effort" "$LIDER"       "effort" '"?xhigh"?'  "lider.md frontmatter effort: xhigh"
assert_frontmatter_field "AC-2.13-orq-model"    "$ORQUESTADOR" "model"  '"?sonnet"?' "orquestador.md frontmatter model: sonnet"
assert_frontmatter_field "AC-2.13-orq-effort"   "$ORQUESTADOR" "effort" '"?xhigh"?'  "orquestador.md frontmatter effort: xhigh"

# ---------------------------------------------------------------------------
# Group E — CAPABILITY FLOOR + NO-FALLBACK (AC-2.6)
# ---------------------------------------------------------------------------
echo
echo "-- Group E: capability floor + no-fallback --"

# The boot capability check literal (CC >= v2.1.199) must appear somewhere
# in the split's boot logic (lider.md and/or orquestador.md).
if [ -f "$LIDER" ] || [ -f "$ORQUESTADOR" ]; then
    if grep -qiE 'v2\.1\.199' "$LIDER" "$ORQUESTADOR" 2>/dev/null; then
        pass "AC-2.6-floor-literal" "capability floor literal v2.1.199 present (lider.md and/or orquestador.md)"
    else
        fail "AC-2.6-floor-literal" "capability floor literal v2.1.199 not found in lider.md or orquestador.md"
    fi
    # On capability failure the split hard-STOPs with a clear error — there is
    # NO monolith fallback (removed by operator decision; a silent fallback
    # would mask that the split is not running).
    if grep -qiE 'no monolith fallback|hard STOP, no fallback|there is no (monolith )?fallback' "$LIDER" "$ORQUESTADOR" 2>/dev/null; then
        pass "AC-2.6-nofallback" "capability failure hard-STOPs (no monolith fallback)"
    else
        fail "AC-2.6-nofallback" "expected a documented hard-STOP-no-fallback path in lider.md or orquestador.md"
    fi
else
    fail "AC-2.6-floor-literal" "capability floor literal v2.1.199 — neither lider.md nor orquestador.md exists"
    fail "AC-2.6-nofallback" "hard-STOP-no-fallback path — neither lider.md nor orquestador.md exists"
fi

# ---------------------------------------------------------------------------
# Group F — sanity: gate-contract.md itself still intact (Task-1 regression
# guard; this suite does not re-test Task-1's own AC, only that Task-2 did
# not accidentally mutate the single-sourced file it must reference).
# ---------------------------------------------------------------------------
echo
echo "-- Group F: gate-contract.md untouched (Task-1 regression guard) --"
assert_file_exists "GATE-CONTRACT-PRESENT" "$GATE_CONTRACT" \
    "agents/_shared/gate-contract.md still present (single source, Task-1)"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  lider/orquestador split tests: $PASS passed / $((PASS + FAIL)) total"
echo "============================================================"
if [ $FAIL -gt 0 ]; then
    echo
    echo "Failures:"
    for f in "${FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi
exit 0
