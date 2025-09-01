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
