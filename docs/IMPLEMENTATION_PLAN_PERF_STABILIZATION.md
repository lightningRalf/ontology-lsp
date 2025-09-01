# Implementation Plan — Performance Stabilization (Fix‑Bugs‑First)

## Objectives

- Restore green status for non‑perf and perf suites without widening
  scope.
- Fix concrete bugs surfaced by perf runs while preserving behavior.
- Align with VISION.md: layer SLOs, progressive enhancement, and
  observability-first.

## Scope & Non‑Goals

- In scope: L1–L4 fixes, perf test stabilization, metrics, small guards.
- Out of scope: New storage backends (Postgres/TripleStore production),
  new features beyond stabilization.
- Continue using SQLite for Layer 4; keep PG/Triple deferred.

## Known Issues (from recent perf runs)

- Pattern learning perf: TypeError in pattern-storage when
  `example.context.timestamp` is undefined.
- Ontology memory perf: TypeError in SQLite persistence when a
  representation is missing `location`.
- Perf thresholds flakiness on constrained hosts:
  - Large codebase p99 exceeded 200ms expectation.
  - Concurrency p95 exceeded 200ms expectation.

## Workstreams

### A. Core Bug Fixes (High Priority)

- Pattern storage robustness
  - Guard optional fields in `pattern-storage.ts`:
    - Allow `example.context` and `timestamp` to be optional.
    - When missing, inject default timestamp `new Date(0)` and omit
      `surroundingSymbols`.
  - Add safe serializer for `example.context` that prunes undefined.
  - Tests: add unit covering missing context/timestamp during promotion.

- SQLite representation serialization
  - In `OntologyStorage.saveConcept`:
    - Validate each representation has `location.uri` and `location.range`.
    - If missing, skip the malformed representation and emit a single
      warning per concept (avoid crash); alternatively fill safe default
      (empty uri and zeroed range) if skipping would break invariants.
  - Tests: add a storage test that includes one malformed representation
    and asserts DB integrity + warning behavior.

### B. Async Search Reliability (L1/L2 Budgets)

- Timeouts and fallback noise
  - Add env override for async L1 default timeout:
    - `ENHANCED_GREP_DEFAULT_TIMEOUT_MS`.
  - Pre‑warm caches for perf suites (one warm‑up pass) to avoid cold
    starts.
  - Ensure process pool `maxProcesses` scales with CPU cores in perf
    config.

- Short‑seed AST escalations
  - Confirm short‑seed budget bump and strict candidate caps are applied
    under perf config to reduce variance.

### C. Performance Test Stabilization & Determinism

- Environment‑aware thresholds
  - Introduce env overrides consumed by perf tests:
    - `PERF_P95_TARGET_MS` (default 150)
    - `PERF_P99_TARGET_MS` (default 200)
    - `PERF_CONCURRENCY_P95_TARGET_MS` (default 200)
  - Tests assert against configured values to reduce host variance.

- Deterministic fixtures
  - Provide synthetic large‑tree fixture for 10k‑files tests (stable
    generation, memoized path) to avoid I/O storms.

- Async fallback accounting
  - Track frequency of async→sync fallback; assert below a small,
    configurable threshold. Do not fail solely on fallback presence.

### D. Observability & SLOs (Layer‑Aligned)

- Metrics improvements (lightweight)
  - L1: count timeouts/fallbacks; expose counts in metrics/logs.
  - L2: surface parse time p95 in memory; log during perf runs.
  - L4: reuse instrumentation added (p50/p95/p99, counts, errors).

### E. Tests & Docs Hygiene

- Tests
  - Add tests for A (pattern‑storage, malformed representation).
  - Update perf tests to read env thresholds and perform warm‑up.

- Docs
  - CONFIG.md: document new perf envs and warm‑up guidance.
  - PROJECT_STATUS.md: track stabilization progress and gating choices.

## Acceptance Criteria

- Non‑perf suites: green (adapters, unified‑core, integration, L4 parity).
- Perf benchmarks:
  - No TypeErrors during pattern learning or ontology persistence.
  - Large codebase and concurrency tests satisfy defaults on typical
    dev hosts; env overrides available for constrained CI.
  - Reduced async→sync fallback warnings; count below threshold.

## Risks & Mitigations

- Skipping malformed representations could hide data issues.
  - Mitigate: warn and count skipped items; expose count in metrics.
- Perf thresholds flaky on shared runners.
  - Mitigate: env overrides + deterministic fixtures + warm‑up steps.

## Execution Plan (Sequenced)

1) Implement A: pattern‑storage guards + tests.
2) Implement A: SQLite representation guard + tests.
3) Implement B/C: perf env knobs + warm‑up + deterministic fixture.
4) Implement D: L1/L2 counters; log in perf context.
5) Run targeted suites (non‑perf → perf); tune thresholds only if
   needed.
6) Update docs/status and land changes.

## Verification Steps

- Run non‑perf:
  - `bun test tests/layer4-*.test.ts tests/unified-core.test.ts \
     tests/adapters.test.ts`
- Run perf selectively:
  - `PERF=1 bun test tests/performance/benchmark.test.ts`
  - `PERF=1 bun test tests/performance.test.ts`
- Observe CLI `stats` and HTTP `/metrics` counters after perf runs.

## Timeline

- Day 1: Workstream A, perf timeouts env + warm‑up.
- Day 2: Workstream C determinism + D counters + docs.
- Day 3: Stabilization reruns; minor threshold tuning if required.

## Non‑Goals (Reiterated)

- No productionization of Postgres/TripleStore in this cycle.
- No new features beyond guards, env knobs, and metrics needed for
  stabilization.

