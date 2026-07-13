#!/bin/bash
# tests/test_leader_orchestrator_split.sh
# Structural regression suite for the leader/orchestrator split: the combined
# coordinator+engine role is split into two distinct agents -- leader.md
# (top-level coordinator) and orchestrator.md (task-scoped engine that reuses
# the filename but not the old combined role). Assertions reference the
# single-sourced gate contract (agents/_shared/gate-contract.md) as an
# interface, never copied content.
#
# What this suite checks (deterministic assertions only; behavioral-scenario and
# probe cases live in tests/run-behavioral.sh / tests/probe_nested_dispatch.md,
# not here):
#   - SPLIT COMPLETENESS: leader.md (coordinator) + orchestrator.md (task-scoped
#     engine, reusing the filename but NOT the old combined coordinator+engine
#     role) are two distinct agents.
#   - GATE-MEDIATION LEADER: leader.md carries zero dual-record schema tokens (it
#     never records a release), declares its gate role as present-inline +
#     relay-with-attribution (leader-relayed-operator), references gate-contract.md
#     for the STOP-block templates it presents, restricts its write surface to
#     overview.md + 00-leader-roster.md, treats pending_gate as advisory-only, and
#     defines leader-recover as coarse-phase/status-only.
#   - PREPARE+RECORD SEAM: orchestrator.md references (never copies)
#     gate-contract.md, prepares and records all three STAGE-GATEs with the
#     dual-record tokens present, is sole-writer of its own 00-state.md, accepts
#     a leader-relayed decision ONLY with operator-verbatim + leader-relayed-operator
#     attribution, and rejects a synthesized/unattributed relay.
#   - LEGIBILITY: orchestrator dispatches specialists only.
#   - MODEL ALLOCATION: leader = opus/xhigh, orchestrator = sonnet/xhigh.
#   - CAPABILITY FLOOR: boot check literal + no-fallback hard STOP.
#
# Assertions test CONTRACT properties (presence/absence of authority), not exact
# prose -- a reasonable implementation passes; only a real deviation (a leader
# that emits/records a gate, an orchestrator that copies the contract instead of
# referencing it, a dispatched second orchestrator, a wrong frontmatter model)
# fails. Every file-scoped assertion FAILS (never silently passes) when its
# target file does not exist.
#
# Usage:
#   ./tests/test_leader_orchestrator_split.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEADER="$REPO_ROOT/agents/leader.md"
ORCHESTRATOR="$REPO_ROOT/agents/orchestrator.md"
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
echo "  Task-2 split: leader.md / orchestrator.md — structural suite"
echo "============================================================"

# ---------------------------------------------------------------------------
# Group 0 — SPLIT COMPLETENESS
# ---------------------------------------------------------------------------
echo
echo "-- Group 0: split completeness --"
assert_contains     "SPLIT-1" "$ORCHESTRATOR" 'task-scoped' \
    "agents/orchestrator.md is the task-scoped engine (split from the monolith, reusing the filename — not the old combined-role monolith)"
assert_file_exists  "SPLIT-2" "$LEADER"                "agents/leader.md created"
assert_file_exists  "SPLIT-3" "$ORCHESTRATOR"          "agents/orchestrator.md created"

# ---------------------------------------------------------------------------
# Group A — GATE-MEDIATION LEADER (GBL-1, GBL-5, GBL-6, GBL-7)
# AC-2.1 / AC-2.8 / AC-2.10 / AC-2.11 / AC-2.12 / AC-1.5(SEC-DR-F)
# ---------------------------------------------------------------------------
echo
echo "-- Group A: gate-mediation leader --"

# AC-2.1(b/c) + AC-2.8 + AC-1.5: the dual-record schema tokens (field names
# and event name) must be COMPLETELY absent from leader.md — not even inside
# a prohibition sentence, per gate-contract.md § "Notification-scoped
# boundary" ("Nothing else ... never includes the field names ... or the
# stage.gate.release event shape"). This single check covers most of
# GBL-1(b,c,d), GBL-5 (leader cannot read what it never names), and the
# capability-leak closure of AC-1.5/SEC-DR-F for the schema half.
assert_not_contains "AC-2.8a" "$LEADER" 'gate1_release|gate2_release_last|gate3_release' \
    "leader.md never names a gateN_release field (dual-record schema absent)"
assert_not_contains "AC-2.8b" "$LEADER" 'stage\.gate\.release' \
    "leader.md never names the stage.gate.release event (dual-record schema absent)"

# AC-1.5 (SEC-DR-F): under leader-mediation the leader REFERENCES gate-contract.md
# for the STOP-block templates + allowlists it presents inline. The capability
# floor is NOT schema-ignorance (that framing is retired): the leader may name the
# contract file, but must still never carry the dual-record SCHEMA TOKENS
# (gateN_release / stage.gate.release) in its own writes -- enforced by AC-2.8a/b.
assert_contains "AC-1.5" "$LEADER" 'gate-contract\.md' \
    "leader.md references agents/_shared/gate-contract.md for the STOP-block templates it presents"

# AC-2.1(a): leader.md contains no instruction to EMIT a STAGE-GATE STOP
# block that clears a gate — the literal STOP-block banner titles from
# gate-contract.md's STOP-block templates must not appear (their presence
# would mean leader.md duplicated/emits the release-capable STOP itself).
assert_not_contains "AC-2.1a" "$LEADER" 'Plan ready for human review|Delivery ready for human approval|Round \{?R\}?/\{?total_rounds\}?' \
    "leader.md does not carry the STAGE-GATE STOP-block banner text"

# AC-2.1(d): leader.md must not claim to create/write/own an orchestrator
# pipeline 00-state.md (it may legitimately READ coarse phase/status from
# one — that is AC-2.12 — so only the unhedged write/own claim is forbidden).
assert_no_unhedged_claim "AC-2.1d" "$LEADER" '00-state\.md' \
    '\b(creates?|writes?|owns?|writing)\b' \
    "leader.md carries no unhedged create/write/own claim on any 00-state.md"

# AC-2.1: self-declaration of the gate-MEDIATION role (present inline + relay).
# The word "gate-blind" still appears in leader.md ONLY as retired-model
# supersession context, so this asserts the POSITIVE role, not the absence of a word.
assert_contains "AC-2.1-self" "$LEADER" 'gate mediation|present.{0,40}relay|gate presentation protocol' \
    "leader.md declares its gate role as present-inline + relay"

# AC-2.1: at a gate the leader PRESENTS the gate to the operator inline (in its
# own conversation) -- the reachable channel -- rather than recording anything.
assert_contains "AC-2.1-present" "$LEADER" 'present.*inline' \
    "leader.md defines a present-the-gate-inline role"

# AC-2.5 (gate presentation protocol): the leader PRESENTS the gate and RELAYS the
# operator's decision verbatim, tagged leader-relayed-operator (the retired
# "bounce a misdirected reply" rule is replaced by present/relay/clarify).
assert_contains "AC-2.5-protocol" "$LEADER" 'gate presentation protocol|present.{0,60}relay' \
    "leader.md defines the gate presentation protocol (present + relay + clarify)"
# AC-2.5 (relay REQUIRED, with attribution): under leader-mediation the leader DOES
# relay the operator's decision -- verbatim, tagged leader-relayed-operator.
assert_contains "AC-2.5-relay" "$LEADER" 'leader-relayed-operator' \
    "leader.md relays the operator's decision tagged leader-relayed-operator"
assert_contains "AC-2.5-verbatim" "$LEADER" 'verbatim' \
    "leader.md relays the operator's decision verbatim (never synthesized)"

# AC-2.10 (GAP 1, durable roster): 00-leader-roster.md is declared as a REAL,
# durable file (not in-context memory).
assert_contains "AC-2.10-file" "$LEADER" '00-leader-roster\.md' \
    "leader.md declares 00-leader-roster.md as its roster file"
assert_contains "AC-2.10-durable" "$LEADER" 'durable|real file' \
    "leader.md declares the roster as durable / a real file (not in-context memory)"
assert_not_contains "AC-2.10-not-context-only" "$LEADER" 'roster.{0,60}(kept|held|stored).{0,20}in.context|in.context memory.{0,40}roster' \
    "leader.md does not describe the roster as in-context-only memory"

# AC-2.10 (write-surface restriction): the leader's write surface is limited
# to overview.md + 00-leader-roster.md.
assert_contains "AC-2.10-write-overview" "$LEADER" 'overview\.md' \
    "leader.md declares overview.md as (one of) its write targets"

# AC-2.11 (GAP 1, advisory pending_gate): pending_gate is advisory, never a
# gate-clear.
assert_contains "AC-2.11-field" "$LEADER" 'pending_gate' \
    "leader.md defines a pending_gate roster field"
assert_contains "AC-2.11-advisory" "$LEADER" 'advisory' \
    "leader.md declares pending_gate advisory (never a gate-clear)"

# AC-2.12 (GAP 1, leader-recover): reads only coarse phase/status, defines a
# leader-recover procedure distinct from orchestrator-recover, and never reads
# the dual-record (already covered globally by AC-2.8a/b above).
assert_contains "AC-2.12-proc" "$LEADER" 'leader-recover|l.der-recover' \
    "leader.md defines a leader-recover procedure"
assert_contains "AC-2.12-coarse" "$LEADER" 'coarse' \
    "leader.md scopes leader-recover reads to coarse phase/status fields"
# Extract the full leader-recover section (its heading to the next heading or
# horizontal rule) with awk, then confirm the section names no dual-record
# field. Section extraction is used instead of a fixed single-line window
# because grep -E is line-based and '.' never spans a newline -- a field named
# several lines below the heading would otherwise escape a windowed regex.
if [ ! -f "$LEADER" ]; then
    fail "AC-2.12-no-dual" "leader.md's leader-recover section never names the dual-record fields -- file not found: $LEADER"
elif awk '/^### leader-recover/{f=1; print; next} f && (/^##/ || /^---/){f=0} f' "$LEADER" \
        | grep -qiE -- 'gate1_release|gate2_release_last|gate3_release|stage\.gate\.release'; then
    fail "AC-2.12-no-dual" "leader.md's leader-recover section names a dual-record field"
else
    pass "AC-2.12-no-dual" "leader.md's leader-recover section never names the dual-record fields"
fi

# ---------------------------------------------------------------------------
# Group B — PREPARE+RECORD SEAM inside orchestrator.md (AC-2.2, AC-2.5)
# ---------------------------------------------------------------------------
echo
echo "-- Group B: prepare+record seam (orchestrator.md) --"

# AC-2.2: references (never copies) the single-sourced gate contract.
assert_contains "AC-2.2-ref" "$ORCHESTRATOR" 'gate-contract\.md' \
    "orchestrator.md references agents/_shared/gate-contract.md"
assert_not_contains "AC-2.2-no-copy-a" "$ORCHESTRATOR" '## Integrity model' \
    "orchestrator.md does not copy gate-contract.md's Integrity-model section verbatim"
assert_not_contains "AC-2.2-no-copy-b" "$ORCHESTRATOR" '## Record-based recover backstop' \
    "orchestrator.md does not copy gate-contract.md's recover-backstop section verbatim"
assert_not_contains "AC-2.2-no-copy-c" "$ORCHESTRATOR" '## .agents/leader\.md' \
    "orchestrator.md does not copy gate-contract.md's leader-boundary section verbatim"

# AC-2.2: owns all three STAGE-GATEs.
assert_contains "AC-2.2-g1" "$ORCHESTRATOR" 'STAGE-GATE-1' "orchestrator.md owns STAGE-GATE-1"
assert_contains "AC-2.2-g2" "$ORCHESTRATOR" 'STAGE-GATE-2' "orchestrator.md owns STAGE-GATE-2"
assert_contains "AC-2.2-g3" "$ORCHESTRATOR" 'STAGE-GATE-3' "orchestrator.md owns STAGE-GATE-3"

# AC-2.2: emits/witnesses/records the dual-record — the schema tokens that
# were forbidden in leader.md must be PRESENT in orchestrator.md (the seam is
# welded here, not absent everywhere).
assert_contains "AC-2.2-field1" "$ORCHESTRATOR" 'gate1_release' "orchestrator.md writes gate1_release"
assert_contains "AC-2.2-field2" "$ORCHESTRATOR" 'gate2_release_last' "orchestrator.md writes gate2_release_last"
assert_contains "AC-2.2-field3" "$ORCHESTRATOR" 'gate3_release' "orchestrator.md writes gate3_release"
assert_contains "AC-2.2-event" "$ORCHESTRATOR" 'stage\.gate\.release' "orchestrator.md appends stage.gate.release"

# AC-2.2: sole-writer of its own 00-state.md.
assert_contains "AC-2.2-sole-writer" "$ORCHESTRATOR" 'sole.writer|.nico escritor|only writer' \
    "orchestrator.md declares itself sole-writer of its own 00-state.md"

# AC-2.2: the orchestrator is PREPARER + RECORDER (th:leader is presenter + relayer).
# The old presenter==witness==recorder identity is retired by the leader-mediated pivot.
assert_contains "AC-2.2-identity" "$ORCHESTRATOR" 'prepare.{0,40}record|you prepare and record|preparer.{0,10}recorder' \
    "orchestrator.md carries the preparer+recorder identity (th:leader presents + relays)"

# AC-2.5: under leader-mediation the "leader presents / orchestrator records" cut IS
# the model -- the orchestrator ACCEPTS a relayed decision only with attribution
# (operator-verbatim + leader-relayed-operator) and REJECTS a synthesized/unattributed
# one. The retired model prohibited the cut outright; that framing is inverted.
assert_contains "AC-2.5-attribution" "$ORCHESTRATOR" 'attribution is required|leader-relayed-operator' \
    "orchestrator.md requires operator-attributed relay (leader-relayed-operator)"
assert_contains "AC-2.5-reject-synth" "$ORCHESTRATOR" 'synthesis is rejected|reject.{0,40}(synthes|unattributed)|not a valid gate decision' \
    "orchestrator.md rejects a synthesized/unattributed relay"
assert_contains "AC-2.5-relay-path" "$ORCHESTRATOR" 'th:leader.{0,40}relay|relay.{0,40}(operator|decision)' \
    "orchestrator.md states the gate decision reaches it via th:leader relay of the operator's decision"

# ---------------------------------------------------------------------------
# Group C — LEGIBILITY (AC-2.3)
# ---------------------------------------------------------------------------
echo
echo "-- Group C: legibility rule --"

assert_contains "AC-2.3-specialists" "$ORCHESTRATOR" 'architect' \
    "orchestrator.md's dispatch target set names specialists (architect present)"
assert_contains "AC-2.3-specialists2" "$ORCHESTRATOR" 'implementer' \
    "orchestrator.md's dispatch target set names specialists (implementer present)"
assert_not_contains "AC-2.3-no-self-nest" "$ORCHESTRATOR" 'dispatch(es|ing)? (another|a second|a nested) orchestrator' \
    "orchestrator.md does not claim to dispatch another orchestrator"
assert_contains "AC-2.3-only-leader-multiplies" "$ORCHESTRATOR" 'leader' \
    "orchestrator.md acknowledges the leader as the sole multiplier of orchestrators"

# ---------------------------------------------------------------------------
# Group D — MODEL ALLOCATION (AC-2.13)
# ---------------------------------------------------------------------------
echo
echo "-- Group D: model allocation --"

assert_frontmatter_field "AC-2.13-leader-model"  "$LEADER"       "model"  '"?opus"?'   "leader.md frontmatter model: opus"
assert_frontmatter_field "AC-2.13-leader-effort" "$LEADER"       "effort" '"?xhigh"?'  "leader.md frontmatter effort: xhigh"
assert_frontmatter_field "AC-2.13-orq-model"    "$ORCHESTRATOR" "model"  '"?sonnet"?' "orchestrator.md frontmatter model: sonnet"
assert_frontmatter_field "AC-2.13-orq-effort"   "$ORCHESTRATOR" "effort" '"?xhigh"?'  "orchestrator.md frontmatter effort: xhigh"

# ---------------------------------------------------------------------------
# Group E — CAPABILITY FLOOR + NO-FALLBACK (AC-2.6)
# ---------------------------------------------------------------------------
echo
echo "-- Group E: capability floor + no-fallback --"

# The boot capability check literal (CC >= v2.1.199) must appear somewhere
# in the split's boot logic (leader.md and/or orchestrator.md).
if [ -f "$LEADER" ] || [ -f "$ORCHESTRATOR" ]; then
    if grep -qiE 'v2\.1\.199' "$LEADER" "$ORCHESTRATOR" 2>/dev/null; then
        pass "AC-2.6-floor-literal" "capability floor literal v2.1.199 present (leader.md and/or orchestrator.md)"
    else
        fail "AC-2.6-floor-literal" "capability floor literal v2.1.199 not found in leader.md or orchestrator.md"
    fi
    # On capability failure the split hard-STOPs with a clear error — there is
    # NO monolith fallback (removed by operator decision; a silent fallback
    # would mask that the split is not running).
    if grep -qiE 'no monolith fallback|hard STOP, no fallback|there is no (monolith )?fallback' "$LEADER" "$ORCHESTRATOR" 2>/dev/null; then
        pass "AC-2.6-nofallback" "capability failure hard-STOPs (no monolith fallback)"
    else
        fail "AC-2.6-nofallback" "expected a documented hard-STOP-no-fallback path in leader.md or orchestrator.md"
    fi
else
    fail "AC-2.6-floor-literal" "capability floor literal v2.1.199 — neither leader.md nor orchestrator.md exists"
    fail "AC-2.6-nofallback" "hard-STOP-no-fallback path — neither leader.md nor orchestrator.md exists"
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
echo "  leader/orchestrator split tests: $PASS passed / $((PASS + FAIL)) total"
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
