#!/usr/bin/env bash
set -ueo pipefail

# Batch progressive test runner
# Runs test files in batches and prints per-batch timing and status.
#
# Env vars:
#  - BATCH_SIZE: number of files per batch (default: 10)
#  - TIMEOUT: per-bun invocation timeout (ms) (default: 300000)
#  - MAX_FILES: limit number of test files (optional)
#  - PERF: when set (e.g., PERF=1), you can include perf suites in FILE_GLOB below
#  - BUN_JOBS: recommended 1 for stable sequential behavior

BATCH_SIZE=${BATCH_SIZE:-10}
TIMEOUT_MS=${TIMEOUT:-300000}
MAX_FILES=${MAX_FILES:-}

# Collect test files; adjust the glob if you want to include perf by default
mapfile -t FILES < <(find test tests -type f \( -name "*.test.ts" -o -name "*.test.js" \) | sort)

if [[ -n "${MAX_FILES}" ]]; then
  FILES=("${FILES[@]:0:${MAX_FILES}}")
fi

TOTAL=${#FILES[@]}
if [[ ${TOTAL} -eq 0 ]]; then
  echo "No test files found."
  exit 0
fi

echo "Running ${TOTAL} files in batches of ${BATCH_SIZE} (timeout ${TIMEOUT_MS}ms, BUN_JOBS=${BUN_JOBS:-1})"

passes=0
fails=0

batch_index=0
for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  batch_index=$((batch_index+1))
  end=$(( i + BATCH_SIZE ))
  if [[ ${end} -gt ${TOTAL} ]]; then end=${TOTAL}; fi
  batch=("${FILES[@]:i:end-i}")

  echo "=== BATCH START $(date -Is) :: [${batch_index}] files ${i}-${end}/${TOTAL}"
  printf "Files: %s\n" "${batch[*]}"
  START=$(date +%s%3N)
  # Run bun once for the entire batch; do not bail so we capture all failures in the batch
  BUN_JOBS=${BUN_JOBS:-1} bun test "${batch[@]}" --timeout ${TIMEOUT_MS}
  code=$?
  END=$(date +%s%3N)
  DUR=$((END-START))

  if [[ $code -eq 0 ]]; then
    passes=$((passes+1))
    echo "=== BATCH PASS  $(date -Is) :: [${batch_index}] duration ${DUR}ms"
  else
    fails=$((fails+1))
    echo "=== BATCH FAIL  $(date -Is) :: [${batch_index}] duration ${DUR}ms (exit ${code})"
  fi
  echo
done

echo "Batches summary: ${passes} passed, ${fails} failed, total $((passes+fails))"
exit $([[ ${fails} -eq 0 ]] && echo 0 || echo 1)

