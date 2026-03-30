/**
 * BatchActionBar — floating bottom bar that appears when 2+ backlog cards are
 * selected, providing bulk actions (run batch, schedule all, trash all).
 */
import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

export interface BatchActionBarProps {
	/** IDs + titles of the selected backlog tasks. */
	selectedTasks: Array<{ taskId: string; title: string }>;
	/** Clears the selection. */
	onClear: () => void;
	/** Opens the BatchConfigDialog to configure and start a batch run. */
	onRunBatch: () => void;
	/** Trashes all selected tasks. */
	onTrashAll: () => Promise<void>;
}

export function BatchActionBar({ selectedTasks, onClear, onRunBatch, onTrashAll }: BatchActionBarProps) {
	const [trashing, setTrashing] = useState(false);

	if (selectedTasks.length < 2) return null;

	return (
		<div
			className={cn(
				"fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
				"flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-xl",
				"border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm",
			)}
		>
			{/* Count */}
			<span className="text-sm font-medium text-neutral-200">{selectedTasks.length} selected</span>

			<div className="h-4 w-px bg-neutral-700" />

			{/* Run Batch */}
			<Button onClick={onRunBatch} className="text-xs px-3 py-1.5 h-auto">
				⚡ Run Batch
			</Button>

			{/* Trash All */}
			<Button
				variant="ghost"
				className="text-xs px-3 py-1.5 h-auto text-red-400 hover:text-red-300"
				disabled={trashing}
				onClick={async () => {
					setTrashing(true);
					try {
						await onTrashAll();
					} finally {
						setTrashing(false);
					}
				}}
			>
				{trashing ? "Trashing…" : "🗑 Trash All"}
			</Button>

			{/* Clear selection */}
			<button
				type="button"
				className="ml-1 rounded-full p-1 text-neutral-500 hover:text-neutral-200 transition-colors"
				onClick={onClear}
				title="Clear selection"
			>
				<svg
					width="12"
					height="12"
					viewBox="0 0 12 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					aria-hidden="true"
				>
					<path d="M1 1l10 10M11 1L1 11" />
				</svg>
			</button>
		</div>
	);
}
