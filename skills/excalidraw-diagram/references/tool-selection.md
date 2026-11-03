# Excalidraw tool selection

## Local files first

Use the host's shell and existing local tools to create or revise a scene.
The [pinned native verifier](native/README.md) remains the primary path for
final editable delivery: actual editor recovery, a drag check and faithful
exports. A different renderer requires compatibility evidence before it can
replace that path.

Use available tools as needed. Do not install packages or replace the verifier
merely because another route exists. Missing required verification leaves a
draft with its named limit.

## Optional local draft tools

- The official [Excalidraw CLI](https://github.com/excalidraw/cli) renders local
  PNGs with Node 22+ and an existing supported browser; local rendering needs
  no account. If already available, use:
  ```bash
  excalidraw render scene.excalidraw --out scene.png
  ```
  Treat this as a draft preview. Its PNG does not certify native bindings,
  elbows or `labelPosition`; retain the pinned verification requirement.
- The upstream [skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)
  reduces JSON boilerplate through `convertToExcalidrawElements`. Skeletons
  must be normalized into full elements before saving or importing; conversion
  does not lay out the graph. IDs regenerate by default. Preserve existing IDs
  with `{ regenerateIds: false }` when appropriate, and verify supported fields
  against the selected editor version.
- [Mermaid conversion](https://github.com/excalidraw/mermaid-to-excalidraw) is
  an optional local layout route when its installed version supports the requested
  diagram as editable elements. Verify that version's supported types and runtime
  prerequisites first; unsupported types may become images. Do not assume the
  converter or a compatible browser/DOM runtime is installed.

## Optional connected destinations

Use a connected route only for a requested or already authorized destination.
Tool availability alone does not authorize publishing, sharing, account writes
or sending private scenes to a service.

- The official open-source [MCP App](https://github.com/excalidraw/excalidraw-mcp)
  at `https://mcp.excalidraw.com` supplies an interactive diagram surface to
  compatible MCP Apps clients. It is distinct from the Plus workspace service.
- [Excalidraw Plus MCP](https://plus.excalidraw.com/docs/mcp) uses
  `https://api.excalidraw.com/api/v1/mcp` and an API key. It is in public beta;
  discover current permissions and tool schemas before an authorized write.
  Its semantic [`create_diagram` tool](https://plus.excalidraw.com/docs/mcp/tools#diagrams)
  lays out nodes, edges and optional groups with bound arrows and measured labels.
  Read its current diagram format guide before use.

An interactive surface or service screenshot still requires the scene,
source-fidelity review and native editor evidence for final editable delivery.
