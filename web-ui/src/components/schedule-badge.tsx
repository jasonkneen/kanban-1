/**
 * ScheduleBadge — small countdown clock badge for backlog cards that have a
 * scheduled start time set via the job queue.
 */
import { useEffect, useState } from "react";
import { cn } from "./ui/cn";

function formatRelative(dueAtMs: number): string {
	const diffMs = dueAtMs - Date.now();
	if (diffMs <= 0) return "due now";
	const secs = Math.floor(diffMs / 1000);
	if (secs < 60) return `${secs}s`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m`;
	const hrs = Math.floor(mins / 60);
	const remMins = mins % 60;
	if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
	const days = Math.floor(hrs / 24);
	return `${days}d`;
}

export interface ScheduleBadgeProps {
	/** Unix milliseconds when the job is due to fire. */
	dueAtMs: number;
	className?: string;
}

export function ScheduleBadge({ dueAtMs, className }: ScheduleBadgeProps) {
	const [label, setLabel] = useState(() => formatRelative(dueAtMs));

	useEffect(() => {
		setLabel(formatRelative(dueAtMs));
		// Update every minute (fine-grained enough for a countdown badge)
		const id = setInterval(() => setLabel(formatRelative(dueAtMs)), 60_000);
		return () => clearInterval(id);
	}, [dueAtMs]);

	const isOverdue = dueAtMs <= Date.now();

	return (
		<span
			title={`Scheduled: ${new Date(dueAtMs).toLocaleString()}`}
			className={cn(
				"inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
				isOverdue ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400",
				className,
			)}
		>
			{/* clock icon */}
			<svg
				width="10"
				height="10"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				aria-hidden="true"
			>
				<circle cx="8" cy="8" r="6.5" />
				<path d="M8 4.5V8l2.5 1.5" />
			</svg>
			{label}
		</span>
	);
}
