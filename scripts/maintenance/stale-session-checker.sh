#!/bin/bash
set -euo pipefail
# Checks for in_progress tasks with no agent output for >STALE_MINUTES and stops them.
# Self-rescheduling via job queue.
#
# Args:
#   $1 = KANBAN_RUNTIME_URL
#   $2 = JOB_QUEUE_DB_URL
#   $3 = INTERVAL_SECS       (default: 300)
#   $4 = STALE_MINUTES       (default: 30)
#   $5 = STATE_FILE

RUNTIME_URL="${1:?KANBAN_RUNTIME_URL is required}"
JOB_QUEUE_DB_URL="${2:?JOB_QUEUE_DB_URL is required}"
INTERVAL="${3:-300}"
STALE_MINUTES="${4:-30}"
STATE_FILE="${5:-${HOME}/.kanban/job-queue/state/stale-session-checker.iter}"

mkdir -p "$(dirname "$STATE_FILE")"
iter=0
[ -f "$STATE_FILE" ] && iter=$(cat "$STATE_FILE")
iter=$((iter + 1))
echo "$iter" > "$STATE_FILE"

echo "[stale-session-checker] Iteration $iter — stale threshold: ${STALE_MINUTES}m"

STALE_THRESHOLD_SECS=$((STALE_MINUTES * 60))
NOW_SECS=$(date +%s)

# Query in_progress tasks from the Kanban TRPC workspace state
STALE_TASKS=$(
  curl -sf --max-time 10 \
    -H "Content-Type: application/json" \
    "${RUNTIME_URL}/api/trpc/runtime.listStaleSessions?input=$(python3 -c "
import urllib.parse, json
print(urllib.parse.quote(json.dumps({'thresholdSecs': $STALE_THRESHOLD_SECS})))
")" \
  2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
sessions = data.get('result', {}).get('data', [])
for s in sessions:
    task_id = s.get('taskId', '')
    workspace = s.get('workspacePath', '')
    if task_id and workspace:
        print(f'{task_id}\t{workspace}')
" 2>/dev/null || true
)

if [ -z "$STALE_TASKS" ]; then
  echo "[stale-session-checker] No stale sessions found."
else
  echo "$STALE_TASKS" | while IFS=$'\t' read -r task_id workspace; do
    echo "[stale-session-checker] Stopping stale session: taskId=$task_id workspace=$workspace"
    kanban task stop "$task_id" --workspace "$workspace" 2>&1 || \
      echo "[stale-session-checker] Warning: could not stop task $task_id"
  done
fi

echo "[stale-session-checker] Iteration $iter complete."

# Schedule next run
JOB_QUEUE_BIN="${KANBAN_JOB_QUEUE_BINARY:-job_queue}"
"$JOB_QUEUE_BIN" --database-url "$JOB_QUEUE_DB_URL" schedule \
  --queue kanban.maintenance \
  --due-in "${INTERVAL}s" \
  --command "$0" \
  --arg "$RUNTIME_URL" \
  --arg "$JOB_QUEUE_DB_URL" \
  --arg "$INTERVAL" \
  --arg "$STALE_MINUTES" \
  --arg "$STATE_FILE" \
  2>&1 && echo "[stale-session-checker] Next run scheduled in ${INTERVAL}s."
