#!/bin/bash
# MCP Server Wrapper - Optimized startup for Claude integration

# Set environment for fast startup
export NODE_ENV=production
export SILENT_MODE=true
export STDIO_MODE=true
export BUN_DISABLE_ANALYTICS=1
export BUN_DISABLE_TRANSPILER_CACHE=1
export ONTOLOGY_DB_PATH="/home/lightningralf/programming/ontology-lsp/.ontology/ontology.db"
export ONTOLOGY_WORKSPACE="/home/lightningralf/programming/ontology-lsp"

# Use the optimized fast MCP server (no caching to ensure hot reload works)
# Guard: ensure the built server exists, otherwise print a clear hint and exit
SERVER_JS="/home/lightningralf/programming/ontology-lsp/dist/mcp-fast/mcp-fast.js"
if [ ! -f "$SERVER_JS" ]; then
  {
    echo "MCP fast server binary not found: $SERVER_JS"
    echo "Build it with one of:"
    echo "  just build-mcp"
    echo "  bun build src/servers/mcp-fast.ts --target=bun --outdir=dist/mcp-fast --format=esm \\
      --external tree-sitter --external tree-sitter-typescript \\
      --external tree-sitter-javascript --external tree-sitter-python \\
      --external pg --external bun:sqlite --external express --external cors \\
      --sourcemap"
  } 1>&2
  exit 1
fi

exec bun "$SERVER_JS"
