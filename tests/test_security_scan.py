#!/usr/bin/env python3
# tests/test_security_scan.py
# Suite 12 — security self-scan (wrapper).
#
# The canonical scanner ships with the audit-security skill so installed
# runtimes (Codex package, opencode config root) can run it without a repo
# checkout. This wrapper preserves the historical repo entry point.

import runpy
import sys
from pathlib import Path

SCANNER = (
    Path(__file__).resolve().parent.parent
    / "skills" / "audit-security" / "scripts" / "security_scan.py"
)

if not SCANNER.is_file():
    sys.exit(f"scanner not found: {SCANNER}")

runpy.run_path(str(SCANNER), run_name="__main__")
