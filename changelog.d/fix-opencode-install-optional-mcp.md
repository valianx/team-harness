### Fixed

- opencode installer (`apply --runtime opencode`) no longer requires `MEMORY_MCP_URL` or `CONTEXT7_API_KEY` — both are optional; assets install regardless, MCP servers registered only when credentials are supplied.
- Welcome banner now shown at the start of `apply --runtime opencode` (previously skipped because the dispatch path returned before the banner call in `main()`).
- `install-opencode.sh` no longer prompts for or requires `MEMORY_MCP_URL`; the bare `curl -fsSL … | bash` form works with no environment variables set and no TTY required.
