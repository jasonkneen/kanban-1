#!/bin/bash
set -euo pipefail
# Periodic git fetch across all Kanban workspace repositories.
# Self-rescheduling: each run schedules the next run via the job queue.
#
# Args:
#   $1 = KANBAN_RUNTIME_URL  (e.g. http://127.0.0.1:3001)
#   $2 = JOB_QUEUE_DB_URL    (e.g. sqlite:///home/user/.kanban/job-queue/jobs.db)
#   $3 = INTERVAL_SECS       (default: 300)
#   $4 = MAX_ITERATIONS      (default: 0 = unlimited)
#   $5 = STATE_FILE          (default: ~/.kanban/job-queue/state/git-fetch-all.iter)

RUNTIME_URL="${1:?KANBAN_RUNTIME_URL is required}"
JOB_QUEUE_DB_URL="${2:?JOB_QUEUE_DB_URL is required}"
INTERVAL="${3:-300}"
MAX_ITER="${4:-0}"
STATE_FILE="${5:-${HOME}/.kanban/job-queue/state/git-fetch-all.iter}"

# ── Iteration counter ───────────────────────────────────────────────────────
mkdir -p "$(dirname "$STATE_FILE")"
iter=0
[ -f "$STATE_FILE" ] && iter=$(cat "$STATE_FILE")
iter=$((iter + 1))

# Policy gate: max iterations (0 = no limit)
if [ "$MAX_ITER" -gt 0 ] && [ "$iter" -gt "$MAX_ITER" ]; then
  echo "[git-fetch-all] Reached max iterations ($MAX_ITER). Stopping."
  rm -f "$STATE_FILE"
  exit 0
fi

echo "$iter" > "$STATE_FILE"
echo "[git-fetch-all] Iteration $iter starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── Fetch workspace paths from Kanban runtime ───────────────────────────────
# Uses the TRPC getStatus endpoint to discover indexed project paths.
PROJECT_PATHS=$(
  curl -sf --max-time 5 \
    -H "Content-Type: application/json" \
    "${RUNTIME_URL}/api/trpc/projects.list" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
projects = data.get('result', {}).get('data', [])
for p in projects:
    path = p.get('path', '')
    if path:
        print(path)
" 2>/dev/null || true
)

if [ -z "$PROJECT_PATHS" ]; then
  echo "[git-fetch-all] No workspace paths found via TRPC, skipping fetch."
else
  while IFS= read -r project_path; do
    if [ -d "${project_path}/.git" ] || git -C "$project_path" rev-parse --git-dir &>/dev/null; then
      echo "[git-fetch-all] Fetching: $project_path"
      git -C "$project_path" fetch --all --prune --tags --quiet 2>&1 || \
        echo "[git-fetch-all] Warning: fetch failed for $project_path"
    else
      echo "[git-fetch-all] Skipping non-git path: $project_path"
    fi
  done <<< "$PROJECT_PATHS"
fi

echo "[git-fetch-all] Iteration $iter complete."

# ── Schedule next run ───────────────────────────────────────────────────────
JOB_QUEUE_BIN="${KANBAN_JOB_QUEUE_BINARY:-job_queue}"
"$JOB_QUEUE_BIN" --database-url "$JOB_QUEUE_DB_URL" schedule \
  --queue kanban.maintenance \
  --due-in "${INTERVAL}s" \
  --command "$0" \
  --arg "$RUNTIME_URL" \
  --arg "$JOB_QUEUE_DB_URL" \
  --arg "$INTERVAL" \
  --arg "$MAX_ITER" \
  --arg "$STATE_FILE" \
  2>&1 && echo "[git-fetch-all] Next run scheduled in ${INTERVAL}s."
