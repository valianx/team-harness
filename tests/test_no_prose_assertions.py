#!/usr/bin/env python3
"""Fail when a Python, JavaScript, or shell test asserts Markdown wording.

README.md § "What gets a test" bans this class absolutely, and a ~46,000-line corpus of it
was deleted once already (#553) for inverting authority — a failing literal search makes
adding a sentence the cheapest fix, so the prose comes to serve the check. It grew back to
3,820 lines in three weeks, pinning contract text that could then not be simplified without
turning CI red. The rule was never enforced by anything; this is that enforcement.

The oracle is a property of the test code, not of any document: does a test read a Markdown
file and assert a phrase against its contents.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Prose is several words of natural language. A path, a config key, or a TOML assignment is
# long but not prose, and asserting one of those against a generated artifact is legitimate.
MIN_CHARS = 24
MIN_WORDS = 4


def is_prose(value: str) -> bool:
    return len(value) >= MIN_CHARS and len(value.split()) >= MIN_WORDS and "\n" not in value
MARKDOWN_READ = re.compile(r"""\.md["']|read\(["'][^"']+\.md""")
JS_MARKDOWN_READ = re.compile(r"readFile(?:Sync)?\([^\n)]*(?:docs|agents|skills)/[^\n)]*\.md")
JS_PROSE_ASSERTION = re.compile(r"assert\.(?:match|doesNotMatch)\([^\n]+/[A-Za-z][^/\n]{20,}/")
SHELL_DOC_PATH = re.compile(r"^[A-Z][A-Z0-9_]*=.*(?:docs|agents|skills)/[^\s'\"]+\.md", re.MULTILINE)
SHELL_LITERAL_ASSERTION = re.compile(r"grep\s+-[^\n]*['\"]([^'\"]{24,})['\"]")

# Suites predating this guard that still carry the pattern; each line is debt to remove.
# A new entry may not be added: the point of the guard is that the set only shrinks.
GRANDFATHERED: frozenset[str] = frozenset()


def membership_phrases(tree: ast.AST) -> list[str]:
    """Long string literals used as `"phrase" in text` — the banned assertion shape.

    Fixture data and message strings are assignments or call arguments, not membership
    comparisons, so they do not count. This keeps the guard on assertions about wording.
    """
    phrases = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Compare):
            continue
        if not any(isinstance(op, (ast.In, ast.NotIn)) for op in node.ops):
            continue
        if isinstance(node.left, ast.Constant) and isinstance(node.left.value, str):
            if is_prose(node.left.value):
                phrases.append(node.left.value)
    return phrases


def offenders() -> list[str]:
    found = []
    for path in sorted(ROOT.glob("tests/test_*.py")):
        if path.name == Path(__file__).name:
            continue
        source = path.read_text(encoding="utf-8")
        if not MARKDOWN_READ.search(source):
            continue
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        phrases = membership_phrases(tree)
        if len(phrases) >= 3:
            found.append(f"{path.relative_to(ROOT)} ({len(phrases)} wording assertions)")

    for path in sorted([*ROOT.glob("tests/test_*.mjs"), *ROOT.glob("tests/test_*.js")]):
        source = path.read_text(encoding="utf-8")
        if JS_MARKDOWN_READ.search(source) and JS_PROSE_ASSERTION.search(source):
            found.append(f"{path.relative_to(ROOT)} (JavaScript Markdown wording assertion)")

    for path in sorted(ROOT.glob("tests/test_*.sh")):
        source = path.read_text(encoding="utf-8")
        if not SHELL_DOC_PATH.search(source):
            continue
        phrases = [match.group(1) for match in SHELL_LITERAL_ASSERTION.finditer(source)]
        if any(is_prose(phrase) for phrase in phrases):
            found.append(f"{path.relative_to(ROOT)} (shell Markdown wording assertion)")
    return [item for item in found if item.split(" ")[0] not in GRANDFATHERED]


def main() -> int:
    found = offenders()
    if found:
        print("no-prose-assertions: FAIL", file=sys.stderr)
        for item in found:
            print(f"  {item}", file=sys.stderr)
        print(
            '\n  README.md § "What gets a test": a test may not assert that a Markdown file\n'
            "  contains a wording, heading, token, or line count. Assert a property of code or\n"
            "  of a machine-readable artifact, evaluated by running it.",
            file=sys.stderr,
        )
        return 1
    print("no-prose-assertions: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
