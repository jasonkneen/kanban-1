/**
 * jobs-api.ts — TRPC handler functions for the job queue integration.
 *
 * These are the domain functions that the app-router delegates to.
 * They receive a dependency-injected `JobQueueService` and return plain
 * serialisable objects, keeping all business logic out of the router file.
 */
import type { JobQueueService } from "../server/job-queue-service";

export interface CreateJobsApiDependencies {
	getJobQueueService: () => JobQueueService;
}

export function createJobsApi(deps: CreateJobsApiDependencies) {
	const svc = () => deps.getJobQueueService();

	return {
		// -----------------------------------------------------------------
		// Status
		// -----------------------------------------------------------------

		/** Returns the current availability, running state, health, and inspect snapshot. */
		getStatus: async () => {
			const service = svc();
			const available = service.isAvailable();
			if (!available) {
				return { available: false, running: false, health: null, inspect: null };
			}
			const running = service.isSidecarRunning();
			if (!running) {
				return { available: true, running: false, health: null, inspect: null };
			}
			try {
				const [health, inspect] = await Promise.all([service.health(), service.inspect()]);
				return { available: true, running: true, health, inspect };
			} catch {
				// Sidecar may still be starting — return graceful partial state.
				return { available: true, running: true, health: null, inspect: null };
			}
		},

		// -----------------------------------------------------------------
		// Mutations
		// -----------------------------------------------------------------

		/** Immediately enqueue a job and return its ID. */
		enqueue: async (input: {
			command: string;
			args?: string[];
			queue?: string;
			priority?: number;
			maxAttempts?: number;
			cwd?: string;
			timeoutSecs?: number;
		}) => {
			const jobId = await svc().enqueue(input);
			return { ok: true, jobId };
		},

		/** Schedule a job for future execution and return its ID. */
		schedule: async (input: {
			command: string;
			args?: string[];
			queue?: string;
			priority?: number;
			maxAttempts?: number;
			cwd?: string;
			timeoutSecs?: number;
			dueIn?: string;
			dueAt?: number;
		}) => {
			const jobId = await svc().schedule(input);
			return { ok: true, jobId };
		},

		/** Pause a queue (workers stop claiming from it). */
		pauseQueue: async (input: { queue: string; reason?: string }) => {
			await svc().pauseQueue(input.queue, input.reason);
			return { ok: true };
		},

		/** Resume a paused queue. */
		resumeQueue: async (input: { queue: string; reason?: string }) => {
			await svc().resumeQueue(input.queue, input.reason);
			return { ok: true };
		},

		/** Replay failed jobs back to queued state. */
		replayFailed: async (input?: { queue?: string; limit?: number }) => {
			const count = await svc().replayFailed(input);
			return { ok: true, replayed: count };
		},

		// -----------------------------------------------------------------
		// Sidecar lifecycle
		// -----------------------------------------------------------------

		/** Start the sidecar process programmatically (e.g., from the UI). */
		startSidecar: async () => {
			const service = svc();
			if (!service.isAvailable()) {
				return { ok: false, error: "Binary not found. Set KANBAN_JOB_QUEUE_BINARY or build the sidecar." };
			}
			await service.startSidecar();
			return { ok: true };
		},

		/** Stop the sidecar process. */
		stopSidecar: async () => {
			await svc().stopSidecar();
			return { ok: true };
		},

		// -----------------------------------------------------------------
		// Batch operations (Project 6)
		// -----------------------------------------------------------------

		/**
		 * Enqueue a set of backlog tasks as a prioritised batch on an isolated
		 * per-batch queue.  Tasks are enqueued with descending priority so the
		 * first task in the list has the highest priority.  The job queue's worker
		 * pool provides natural concurrency control — only `concurrency` workers
		 * need to be assigned to the batch queue for strict cap enforcement.
		 */
		createBatch: async (input: { taskIds: string[]; concurrency: number; projectPath: string }) => {
			const batchId = globalThis.crypto.randomUUID().slice(0, 8);
			const queue = `kanban.batch.${batchId}`;
			const kanbanBin = process.argv[1] ?? "kanban";
			const jobIds: string[] = [];

			for (let i = 0; i < input.taskIds.length; i++) {
				const taskId = input.taskIds[i];
				// Priority descends so earlier tasks in the list are processed first.
				const priority = input.taskIds.length - i;
				const jobId = await svc().enqueue({
					queue,
					priority,
					command: process.execPath,
					args: [kanbanBin, "task", "start", "--task-id", taskId, "--project-path", input.projectPath],
					maxAttempts: 2,
					timeoutSecs: 7200,
				});
				jobIds.push(jobId);
			}

			return {
				ok: true,
				batchId,
				queue,
				jobIds,
				taskCount: input.taskIds.length,
				concurrency: input.concurrency,
			};
		},
	};
}

export type JobsApi = ReturnType<typeof createJobsApi>;
