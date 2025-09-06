# Workflows & Recipes

This guide shows how to run the core high‑value workflows across CLI, HTTP, and MCP.

## Locate & Confirm Definition

Purpose: quickly locate a symbol’s definition with a fast pass and a precise retry when ambiguous.

- CLI:
  - `ontology-lsp workflow locate_confirm_definition --args '{"symbol":"TestClass","file":"tests/fixtures/example.ts"}'`
- HTTP (parity):
  - `POST /api/v1/tools/call` with `{ "name":"locate_confirm_definition", "arguments": { "symbol":"TestClass", "file":"tests/fixtures/example.ts" } }`
- MCP (HTTP):
  - Initialize → `tools/call` with the same payload; reuse `Mcp-Session-Id`.

Returns (shape): `{ ok, symbol, attempts: [{mode,count}...], definitions: [...], decision }`.
Note: via HTTP `tools/call`, the `result` field already contains parsed JSON (not a string-wrapped payload).

## Safe Rename (Snapshot + Optional Checks)

Purpose: plan rename, stage a unified diff to a snapshot, then run checks in the snapshot (never touching working tree).

- CLI alias:
  - `ontology-lsp rename-safely HTTPServer HTTPServerX -f src/servers/http.ts --no-checks`
  - With checks: add `--cmd 'bun run build:tsc' -t 180` (defaults to typecheck if omitted and FAST_STDIO_CHECKS=touched).
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"rename_safely", "arguments": { "oldName":"HTTPServer", "newName":"HTTPServerX", "file":"src/servers/http.ts", "runChecks": true, "commands": ["bun run build:tsc"], "timeoutSec": 180 } }`
- MCP (HTTP): same as HTTP via `tools/call`.

Returns (shape): `{ ok, snapshot, filesAffected, totalEdits, elapsedMs?, outputTail?, next_actions }`.
Note: HTTP returns this directly under `result`; MCP transports return a text payload which clients may parse.

## Patch + Checks in Snapshot

Purpose: stage a unified diff (supports apply_patch format) and run checks in the snapshot.

- CLI alias:
  - `cat my.diff | ontology-lsp patch-checks-in-snapshot --cmd 'bun run build:tsc' --only-touched`
  - Or pass apply_patch directly via stdin.
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"patch_checks_in_snapshot", "arguments": { "patch":"<unified or apply_patch>", "timeoutSec": 180, "onlyTouched": true } }`
- MCP (HTTP): same via `tools/call`.

Returns (shape): `{ ok, snapshot, elapsedMs, output }`.
Note: HTTP returns parsed JSON in `result`; MCP transports return JSON text content.

## Explore Codebase

Purpose: gather definitions, references, and (optionally) conceptual hints.

- CLI:
  - `ontology-lsp explore TestClass -f tests/fixtures/example.ts --precise`
- HTTP/MCP:
  - `tools/call` with `{ "name":"explore_codebase", "arguments": { "symbol":"TestClass", "file":"tests/fixtures/example.ts", "conceptual": true } }`

Returns (shape): `{ definitions, references, (optional) concepts }`.
Note: HTTP `tools/call` unwraps and returns parsed JSON in `result`.

## Learning Pipelines (L5)

Purpose: manually trigger and inspect learning pipelines (dev/dogfooding).

- CLI:
  - List: `ontology-lsp pipelines list [--json]`
  - Run: `ontology-lsp pipelines run pattern_feedback_cycle [--json]`
  - Runs: `ontology-lsp pipelines runs pattern_feedback_cycle --limit 5 [--json]`
- HTTP (parity):
  - `POST /api/v1/tools/call` with `{ "name":"list_pipelines", "arguments": {} }`
  - `POST /api/v1/tools/call` with `{ "name":"run_pipeline", "arguments": { "id":"pattern_feedback_cycle" } }`
  - `POST /api/v1/tools/call` with `{ "name":"list_pipeline_runs", "arguments": { "id":"pattern_feedback_cycle", "limit": 5 } }`
- MCP (HTTP): same via `tools/call`.

Returns:
- `list_pipelines`: `{ pipelines: [{ id, name, trigger, schedule, enabled }] }`
- `run_pipeline`: `{ ok, runId }`
- `list_pipeline_runs`: `{ runs: [{ id, pipeline_id, started_at, finished_at?, status, metrics }] }`

## Tips

- Prefer stdio MCP (`./mcp-wrapper.sh`) for Codex/Claude; no headers or session management required.
- For HTTP MCP testing, include `Accept: application/json, text/event-stream` and reuse `Mcp-Session-Id` header across calls.
- Use `FAST_STDIO_CHECKS=touched` to keep checks fast within snapshots; it prepends a quick `tsc --noEmit` for touched TS files.
