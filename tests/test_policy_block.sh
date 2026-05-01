#!/bin/bash
# tests/test_policy_block.sh
# Functional tests for hooks/policy-block.sh
# Each case feeds a tool-call JSON payload to the hook and asserts the output:
#   - "deny" cases must produce a JSON with permissionDecision: "deny"
#   - "allow" cases must produce empty stdout (no JSON, hook lets the call through)
#
# Usage:
#   ./tests/test_policy_block.sh
# Exit code:
#   0 if all cases pass, 1 otherwise.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/hooks/policy-block.sh"

if [ ! -x "$HOOK" ]; then
    chmod +x "$HOOK"
fi

PASS=0
FAIL=0
declare -a FAILURES

assert_deny() {
    local name="$1"
    local payload="$2"
    local out
    out=$(echo "$payload" | bash "$HOOK" 2>&1)
    if echo "$out" | grep -q '"permissionDecision": "deny"'; then
        PASS=$((PASS + 1))
        echo "  [PASS] DENY: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("DENY expected but got allow: $name | output: $out")
        echo "  [FAIL] DENY: $name (got: ${out:-<empty>})"
    fi
}

assert_allow() {
    local name="$1"
    local payload="$2"
    local out
    out=$(echo "$payload" | bash "$HOOK" 2>&1)
    if [ -z "$out" ]; then
        PASS=$((PASS + 1))
        echo "  [PASS] ALLOW: $name"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("ALLOW expected but got deny: $name | output: $out")
        echo "  [FAIL] ALLOW: $name (got: $out)"
    fi
}

echo "=== Bash: rm -rf destructive targets (DENY) ==="
assert_deny "rm -rf /" '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'
assert_deny "rm -rf / (with --)" '{"tool_name":"Bash","tool_input":{"command":"rm -rf -- /"}}'
assert_deny "rm -rf ~" '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~"}}'
assert_deny "rm -rf \$HOME" '{"tool_name":"Bash","tool_input":{"command":"rm -rf $HOME"}}'
assert_deny "rm -rf \${HOME}" '{"tool_name":"Bash","tool_input":{"command":"rm -rf ${HOME}"}}'
assert_deny "rm -fr / (flags reversed)" '{"tool_name":"Bash","tool_input":{"command":"rm -fr /"}}'
assert_deny "rm -Rf / (uppercase R)" '{"tool_name":"Bash","tool_input":{"command":"rm -Rf /"}}'
assert_deny "rm -rf * (bare wildcard)" '{"tool_name":"Bash","tool_input":{"command":"rm -rf *"}}'

echo
echo "=== Bash: rm safe targets (ALLOW) ==="
assert_allow "rm -rf /tmp/foo" '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/foo"}}'
assert_allow "rm -rf \$HOME/junk" '{"tool_name":"Bash","tool_input":{"command":"rm -rf $HOME/junk"}}'
assert_allow "rm -rf ~/junk" '{"tool_name":"Bash","tool_input":{"command":"rm -rf ~/junk"}}'
assert_allow "rm /tmp/foo (no -rf)" '{"tool_name":"Bash","tool_input":{"command":"rm /tmp/foo"}}'

echo
echo "=== Bash: git destructive operations (DENY) ==="
assert_deny "git push --force" '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}'
assert_deny "git push -f" '{"tool_name":"Bash","tool_input":{"command":"git push -f origin main"}}'
assert_deny "git push --force-with-lease" '{"tool_name":"Bash","tool_input":{"command":"git push --force-with-lease origin main"}}'
assert_deny "git reset --hard" '{"tool_name":"Bash","tool_input":{"command":"git reset --hard origin/main"}}'
assert_deny "git clean -fd" '{"tool_name":"Bash","tool_input":{"command":"git clean -fd"}}'
assert_deny "git commit --no-verify" '{"tool_name":"Bash","tool_input":{"command":"git commit -m hello --no-verify"}}'
assert_deny "git rebase --no-verify" '{"tool_name":"Bash","tool_input":{"command":"git rebase --no-verify main"}}'

echo
echo "=== Bash: git safe operations (ALLOW) ==="
assert_allow "git push origin main" '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
assert_allow "git push -u origin feature/x" '{"tool_name":"Bash","tool_input":{"command":"git push -u origin feature/x"}}'
assert_allow "git reset --soft HEAD~1" '{"tool_name":"Bash","tool_input":{"command":"git reset --soft HEAD~1"}}'
assert_allow "git clean (no -f)" '{"tool_name":"Bash","tool_input":{"command":"git clean -n"}}'
assert_allow "git commit -m message" '{"tool_name":"Bash","tool_input":{"command":"git commit -m hello"}}'

echo
echo "=== Bash: destructive SQL via shell (DENY) ==="
assert_deny "DROP TABLE" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"DROP TABLE users\""}}'
assert_deny "drop database (lowercase)" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"drop database analytics\""}}'
assert_deny "DROP SCHEMA" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"DROP SCHEMA public CASCADE\""}}'
assert_deny "TRUNCATE TABLE" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"TRUNCATE TABLE events\""}}'

echo
echo "=== Bash: safe SQL via shell (ALLOW) ==="
assert_allow "SELECT" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"SELECT * FROM users\""}}'
assert_allow "INSERT INTO" '{"tool_name":"Bash","tool_input":{"command":"psql -c \"INSERT INTO logs(x) VALUES (1)\""}}'

echo
echo "=== Write/Edit: sensitive paths (DENY) ==="
assert_deny "Write /home/u/.env" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.env"}}'
assert_deny "Write .env.production" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.env.production"}}'
assert_deny "Edit cert.pem" '{"tool_name":"Edit","tool_input":{"file_path":"/etc/ssl/cert.pem"}}'
assert_deny "Write id_rsa" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.ssh/id_rsa"}}'
assert_deny "Write id_ed25519" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.ssh/id_ed25519"}}'
assert_deny "Write under .ssh/" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.ssh/known_hosts"}}'
assert_deny "Write .aws/credentials" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.aws/credentials"}}'
assert_deny "Write credentials.json" '{"tool_name":"Write","tool_input":{"file_path":"/srv/app/credentials.json"}}'
assert_deny "Write secrets.yaml" '{"tool_name":"Write","tool_input":{"file_path":"/srv/app/secrets.yaml"}}'
assert_deny "Write secrets.toml" '{"tool_name":"Write","tool_input":{"file_path":"/srv/app/secrets.toml"}}'

echo
echo "=== Write/Edit: example/sample variants (ALLOW) ==="
assert_allow ".env.example" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.env.example"}}'
assert_allow ".env.sample" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.env.sample"}}'
assert_allow ".env.template" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/.env.template"}}'
assert_allow "regular source file" '{"tool_name":"Write","tool_input":{"file_path":"/home/u/app/main.py"}}'

echo
echo "=== Other tools (ALLOW — hook only inspects Bash/Write/Edit/NotebookEdit) ==="
assert_allow "Read on .env (read-only is fine)" '{"tool_name":"Read","tool_input":{"file_path":"/home/u/.env"}}'
assert_allow "Glob" '{"tool_name":"Glob","tool_input":{"pattern":"**/*.py"}}'

echo
echo "=== Malformed payload (ALLOW — fail open on parser errors) ==="
assert_allow "empty payload" ''
assert_allow "invalid JSON" 'not-a-json'

echo
echo "============================================================"
echo "  policy-block tests: $PASS passed / $((PASS + FAIL)) total"
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
