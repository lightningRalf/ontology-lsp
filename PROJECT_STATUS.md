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
- Test port collisions in parallel runs; move to ephemeral/offset ports per slice.

## Next Steps (Pointers)

- See `NEXT_STEPS.md` — especially:
  - 0.7 Unified Metrics via OpenTelemetry + Prometheus (HTTP + MCP HTTP done; LSP, MCP stdio, CLI Pushgateway next)
  - 0.6 MCP/HTTP Workflows GA (discoverability + docs)
  - 0.28 Test Runner Stabilization v2
  - 0.29 Test Infra Hardening — L4 schema bootstrap **DONE**; port collisions fix pending

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
- Docs: CONFIG.md updated with scrape examples.
- Remaining: LSP exporter, MCP stdio exporter, CLI Pushgateway, error counters expansion, OpenAPI/docs polish.

## Changelog

- Condensed monthly changes are maintained in `docs/status/CHANGES-2025-09.md`.
