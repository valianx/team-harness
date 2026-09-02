#!/usr/bin/env python3
"""Fail when an active OpenSpec change is a chore or exceeds the ceremony rules.

`openspec validate --strict` proves a change is well-formed. It cannot say whether the
change should exist, or whether its proposal, task list, and delta stayed inside the
sizes an operator can read at Gate 1. Those numbers live in `openspec/config.yaml`
under the repository-owned `team_harness` key, so the rule and the check cannot drift.

Every oracle here reads a machine-readable artifact: a directory's contents, a heading
count, a word count, a checklist-item count, or a scalar from the config file.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGES = ROOT / "openspec/changes"
CONFIG = ROOT / "openspec/config.yaml"
BASELINE = ROOT / "docs/benchmarks/pipeline-baseline.md"

REQUIREMENT = re.compile(r"(?m)^### Requirement:")
TASK_ITEM = re.compile(r"(?m)^\s*- \[[ xX]\]")
OPEN_TASK = re.compile(r"(?m)^\s*- \[ \]")
SCALAR = "(?m)^[ \t]+{key}:[ \t]*(\\d+)[ \t]*$"
SECTION = "(?m)^##[ \t]+{name}[ \t]*$"
LIST_ITEM = "(?m)^[ \t]+{key}:[ \t]*\n((?:[ \t]+-[ \t]*.+\n?)+)"

RULE_KEYS = ("max_requirements_per_change", "proposal_max_words", "tasks_max_items")


def rules() -> dict[str, object]:
    text = CONFIG.read_text(encoding="utf-8")
    found: dict[str, object] = {}
    for key in RULE_KEYS:
        match = re.search(SCALAR.format(key=key), text)
        if match is None:
            raise SystemExit(f"openspec-scope: FAIL\n  openspec/config.yaml declares no {key}")
        found[key] = int(match.group(1))
    sections = re.search(LIST_ITEM.format(key="proposal_required_sections"), text)
    if sections is None:
        raise SystemExit("openspec-scope: FAIL\n  openspec/config.yaml declares no proposal_required_sections")
    found["proposal_required_sections"] = [
        line.strip().lstrip("-").strip() for line in sections.group(1).splitlines() if line.strip()
    ]
    return found


def active_changes() -> list[Path]:
    if not CHANGES.is_dir():
        return []
    return sorted(p for p in CHANGES.iterdir() if p.is_dir() and p.name != "archive")


def section(text: str, name: str) -> str | None:
    """The body under `## name`, bounded by the next `##` heading."""
    match = re.search(SECTION.format(name=re.escape(name)), text)
    if match is None:
        return None
    rest = text[match.end() :]
    following = re.search(r"(?m)^##[ \t]", rest)
    return rest[: following.start()] if following else rest


def declares_capability(text: str) -> bool:
    """A change declares a capability when it lists one under New or Modified."""
    for name in ("New Capabilities", "Modified Capabilities"):
        match = re.search(r"(?m)^###[ \t]+" + name + r"[ \t]*$", text)
        if match is None:
            continue
        rest = text[match.end() :]
        following = re.search(r"(?m)^#{2,3}[ \t]", rest)
        body = rest[: following.start()] if following else rest
        items = [line for line in body.split("\n") if line.strip().startswith("- ")]
        if any("none" not in line.lower() for line in items):
            return True
    return False


def check(change: Path, limits: dict[str, int]) -> list[str]:
    name = change.name
    out: list[str] = []
    specs = sorted(change.glob("specs/*/spec.md"))
    if not specs:
        out.append(f"{name}: no delta under specs/ — a change exists only for product behavior")

    proposal = change / "proposal.md"
    if not proposal.is_file():
        out.append(f"{name}: no proposal.md")
    else:
        text = proposal.read_text(encoding="utf-8")
        words = len(text.split())
        if words >= limits["proposal_max_words"]:
            out.append(f"{name}: proposal is {words} words, at or over the {limits['proposal_max_words']}-word limit")
        for required in limits["proposal_required_sections"]:
            if section(text, required) is None:
                out.append(f"{name}: proposal has no '## {required}' section")
        if not declares_capability(text):
            out.append(f"{name}: proposal declares no new and no modified capability")

    tasks = change / "tasks.md"
    if not tasks.is_file():
        out.append(f"{name}: no tasks.md")
    else:
        items = len(TASK_ITEM.findall(tasks.read_text(encoding="utf-8")))
        if items > limits["tasks_max_items"]:
            out.append(f"{name}: {items} tasks over the {limits['tasks_max_items']}-item limit")

    requirements = sum(len(REQUIREMENT.findall(spec.read_text(encoding="utf-8"))) for spec in specs)
    if requirements > limits["max_requirements_per_change"]:
        out.append(
            f"{name}: {requirements} requirements over the ceiling of "
            f"{limits['max_requirements_per_change']} — split the change"
        )
    return out


def archive_lag(change: Path) -> str | None:
    """A change whose every task is checked but still sits outside archive/."""
    tasks = change / "tasks.md"
    if not tasks.is_file():
        return None
    text = tasks.read_text(encoding="utf-8")
    items = TASK_ITEM.findall(text)
    if items and not OPEN_TASK.search(text):
        return f"{change.name}: every task is checked and the change is not archived"
    return None


def main() -> int:
    limits = rules()
    failures: list[str] = []
    warnings: list[str] = []

    if not BASELINE.is_file():
        failures.append(
            f"{BASELINE.relative_to(ROOT).as_posix()} is missing — a change that alters dispatch, "
            f"state, or recovery contracts has nothing to compare against"
        )

    changes = active_changes()
    for change in changes:
        failures.extend(check(change, limits))
        lag = archive_lag(change)
        if lag:
            warnings.append(lag)

    if failures:
        print("openspec-scope: FAIL", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 1

    for line in warnings:
        print(f"WARN  {line}")
    print(f"openspec-scope: PASS ({len(changes)} active change(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
