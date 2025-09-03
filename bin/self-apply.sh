#!/usr/bin/env bash
set -euo pipefail

# Self-apply helper: stage a unified diff via CLI propose-patch and run checks.
# Usage:
#   bin/self-apply.sh -f my.diff -- bun run typecheck "bun test -q"
#   git diff | bin/self-apply.sh -- bun run typecheck

PATCH_FILE=""
CMDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)
      PATCH_FILE="$2"; shift 2;;
    --)
      shift; CMDS=("$@"); break;;
    *)
      echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

# Reuse existing snapshot when available for iterative runs
SNAP=$(ontology-lsp get-snapshot --prefer-existing)

if [[ -z "$PATCH_FILE" ]]; then
  TMP=$(mktemp)
  cat > "$TMP"
  PATCH_FILE="$TMP"
fi

ARGS=("--snapshot" "$SNAP" "--file" "$PATCH_FILE" "--run-checks")
for c in "${CMDS[@]:-}"; do
  [[ -n "$c" ]] && ARGS+=("--cmd" "$c")
done

ontology-lsp propose-patch "${ARGS[@]}"

if [[ -n "${TMP:-}" && -f "$TMP" ]]; then rm -f "$TMP"; fi

echo "Snapshot: $SNAP"
