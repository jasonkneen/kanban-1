/**
 * WorkflowDetailPanel — replaces the normal card detail view for cards that
 * have an active workflow (workflowPolicy + workflowState set).
 *
 * Shows:
 *  - Iteration progress bar and counter
 *  - Status badge (running / paused / completed / stopped)
 *  - Countdown to next iteration
 *  - Artifact timeline
 *  - Controls: Pause, Resume, Stop, Run Next Step Now
 */

import type { RuntimeWorkflowPolicy, RuntimeWorkflowState } from "@runtime-contract";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

export interface WorkflowDetailPanelProps {
	taskId: string;
	workflowPolicy: RuntimeWorkflowPolicy;
	workflowState: RuntimeWorkflowState;
	onPause: () => Promise<void>;
	onResume: () => Promise<void>;
	onStop: () => Promise<void>;
	/** Run the next iteration immediately (re-enqueue with dueIn=0s). */
	onRunNow: () => Promise<void>;
}

const STATUS_COLORS: Record<RuntimeWorkflowState["status"], string> = {
	pending: "bg-neutral-500/20 text-neutral-400",
	running: "bg-green-500/20 text-green-400",
	paused: "bg-amber-500/20 text-amber-400",
	completed: "bg-blue-500/20 text-blue-400",
	stopped: "bg-red-500/20 text-red-400",
};

function useCountdown(targetMs: number | null): string {
	const [label, setLabel] = useState("");
	useEffect(() => {
		if (!targetMs) {
			setLabel("");
			return;
		}
		const update = () => {
			const diff = targetMs - Date.now();
			if (diff <= 0) {
				setLabel("now");
				return;
			}
			const s = Math.floor(diff / 1000);
			const m = Math.floor(s / 60);
			const h = Math.floor(m / 60);
			if (h > 0) setLabel(`${h}h ${m % 60}m`);
			else if (m > 0) setLabel(`${m}m ${s % 60}s`);
			else setLabel(`${s}s`);
		};
		update();
		const id = setInterval(update, 1_000);
		return () => clearInterval(id);
	}, [targetMs]);
	return label;
}

export function WorkflowDetailPanel({
	taskId: _taskId,
	workflowPolicy,
	workflowState,
	onPause,
	onResume,
	onStop,
	onRunNow,
}: WorkflowDetailPanelProps) {
	const [busy, setBusy] = useState<string | null>(null);
	const countdown = useCountdown(workflowState.nextDueAt ? workflowState.nextDueAt * 1000 : null);
	const progress = Math.min(1, workflowState.iteration / workflowPolicy.maxIterations);

	async function handle(label: string, fn: () => Promise<void>) {
		setBusy(label);
		try {
			await fn();
		} finally {
			setBusy(null);
		}
	}

	const isRunning = workflowState.status === "running";
	const isPaused = workflowState.status === "paused";
	const isDone = workflowState.status === "completed" || workflowState.status === "stopped";

	return (
		<div className="flex flex-col gap-4 p-4 text-sm">
			{/* Header row */}
			<div className="flex items-center justify-between">
				<span className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS_COLORS[workflowState.status])}>
					{workflowState.status.charAt(0).toUpperCase() + workflowState.status.slice(1)}
				</span>
				{!isDone && countdown && (
					<span className="text-xs text-neutral-400">
						Next step in <span className="text-neutral-200">{countdown}</span>
					</span>
				)}
			</div>

			{/* Progress bar */}
			<div className="flex flex-col gap-1">
				<div className="flex justify-between text-xs text-neutral-400">
					<span>
						Iteration <span className="text-neutral-200">{workflowState.iteration}</span> /{" "}
						{workflowPolicy.maxIterations}
					</span>
					<span>{Math.round(progress * 100)}%</span>
				</div>
				<div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
					<div
						className="h-full rounded-full bg-blue-500 transition-all duration-500"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			</div>

			{/* Policy summary */}
			<div className="rounded border border-neutral-800 bg-neutral-900/50 p-3 flex flex-col gap-1 text-xs text-neutral-400">
				<span className="text-neutral-300 font-medium mb-1">Policy</span>
				<span>Interval: {workflowPolicy.intervalSeconds}s</span>
				{workflowPolicy.deadlineMinutes && <span>Deadline: {workflowPolicy.deadlineMinutes} min</span>}
				<span>Code edits: {workflowPolicy.allowCodeEdits ? "allowed" : "disallowed"}</span>
				<span>Verification: {workflowPolicy.requireVerification ? "required" : "optional"}</span>
			</div>

			{/* Artifacts */}
			{workflowState.artifacts.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium text-neutral-300">Artifacts</span>
					<ul className="flex flex-col gap-1">
						{[...workflowState.artifacts]
							.sort((a, b) => b.iteration - a.iteration)
							.map((a) => (
								<li key={a.path} className="flex items-center gap-2 text-xs text-neutral-400">
									<span className="rounded bg-neutral-800 px-1">{a.type}</span>
									<span className="text-neutral-500">iter {a.iteration}</span>
									<code className="truncate text-neutral-300">{a.path.split("/").slice(-2).join("/")}</code>
								</li>
							))}
					</ul>
				</div>
			)}

			{/* Controls */}
			{!isDone && (
				<div className="flex flex-wrap gap-2 pt-1">
					{isRunning && (
						<Button
							variant="ghost"
							className="text-xs"
							disabled={!!busy}
							onClick={() => handle("pause", onPause)}
						>
							{busy === "pause" ? "Pausing…" : "⏸ Pause"}
						</Button>
					)}
					{isPaused && (
						<>
							<Button
								variant="ghost"
								className="text-xs"
								disabled={!!busy}
								onClick={() => handle("resume", onResume)}
							>
								{busy === "resume" ? "Resuming…" : "▶ Resume"}
							</Button>
							<Button
								variant="ghost"
								className="text-xs"
								disabled={!!busy}
								onClick={() => handle("runnow", onRunNow)}
							>
								{busy === "runnow" ? "Enqueueing…" : "⚡ Run Now"}
							</Button>
						</>
					)}
					<Button
						variant="ghost"
						className="text-xs text-red-400 hover:text-red-300"
						disabled={!!busy}
						onClick={() => handle("stop", onStop)}
					>
						{busy === "stop" ? "Stopping…" : "⏹ Stop"}
					</Button>
				</div>
			)}
		</div>
	);
}
