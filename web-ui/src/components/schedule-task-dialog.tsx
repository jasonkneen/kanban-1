/**
 * ScheduleTaskDialog — dialog for scheduling a backlog task to start at a
 * future time via the job queue `jobs.schedule` TRPC endpoint.
 *
 * Usage:
 *   <ScheduleTaskDialog
 *     taskId="abc123"
 *     taskTitle="Refactor auth module"
 *     onSchedule={(dueAtMs) => client.jobs.schedule.mutate(...)}
 *     onClose={() => setOpen(false)}
 *   />
 */
import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Dialog } from "./ui/dialog";

export interface ScheduleTaskDialogProps {
	taskId: string;
	taskTitle: string;
	/** Called with unix-millisecond timestamp when the user confirms. */
	onSchedule: (dueAtMs: number) => Promise<void>;
	onClose: () => void;
}

type Preset = { label: string; getMs: () => number };

const PRESETS: Preset[] = [
	{ label: "In 30 min", getMs: () => Date.now() + 30 * 60_000 },
	{ label: "In 1 hour", getMs: () => Date.now() + 60 * 60_000 },
	{ label: "In 2 hours", getMs: () => Date.now() + 2 * 60 * 60_000 },
	{
		label: "Tonight 10 pm",
		getMs: () => {
			const d = new Date();
			d.setHours(22, 0, 0, 0);
			if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
			return d.getTime();
		},
	},
	{
		label: "Tomorrow 9 am",
		getMs: () => {
			const d = new Date();
			d.setDate(d.getDate() + 1);
			d.setHours(9, 0, 0, 0);
			return d.getTime();
		},
	},
];

/** Format ms timestamp to local datetime-local input value (YYYY-MM-DDTHH:mm). */
function msToDatetimeLocal(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleTaskDialog({ taskId: _taskId, taskTitle, onSchedule, onClose }: ScheduleTaskDialogProps) {
	const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
	const [customValue, setCustomValue] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function resolvedMs(): number | null {
		if (selectedPreset !== null) return PRESETS[selectedPreset]?.getMs() ?? null;
		if (customValue) return new Date(customValue).getTime();
		return null;
	}

	async function handleConfirm() {
		const ms = resolvedMs();
		if (!ms || Number.isNaN(ms)) {
			setError("Please pick a time.");
			return;
		}
		if (ms <= Date.now()) {
			setError("Scheduled time must be in the future.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			await onSchedule(ms);
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to schedule task.");
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
			<div className="flex flex-col gap-4 p-4 min-w-[320px]">
				<h3 className="text-sm font-semibold text-neutral-100">Schedule &ldquo;{taskTitle}&rdquo;</h3>
				{/* Presets */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Quick presets</span>
					<div className="flex flex-wrap gap-2">
						{PRESETS.map((p, i) => (
							<button
								key={p.label}
								type="button"
								onClick={() => {
									setSelectedPreset(i);
									setCustomValue("");
								}}
								className={cn(
									"rounded px-2.5 py-1 text-sm border transition-colors",
									selectedPreset === i
										? "border-blue-500 bg-blue-500/20 text-blue-300"
										: "border-neutral-700 text-neutral-300 hover:border-neutral-500",
								)}
							>
								{p.label}
							</button>
						))}
					</div>
				</div>

				{/* Custom date-time */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Custom time</span>
					<input
						type="datetime-local"
						className={cn(
							"rounded border bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 transition-colors",
							customValue ? "border-blue-500" : "border-neutral-700",
						)}
						min={msToDatetimeLocal(Date.now() + 60_000)}
						value={customValue}
						onChange={(e) => {
							setCustomValue(e.target.value);
							setSelectedPreset(null);
						}}
					/>
				</div>

				{error && <p className="text-xs text-red-400">{error}</p>}

				{/* Actions */}
				<div className="flex justify-end gap-2 pt-1">
					<Button variant="ghost" onClick={onClose} disabled={loading}>
						Cancel
					</Button>
					<Button onClick={handleConfirm} disabled={loading || resolvedMs() === null}>
						{loading ? "Scheduling…" : "Schedule Task"}
					</Button>
				</div>
			</div>
		</Dialog>
	);
}
