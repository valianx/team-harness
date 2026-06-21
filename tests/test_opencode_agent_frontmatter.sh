#!/usr/bin/env bash
# tests/test_opencode_agent_frontmatter.sh
#
# Smoke test: build the Go installer, run `apply --runtime opencode` into a
# temp directory, and assert that a placed agent .md file has valid opencode
# frontmatter:
#   - permission is a YAML block-form object (not an array)
#   - color is a valid opencode named enum (not a CC color name)
#   - no mcp__* tokens appear in the permission section
#
# Skips with exit 0 when `go` is absent (AC-6).
#
# Usage: bash tests/test_opencode_agent_frontmatter.sh
# Exit 0 = pass, 1 = fail.

set -euo pipefail

PASS=0
FAIL=1

# Resolve repo root (two dirs up from this script).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Skip when go is absent.
if ! command -v go &>/dev/null; then
  echo "SKIP: go not found — skipping opencode frontmatter smoke test"
  exit 0
fi

echo "=== opencode agent frontmatter smoke test ==="

# Build the installer binary into a temp location.
BIN_DIR="$(mktemp -d)"
trap 'rm -rf "${BIN_DIR}"' EXIT

BINARY="${BIN_DIR}/th-installer"
echo "Building installer..."
if ! (cd "${REPO_ROOT}" && go build -o "${BINARY}" ./cmd/install) 2>&1; then
  echo "FAIL: go build failed"
  exit ${FAIL}
fi
echo "  Binary: ${BINARY}"

# Create a temp HOME for the apply run (no actual ~/.claude modification).
FAKE_HOME="$(mktemp -d)"
trap 'rm -rf "${FAKE_HOME}" "${BIN_DIR}"' EXIT

OPENCODE_DIR="${FAKE_HOME}/.opencode"

echo "Running apply --runtime opencode ..."
# Non-interactive apply into the fake home.
HOME="${FAKE_HOME}" MEMORY_MCP_URL="https://smoke-test.example.com/mcp" CONTEXT7_API_KEY="ctx7-smoke-test" \
  "${BINARY}" apply \
    --runtime opencode \
    --opencode-dir "${OPENCODE_DIR}" \
    --non-interactive \
    2>&1 | tail -5 || true

# Find a representative placed agent file.
AGENT_FILE="${OPENCODE_DIR}/agents/orchestrator.md"
if [[ ! -f "${AGENT_FILE}" ]]; then
  # Fall back to any placed agent file.
  AGENT_FILE="$(find "${OPENCODE_DIR}/agents" -name "*.md" 2>/dev/null | head -1 || true)"
fi

if [[ -z "${AGENT_FILE}" || ! -f "${AGENT_FILE}" ]]; then
  echo "FAIL: no placed agent .md found under ${OPENCODE_DIR}/agents/"
  exit ${FAIL}
fi

echo "Checking: ${AGENT_FILE}"
CONTENT="$(cat "${AGENT_FILE}")"

# Extract frontmatter section (between the first and second --- fences).
# Read lines after the first "---" until the next "---" is found.
FM=""
in_fm=false
while IFS= read -r line; do
  if [[ "${line}" == "---" ]]; then
    if [[ "${in_fm}" == false ]]; then
      in_fm=true
      continue
    else
      break
    fi
  fi
  if [[ "${in_fm}" == true ]]; then
    FM="${FM}${line}"$'\n'
  fi
done <<< "${CONTENT}"

echo ""
echo "--- Frontmatter ---"
echo "${FM}"
echo "-------------------"

FAILURES=0

# 1. permission must be present.
if ! echo "${FM}" | grep -q "^permission:"; then
  echo "FAIL: permission field not found in frontmatter"
  FAILURES=$((FAILURES + 1))
else
  echo "PASS: permission field present"
fi

# 2. permission must be flow-form object (not array form).
# Valid: "permission: {read: allow, edit: allow, ...}" or "permission: {}"
# Invalid: "permission: {allow: [...]}" or block form with separate allow: key
if echo "${FM}" | grep -q "^permission:.*\[" || echo "${FM}" | grep -qP "^\s+allow:" 2>/dev/null; then
  echo "FAIL: permission appears to use array form (allow: [...] or block allow: key)"
  FAILURES=$((FAILURES + 1))
else
  echo "PASS: permission is not in array form"
fi

# 2b. permission must be on a single line (flow-form object).
PERM_LINE="$(echo "${FM}" | grep "^permission:" || true)"
if [[ -z "${PERM_LINE}" ]]; then
  echo "INFO: permission field not found on a single line (already flagged above)"
elif echo "${PERM_LINE}" | grep -q "^permission: {"; then
  echo "PASS: permission is flow-form object {}"
else
  echo "FAIL: permission is not flow-form — expected 'permission: {key: allow, ...}'"
  FAILURES=$((FAILURES + 1))
fi

# 3. permission block must not contain mcp__ tokens.
if echo "${FM}" | grep -q "mcp__"; then
  echo "FAIL: mcp__ token found in frontmatter — should be dropped from permission"
  FAILURES=$((FAILURES + 1))
else
  echo "PASS: no mcp__ tokens in frontmatter"
fi

# 4. Every permission key in the flow-form object must be from the opencode closed key set.
# Flow form: permission: {read: allow, edit: allow, bash: allow}
VALID_KEYS="read edit glob grep list bash task external_directory todowrite webfetch websearch lsp skill question doom_loop"
PERM_LINE="$(echo "${FM}" | grep "^permission:" || true)"
if [[ -n "${PERM_LINE}" ]]; then
  # Extract the content between { and } from "permission: {read: allow, edit: allow}"
  PERM_CONTENT="${PERM_LINE#*\{}"
  PERM_CONTENT="${PERM_CONTENT%\}*}"
  # Split by comma and check each key.
  IFS=',' read -ra PERM_PAIRS <<< "${PERM_CONTENT}"
  for pair in "${PERM_PAIRS[@]}"; do
    pair="$(echo "${pair}" | tr -d ' ')"
    if [[ -z "${pair}" ]]; then continue; fi
    key="${pair%%:*}"
    if [[ -n "${key}" ]] && ! echo " ${VALID_KEYS} " | grep -q " ${key} "; then
      echo "FAIL: permission key '${key}' is not in the opencode closed key set"
      FAILURES=$((FAILURES + 1))
    fi
  done
fi

# 5. If color is present, it must be a valid opencode value (named enum or hex).
COLOR_LINE="$(echo "${FM}" | grep "^color:" || true)"
if [[ -n "${COLOR_LINE}" ]]; then
  COLOR_VAL="${COLOR_LINE#color: }"
  COLOR_VAL="${COLOR_VAL//\"/}"
  COLOR_VAL="$(echo "${COLOR_VAL}" | tr -d '[:space:]')"
  VALID_ENUMS="primary secondary accent success warning error info"
  HEX_RE='^#[0-9a-fA-F]{6}$'
  if echo " ${VALID_ENUMS} " | grep -q " ${COLOR_VAL} " || echo "${COLOR_VAL}" | grep -qP "${HEX_RE}" 2>/dev/null || [[ "${COLOR_VAL}" =~ ^#[0-9a-fA-F]{6}$ ]]; then
    echo "PASS: color '${COLOR_VAL}' is a valid opencode enum or hex"
  else
    echo "FAIL: color '${COLOR_VAL}' is not a valid opencode enum or hex"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "INFO: no color field in this agent"
fi

echo ""
if [[ ${FAILURES} -eq 0 ]]; then
  echo "=== PASS: all assertions passed ==="
  exit ${PASS}
else
  echo "=== FAIL: ${FAILURES} assertion(s) failed ==="
  exit ${FAIL}
fi
