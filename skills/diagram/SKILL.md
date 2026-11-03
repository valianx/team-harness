---
name: diagram
description: Use when an Excalidraw diagram is requested for a concept, workflow or architecture.
---

# Create an editable diagram

Main applies [excalidraw-diagram](../excalidraw-diagram/SKILL.md) directly with the
host's native tools. Supplied sources, approved references and current editable
scenes guide the result. Honor an explicit request for another engine through
its selected skill.

## Input and destination

`$ARGUMENTS` describes the diagram, such as "authentication flow for the login
system". For a topic alone, infer a useful view from the bound context.

- `--vault [name]` writes the `.excalidraw` file to the named Obsidian vault
  instead of the declared artifact directory. Resolve the vault mapping through
  the active runtime; report an unresolved mapping instead of inventing a path.
- `--folder <name>` selects a subfolder within that vault. It requires
  `--vault` and defaults to the vault root.

Parse and remove these flags from the diagram description. Use the resolved
vault and folder as the real local artifact directory, or retain the existing
declared directory when no vault is requested. Preserve an explicit file target;
otherwise create `diagram.excalidraw` in the selected directory.

## Complete the request

Read the selected skill, compose the native scene, then perform its bounded
visual review and native editor validation. Retain the editable file, previews
and evidence in the selected location; Main links the artifacts and reports
assessment results or draft limits in the bound context.
