import { stop as stopEsbuild } from "esbuild";

// Node 22 changed stream.pipeline() to wait for the "close" event before
// completing (nodejs/node#53462). The esbuild child process that vite spawns
// for TypeScript transforms holds stdio handles open indefinitely, which
// prevents the Node event loop from draining after tests finish. Explicitly
// stopping esbuild releases those handles so vitest can exit cleanly.
//
// On Node 20 (and locally on Node 22 with faster shutdown timing), vitest
// exits before this becomes a problem. In CI on Node 22, the slower runner
// timing consistently triggers the hang.
function shouldLogNode22CiDiagnostics(): boolean {
	if (!process.env.CI) {
		return false;
	}
	const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
	return Number.isFinite(majorVersion) && majorVersion >= 22;
}

function describeHandle(handle: unknown): string {
	if (!handle || typeof handle !== "object") {
		return typeof handle;
	}

	const candidate = handle as {
		constructor?: { name?: string };
		pid?: number;
		fd?: number;
	};
	const name = candidate.constructor?.name ?? "unknown";

	if (name === "ChildProcess" && typeof candidate.pid === "number") {
		return `${name}(pid=${String(candidate.pid)})`;
	}

	if (typeof candidate.fd === "number") {
		return `${name}(fd=${String(candidate.fd)})`;
	}

	return name;
}

function logActiveResources(stage: string): void {
	const inspector = process as NodeJS.Process & {
		_getActiveHandles?: () => unknown[];
		_getActiveRequests?: () => unknown[];
	};
	const handles = inspector._getActiveHandles?.() ?? [];
	const requests = inspector._getActiveRequests?.() ?? [];
	const handleSummary = handles.map((handle) => describeHandle(handle)).join(", ");
	const requestSummary = requests.map((request) => describeHandle(request)).join(", ");

	console.error(
		`[vitest teardown] ${stage}: handles=${String(handles.length)} [${handleSummary}] requests=${String(
			requests.length,
		)} [${requestSummary}]`,
	);
}

export async function teardown(): Promise<void> {
	if (shouldLogNode22CiDiagnostics()) {
		logActiveResources("before esbuild.stop()");
	}
	await stopEsbuild();
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 50);
	});
	if (shouldLogNode22CiDiagnostics()) {
		logActiveResources("after esbuild.stop()");
	}
}
