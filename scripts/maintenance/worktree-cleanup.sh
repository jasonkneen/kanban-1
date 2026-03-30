#!/bin/bash
set -euo pipefail
# Removes git worktrees for trashed tasks older than AGE_HOURS hours.
# Self-rescheduling via job queue.
#
# Args:
#   $1 = KANBAN_RUNTIME_URL
#   $2 = JOB_QUEUE_DB_URL
#   $3 = INTERVAL_SECS   (default: 3600)
#   $4 = AGE_HOURS       (default: 24)
#   $5 = STATE_FILE

RUNTIME_URL="${1:?KANBAN_RUNTIME_URL is required}"
JOB_QUEUE_DB_URL="${2:?JOB_QUEUE_DB_URL is required}"
INTERVAL="${3:-3600}"
AGE_HOURS="${4:-24}"
STATE_FILE="${5:-${HOME}/.kanban/job-queue/state/worktree-cleanup.iter}"

mkdir -p "$(dirname "$STATE_FILE")"
iter=0
[ -f "$STATE_FILE" ] && iter=$(cat "$STATE_FILE")
iter=$((iter + 1))
echo "$iter" > "$STATE_FILE"

echo "[worktree-cleanup] Iteration $iter — age threshold: ${AGE_HOURS}h"

AGE_THRESHOLD_SECS=$((AGE_HOURS * 3600))

# Ask Kanban for worktrees that are safe to delete
STALE_WORKTREES=$(
  curl -sf --max-time 10 \
    -H "Content-Type: application/json" \
    "${RUNTIME_URL}/api/trpc/runtime.listStaleWorktrees?input=$(python3 -c "
import urllib.parse, json
print(urllib.parse.quote(json.dumps({'olderThanSecs': $AGE_THRESHOLD_SECS})))
")" \
  2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
worktrees = data.get('result', {}).get('data', [])
for w in worktrees:
    path = w.get('worktreePath', '')
    task_id = w.get('taskId', '')
    workspace = w.get('workspaceId', '')
    if path and task_id:
        print(f'{path}\t{task_id}\t{workspace}')
" 2>/dev/null || true
)

if [ -z "$STALE_WORKTREES" ]; then
  echo "[worktree-cleanup] No stale worktrees found."
else
  echo "$STALE_WORKTREES" | while IFS=$'\t' read -r worktree_path task_id workspace_id; do
    echo "[worktree-cleanup] Removing worktree for task $task_id: $worktree_path"
    # Remove the worktree via git (prune handles dangling refs)
    if [ -d "$worktree_path" ]; then
      # Find the main repo from the worktree path by checking parent dirs
      MAIN_REPO=$(git -C "$worktree_path" rev-parse --git-common-dir 2>/dev/null | sed 's|/.git/||' || true)
      if [ -n "$MAIN_REPO" ] && [ -d "$MAIN_REPO" ]; then
        git -C "$MAIN_REPO" worktree remove --force "$worktree_path" 2>&1 || \
          echo "[worktree-cleanup] Warning: git worktree remove failed for $worktree_path, trying rm"
        # Fallback: direct removal
        [ -d "$worktree_path" ] && rm -rf "$worktree_path" || true
      else
        rm -rf "$worktree_path"
      fi
      echo "[worktree-cleanup] Removed: $worktree_path"
    else
      echo "[worktree-cleanup] Path already gone: $worktree_path"
    fi

    # Prune stale worktree refs in the main repo(s)
    # (best-effort; non-fatal)
    git -C "$(dirname "$worktree_path")" worktree prune 2>/dev/null || true
  done
fi

echo "[worktree-cleanup] Iteration $iter complete."

# Schedule next run
JOB_QUEUE_BIN="${KANBAN_JOB_QUEUE_BINARY:-job_queue}"
"$JOB_QUEUE_BIN" --database-url "$JOB_QUEUE_DB_URL" schedule \
  --queue kanban.maintenance \
  --due-in "${INTERVAL}s" \
  --command "$0" \
  --arg "$RUNTIME_URL" \
  --arg "$JOB_QUEUE_DB_URL" \
  --arg "$INTERVAL" \
  --arg "$AGE_HOURS" \
  --arg "$STATE_FILE" \
  2>&1 && echo "[worktree-cleanup] Next run scheduled in ${INTERVAL}s."
