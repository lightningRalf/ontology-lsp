# Workflows & Recipes

Run high‑value workflows deterministically via the Ontology‑LSP tool surface. Prefer HTTP tools in CI; MCP (HTTP or stdio) is fine for local dev.

## Quick Start

- Endpoint: `POST /api/v1/tools/call` with `{ name, arguments }`
- UI: `/ui` — dashboard with snapshots, workflows, and pipelines run‑stream
- OpenAPI: `/openapi.json` — schemas include named workflow results

Transports
- HTTP tools (recommended in CI/scripts); MCP HTTP (JSON‑RPC) and MCP stdio work equally for local dev (keep stdio stdout clean).

## Workflows

### Locate & Confirm Definition
- Purpose: fast locate with precise retry if ambiguous.
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"locate_confirm_definition", "arguments": { "symbol":"TestClass", "file":"tests/fixtures/example.ts" } }`
- Returns (LocateConfirmDefinitionResult): `{ ok, symbol, attempts:[{mode,count}], definitions:[...], decision }`
- Note: HTTP returns parsed JSON under `result`.

### Safe Rename (Snapshot + Optional Checks)
- Purpose: plan rename, stage unified diff to snapshot, optionally run checks (no working‑tree writes).
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"rename_safely", "arguments": { "oldName":"HTTPServer", "newName":"HTTPServerX", "file":"src/servers/http.ts", "runChecks": false } }`
- Returns (SafeRenameResult): `{ ok, snapshot, filesAffected, totalEdits, elapsedMs?, outputTail?, next_actions }`

### Patch + Checks in Snapshot
- Purpose: stage a unified or `apply_patch` diff and run checks in the snapshot.
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"patch_checks_in_snapshot", "arguments": { "patch":"<diff>", "onlyTouched": true, "timeoutSec": 180 } }`
- Returns (PatchChecksInSnapshotResult): `{ ok, snapshot, stage?, checks? }`

### Explore Codebase
- Purpose: retrieve definitions, references, and optionally conceptual hints.
- HTTP:
  - `POST /api/v1/tools/call` with `{ "name":"explore_codebase", "arguments": { "symbol":"TestClass", "file":"tests/fixtures/example.ts", "conceptual": true } }`
- Returns: `{ definitions, references, (optional) concepts }`

### Learning Pipelines (L5)
- Purpose: trigger and inspect learning pipelines during dev/dogfooding.
- HTTP:
  - List: `{ "name":"list_pipelines", "arguments":{} }`
  - Run: `{ "name":"run_pipeline", "arguments": { "id":"pattern_feedback_cycle" } }`
  - Runs: `{ "name":"list_pipeline_runs", "arguments": { "id":"pattern_feedback_cycle", "limit": 5 } }`
- Stream run output (NDJSON): `POST /api/v1/pipelines/run-stream` and incrementally read lines.

## Snapshot Resources
- Diff: `GET /api/v1/snapshots/{id}/diff` → `{ success, data: { id, diff } }`
- Status: `GET /api/v1/snapshots/{id}/status`
- UI: `/ui` → Snapshots panel with client‑side diff highlighting
- CLI: `just snap_diff_cli <SNAP_ID>` uses `delta` when available

## Outputs & Schemas
- OpenAPI `/openapi.json` includes named schemas for workflow outputs:
  - `LocateConfirmDefinitionResult`
  - `SafeRenameResult`
  - `PatchChecksInSnapshotResult`
- Tool call response (HTTP): `{ success, result, error? }` (result is parsed JSON for workflows)

## Tips
- Prefer HTTP tools in CI; for local dev, MCP stdio via `./mcp-wrapper.sh` is convenient (ensure clean stdout).
- `FAST_STDIO_CHECKS=touched` keeps snapshot checks fast (typecheck touched TS files).
