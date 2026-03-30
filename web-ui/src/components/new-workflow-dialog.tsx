/**
 * NewWorkflowDialog — dialog for configuring and starting a multi-step
 * agentic workflow on a board card via the `jobs.startWorkflow` TRPC endpoint.
 */

import type { RuntimeWorkflowPolicy } from "@runtime-contract";
import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Dialog } from "./ui/dialog";

export interface NewWorkflowDialogProps {
	taskId: string;
	taskTitle: string;
	projectPath: string;
	onStart: (policy: RuntimeWorkflowPolicy) => Promise<void>;
	onClose: () => void;
}

const DEFAULT_POLICY: RuntimeWorkflowPolicy = {
	maxIterations: 10,
	intervalSeconds: 120,
	allowCodeEdits: false,
	requireVerification: true,
	deadlineMinutes: null,
};

type PolicyField = keyof RuntimeWorkflowPolicy;

export function NewWorkflowDialog({
	taskId: _taskId,
	taskTitle,
	projectPath: _projectPath,
	onStart,
	onClose,
}: NewWorkflowDialogProps) {
	const [policy, setPolicy] = useState<RuntimeWorkflowPolicy>(DEFAULT_POLICY);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function update<K extends PolicyField>(key: K, value: RuntimeWorkflowPolicy[K]) {
		setPolicy((p: RuntimeWorkflowPolicy) => ({ ...p, [key]: value }));
	}

	async function handleStart() {
		if (policy.maxIterations < 1 || policy.intervalSeconds < 10) {
			setError("Max iterations ≥ 1 and interval ≥ 10s required.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await onStart(policy);
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to start workflow.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<div className="flex flex-col gap-5 p-5 min-w-[380px]">
				<div>
					<h3 className="text-sm font-semibold text-neutral-100">New Workflow</h3>
					<p className="mt-0.5 text-xs text-neutral-400 truncate">{taskTitle}</p>
				</div>

				{/* Max iterations */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium">Max iterations</span>
					<input
						type="number"
						min={1}
						max={100}
						value={policy.maxIterations}
						onChange={(e) => update("maxIterations", Math.max(1, Number(e.target.value)))}
						className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 w-24"
					/>
				</label>

				{/* Interval */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium">Interval between steps (seconds)</span>
					<div className="flex items-center gap-3">
						<input
							type="range"
							min={10}
							max={600}
							step={10}
							value={policy.intervalSeconds}
							onChange={(e) => update("intervalSeconds", Number(e.target.value))}
							className="flex-1"
						/>
						<span className="text-sm text-neutral-200 w-12 text-right">{policy.intervalSeconds}s</span>
					</div>
				</label>

				{/* Deadline */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium">Deadline (minutes, optional)</span>
					<input
						type="number"
						min={1}
						placeholder="No deadline"
						value={policy.deadlineMinutes ?? ""}
						onChange={(e) => update("deadlineMinutes", e.target.value ? Number(e.target.value) : null)}
						className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 w-32"
					/>
				</label>

				{/* Toggles */}
				<div className="flex flex-col gap-2">
					{(
						[
							["allowCodeEdits", "Allow code edits"],
							["requireVerification", "Require verification step"],
						] as Array<[keyof RuntimeWorkflowPolicy & string, string]>
					).map(([key, label]) => (
						<label key={key} className="flex items-center gap-2 cursor-pointer select-none">
							<button
								type="button"
								role="switch"
								aria-checked={!!policy[key]}
								onClick={() => update(key, !policy[key] as RuntimeWorkflowPolicy[typeof key])}
								className={cn(
									"relative inline-flex h-4 w-8 shrink-0 rounded-full border-2 border-transparent transition-colors",
									policy[key] ? "bg-blue-500" : "bg-neutral-700",
								)}
							>
								<span
									className={cn(
										"pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
										policy[key] ? "translate-x-4" : "translate-x-0",
									)}
								/>
							</button>
							<span className="text-sm text-neutral-300">{label}</span>
						</label>
					))}
				</div>

				{error && <p className="text-xs text-red-400">{error}</p>}

				<div className="flex justify-end gap-2 pt-1">
					<Button variant="ghost" onClick={onClose} disabled={loading}>
						Cancel
					</Button>
					<Button onClick={handleStart} disabled={loading}>
						{loading ? "Starting…" : "Start Workflow"}
					</Button>
				</div>
			</div>
		</Dialog>
	);
}
