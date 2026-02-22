#!/bin/bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <pr-number>"
  exit 1
fi

PR_NUMBER="$1"
POLL_SECONDS="${CI_POLL_SECONDS:-15}"
TIMEOUT_SECONDS="${CI_TIMEOUT_SECONDS:-1800}"
START_TS=$(date +%s)

echo "Waiting for CI on PR #${PR_NUMBER}..."

while true; do
  NOW_TS=$(date +%s)
  ELAPSED=$((NOW_TS - START_TS))

  if [ "$ELAPSED" -ge "$TIMEOUT_SECONDS" ]; then
    echo "❌ Timed out waiting for CI after ${TIMEOUT_SECONDS}s"
    exit 1
  fi

  TOTAL_CHECKS=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '.statusCheckRollup | length')

  if [ "$TOTAL_CHECKS" -eq 0 ]; then
    echo "[${ELAPSED}s] CI checks not available yet..."
    sleep "$POLL_SECONDS"
    continue
  fi

  PENDING_CHECKS=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length')

  FAILED_CHECKS=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '[.statusCheckRollup[] | select(.status == "COMPLETED" and .conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED")] | length')

  echo "[${ELAPSED}s] checks=${TOTAL_CHECKS} pending=${PENDING_CHECKS} failed=${FAILED_CHECKS}"

  if [ "$FAILED_CHECKS" -gt 0 ]; then
    echo "❌ CI failed"
    gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '.statusCheckRollup[] | select(.status == "COMPLETED" and .conclusion != "SUCCESS" and .conclusion != "NEUTRAL" and .conclusion != "SKIPPED") | "- " + .name + " (" + (.conclusion // "unknown") + ") " + (.detailsUrl // "")'
    exit 1
  fi

  if [ "$PENDING_CHECKS" -eq 0 ]; then
    echo "✅ CI is green"
    exit 0
  fi

  sleep "$POLL_SECONDS"
done
