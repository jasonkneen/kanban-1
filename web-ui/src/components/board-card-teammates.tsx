import { useState } from "react";
import type { RuntimeTaskSessionSummary } from "@/runtime/types";
import type { BoardCard } from "@/types";

interface BoardCardTeammatesProps {
	teammates: BoardCard[];
	sessionsByTaskId: Record<string, RuntimeTaskSessionSummary>;
}

const COLLAPSE_THRESHOLD = 4;

function getTeammateStatusDotColor(session: RuntimeTaskSessionSummary | undefined): string {
	if (!session) {
		return "var(--color-text-tertiary)";
	}
	switch (session.state) {
		case "running":
			return "var(--color-status-blue)";
		case "awaiting_review":
		case "interrupted":
			return "var(--color-status-green)";
		case "failed":
			return "var(--color-status-red)";
		case "idle":
		default:
			return "var(--color-text-tertiary)";
	}
}

function getTeammateStatusText(session: RuntimeTaskSessionSummary | undefined): string {
	if (!session) {
		return "Idle";
	}
	switch (session.state) {
		case "running":
			return "Running";
		case "awaiting_review":
			return "Completed";
		case "interrupted":
			return "Completed";
		case "failed":
			return "Failed";
		case "idle":
		default:
			return "Idle";
	}
}

export function BoardCardTeammates({ teammates, sessionsByTaskId }: BoardCardTeammatesProps): React.ReactElement | null {
	const [isExpanded, setIsExpanded] = useState(false);

	if (teammates.length === 0) {
		return null;
	}

	const shouldCollapse = teammates.length > COLLAPSE_THRESHOLD;
	const visibleTeammates = shouldCollapse && !isExpanded ? teammates.slice(0, COLLAPSE_THRESHOLD) : teammates;

	return (
		<div className="border-t border-border mt-2 pt-2">
			<p className="text-text-tertiary text-xs mb-1" style={{ margin: "0 0 4px" }}>
				Teammates ({teammates.length})
			</p>
			<div className="flex flex-col gap-0.5">
				{visibleTeammates.map((teammate) => {
					const session = sessionsByTaskId[teammate.id];
					const dotColor = getTeammateStatusDotColor(session);
					const statusText = getTeammateStatusText(session);
					const roleLabel = teammate.role
						? teammate.role.length > 40
							? `${teammate.role.slice(0, 40)}…`
							: teammate.role
						: teammate.id;
					const agentLabel = session?.agentId ?? null;

					return (
						<div key={teammate.id} className="flex items-center gap-1.5 min-w-0">
							<span
								className="inline-block shrink-0 rounded-full"
								style={{
									width: 6,
									height: 6,
									backgroundColor: dotColor,
									marginTop: 1,
								}}
							/>
							<div className="flex flex-col flex-1 min-w-0">
								<span
									className="text-text-secondary truncate"
									style={{ fontSize: 11 }}
								>
									{roleLabel}
								</span>
								{agentLabel ? (
									<span
										className="text-text-tertiary truncate"
										style={{ fontSize: 10 }}
									>
										{agentLabel}
									</span>
								) : null}
							</div>
							<span
								className="text-text-tertiary shrink-0"
								style={{ fontSize: 11, color: dotColor }}
							>
								{statusText}
							</span>
						</div>
					);
				})}
			</div>
			{shouldCollapse ? (
				<button
					type="button"
					className="text-text-tertiary text-xs mt-1 cursor-pointer hover:text-text-secondary"
					style={{ fontSize: 11, marginTop: 4, background: "none", border: "none", padding: 0 }}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setIsExpanded((prev) => !prev);
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					{isExpanded ? "Show less" : `Show all ${teammates.length}`}
				</button>
			) : null}
		</div>
	);
}
