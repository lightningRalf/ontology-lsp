# AGENTS.md — Guidelines for Agentic Changes in this Repo

This document defines how agents (and humans automating work) should
operate in this repository. It encodes our “fix‑bugs‑first” mindset,
layer mapping, safety rules, and delivery expectations.

## Purpose

- Ensure safe, incremental, high‑signal changes.
- Keep the codebase buildable, testable, and deployable at all times.
- Reduce rework by aligning with the project’s architecture and docs.

## Core Principles

1) Fix bugs first
- Prioritize broken builds, failing tests, and type errors before
  features or refactors.
- Make CI/`tsc` green for core + adapters before expanding scope.

2) Small, reversible changes
- Prefer minimal diffs with isolated scope; avoid broad churn.
- Use Conventional Commits with clear scopes and rationale.

3) Keep the architecture consistent
- Layers (renumbered):
  - Layer 1: Fast Search
  - Layer 2: AST Analysis
  - Layer 3: Planner (symbol map + rename planning)
  - Layer 4: Ontology / Semantic Graph
  - Layer 5: Pattern Learning & Propagation
- Ontology DB path comes from `layers.layer4.dbPath`.
- Pattern learner config is under `layers.layer5.*`.
- Use Drizzle ORM for TypeScript data access when adding new
  persistence modules; align choices with the tech stack document
  referenced below.

4) Pluggable storage mindset
- Treat Layer 4 storage behind a StoragePort with adapters (SQLite,
  Postgres, Triple Store). Do not hard‑code storage specifics into
  higher layers.

5) Observability & SLOs
- Emit/keep metrics per layer (p95/p99, error rate, budgets). Do not
  add noisy logs to stdio‑based protocols.

## Safety Rules

- Do not commit generated artifacts (bundles, logs, pid files).
- Keep protocol stdout clean for stdio servers (e.g., LSP/MCP stdio).
- Do not introduce network calls in core paths without feature flags.
- Use approved environment variables and config (see CONFIG.md).

## Change Workflow

1) Triage & prepare
- Reproduce issue locally. Capture exact commands.
- Read VISION.md, PROJECT_STATUS.md, NEXT_STEPS.md for context.

2) Implement
- Start with the narrowest fix that restores correctness.
- Add or adjust tests narrowly around the fix (when applicable).
- Keep public types stable unless a breaking change is approved.

3) Validate
- Build: `bun run build:all`.
- Type‑check: `tsc` (or a core‑only `tsconfig.build.json` once added).
- Tests (fast path): `bun test --bail=1`.
- Avoid running perf/e2e unless explicitly requested.

4) Commit & docs
- Use Conventional Commits with gitmoji, e.g.:
  - 🐛 fix(adapter): correct completion request shape
  - 📝 docs(vision): align storage adapters roadmap
- Note breaking changes in the commit body; update docs accordingly.

@docs/tech-stack-ts.md

<context: folderstructure and filenames>
Run: eza -T -L 3 --git-ignore .
</context:folderstructure and filenames>

## Protocol Adapter Notes

- LSP adapter:
  - Map Completion → LSP CompletionItem precisely (kinds, fields).
  - Keep textDocumentSync types valid (use enum/object as required).
  - Avoid private method access in class internals.

- MCP adapter:
  - Serialize core types to MCP payloads via explicit mappers.
  - Keep core types out of wire objects to avoid leakage.

- HTTP adapter:
  - Guard optional diagnostics and stats; do not assume interfaces.

## Layer‑Specific Guidance

- L3 Planner: time `buildSymbolMap` and `planRename` via LayerManager
  for clear metrics. Skip learning/propagation during preview (dryRun).
- L4 Ontology: route persistence through StoragePort; budget queries;
  avoid tight coupling to a specific DB.
- L5 Learning & Propagation: attribute both learning and propagation
  time to Layer 5; allow gating by config.

## PR & Review Checklist

- [ ] Fixes/tests first; build green locally.
- [ ] Minimal blast radius; no unrelated refactors.
- [ ] Conventional Commit with clear scope and body.
- [ ] Docs updated when behavior/architecture changes.
- [ ] No generated files or secrets committed.

## Incident Response

- If a change breaks build/test, prioritize a `revert` or minimal hotfix
  over new features. Follow with a post‑mortem in PROJECT_STATUS.md.

---

For additional context, read VISION.md (system concept and roadmap),
PROJECT_STATUS.md (current state), and NEXT_STEPS.md (near‑term work).



## Dogfooding (MCP‑first)

Prefer dogfooding through the MCP HTTP server (Streamable HTTP) so flows match how real clients integrate. The CLI is available for convenience but MCP should be primary. When building features or fixes, validate via the registered MCP tools and prompts (workflows), not by calling internals directly.

### Start servers

```
just start
# HTTP: 7000, MCP HTTP: 7001, LSP: 7002
```

### Open MCP session (JSON‑RPC over HTTP)

Initialize and capture the session id:

```
curl -i -sS -X POST   -H 'content-type: application/json'   http://localhost:7001/mcp   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | tee /tmp/mcp.init

export MCP_SESSION_ID=$(grep -i ^Mcp-Session-Id: /tmp/mcp.init | awk '{print $2}' | tr -d '')
echo "MCP_SESSION_ID=$MCP_SESSION_ID"
```

List available tools:

```
curl -sS -X POST -H "content-type: application/json" -H "Mcp-Session-Id: $MCP_SESSION_ID"   http://localhost:7001/mcp   -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq .
```

### Explore code via MCP (with conceptual hints)

```
curl -sS -X POST -H "content-type: application/json" -H "Mcp-Session-Id: $MCP_SESSION_ID"   http://localhost:7001/mcp   -d '{
        "jsonrpc":"2.0",
        "id":3,
        "method":"tools/call",
        "params":{
          "name":"explore_codebase",
          "arguments":{ "symbol":"TestClass", "file":"tests/fixtures", "maxResults":50, "conceptual":true }
        }
      }' | jq .
```

Notes:
- Set `L4_AUGMENT_EXPLORE=1` or pass `conceptual: true` to include Layer 4 conceptual hints.
- Conceptual is optional and off by default in core.

### Safe rename (plan → snapshot → checks) via MCP

```
# Plan and stage a safe rename with checks
curl -sS -X POST -H "content-type: application/json" -H "Mcp-Session-Id: $MCP_SESSION_ID"   http://localhost:7001/mcp   -d '{
        "jsonrpc":"2.0",
        "id":4,
        "method":"tools/call",
        "params":{
          "name":"workflow_safe_rename",
          "arguments":{
            "oldName":"HTTPServer",
            "newName":"HTTPServerX",
            "file":"src/servers/http.ts",
            "runChecks":true,
            "commands":["bun run build:all","bun test -q"],
            "timeoutSec":180
          }
        }
      }' | jq .
```

Inspect the staged diff for the snapshot (via MCP resource read):

```
# Replace <SNAP_ID> from previous output
export SNAP_ID=<SNAP_ID>
# diff
curl -sS -X POST -H "content-type: application/json" -H "Mcp-Session-Id: $MCP_SESSION_ID"   http://localhost:7001/mcp   -d '{
        "jsonrpc":"2.0",
        "id":5,
        "method":"resources/read",
        "params":{ "uri":"snapshot://'$'SNAP_ID/overlay.diff" }
      }' | jq -r '.contents[0].text'
# status
curl -sS -X POST -H "content-type: application/json" -H "Mcp-Session-Id: $MCP_SESSION_ID"   http://localhost:7001/mcp   -d '{
        "jsonrpc":"2.0",
        "id":6,
        "method":"resources/read",
        "params":{ "uri":"snapshot://'$'SNAP_ID/status" }
      }' | jq .
```

### Dogfood Workflows (expected during changes)

- Use the prompts to exercise end‑to‑end flows during development:
  - `plan-safe-rename` → calls `plan_rename` then `workflow_safe_rename` (snapshot + checks)
  - `investigate-symbol` → `explore_codebase` (conceptual on/off) → `build_symbol_map` (astOnly) → `graph_expand`
  - `quick-patch-checks` → `get_snapshot` → `propose_patch` → `run_checks`
- Validate results are structured, errors are JSON‑RPC with codes, and latencies are within budgets.
- Prefer small fixtures under `tests/fixtures` when iterating.

### Quick helpers
- `just dogfood` (stdio MCP fast path; bounded workspace)
- `just dogfood_full` (includes quick checks via build:tsc)
- `just sync-ports` to align `.env` ports (if using MCP HTTP locally)

### Optional CLI helpers (local dogfooding)
- `bin/dogfood-explore.sh <symbol> [-f <path>] [--no-conceptual] [--precise] [--json]`
- `bin/self-apply.sh -f my.diff -- bun run build:all "bun test -q"`
- `bun run tmp/dogfood-safe-rename.ts`
