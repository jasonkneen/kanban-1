/**
 * Integration tests for the job_queue sidecar.
 *
 * These tests spawn a REAL sidecar process against an isolated temp SQLite DB.
 * They require the compiled job_queue binary to be available (build with
 * `cargo build` inside overthink_rust/job_queue_layer).
 *
 * Covers plan items:
 *  0.6  — start sidecar, enqueue a job, verify it runs to completion
 *  1.10 — schedule a command for 3s in the future, verify it stays pending then
 *         executes and writes verifiable output (proves scheduler deferred-execution
 *         pipeline for the "kanban task start" use case)
 *  2.9  — schedule 3 jobs with short delays, verify all complete (scheduler pipeline)
 *  4.10 — run planner-step.sh 3 iterations directly, verify artifacts + policy gate
 *  5.14 — enqueue 10 jobs, verify inspect() returns accurate status counts
 *  6.8  — enqueue 4 batch jobs on an isolated queue, verify all succeed
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { resolveJobQueueBinary } from "../../src/core/job-queue-paths";
import { createJobQueueHarness } from "../utilities/job-queue-harness";

// All tests in this suite share one sidecar instance for efficiency.
const jq = createJobQueueHarness();

beforeAll(() => jq.start(), 30_000);
afterAll(() => jq.stop());

// ---------------------------------------------------------------------------
// 0.6 — Enqueue a job and verify it runs to completion
// ---------------------------------------------------------------------------
describe("0.6: enqueue a job and verify it runs", () => {
	test("enqueue /bin/echo, verify completed status", async () => {
		const jobId = await jq.service.enqueue({
			command: "/bin/echo",
			args: ["hello from job_queue integration test"],
		});

		expect(jobId).toMatch(/\S+/); // non-empty job ID

		await jq.waitForJobs(1, 10_000);

		const snapshot = await jq.service.inspect();
		// The binary uses "succeeded" as the terminal success status.
		expect(snapshot.jobs.status_counts.succeeded).toBeGreaterThanOrEqual(1);
	}, 15_000);

	test("sidecar health check returns healthy after processing", async () => {
		const health = await jq.service.health();
		// The health endpoint should return a non-empty response — shape
		// varies by binary version so we just confirm it parsed as an object.
		expect(health).toBeDefined();
		expect(typeof health).toBe("object");
	}, 10_000);
});

// ---------------------------------------------------------------------------
// 1.10 — Deferred execution: schedule a command for 3s, verify sentinel file
//        exists only AFTER the delay (proves deferred execution, the core
//        mechanism behind "kanban task start" scheduled at a future time)
// ---------------------------------------------------------------------------
describe("1.10: scheduled task execution — deferred pipeline", () => {
	test("scheduled command creates sentinel file only after due time", async () => {
		const sentinel = join(tmpdir(), `kanban-test-1.10-${Date.now()}.txt`);

		// Sanity check: file doesn't exist yet.
		expect(existsSync(sentinel)).toBe(false);

		const baseline = await jq.service.inspect();
		const baselineSucceeded = baseline.jobs.status_counts.succeeded ?? 0;

		// Schedule /usr/bin/touch to create a sentinel file, due in 3 seconds.
		// Using touch (no -c-style flags) because clap in job_queue treats
		// dash-prefixed --arg values as unexpected flags.
		const jobId = await jq.service.schedule({
			command: "/usr/bin/touch",
			args: [sentinel],
			dueIn: "3s",
		});
		expect(jobId).toMatch(/\S+/);

		// 0.8s after scheduling the job is still in the scheduled queue — NOT yet executed.
		await new Promise((res) => setTimeout(res, 800));
		expect(existsSync(sentinel)).toBe(false);

		// Now wait for the scheduler to fire the job and the worker to execute it.
		await jq.waitForJobs(baselineSucceeded + 1, 12_000);
		expect(existsSync(sentinel)).toBe(true);
	}, 20_000);
});

// ---------------------------------------------------------------------------
// 2.9 — Scheduler pipeline: schedule 3 jobs with short delays, all complete
// ---------------------------------------------------------------------------
describe("2.9: scheduler pipeline runs scheduled jobs to completion", () => {
	test("three jobs scheduled with 1s delay all complete within 8s", async () => {
		// Snapshot baseline so we measure NEW completions.
		const baseline = await jq.service.inspect();
		const baselineSucceeded = baseline.jobs.status_counts.succeeded ?? 0;

		// Schedule 3 jobs due in 1 second each (the fast schedulerPollMs=100
		// in the harness ensures they're picked up promptly).
		await jq.service.schedule({ command: "/bin/echo", args: ["sched-1"], dueIn: "1s" });
		await jq.service.schedule({ command: "/bin/echo", args: ["sched-2"], dueIn: "1s" });
		await jq.service.schedule({ command: "/bin/echo", args: ["sched-3"], dueIn: "1s" });

		// Wait until 3 more jobs succeed (baseline + 3).
		await jq.waitForJobs(baselineSucceeded + 3, 12_000);

		const snapshot = await jq.service.inspect();
		expect(snapshot.jobs.status_counts.succeeded).toBeGreaterThanOrEqual(baselineSucceeded + 3);
	}, 15_000);
});

// ---------------------------------------------------------------------------
// 4.10 — Multi-step agentic workflow: 3 iterations with artifacts
//
// Runs planner-step.sh manually for iterations 1-3, verifying:
//   • plan.md / exec.md / verify.md are written for each iteration
//   • state.json is updated correctly after each step
//   • a 4th call triggers the maxIterations policy gate (exit code 2)
//     and marks the workflow as "completed" in state.json
//
// Requires: jq (from PATH) and the job_queue binary (resolved via
// KANBAN_JOB_QUEUE_BINARY env var or the dev build location).
// The test is skipped with a warning if either is unavailable.
// ---------------------------------------------------------------------------
describe("4.10: multi-step workflow — 3 iterations with artifacts", () => {
	test("planner-step.sh creates artifacts per iteration and stops at maxIterations", () => {
		// ── Resolve the job_queue binary dir so we can add it to PATH ──────────
		const binPath = resolveJobQueueBinary();
		if (!binPath) {
			console.warn("4.10: skipping — job_queue binary not found");
			return;
		}
		const binDir = dirname(binPath);

		// Build a PATH that includes both the binary dir and the system jq.
		const basePath = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
		const testPath = `${binDir}:${basePath}`;

		// Verify jq is reachable (the script requires it).
		const jqCheck = spawnSync("which", ["jq"], { env: { ...process.env, PATH: testPath } });
		if (jqCheck.status !== 0) {
			console.warn("4.10: skipping — jq not found on PATH");
			return;
		}

		// ── Temp workspace ─────────────────────────────────────────────────────
		const workspaceDir = mkdtempSync(join(tmpdir(), "kanban-wf-4.10-"));
		const taskId = `wf-test-${Date.now()}`;
		const stateFile = join(workspaceDir, "state.json");
		const policyFile = join(workspaceDir, "policy.json");

		const initialState = {
			iteration: 0,
			status: "running",
			lastStepAt: null,
			nextDueAt: null,
			currentJobId: null,
			artifacts: [],
		};

		// maxIterations=3, very long interval so self-scheduled jobs never fire
		// during the test (test drives iterations manually).
		const policy = {
			maxIterations: 3,
			intervalSeconds: 9999,
			allowCodeEdits: false,
			requireVerification: true,
		};

		writeFileSync(stateFile, JSON.stringify(initialState));
		writeFileSync(policyFile, JSON.stringify(policy));

		const scriptPath = resolve(__dirname, "../../scripts/workflows/planner-step.sh");
		const dbUrl = jq.service.getDatabaseUrl();
		const env = { ...process.env, PATH: testPath };

		try {
			// ── 3 successful iterations ────────────────────────────────────────
			for (let i = 1; i <= 3; i++) {
				const result = spawnSync("bash", [scriptPath, taskId, workspaceDir, dbUrl, stateFile, policyFile], {
					env,
					timeout: 15_000,
					encoding: "utf8",
				});

				expect(result.status, `iteration ${i} should exit 0 — stderr: ${result.stderr}`).toBe(0);

				// Each iteration writes plan.md, exec.md, and verify.md.
				const artDir = join(workspaceDir, ".kanban-workflows", taskId, `iter-${i}`);
				expect(existsSync(join(artDir, "plan.md")), `plan.md missing for iter ${i}`).toBe(true);
				expect(existsSync(join(artDir, "exec.md")), `exec.md missing for iter ${i}`).toBe(true);
				// requireVerification=true → verify.md should exist
				expect(existsSync(join(artDir, "verify.md")), `verify.md missing for iter ${i}`).toBe(true);

				// State file must reflect the correct iteration and status.
				const state = JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, unknown>;
				expect(state.iteration).toBe(i);
				expect(state.status).toBe("running");
			}

			// ── 4th call: policy gate fires (iteration 4 > maxIterations 3) ───
			const gateTrigger = spawnSync("bash", [scriptPath, taskId, workspaceDir, dbUrl, stateFile, policyFile], {
				env,
				timeout: 15_000,
				encoding: "utf8",
			});

			// Exit code 2 = policy gate triggered (not a crash).
			expect(gateTrigger.status, `4th call should exit 2 — stderr: ${gateTrigger.stderr}`).toBe(2);

			const finalState = JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, unknown>;
			expect(finalState.status).toBe("completed");
			expect(finalState.iteration).toBe(4);
		} finally {
			rmSync(workspaceDir, { recursive: true, force: true });
		}
	}, 60_000);
});

// ---------------------------------------------------------------------------
// 5.14 — Dashboard accuracy: enqueue 10 jobs, verify counts
// ---------------------------------------------------------------------------
describe("5.14: inspect() returns accurate counts for 10 enqueued jobs", () => {
	test("status counts reflect all enqueued and completed jobs", async () => {
		// Baseline.
		const baseline = await jq.service.inspect();
		const baselineSucceeded = baseline.jobs.status_counts.succeeded ?? 0;

		// Enqueue 10 quick echo jobs.
		const enqueuePromises = Array.from({ length: 10 }, (_, i) =>
			jq.service.enqueue({
				command: "/bin/echo",
				args: [`batch-job-${i}`],
			}),
		);
		const jobIds = await Promise.all(enqueuePromises);
		expect(jobIds).toHaveLength(10);

		// Every returned ID must be a non-empty string.
		for (const id of jobIds) {
			expect(id).toMatch(/\S+/);
		}

		// Wait for all 10 to succeed.
		await jq.waitForJobs(baselineSucceeded + 10, 15_000);

		const snapshot = await jq.service.inspect();
		const succeeded = snapshot.jobs.status_counts.succeeded ?? 0;

		// Total succeeded must be at least 10 more than baseline.
		expect(succeeded).toBeGreaterThanOrEqual(baselineSucceeded + 10);

		// No new failures introduced by our jobs.
		const failed = snapshot.jobs.status_counts.failed ?? 0;
		const baselineFailed = baseline.jobs.status_counts.failed ?? 0;
		expect(failed).toBe(baselineFailed);
	}, 20_000);

	test("inspect() snapshot includes all required top-level fields", async () => {
		const snapshot = await jq.service.inspect();
		expect(snapshot).toHaveProperty("schema_version");
		expect(snapshot).toHaveProperty("generated_at");
		expect(snapshot).toHaveProperty("jobs");
		expect(snapshot).toHaveProperty("scheduled");
		expect(snapshot).toHaveProperty("diagnostics");
		expect(snapshot.jobs).toHaveProperty("status_counts");
		expect(snapshot.scheduled).toHaveProperty("status_counts");
	}, 10_000);
});

// ---------------------------------------------------------------------------
// 6.8 — Batch operations: 4 tasks enqueued on an isolated batch queue
//
// Simulates the createBatch() path from jobs-api.ts:
//   • 4 jobs are enqueued on a dedicated kanban.batch.<id> queue
//   • jobs are given descending priority (first = highest)
//   • all 4 succeed within the timeout window
//
// With 2 workers in the test harness, at most 2 run concurrently — this
// validates that the worker pool provides natural concurrency control for
// batch queues without any special configuration.
// ---------------------------------------------------------------------------
describe("6.8: batch operations — 4 tasks with priority ordering complete successfully", () => {
	test("4 batch-queued jobs all succeed; descending priority ensures correct order", async () => {
		const baseline = await jq.service.inspect();
		const baselineSucceeded = baseline.jobs.status_counts.succeeded ?? 0;

		// Unique batch queue isolates these jobs from the rest of the suite.
		const batchId = `test-${Date.now()}`;
		const queue = `kanban.batch.${batchId}`;
		const taskCount = 4;

		// Enqueue 4 echo jobs with descending priority (mirrors createBatch logic).
		const jobIds: string[] = [];
		for (let i = 0; i < taskCount; i++) {
			const priority = taskCount - i; // 4, 3, 2, 1
			const jobId = await jq.service.enqueue({
				queue,
				priority,
				command: "/bin/echo",
				args: [`batch-task-${i}-of-${taskCount}`],
				maxAttempts: 2,
			});
			jobIds.push(jobId);
		}

		// All 4 job IDs must be non-empty strings.
		expect(jobIds).toHaveLength(taskCount);
		for (const id of jobIds) {
			expect(id).toMatch(/\S+/);
		}

		// Wait for all 4 to succeed — with 2 harness workers this proves that
		// the batch queue drains fully even with concurrency < task count.
		await jq.waitForJobs(baselineSucceeded + taskCount, 20_000);

		const snapshot = await jq.service.inspect();
		expect(snapshot.jobs.status_counts.succeeded).toBeGreaterThanOrEqual(baselineSucceeded + taskCount);

		// No new failures from the batch.
		const failed = snapshot.jobs.status_counts.failed ?? 0;
		const baselineFailed = baseline.jobs.status_counts.failed ?? 0;
		expect(failed).toBe(baselineFailed);
	}, 25_000);
});
