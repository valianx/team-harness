#!/usr/bin/env python3
"""Fail when a pipeline contract names a workspace artifact nothing produces.

A specialist that reads fail-closed from an artifact no coordinator or specialist writes
returns `artifact-missing`, its re-dispatch repeats the same causal identity, and the run
pauses on a cause the operator cannot resolve. The oracle is the registry in
`tests/fixtures/workspace-artifacts.json`: every artifact-shaped token in a scanned contract
must be registered with a producer file that mentions it, or be marked `retired` and appear
nowhere in the scan. Existence over path sets; no sentence makes this pass.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "tests" / "fixtures" / "workspace-artifacts.json"

TOKEN = re.compile(
    r"`(?:\{docs_root\}/|\{workspaces?[^}]*\}/|workspaces/\{[^}]+\}/)?"
    r"((?:plan|reviews|inputs|research|control|sketches)/[A-Za-z0-9_.{}*-]+"
    r"|\d\d-[a-z0-9-]+\.(?:md|jsonl|diff))`"
)


def load() -> tuple[list[Path], dict[str, dict]]:
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    scan = []
    for pattern in data["scan"]:
        matches = sorted(ROOT.glob(pattern))
        if not matches:
            raise SystemExit(f"workspace-artifacts: scan pattern matches nothing: {pattern}")
        scan.extend(matches)
    return scan, data["artifacts"]


def problems() -> list[str]:
    scan, artifacts = load()
    found: list[str] = []
    seen: set[str] = set()
    for source in scan:
        where = source.relative_to(ROOT).as_posix()
        for token in sorted({match.group(1) for match in TOKEN.finditer(source.read_text(encoding="utf-8"))}):
            seen.add(token)
            entry = artifacts.get(token)
            if entry is None:
                found.append(f"{where}: `{token}` is not registered")
            elif entry.get("status") == "retired":
                found.append(f"{where}: `{token}` is retired — read a produced artifact instead")
    for token, entry in artifacts.items():
        if entry.get("status") == "retired":
            continue
        producer = ROOT / entry["producer"]
        if not producer.is_file():
            found.append(f"registry: `{token}` names a producer that does not exist: {entry['producer']}")
        elif token not in producer.read_text(encoding="utf-8"):
            found.append(f"registry: `{token}` producer {entry['producer']} never mentions it")
    return sorted(set(found))


def main() -> int:
    issues = problems()
    if issues:
        print(f"workspace-artifacts: FAIL ({len(issues)} problem(s))", file=sys.stderr)
        for issue in issues:
            print(f"  {issue}", file=sys.stderr)
        print(
            "\n  Register the artifact with the contract that produces it, or point the reader\n"
            "  at an artifact the v5 pipeline produces. Do not register a producer to satisfy\n"
            "  a reader.",
            file=sys.stderr,
        )
        return 1
    print("workspace-artifacts: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
