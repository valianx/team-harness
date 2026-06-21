### Changed
- Trimmed opencode interactive setup to two prompts (Memory MCP + context7); removed Agent Output Location, Language, English-Learning, ClickUp, and Obsidian Tasks groups and the final "Write configuration?" confirm — worst-case stops drop from ~16 to ≤3.
- Import decision now short-circuits straight to write-config + MCP-registration without re-walking the main form; a pre-filled Memory URL (from `--memory-url` or CC migration) is honoured.
- Added `python3`/`gh` dependency detect-and-guide step: present → prints `ok`; missing → OS-appropriate install hint. No prompt, no execution.
- `bin/install-opencode.sh` comment block updated to reflect the trimmed interactive surface.

### Fixed
- Memory MCP URL paste under `curl | bash`: the huh form now wires `/dev/tty` explicitly as the bubbletea input source (`tea.WithInput`) so bracketed-paste is attached to the real controlling terminal, not a pipe-backed stdin. Pasting a bare URL is now delivered as a single `tea.PasteMsg` to the URL field. The JSON-snippet fallback is retained as defense-in-depth.
