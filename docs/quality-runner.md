# Deterministic Quality Runner

The maintained quality-runner guide lives with the `spec` skill so the same
workflow reference is available to Codex, Claude Code and OpenCode:

[Quality runner reference](../skills/spec/references/quality-runner.md)

This file remains a repository-facing pointer for contributors. The runner
itself is a diagnostic evidence tool: it records exact checks against one
clean candidate and computes CRAP in measure-only mode when a selected project
adapter provides matched complexity and coverage inputs. It does not select
tools, install dependencies, edit source, or decide whether a change should be
merged.
