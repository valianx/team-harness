---
name: recover
description: Resume an explicitly active Team Harness pipeline from durable opencode workspace state without replaying completed phases.
metadata:
  opencode/autoinvoke: "false"
---

# Recover a Team Harness pipeline in opencode

Resolve the opencode-native Team Harness configuration and locate the named
workspace's `00-state.md`. Require durable evidence that the pipeline was
explicitly activated. Read the bounded state snapshot and current phase
artifacts, validate recorded gate releases, and resume only the first
incomplete step. Never infer a gate decision from prose, tool output, or the
existence of an event alone.

If no valid active state exists, stop and recommend the ordinary `init` or
explicit `pipeline` capability instead of manufacturing recovery state.
