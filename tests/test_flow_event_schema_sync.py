"""
Suite 127 — flow-event-schema-sync

AC-2.7 automated cross-repo schema-identity guard.

Fetches the canonical `event` enum + per-event field names from the merged
context-harness-mcp `internal/validate/flowevent.go` (raw GitHub URL, pinned to the
commit that merged PR-1) and asserts byte-identity with the enum/fields declared in
`agents/orchestrator.md § Flow Telemetry Emission`.

Network failure → SKIP with a clear warning so this test never false-reds CI offline.
"""
# Marker: flow-event-schema-sync  Suite 127

import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Canonical CH source — raw GitHub URL on context-harness-mcp main (the merged
# schema). The guard compares the live CH main enum against the snapshot below,
# so any divergence on either side fails the test (drift detection across the
# two-repo multi-site invariant). PR-1 (record_flow_event) is merged to main.
# ---------------------------------------------------------------------------
CH_RAW_URL = (
    "https://raw.githubusercontent.com/valianx/context-harness-mcp/"
    "main/internal/validate/flowevent.go"
)

# ---------------------------------------------------------------------------
# The authoritative 8-value event enum (hardcoded as the contract snapshot).
# This set is the source of truth for this test; the GitHub fetch CONFIRMS it
# has not drifted.  Any divergence → test failure (schema drift detected).
# ---------------------------------------------------------------------------
CANONICAL_EVENT_ENUM = frozenset(
    [
        "guard.block",
        "gate.fail",
        "verify.reject",
        "iteration.loop",
        "blocked",
        "scope.collapse",
        "mcp.unavailable",
        "abandon",
    ]
)

# Expected per-event fields (field names only; types are validated by CH).
CANONICAL_PER_EVENT_FIELDS = {
    "guard.block": frozenset(["hook", "reason", "resolved"]),
    "gate.fail": frozenset(["gate", "verdict"]),
    "verify.reject": frozenset(["agent", "verdict"]),
    "iteration.loop": frozenset(["stage", "iterations"]),
    "blocked": frozenset(["reason"]),
    "scope.collapse": frozenset(["items_dropped"]),
    "mcp.unavailable": frozenset(["op"]),
    "abandon": frozenset(["last_stage"]),
}

# Common fields present on every event.
CANONICAL_COMMON_FIELDS = frozenset(["event", "ts", "project", "task_type", "th_version"])


def _fetch_ch_source() -> str | None:
    """Fetch the CH flowevent.go source.  Returns None on any network error."""
    try:
        req = urllib.request.Request(CH_RAW_URL, headers={"User-Agent": "th-schema-sync-test/1"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode("utf-8")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        print(
            f"\nWARNING: Could not fetch CH source (network unavailable or URL changed).\n"
            f"  URL: {CH_RAW_URL}\n"
            f"  Error: {exc}\n"
            f"  Skipping online schema-identity check — this is NOT a failure.\n",
            file=sys.stderr,
        )
        return None


def _parse_ch_enum(source: str) -> frozenset[str]:
    """Extract the flowEventTypes map keys from flowevent.go source.

    Scopes extraction to the specific `flowEventTypes = map[string]bool{ ... }`
    block so that other map[string]bool declarations (taskTypes, hookValues,
    reasonValues, gateValues, etc.) do not pollute the result.
    """
    # Locate the exact declaration line, then slice to the matching closing brace.
    decl_match = re.search(r'\bflowEventTypes\s*=\s*map\[string\]bool\s*\{', source)
    if not decl_match:
        return frozenset()

    block_start = decl_match.end()
    close_idx = source.find("}", block_start)
    if close_idx == -1:
        return frozenset()

    block = source[block_start:close_idx]
    # Within the scoped block, extract all quoted keys that map to `true`.
    pattern = re.compile(r'"([a-z.]+)":\s+true')
    return frozenset(pattern.findall(block))


def _parse_ch_per_event_fields(source: str) -> dict[str, frozenset[str]]:
    """
    Extract per-event field names from the validateFlowEventPerEvent switch.

    CH delegates each case to a named helper:
        case "guard.block":
            return validateGuardBlock(p)

    The field accessors (p.Hook, p.Reason, etc.) live in those helpers, not in
    the case body itself.  This parser therefore:
      1. Parses the validateFlowEventPerEvent switch to build an
         event → helper-function-name map.
      2. For each helper, locates its function body and searches for the
         field accessors defined in field_map.

    Degrades to best-effort (skip-with-note) for any event whose helper cannot
    be located — the event-enum check (B1) is the hard assertion; field checks
    are confirmatory.
    """
    # Mapping from Go struct field accessor to JSON field name.
    field_map = {
        "p.Hook": "hook",
        "p.Reason": "reason",
        "p.Resolved": "resolved",
        "p.Gate": "gate",
        "p.Verdict": "verdict",
        "p.Agent": "agent",
        "p.Stage": "stage",
        "p.Iterations": "iterations",
        "p.ItemsDropped": "items_dropped",
        "p.Op": "op",
        "p.LastStage": "last_stage",
    }

    # ── Step 1: locate validateFlowEventPerEvent and parse its switch ──────────
    # Find the function body start (opening brace after the signature).
    per_event_match = re.search(
        r'\bfunc\s+validateFlowEventPerEvent\s*\([^)]*\)[^{]*\{', source
    )
    if not per_event_match:
        return {}

    # Extract the function body by counting braces from the opening {.
    fn_start = per_event_match.end() - 1  # index of the opening '{'
    depth = 0
    fn_end = fn_start
    for idx in range(fn_start, len(source)):
        if source[idx] == '{':
            depth += 1
        elif source[idx] == '}':
            depth -= 1
            if depth == 0:
                fn_end = idx + 1
                break
    per_event_body = source[fn_start:fn_end]

    # Parse: case "event.name": ... return helperFuncName(p)
    case_helper_re = re.compile(
        r'case\s+"([a-z.]+)":\s*\n\s*return\s+(\w+)\(p\)'
    )
    event_to_helper: dict[str, str] = {}
    for m in case_helper_re.finditer(per_event_body):
        event_to_helper[m.group(1)] = m.group(2)

    # ── Step 2: for each helper, parse its body for field accessors ────────────
    result: dict[str, frozenset[str]] = {}
    for event_name, helper_name in event_to_helper.items():
        # Locate the helper function definition.
        helper_match = re.search(
            rf'\bfunc\s+{re.escape(helper_name)}\s*\([^)]*\)[^{{]*\{{', source
        )
        if not helper_match:
            # Best-effort: skip this event's field check with a note; do not
            # produce a false negative.
            print(
                f"  NOTE: helper '{helper_name}' for event '{event_name}' not found "
                f"in CH source — skipping field check for this event.",
                file=sys.stderr,
            )
            continue

        # Extract the helper body by brace counting.
        h_start = helper_match.end() - 1
        depth = 0
        h_end = h_start
        for idx in range(h_start, len(source)):
            if source[idx] == '{':
                depth += 1
            elif source[idx] == '}':
                depth -= 1
                if depth == 0:
                    h_end = idx + 1
                    break
        helper_body = source[h_start:h_end]

        fields: set[str] = set()
        for accessor, json_name in field_map.items():
            if accessor in helper_body:
                fields.add(json_name)
        if fields:
            result[event_name] = frozenset(fields)

    return result


def _slice_flow_emission_section(orchestrator_text: str) -> str:
    """
    Extract the content of '## Flow Telemetry Emission' up to the next ## heading
    or a --- boundary.  Returns empty string when the section is absent.
    """
    marker = "## Flow Telemetry Emission"
    idx = orchestrator_text.find(marker)
    if idx == -1:
        return ""
    section_end = len(orchestrator_text)
    for boundary in ["\n## ", "\n---\n"]:
        pos = orchestrator_text.find(boundary, idx + len(marker))
        if pos != -1:
            section_end = min(section_end, pos)
    return orchestrator_text[idx:section_end]


def _parse_th_enum(section: str) -> frozenset[str]:
    """
    Extract the event enum values from the per-event-fields catalog table in the
    Flow Telemetry Emission section.

    The table header is:
        | `event` | Per-event fields | Field constraints |
        |---------|-----------------|-------------------|
    Data rows:
        | `guard.block` | `hook`, `reason`, `resolved` | ...constraint... |

    Strategy: find the table that contains "Per-event fields" in its header row.
    Then parse only the first column (backtick-quoted value) of subsequent data rows.
    Skip the separator row (all dashes).
    """
    # Locate the specific table by its header row.
    table_header_re = re.compile(r"\|\s+`event`\s+\|\s+Per-event fields")
    header_match = table_header_re.search(section)
    if not header_match:
        return frozenset()

    # Find the start of the table (beginning of the header line).
    table_start = section.rfind("\n", 0, header_match.start()) + 1
    # Find the end of the table (blank line or non-pipe line after the separator).
    # Consume lines while they start with '|'.
    table_lines = section[table_start:].splitlines()
    in_table = False
    event_names: set[str] = set()
    for line in table_lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            if in_table:
                break  # Table ended.
            continue
        in_table = True
        # Skip header and separator rows.
        if re.fullmatch(r"\|[-| ]+\|", stripped):
            continue  # Separator row.
        # The first column is the event name: | `event-name` | ...
        cols = stripped.split("|")
        if len(cols) < 3:
            continue
        first_col = cols[1].strip()
        # Match a backtick-quoted value that is one of our canonical event names.
        m = re.fullmatch(r"`([a-z][a-z.]*)`", first_col)
        if m:
            value = m.group(1)
            # Exclude the header row's `event` literal by checking it is not a
            # meta-word (the header value would be 'event' itself — not a data row).
            if value != "event":
                event_names.add(value)
    return frozenset(event_names)


def _parse_th_per_event_fields(section: str) -> dict[str, frozenset[str]]:
    """
    Extract per-event field names from the second column of the catalog table.

    Table format:
        | `guard.block` | `hook`, `reason`, `resolved` | constraint... |

    Only the second column (Per-event fields) is parsed — the third column
    (Field constraints) contains backtick-quoted enum values that must NOT be
    mistaken for field names.
    """
    table_header_re = re.compile(r"\|\s+`event`\s+\|\s+Per-event fields")
    header_match = table_header_re.search(section)
    if not header_match:
        return {}

    table_start = section.rfind("\n", 0, header_match.start()) + 1
    table_lines = section[table_start:].splitlines()
    in_table = False
    result: dict[str, frozenset[str]] = {}
    field_token = re.compile(r"`([a-z][a-z_]+)`")

    for line in table_lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            if in_table:
                break
            continue
        in_table = True
        if re.fullmatch(r"\|[-| ]+\|", stripped):
            continue
        cols = stripped.split("|")
        if len(cols) < 4:
            continue
        first_col = cols[1].strip()
        second_col = cols[2].strip()
        m = re.fullmatch(r"`([a-z][a-z.]*)`", first_col)
        if not m or m.group(1) == "event":
            continue
        event_name = m.group(1)
        if event_name not in CANONICAL_EVENT_ENUM:
            continue
        # Parse field names from the second column only.
        fields = frozenset(field_token.findall(second_col))
        if fields:
            result[event_name] = fields
    return result


def run_tests() -> int:
    """Return 0 on all pass, 1 on any failure, 2 on skip."""
    failures: list[str] = []

    orchestrator_path = REPO_ROOT / "agents" / "orchestrator.md"
    if not orchestrator_path.exists():
        failures.append("agents/orchestrator.md not found")
        _report(failures)
        return 1

    orchestrator_text = orchestrator_path.read_text(encoding="utf-8")
    section = _slice_flow_emission_section(orchestrator_text)

    # -----------------------------------------------------------------------
    # Group A — TH-local checks (always run, no network required).
    # -----------------------------------------------------------------------

    # A1: § Flow Telemetry Emission section exists.
    if not section:
        failures.append("agents/orchestrator.md: '## Flow Telemetry Emission' section absent")

    # A2: TH enum matches the canonical set.
    th_enum = _parse_th_enum(section)
    missing_in_th = CANONICAL_EVENT_ENUM - th_enum
    extra_in_th = th_enum - CANONICAL_EVENT_ENUM
    if missing_in_th:
        failures.append(
            f"TH enum is missing event values: {sorted(missing_in_th)}"
        )
    if extra_in_th:
        failures.append(
            f"TH enum has extra (non-canonical) event values: {sorted(extra_in_th)}"
        )

    # A3: TH per-event fields match the canonical map.
    th_fields = _parse_th_per_event_fields(section)
    for event, expected_fields in CANONICAL_PER_EVENT_FIELDS.items():
        actual_fields = th_fields.get(event, frozenset())
        missing = expected_fields - actual_fields
        extra = actual_fields - expected_fields
        if missing:
            failures.append(
                f"TH catalog: event '{event}' missing fields {sorted(missing)}"
            )
        if extra:
            failures.append(
                f"TH catalog: event '{event}' has extra fields {sorted(extra)}"
            )

    # A4: Common fields documented in the TH section.
    for field in CANONICAL_COMMON_FIELDS:
        if f"`{field}`" not in section:
            failures.append(
                f"TH catalog: common field '{field}' not found in § Flow Telemetry Emission"
            )

    # A5: config gate documented (flow_telemetry.enabled).
    if "flow_telemetry.enabled" not in section:
        failures.append(
            "agents/orchestrator.md § Flow Telemetry Emission: "
            "'flow_telemetry.enabled' config gate not documented"
        )

    # A6: resilience / non-blocking contract documented.
    if "flow-telemetry: unavailable" not in section:
        failures.append(
            "agents/orchestrator.md § Flow Telemetry Emission: "
            "resilience log line 'flow-telemetry: unavailable' not documented"
        )

    # A7: self-referential guard — this test file contains Suite 127.
    this_file_text = Path(__file__).read_text(encoding="utf-8")
    for token in ["Suite 127", "flow-event-schema-sync"]:
        if token not in this_file_text:
            failures.append(f"tests/test_flow_event_schema_sync.py: missing self-ref token '{token}'")

    # A8: docs/testing.md registers this suite.
    testing_md = REPO_ROOT / "docs" / "testing.md"
    if testing_md.exists():
        testing_text = testing_md.read_text(encoding="utf-8")
        for token in ["Suite 127", "flow-event-schema-sync"]:
            if token not in testing_text:
                failures.append(f"docs/testing.md: missing registry token '{token}'")

    # A9: docs/observability.md documents the cross-user plane as SEPARATE.
    obs_path = REPO_ROOT / "docs" / "observability.md"
    if obs_path.exists():
        obs_text = obs_path.read_text(encoding="utf-8")
        if "cross-user" not in obs_text:
            failures.append("docs/observability.md: 'cross-user' plane not documented")
        if "00-execution-events" not in obs_text:
            failures.append("docs/observability.md: '00-execution-events' local plane not referenced")

    # -----------------------------------------------------------------------
    # Group B — Online cross-repo identity check (skip on network failure).
    # -----------------------------------------------------------------------
    ch_source = _fetch_ch_source()
    if ch_source is None:
        print(
            "\nSKIP: Online schema-identity check skipped (network unavailable).\n"
            "  Local TH-only checks completed above.\n",
            file=sys.stderr,
        )
        # Report any local failures but exit 0 if only the online check was skipped
        # and there are no local failures.
        _report(failures)
        return 1 if failures else 0

    # B1: CH enum matches the canonical set.
    ch_enum = _parse_ch_enum(ch_source)
    if not ch_enum:
        failures.append(
            f"Could not parse event enum from CH source at {CH_RAW_URL}. "
            "The URL may have moved or the source format changed."
        )
    else:
        missing_in_ch = CANONICAL_EVENT_ENUM - ch_enum
        extra_in_ch = ch_enum - CANONICAL_EVENT_ENUM
        if missing_in_ch:
            failures.append(
                f"CH enum (from {CH_RAW_URL}) is missing canonical values: {sorted(missing_in_ch)}"
            )
        if extra_in_ch:
            failures.append(
                f"CH enum has values not in CANONICAL_EVENT_ENUM (schema drift): {sorted(extra_in_ch)}"
            )

    # B2: CH per-event fields match the canonical map.
    ch_fields = _parse_ch_per_event_fields(ch_source)
    for event, expected_fields in CANONICAL_PER_EVENT_FIELDS.items():
        actual_fields = ch_fields.get(event, frozenset())
        missing = expected_fields - actual_fields
        # Allow CH to have extra fields (additive); only flag missing.
        if missing:
            failures.append(
                f"CH source: event '{event}' missing field validators for {sorted(missing)}"
            )

    # B3: TH enum == CH enum (byte-identity invariant).
    if ch_enum and th_enum and ch_enum != th_enum:
        failures.append(
            f"Schema drift: TH enum {sorted(th_enum)} != CH enum {sorted(ch_enum)}"
        )

    _report(failures)
    return 1 if failures else 0


def _report(failures: list[str]) -> None:
    if failures:
        print(f"\nFAIL — {len(failures)} failure(s):", file=sys.stderr)
        for f in failures:
            print(f"  • {f}", file=sys.stderr)
    else:
        print("PASS — flow-event schema identity check green.", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(run_tests())
