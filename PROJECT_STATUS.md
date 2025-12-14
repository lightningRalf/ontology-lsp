# Ontology‑LSP — Project Status (Concise)

This is a condensed project status. Detailed historical updates have been moved to `docs/status/`.

Links
- Vision and roadmap: `VISION.md`, `NEXT_STEPS.md`
- Condensed monthly changes: `docs/status/CHANGES-2025-09.md`
- Workflows and tools: `docs/WORKFLOWS.md`, `CONFIG.md`

## Current Status

- Core: unified `CodeAnalyzer` + `LayerManager` orchestrate L1–L5; adapters remain thin.
- Adapters: HTTP, MCP (HTTP/stdio), CLI, and LSP integrate with the unified core and shared mappers.
- Observability: HTTP and MCP HTTP export Prometheus-compatible `/metrics` with bounded counters/histograms; layer latencies recorded via event bridge.
- Learning: pattern detection, feedback loop, pipelines (dev) surfaced via HTTP and UI; stats available.
- Dogfooding: `just dogfood_ci` runs explore → safe‑rename → patch+checks and uploads a summary artifact.
- Monitoring (in‑process): layer timings and tool counts available; unified metrics plan (below) replaces bespoke rollups.

## Recent Highlights

- **Text Search Routing Verified (2025-09-07)**: NEXT_STEPS task 0.16 investigation revealed text_search already properly routes through Layer 1 Fast Search. No implementation needed - system working correctly. Key findings:
  - `CodeAnalyzer.textSearch()` exists at `src/core/unified-analyzer.ts:2698`
  - MCP adapter correctly calls `this.coreAnalyzer.textSearch()` (line 1097)
  - CLI adapter correctly calls `this.coreAnalyzer.textSearch()` (line 399)
  - Layer 1 integration active with caching and BloomFilter optimization
  - Performance exceeds targets: avg 65ms, p95 87ms, cached 0ms (target: <200ms)
  - Fallback to AsyncEnhancedGrep only for regex patterns (by design)
  - Test suite: `tests/text-search-performance.test.ts` (8/8 passing)
  - Architecture: Adapters → CodeAnalyzer → Layer 1 Fast Search with proper budgets
  - Documentation: `TEXT_SEARCH_ROUTING_ANALYSIS.md` and `TEXT_SEARCH_IMPLEMENTATION_SUMMARY.md`
- **L4 schema auto-migrate**: Schema is now auto-created in `OntologyStorage` constructor when `L4_AUTO_MIGRATE=1` (default). Eliminates "no such table: concepts" errors in tests. Idempotent `ensureSchema()` method added; works with `:memory:` and file-based DBs.
- Unified metrics (decision): adopt OpenTelemetry + Prometheus across ALL adapters (HTTP, MCP HTTP, MCP stdio, CLI, LSP). Counters + histograms with bounded labels; exporters per adapter; CLI via Pushgateway.
- Prometheus endpoints: Shipped first slice — HTTP and MCP HTTP expose `/metrics`; record `tool_calls_total`, `tool_duration_ms`, `layer_latency_ms`, and `inflight_requests`. Tests added for HTTP.
- Graph Expand hardened: never 500; returns `{ neighbors }` with AST‑only and regex fallbacks; counters for primary/fallback.
- Test‑runner stabilization: balanced slices, heartbeat, hard caps; quick/smoke suites for fast signal.
- Dogfooding CI: HTTP tools gate with compact JSON summary.

## Known Gaps

- Graph expand callers/callees remain best‑effort; imports/exports robust. Plan AST‑only caller coverage for TS/JS under budgets.
- Pipelines persistence/UI: minor polish; token gating for write endpoints in HTTP adapter.
- Perf tests flake on constrained hosts; CI guards via `L2_MAX_PARSE_FILES` and capped suites.
- ~~Test port collisions in parallel runs~~ **FIXED** — config port now takes priority over env; tests use unique temp files.

## Next Steps (Pointers)

- See `NEXT_STEPS.md` — especially:
  - 0.7 Unified Metrics via OpenTelemetry + Prometheus — **COMPLETE**
  - 0.6 MCP/HTTP Workflows GA (discoverability + docs)
  - 0.28 Test Runner Stabilization v2
  - 0.29 Test Infra Hardening — **COMPLETE** (L4 schema bootstrap, port collisions fix, test fixture isolation)

## Unified Metrics — OTEL + Prometheus (Plan Snapshot)

What we emit (bounded labels):
- Counters: `tool_calls_total{adapter,tool,result}`, `errors_total{adapter,error_code}`
- Graph expand only: `path=primary|fallback`
- Histograms: `tool_duration_ms{adapter,tool}`, `layer_latency_ms{adapter,layer}`
- Optional: `inflight_requests{adapter}`

Exporter defaults:
- HTTP: 127.0.0.1:9464 • MCP HTTP: 127.0.0.1:9465 • MCP stdio: 127.0.0.1:9466 • LSP: 127.0.0.1:9467 • CLI: Pushgateway (`PUSHGATEWAY_URL`)

Why this path:
- Standardized dashboards without bespoke DB plumbing; adapters remain thin.
- Bounded labels → predictable Prom storage; portable to OTLP/Collector later.

Progress (2025‑09‑11):
- HTTP: `/metrics` shipped; tools and graph-expand instrumented; layer latency histograms recorded; test coverage added.
- MCP HTTP: `/metrics` shipped; tool calls instrumented.
- MCP stdio: `/metrics` on loopback port 9466; tool calls instrumented.
- LSP: `/metrics` on loopback port 9467; LSP methods instrumented; layer latencies recorded.
- **CLI Pushgateway**: Metrics pushed to Prometheus Pushgateway on exit when `PUSHGATEWAY_URL` is set. Records `tool_calls_total` and `tool_duration_ms` for key commands (find, references, explore, text_search, stats, workflow).
- Docs: CONFIG.md updated with scrape examples and CLI Pushgateway configuration.
- Remaining: error counters expansion, OpenAPI/docs polish.

## Changelog

- Condensed monthly changes are maintained in `docs/status/CHANGES-2025-09.md`.
