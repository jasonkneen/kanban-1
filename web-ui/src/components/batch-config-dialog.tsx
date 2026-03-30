/**
 * BatchConfigDialog — configures and starts a batch run of multiple backlog
 * tasks via the `jobs.createBatch` TRPC endpoint.
 *
 * Features:
 *  - Drag-to-reorder task list (sets priority order)
 *  - Concurrency slider (1 to min(selected, 4))
 *  - "Start Batch" button
 */
import { useCallback, useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Dialog } from "./ui/dialog";

export interface BatchConfigDialogProps {
	tasks: Array<{ taskId: string; title: string }>;
	projectPath: string;
	onStart: (input: { taskIds: string[]; concurrency: number; projectPath: string }) => Promise<void>;
	onClose: () => void;
}

export function BatchConfigDialog({ tasks: initialTasks, projectPath, onStart, onClose }: BatchConfigDialogProps) {
	const [orderedTasks, setOrderedTasks] = useState(initialTasks);
	const [concurrency, setConcurrency] = useState(Math.min(2, initialTasks.length));
	const [dragging, setDragging] = useState<number | null>(null);
	const [dragOver, setDragOver] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDragStart = useCallback(
		(i: number) => (e: React.DragEvent) => {
			setDragging(i);
			e.dataTransfer.effectAllowed = "move";
		},
		[],
	);

	const handleDragOver = useCallback(
		(i: number) => (e: React.DragEvent) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			setDragOver(i);
		},
		[],
	);

	const handleDrop = useCallback(
		(toIndex: number) => () => {
			if (dragging === null || dragging === toIndex) {
				setDragging(null);
				setDragOver(null);
				return;
			}
			setOrderedTasks((prev) => {
				const next = [...prev];
				const spliced = next.splice(dragging, 1);
				const moved = spliced[0];
				if (!moved) return next;
				next.splice(toIndex, 0, moved);
				return next;
			});
			setDragging(null);
			setDragOver(null);
		},
		[dragging],
	);

	async function handleStart() {
		setError(null);
		setLoading(true);
		try {
			await onStart({
				taskIds: orderedTasks.map((t) => t.taskId),
				concurrency,
				projectPath,
			});
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to start batch.");
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
			<div className="flex flex-col gap-5 p-5 min-w-[400px] max-w-[480px]">
				<div>
					<h3 className="text-sm font-semibold text-neutral-100">Configure Batch</h3>
					<p className="mt-0.5 text-xs text-neutral-400">Drag to reorder • Tasks run highest priority first</p>
				</div>

				{/* Task list */}
				<ol className="flex flex-col gap-1">
					{orderedTasks.map((task, i) => (
						<li
							key={task.taskId}
							draggable
							onDragStart={handleDragStart(i)}
							onDragOver={handleDragOver(i)}
							onDrop={handleDrop(i)}
							onDragEnd={() => {
								setDragging(null);
								setDragOver(null);
							}}
							className={cn(
								"flex items-center gap-2 rounded px-3 py-2 text-sm cursor-grab active:cursor-grabbing select-none",
								"border transition-colors",
								dragOver === i ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 bg-neutral-900/50",
								dragging === i ? "opacity-40" : "opacity-100",
							)}
						>
							{/* Priority badge */}
							<span className="w-5 h-5 shrink-0 rounded-full bg-neutral-700 text-neutral-400 text-[10px] font-bold flex items-center justify-center">
								{i + 1}
							</span>
							{/* Drag handle */}
							<svg
								width="12"
								height="12"
								viewBox="0 0 12 12"
								fill="currentColor"
								className="text-neutral-600 shrink-0"
								aria-hidden="true"
							>
								<rect y="1" width="12" height="1.5" rx="0.75" />
								<rect y="5" width="12" height="1.5" rx="0.75" />
								<rect y="9" width="12" height="1.5" rx="0.75" />
							</svg>
							<span className="truncate text-neutral-200">{task.title}</span>
						</li>
					))}
				</ol>

				{/* Concurrency */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium">Concurrency (simultaneous tasks)</span>
					<div className="flex items-center gap-3">
						<input
							type="range"
							min={1}
							max={Math.min(orderedTasks.length, 4)}
							step={1}
							value={concurrency}
							onChange={(e) => setConcurrency(Number(e.target.value))}
							className="flex-1"
						/>
						<span className="text-sm text-neutral-200 w-4 text-right">{concurrency}</span>
					</div>
				</label>

				{error && <p className="text-xs text-red-400">{error}</p>}

				<div className="flex justify-end gap-2 pt-1">
					<Button variant="ghost" onClick={onClose} disabled={loading}>
						Cancel
					</Button>
					<Button onClick={handleStart} disabled={loading}>
						{loading ? "Starting…" : `Start ${orderedTasks.length} Tasks`}
					</Button>
				</div>
			</div>
		</Dialog>
	);
}
