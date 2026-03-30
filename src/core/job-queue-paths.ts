import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Root data directory for the job queue sidecar. */
export function getJobQueueDataDir(): string {
	const override = process.env.KANBAN_JOB_QUEUE_DATA_DIR;
	if (override?.trim()) {
		return override.trim();
	}
	return join(homedir(), ".kanban", "job-queue");
}

/** SQLite database URL for the job queue (passed to the binary as --database-url). */
export function getJobQueueDatabaseUrl(): string {
	return `sqlite://${join(getJobQueueDataDir(), "jobs.db")}`;
}

/**
 * Resolve the absolute path to the `job_queue` binary.
 *
 * Resolution order:
 *  1. `KANBAN_JOB_QUEUE_BINARY` environment variable (explicit override)
 *  2. Dev build path inside the adjacent `overthink_rust` workspace
 *  3. `job_queue` / `job-queue` on `$PATH` via `which`
 *
 * Returns `null` if the binary cannot be found.
 */
export function resolveJobQueueBinary(): string | null {
	// 1. Explicit env override
	const envPath = process.env.KANBAN_JOB_QUEUE_BINARY?.trim();
	if (envPath) {
		try {
			accessSync(envPath, constants.X_OK);
			return envPath;
		} catch {
			// env path is set but not executable — fall through to warn via null
			return null;
		}
	}

	// 2. Dev build path: adjacent overthink_rust workspace (debug build)
	const devCandidates = [
		// Mac/Linux debug build
		join(
			homedir(),
			"dev",
			"github.com",
			"cline",
			"overthink_rust",
			"job_queue_layer",
			"target",
			"debug",
			"job_queue",
		),
		// Relative to current working dir (monorepo sibling)
		join(process.cwd(), "..", "overthink_rust", "job_queue_layer", "target", "debug", "job_queue"),
	];
	for (const candidate of devCandidates) {
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// not found, continue
		}
	}

	// 3. PATH lookup
	const pathNames = ["job_queue", "job-queue"];
	for (const name of pathNames) {
		try {
			// execSync is synchronous and fine here (called once at startup)
			const { execSync } = require("node:child_process") as typeof import("node:child_process");
			const resolved = execSync(`which ${name} 2>/dev/null`, {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
			if (resolved) {
				return resolved;
			}
		} catch {
			// not found on PATH
		}
	}

	return null;
}
