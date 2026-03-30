/**
 * Maintenance job seeding for the Kanban job queue.
 *
 * These jobs are scheduled once at server startup and re-scheduled by the
 * scripts they invoke so that they recur on the desired cadence.  They are
 * idempotent — duplicate scheduling is harmless because the job queue
 * deduplicates by content hash internally.
 *
 * Jobs use the "maintenance" queue so that they are isolated from
 * user-visible "scheduled-tasks" and do not consume worker capacity that is
 * needed for task execution.
 */
import type { JobQueueService } from "./job-queue-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceJobOptions {
	/** Number of worker threads available in the sidecar.  Affects how many
	 *  concurrent maintenance jobs are allowed.  Default: 2. */
	maxMaintenanceWorkers?: number;
}

// ---------------------------------------------------------------------------
// Job definitions
// ---------------------------------------------------------------------------

interface MaintenanceSeed {
	/** Human-readable name for log messages. */
	name: string;
	/** Delay from now until first run.  Uses job_queue `--due-in` format. */
	dueIn: string;
	/** The command to run (absolute path or PATH-resolvable binary). */
	command: string;
	/** Additional arguments passed to the command. */
	args: string[];
	/** Queue to use.  Defaults to "maintenance". */
	queue?: string;
	/** Maximum attempts before the job is failed-permanently.  Default: 1. */
	maxAttempts?: number;
	/** Wall-clock timeout in seconds.  Default: 300 (5 minutes). */
	timeoutSecs?: number;
}

/**
 * Returns the set of recurring maintenance jobs to seed.
 * The kanban binary path is resolved from the calling process so that the
 * same version that started the server runs the maintenance scripts.
 */
function buildMaintenanceSeeds(kanbanBin: string): MaintenanceSeed[] {
	return [
		// -----------------------------------------------------------------------
		// 1. Replay recently-failed scheduled-task jobs.
		//    Runs 15 minutes after startup, then every hour (the script
		//    re-schedules itself with --due-in 1h).
		// -----------------------------------------------------------------------
		{
			name: "replay-failed-scheduled-tasks",
			dueIn: "15m",
			command: process.execPath,
			args: [kanbanBin, "maintenance", "replay-failed", "--queue", "scheduled-tasks", "--limit", "50"],
			queue: "maintenance",
			maxAttempts: 1,
			timeoutSecs: 120,
		},
		// -----------------------------------------------------------------------
		// 2. Log a job-queue health snapshot.
		//    Runs 5 minutes after startup, then every 30 minutes.
		// -----------------------------------------------------------------------
		{
			name: "health-snapshot",
			dueIn: "5m",
			command: process.execPath,
			args: [kanbanBin, "maintenance", "health-snapshot"],
			queue: "maintenance",
			maxAttempts: 1,
			timeoutSecs: 30,
		},
	];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed periodic maintenance jobs into the job queue.
 *
 * This is called once after the sidecar has started.  It is intentionally
 * fire-and-forget: failures are logged but do not propagate.
 */
export async function seedMaintenanceJobs(
	service: JobQueueService,
	_options: MaintenanceJobOptions = {},
): Promise<void> {
	if (!service.isAvailable() || !service.isSidecarRunning()) {
		return;
	}

	const kanbanBin = process.argv[1] ?? "kanban";
	const seeds = buildMaintenanceSeeds(kanbanBin);

	for (const seed of seeds) {
		try {
			await service.schedule({
				command: seed.command,
				args: seed.args,
				queue: seed.queue ?? "maintenance",
				dueIn: seed.dueIn,
				maxAttempts: seed.maxAttempts ?? 1,
				timeoutSecs: seed.timeoutSecs ?? 300,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[job-queue] maintenance seed "${seed.name}" failed: ${msg}\n`);
		}
	}
}
