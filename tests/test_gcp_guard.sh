#!/bin/bash
# tests/test_gcp_guard.sh
# Suite 87 — gcp-guard-hook-behavior
#
# Behavioral tests for hooks/ts/bodies/gcp-guard.ts (compiled to
# hooks/ts/dist/gcp-guard.cjs — the single source of gate logic post-cutover,
# issue #446).
#
# The hook is a PreToolUse gate that classifies gcloud verbs and returns:
#   - nodecision (exit 0, empty stdout)     for non-gcloud Bash, read-only verbs,
#                                            non-Bash tool payloads
#   - permissionDecision: ask               for mutating and destructive verbs
#   - permissionDecision: deny              for catastrophic denylist verbs
#
# SPEC (oracle is the contract documented in the hook's own header + 02-implementation.md,
# NOT the current output of the hook):
#   read-only: list, describe, get/get-*, search-all-resources, simulator,
#              replay-recent-access, recommendations, print-*, --dry-run, --validate-only
#   mutating:  create, update, patch, add-*, set-*, enable, disable, resize,
#              start, stop, deploy, import, add-iam-policy-binding, set-iam-policy
#   destructive: delete, remove-*, remove-iam-policy-binding, purge, clear-*, destroy
#   catastrophic (deny): projects delete, resource-manager folders delete,
#                        organizations * delete
#
# Fail-closed contract (NEVER allow for mutating/destructive):
#   gcloud + destructive verb present but unparseable -> ask (fail-safe)
#   gcloud + catastrophic token but unparseable       -> deny (fail-safe)
#   empty/malformed stdin with gcloud token           -> fail-safe (never allow)
#   strongest class across all gcloud invocations wins
#
# Usage:
#   bash tests/test_gcp_guard.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

# Marker: gcp-guard-hook-behavior

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/ts/dist/gcp-guard.cjs"

if [ ! -f "$HOOK" ]; then
    echo "ERROR: $HOOK not found — run 'npm --prefix hooks/ts run build'"
    exit 1
fi

PASS=0
FAIL=0
declare -a FAILURES

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Build a Bash tool-call JSON payload. Uses python3 for reliable JSON escaping.
make_payload() {
    local cmd="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
cmd = sys.argv[1]
payload = {'tool_name': 'Bash', 'tool_input': {'command': cmd}}
print(json.dumps(payload))
" "$cmd"
    else
        printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}\n' "$cmd"
    fi
}

# Build a non-Bash tool-call JSON payload (e.g. Read, Write, Edit).
make_nontool_payload() {
    local tool_name="$1"
    local file_path="${2:-/tmp/foo.txt}"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
payload = {'tool_name': sys.argv[1], 'tool_input': {'file_path': sys.argv[2]}}
print(json.dumps(payload))
" "$tool_name" "$file_path"
    else
        printf '{"tool_name":"%s","tool_input":{"file_path":"%s"}}\n' "$tool_name" "$file_path"
    fi
}

# Run the hook; print stdout (decision JSON or empty).
run_hook() {
    local payload="$1"
    node "$HOOK" <<< "$payload" 2>&1
}

# Assert hook emits "ask".
assert_ask() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"ask"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] ASK: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ASK expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] ASK: $name (got: ${out:-<empty>})"
    fi
}

# Assert hook emits "deny".
assert_deny() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

# assert_nodecision — PASS when the hook emits NO permissionDecision (exit 0, empty stdout).
# This is the "defer to operator's normal permission flow" contract.
# The hook MUST NOT return "allow" — that would silently widen permissions.
assert_nodecision() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if [ -z "$out" ] || ! echo "$out" | grep -q '"permissionDecision"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] NODECISION: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("NODECISION expected: $name | got: ${out:-<empty>}")
        echo "  [FAIL] NODECISION: $name (got: $out)"
    fi
}

# Assert hook NEVER returns "allow" (must be empty or ask/deny).
assert_never_allow() {
    local name="$1"
    local payload="$2"
    local out
    out=$(run_hook "$payload")
    if echo "$out" | grep -q '"permissionDecision": *"allow"'; then
        FAIL=$((FAIL + 1))
        FAILURES+=("ALLOW emitted (forbidden for gcloud): $name | got: $out")
        echo "  [FAIL] NEVER-ALLOW: $name (hook emitted allow — contract violation)"
    else
        PASS=$((PASS + 1))
        echo "  [PASS] NEVER-ALLOW: $name (no allow emitted)"
    fi
}

# ---------------------------------------------------------------------------
# Case 1 — read-only verb: list -> nodecision
# ---------------------------------------------------------------------------
echo "=== Case 1: read-only verb (list) -> NODECISION ==="
assert_nodecision \
    "gcloud compute instances list --project=my-project" \
    "$(make_payload 'gcloud compute instances list --project=my-project')"

# ---------------------------------------------------------------------------
# Case 2a — read-only with --dry-run -> nodecision
# ---------------------------------------------------------------------------
echo
echo "=== Case 2a: read-only flag (--dry-run) -> NODECISION ==="
assert_nodecision \
    "gcloud compute instances create vm1 --dry-run" \
    "$(make_payload 'gcloud compute instances create vm1 --dry-run --project=my-project')"

# ---------------------------------------------------------------------------
# Case 2b — read-only with --validate-only -> nodecision
# ---------------------------------------------------------------------------
echo
echo "=== Case 2b: read-only flag (--validate-only) -> NODECISION ==="
assert_nodecision \
    "gcloud deployment-manager deployments create dep --validate-only" \
    "$(make_payload 'gcloud deployment-manager deployments create dep --validate-only --config=config.yaml')"

# ---------------------------------------------------------------------------
# Case 3 — mutating: create -> ask
# ---------------------------------------------------------------------------
echo
echo "=== Case 3: mutating verb (create) -> ASK ==="
assert_ask \
    "gcloud compute instances create vm1 --project=my-project" \
    "$(make_payload 'gcloud compute instances create vm1 --project=my-project --zone=us-central1-a')"

# Also assert never-allow for the same payload (belt + suspenders)
assert_never_allow \
    "gcloud compute instances create — never allow" \
    "$(make_payload 'gcloud compute instances create vm1 --project=my-project')"

# ---------------------------------------------------------------------------
# Case 4 — mutating IAM: set-iam-policy / add-iam-policy-binding -> ask
# ---------------------------------------------------------------------------
echo
echo "=== Case 4a: mutating IAM (set-iam-policy) -> ASK ==="
assert_ask \
    "gcloud projects set-iam-policy my-project policy.yaml" \
    "$(make_payload 'gcloud projects set-iam-policy my-project policy.yaml')"

echo
echo "=== Case 4b: mutating IAM (add-iam-policy-binding) -> ASK ==="
assert_ask \
    "gcloud projects add-iam-policy-binding my-project --member=user:x@example.com --role=roles/editor" \
    "$(make_payload 'gcloud projects add-iam-policy-binding my-project --member=user:x@example.com --role=roles/editor')"

# ---------------------------------------------------------------------------
# Case 5 — destructive: delete -> ask with irreversibility reason
# ---------------------------------------------------------------------------
echo
echo "=== Case 5: destructive verb (delete) -> ASK (irreversibility reason) ==="
assert_ask \
    "gcloud compute instances delete vm1 --project=my-project" \
    "$(make_payload 'gcloud compute instances delete vm1 --project=my-project --zone=us-central1-a')"

# The reason must mention irreversibility or blast-radius
_case5_out=$(run_hook "$(make_payload 'gcloud compute instances delete vm1 --project=my-project')")
_case5_reason_ok=0
if echo "$_case5_out" | grep -qi 'irreversible\|IRREVERSIBLE\|blast.radius\|permanently\|cannot be undone'; then
    _case5_reason_ok=1
fi
if [ "$_case5_reason_ok" -eq 1 ]; then
    PASS=$((PASS + 1))
    echo "  [PASS] ASK-REASON: destructive delete reason mentions irreversibility"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("ASK-REASON: destructive delete reason missing irreversibility token | got: ${_case5_out:-<empty>}")
    echo "  [FAIL] ASK-REASON: destructive delete reason missing irreversibility/blast-radius token"
fi

# ---------------------------------------------------------------------------
# Case 6 — catastrophic denylist: projects delete -> deny
# ---------------------------------------------------------------------------
echo
echo "=== Case 6a: catastrophic denylist (projects delete) -> DENY ==="
assert_deny \
    "gcloud projects delete my-project" \
    "$(make_payload 'gcloud projects delete my-project')"

echo
echo "=== Case 6b: catastrophic denylist (resource-manager folders delete) -> DENY ==="
assert_deny \
    "gcloud resource-manager folders delete 123456789" \
    "$(make_payload 'gcloud resource-manager folders delete 123456789')"

# Also assert never-allow for catastrophic
assert_never_allow \
    "gcloud projects delete — never allow" \
    "$(make_payload 'gcloud projects delete my-project')"

# ---------------------------------------------------------------------------
# Case 7 — non-gcloud Bash: ls -la -> nodecision
# ---------------------------------------------------------------------------
echo
echo "=== Case 7: non-gcloud Bash (ls -la) -> NODECISION ==="
assert_nodecision \
    "ls -la /tmp" \
    "$(make_payload 'ls -la /tmp')"

echo
echo "=== Case 7b: non-gcloud Bash (git status) -> NODECISION ==="
assert_nodecision \
    "git status" \
    "$(make_payload 'git status')"

# ---------------------------------------------------------------------------
# Case 8 — non-Bash tool payload (e.g. Read) -> nodecision
# The hook only gates Bash; all other tool types must produce no decision.
# ---------------------------------------------------------------------------
echo
echo "=== Case 8a: non-Bash tool (Read) -> NODECISION ==="
assert_nodecision \
    "Read tool payload (not Bash)" \
    "$(make_nontool_payload 'Read' '/tmp/foo.txt')"

echo
echo "=== Case 8b: non-Bash tool (Write) -> NODECISION ==="
assert_nodecision \
    "Write tool payload (not Bash)" \
    "$(make_nontool_payload 'Write' '/tmp/foo.txt')"

echo
echo "=== Case 8c: non-Bash tool (Edit) -> NODECISION ==="
assert_nodecision \
    "Edit tool payload (not Bash)" \
    "$(make_nontool_payload 'Edit' '/tmp/foo.txt')"

# ---------------------------------------------------------------------------
# Case 9 — strongest-class-wins: list && delete compound -> ask (destructive wins)
# A compound command containing both a read-only and a destructive verb must
# produce ASK, not nodecision. Destructive class outranks read-only.
# ---------------------------------------------------------------------------
echo
echo "=== Case 9: compound (list && delete) -> ASK (strongest class = destructive) ==="
assert_ask \
    "gcloud compute instances list && gcloud compute instances delete vm1" \
    "$(make_payload 'gcloud compute instances list --project=p1 && gcloud compute instances delete vm1 --project=p1 --zone=us-central1-a')"

# Also verify never-allow on the same compound
assert_never_allow \
    "compound list && delete — never allow" \
    "$(make_payload 'gcloud compute instances list --project=p1 && gcloud compute instances delete vm1 --project=p1')"

# ---------------------------------------------------------------------------
# Case 9b — strongest-class-wins: mutating + catastrophic compound -> deny
# A compound containing both a mutating verb and a catastrophic verb must
# produce DENY (catastrophic outranks mutating).
# ---------------------------------------------------------------------------
echo
echo "=== Case 9b: compound (create && projects delete) -> DENY (catastrophic wins) ==="
assert_deny \
    "gcloud compute instances create vm1 && gcloud projects delete my-project" \
    "$(make_payload 'gcloud compute instances create vm1 --project=p1 && gcloud projects delete my-project')"

# ---------------------------------------------------------------------------
# Case 10a — malformed/empty stdin -> fail-safe (never allow)
# An empty payload is not a Bash tool call at all; hook must exit cleanly
# without emitting "allow" or crashing.
# ---------------------------------------------------------------------------
echo
echo "=== Case 10a: empty stdin -> fail-safe (never allow, no crash) ==="
assert_nodecision \
    "empty stdin (malformed input)" \
    ""

echo
echo "=== Case 10a-2: curly braces only ({}), not JSON -> fail-safe (never allow) ==="
assert_nodecision \
    "literal curly braces (not JSON)" \
    "{}"

# ---------------------------------------------------------------------------
# Case 10b — gcloud token in raw payload but unparseable JSON (no tool_name field)
# When extraction fails on a payload that contains "gcloud" and a destructive token,
# the hook must gate (ask), never allow. This is the fail-closed contract.
# ---------------------------------------------------------------------------
echo
echo "=== Case 10b: gcloud + destructive token in unparseable payload -> ASK (fail-safe) ==="
_case10b_payload='not valid json but contains gcloud compute instances delete vm1'
_case10b_out=$(run_hook "$_case10b_payload")
# The hook should not emit allow; it may emit ask or nodecision depending on how
# deeply it can parse. If it extracts "delete" from raw text it must ask/deny;
# if it cannot parse tool_name it exits early as nodecision. Either is acceptable
# as long as it NEVER emits allow.
if echo "$_case10b_out" | grep -q '"permissionDecision": *"allow"'; then
    FAIL=$((FAIL + 1))
    FAILURES+=("Case 10b: hook emitted allow on unparseable gcloud+delete payload — contract violation")
    echo "  [FAIL] NEVER-ALLOW (10b): unparseable gcloud+delete payload emitted allow"
else
    PASS=$((PASS + 1))
    echo "  [PASS] NEVER-ALLOW (10b): unparseable gcloud+delete payload did not emit allow (got: ${_case10b_out:-<nodecision>})"
fi

# ---------------------------------------------------------------------------
# Case 10c — gcloud token in raw payload but unparseable, with catastrophic token
# When the raw payload contains "projects delete", the hook must deny (fail-safe).
# ---------------------------------------------------------------------------
echo
echo "=== Case 10c: gcloud + 'projects delete' in unparseable payload -> fail-safe (never allow) ==="
_case10c_payload='not valid json but contains gcloud projects delete my-dangerous-project'
_case10c_out=$(run_hook "$_case10c_payload")
if echo "$_case10c_out" | grep -q '"permissionDecision": *"allow"'; then
    FAIL=$((FAIL + 1))
    FAILURES+=("Case 10c: hook emitted allow on unparseable gcloud projects delete payload — contract violation")
    echo "  [FAIL] NEVER-ALLOW (10c): unparseable gcloud+projects+delete emitted allow"
else
    PASS=$((PASS + 1))
    echo "  [PASS] NEVER-ALLOW (10c): unparseable gcloud+projects+delete did not emit allow (got: ${_case10c_out:-<nodecision>})"
fi

# ---------------------------------------------------------------------------
# Case 11 — SEC-PR2-002: command field absent (well-formed JSON, malformed
# tool_input shape) but a catastrophic verb present elsewhere in tool_input
# -> DENY. Regression test for the Step-5 raw-catastrophic-scan fail-safe,
# which was dead code before the fix (an absent command field produced ""
# rather than null, short-circuiting to none() before Step 5 could run).
# ---------------------------------------------------------------------------
echo
echo "=== Case 11: command field absent + 'projects delete' in raw payload -> DENY (SEC-PR2-002 fail-safe) ==="
_case11_payload='{"tool_name":"Bash","tool_input":{"raw_input":"gcloud projects delete my-dangerous-project"}}'
assert_deny \
    "command absent, catastrophic verb elsewhere in tool_input -> deny (fail-safe reachable)" \
    "$_case11_payload"

echo
echo "=== Case 11b: command field absent + no gcloud token anywhere -> NODECISION (fail-safe does not over-trigger) ==="
_case11b_payload='{"tool_name":"Bash","tool_input":{"raw_input":"echo hello world"}}'
assert_nodecision \
    "command absent, no gcloud token -> nodecision" \
    "$_case11b_payload"

# ---------------------------------------------------------------------------
# Case 12 — CodeRabbit finding [5]: RAW_CATASTROPHIC_RE used an invalid POSIX
# class [^[:space:]"] (matches literal chars [, :, s, p, a, c, e, ], " — NOT
# non-whitespace) instead of [^\s"], so the "organizations <arg> delete"
# alternative of the Step-5 raw-payload fail-safe never matched a real org
# name. Regression test for the fix: command field absent + raw payload
# contains "organizations <org> delete" -> DENY.
# ---------------------------------------------------------------------------
echo
echo "=== Case 12: command field absent + 'organizations abc delete' in raw payload -> DENY (RAW_CATASTROPHIC_RE org fix) ==="
_case12_payload='{"tool_name":"Bash","tool_input":{"raw_input":"gcloud organizations abc delete"}}'
assert_deny \
    "command absent, catastrophic org-delete verb elsewhere in tool_input -> deny (fail-safe reachable)" \
    "$_case12_payload"

# ---------------------------------------------------------------------------
# Additional contract validations
# ---------------------------------------------------------------------------

# Additional read-only verbs: describe, get
echo
echo "=== Additional: read-only verbs (describe, get) -> NODECISION ==="
assert_nodecision \
    "gcloud compute instances describe vm1 --project=p1" \
    "$(make_payload 'gcloud compute instances describe vm1 --project=my-project --zone=us-central1-a')"

assert_nodecision \
    "gcloud projects get-iam-policy my-project" \
    "$(make_payload 'gcloud projects get-iam-policy my-project')"

# Additional mutating verbs: stop, enable, set-*
echo
echo "=== Additional: mutating verbs (stop, enable, set-*) -> ASK ==="
assert_ask \
    "gcloud compute instances stop vm1" \
    "$(make_payload 'gcloud compute instances stop vm1 --project=my-project --zone=us-central1-a')"

assert_ask \
    "gcloud services enable compute.googleapis.com" \
    "$(make_payload 'gcloud services enable compute.googleapis.com --project=my-project')"

assert_ask \
    "gcloud compute project-info describe set-* like set-common-instance-metadata" \
    "$(make_payload 'gcloud compute project-info add-metadata --metadata=key=val --project=my-project')"

# Additional destructive verbs: remove-*, purge
echo
echo "=== Additional: destructive verbs (remove-iam-policy-binding, purge) -> ASK ==="
assert_ask \
    "gcloud projects remove-iam-policy-binding" \
    "$(make_payload 'gcloud projects remove-iam-policy-binding my-project --member=user:x@example.com --role=roles/viewer')"

# No-self-approval marker contract: hook emits no "agent-writable" override marker
# A single "ask" response must contain only hookSpecificOutput fields, not any
# agent-controlled bypass token. We check that the JSON does NOT contain known
# bypass tokens.
echo
echo "=== Contract: no self-approval marker in ask response ==="
_contract_out=$(run_hook "$(make_payload 'gcloud compute instances create vm1 --project=p1')")
_has_bypass=0
for _token in "approved" "bypass" "authorized" "agent-approval" "auto-approve"; do
    if echo "$_contract_out" | grep -qi "\"$_token\""; then
        _has_bypass=1
    fi
done
if [ "$_has_bypass" -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "  [PASS] CONTRACT: ask response contains no agent-writable bypass token"
else
    FAIL=$((FAIL + 1))
    FAILURES+=("CONTRACT: ask response contains a bypass token — no self-approval marker allowed | got: $_contract_out")
    echo "  [FAIL] CONTRACT: ask response contains a bypass token"
fi

# ---------------------------------------------------------------------------
# SEC-001 regression — bash -c "gcloud … delete …" caught past word-5
#
# A destructive verb buried inside a bash -c "..." argument sits beyond the
# first 5 words extracted by the word loop. Before SEC-001 the full-segment
# scan was absent and this degraded to nodecision. The hardened hook must
# classify it as destructive → ask.
# ---------------------------------------------------------------------------
echo
echo "=== SEC-001: bash -c 'gcloud beta compute instances --zone=z --project=p delete vm-1' -> ASK ==="
assert_ask \
    "bash -c with gcloud delete buried after --flags (SEC-001)" \
    "$(make_payload 'bash -c "gcloud beta compute instances --zone=z --project=p delete vm-1"')"

# Belt + suspenders: must never emit allow for this vector
assert_never_allow \
    "bash -c gcloud delete — never allow (SEC-001)" \
    "$(make_payload 'bash -c "gcloud beta compute instances --zone=z --project=p delete vm-1"')"

# ---------------------------------------------------------------------------
# SEC-002 regression — xargs pipeline: destructive verb in second segment
#
# The pipe splits the command into two segments. The second segment contains
# "gcloud compute instances delete". Before SEC-001/002 the full-segment scan
# was missing; the xargs segment was classified as unknown (no gcloud token in
# the cleaned words). The hardened hook detects "delete" in the full segment
# text → destructive → ask (strongest class wins over the first segment's
# read-only).
# ---------------------------------------------------------------------------
echo
echo "=== SEC-002: xargs pipeline with gcloud delete in second segment -> ASK ==="
assert_ask \
    "gcloud list | xargs gcloud delete (SEC-002)" \
    "$(make_payload "gcloud compute instances list --format='value(name)' | xargs -I{} gcloud compute instances delete {} --project=p")"

assert_never_allow \
    "xargs gcloud delete — never allow (SEC-002)" \
    "$(make_payload "gcloud compute instances list --format='value(name)' | xargs -I{} gcloud compute instances delete {} --project=p")"

# ---------------------------------------------------------------------------
# SEC-005 regression — organizations list with --filter="state:DELETE_REQUESTED"
# must NOT false-deny
#
# Before SEC-005 the organizations catastrophic pattern was greedy and matched
# "delete" anywhere after the org name, including inside --filter values.
# The hardened hook uses a token-anchored pattern that requires "delete" to
# appear as a standalone verb token (followed by whitespace, quote, or EOS),
# so "DELETE_REQUESTED" inside a flag value must NOT trigger a deny.
# ---------------------------------------------------------------------------
echo
echo "=== SEC-005a: gcloud organizations list --filter='state:DELETE_REQUESTED' -> NODECISION (no false-deny) ==="
assert_nodecision \
    "organizations list with DELETE_REQUESTED in filter (SEC-005 false-deny fix)" \
    "$(make_payload 'gcloud organizations list --filter="state:DELETE_REQUESTED"')"

# ---------------------------------------------------------------------------
# SEC-005 — real org delete must still deny
#
# The token-anchored fix must not weaken protection for actual org deletion.
# "gcloud organizations my-org delete" carries a real destructive verb as a
# standalone token and must still be classified as catastrophic → deny.
# ---------------------------------------------------------------------------
echo
echo "=== SEC-005b: gcloud organizations my-org delete -> DENY (catastrophic, real org delete) ==="
assert_deny \
    "gcloud organizations <id> delete (SEC-005 real org delete still blocked)" \
    "$(make_payload 'gcloud organizations my-org delete')"

# ---------------------------------------------------------------------------
# SEC-003 regression — variable-indirection must NEVER return allow
#
# When the destructive verb is stored in a shell variable (V=delete; gcloud …
# "$V" …), the hook cannot resolve the substitution at inspection time. This
# is a documented inherent limit. The fail-safe contract requires that the hook
# NEVER returns "allow" for such input; degrading to nodecision or ask is both
# acceptable. "allow" is the only forbidden outcome.
# ---------------------------------------------------------------------------
echo
echo "=== SEC-003: variable-indirection V=delete must never return allow ==="
assert_never_allow \
    "V=delete variable-indirection degrade to fail-safe, never allow (SEC-003)" \
    "$(make_payload 'V=delete; gcloud compute instances "$V" vm-1 --project=p')"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "============================================================"
echo "  Suite 87 gcp-guard tests: $PASS passed / $((PASS + FAIL)) total"
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
