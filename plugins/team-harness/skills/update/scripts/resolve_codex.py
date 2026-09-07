#!/usr/bin/env python3
"""Resolve a discovered absolute Codex path before pinning native update argv."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from converge import ConvergenceError, validate_codex_binary


def resolve_codex_binary(candidate: str) -> Path:
    """Follow parent junctions and file aliases, then enforce the binary contract."""
    raw = Path(candidate)
    if not raw.is_absolute() or ".." in raw.parts or any(ord(char) < 32 for char in candidate):
        raise ConvergenceError("CODEX_BINARY_INVALID")
    try:
        resolved = raw.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ConvergenceError("CODEX_BINARY_INVALID") from exc
    return validate_codex_binary(str(resolved))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True)
    args = parser.parse_args()
    try:
        binary = resolve_codex_binary(args.candidate)
    except ConvergenceError as exc:
        print(json.dumps({"errorCode": exc.code}), file=sys.stderr)
        return 1
    print(json.dumps({"codexBin": str(binary)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
