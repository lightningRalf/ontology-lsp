# Legacy Components

The following components are archived and no longer part of the active build:

- mcp-language-server (Go): superseded by our Streamable HTTP MCP server (src/servers/mcp-http.ts). Not used by current adapters or tests.
- bun-mcp-sse-transport (Bun SSE transport): replaced by Streamable HTTP transport; SSE-only path is deprecated.

Rationale:
- Consolidate on a protocol-agnostic core and thin adapters.
- Use a single, streamable HTTP MCP transport for Claude/Desktop integration.
- Reduce maintenance surface and build times.

If you need to resurrect any of these, copy back to the repo root and wire through a feature flag.
