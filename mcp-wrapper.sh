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
exec bun /home/lightningralf/programming/ontology-lsp/dist/mcp-fast/mcp-fast.js