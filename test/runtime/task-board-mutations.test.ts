import { describe, expect, it } from "vitest";

import type { RuntimeBoardData } from "../../src/core/api-contract";
import {
	addTaskDependency,
	addTaskToColumn,
	deleteTasksFromBoard,
	getTaskColumnId,
	moveTaskToColumn,
	trashTaskAndGetReadyLinkedTaskIds,
	updateTask,
} from "../../src/core/task-board-mutations";

function createBoard(): RuntimeBoardData {
	return {
		columns: [
			{ id: "backlog", title: "Backlog", cards: [] },
			{ id: "in_progress", title: "In Progress", cards: [] },
			{ id: "review", title: "Review", cards: [] },
			{ id: "trash", title: "Trash", cards: [] },
		],
		dependencies: [],
	};
}

describe("deleteTasksFromBoard", () => {
	it("removes a trashed task and any dependencies that reference it", () => {
		const createA = addTaskToColumn(
			createBoard(),
			"backlog",
			{ prompt: "Task A", baseRef: "main" },
			() => "aaaaa111",
		);
		const createB = addTaskToColumn(createA.board, "review", { prompt: "Task B", baseRef: "main" }, () => "bbbbb111");
		const linked = addTaskDependency(createB.board, "aaaaa", "bbbbb");
		if (!linked.added) {
			throw new Error("Expected dependency to be created.");
		}
		const trashed = trashTaskAndGetReadyLinkedTaskIds(linked.board, "bbbbb");
		const deleted = deleteTasksFromBoard(trashed.board, ["bbbbb"]);

		expect(deleted.deleted).toBe(true);
		expect(deleted.deletedTaskIds).toEqual(["bbbbb"]);
		expect(deleted.board.columns.find((column) => column.id === "trash")?.cards).toEqual([]);
		expect(deleted.board.dependencies).toEqual([]);
	});

	it("removes multiple trashed tasks at once", () => {
		const createA = addTaskToColumn(createBoard(), "trash", { prompt: "Task A", baseRef: "main" }, () => "aaaaa111");
		const createB = addTaskToColumn(createA.board, "trash", { prompt: "Task B", baseRef: "main" }, () => "bbbbb111");

		const deleted = deleteTasksFromBoard(createB.board, ["aaaaa", "bbbbb"]);

		expect(deleted.deleted).toBe(true);
		expect(deleted.deletedTaskIds.sort()).toEqual(["aaaaa", "bbbbb"]);
		expect(deleted.board.columns.find((column) => column.id === "trash")?.cards).toEqual([]);
	});
});

describe("task images", () => {
	it("preserves images when creating and updating tasks", () => {
		const created = addTaskToColumn(
			createBoard(),
			"backlog",
			{
				prompt: "Task with image",
				baseRef: "main",
				images: [
					{
						id: "img-1",
						data: "abc123",
						mimeType: "image/png",
					},
				],
			},
			() => "aaaaa111",
		);

		expect(created.task.images).toEqual([
			{
				id: "img-1",
				data: "abc123",
				mimeType: "image/png",
			},
		]);

		const updated = updateTask(created.board, created.task.id, {
			prompt: "Task with updated image",
			baseRef: "main",
			images: [
				{
					id: "img-2",
					data: "def456",
					mimeType: "image/jpeg",
				},
			],
		});

		expect(updated.task?.images).toEqual([
			{
				id: "img-2",
				data: "def456",
				mimeType: "image/jpeg",
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// 3.7 — Dependency chain auto-start
// ---------------------------------------------------------------------------
// Validates the board-mutation layer of the "dependency-driven auto-start"
// feature (plan item 3.7).  trashTaskAndGetReadyLinkedTaskIds() is the
// primitive that trashTaskById() in commands/task.ts calls to discover which
// backlog tasks become unblocked when a prerequisite moves to trash.

describe("3.7: dependency chain auto-start", () => {
	it("trashing a review task surfaces the linked backlog task in readyTaskIds", () => {
		// A (backlog) depends on B (review).  When B is trashed, A becomes ready.
		const b0 = createBoard();
		const { board: b1, task: taskA } = addTaskToColumn(
			b0,
			"backlog",
			{ prompt: "Waiting task A", baseRef: "main" },
			() => "task-a",
		);
		const { board: b2, task: taskB } = addTaskToColumn(
			b1,
			"review",
			{ prompt: "Prerequisite B", baseRef: "main" },
			() => "task-b",
		);

		const linked = addTaskDependency(b2, taskA.id, taskB.id);
		expect(linked.added).toBe(true);

		// Trash B — should unblock A.
		const result = trashTaskAndGetReadyLinkedTaskIds(linked.board, taskB.id);

		expect(result.moved).toBe(true);
		expect(getTaskColumnId(result.board, taskB.id)).toBe("trash");
		expect(getTaskColumnId(result.board, taskA.id)).toBe("backlog");
		expect(result.readyTaskIds).toContain(taskA.id);
	});

	it("only review → trash transition surfaces ready tasks (in_progress → trash does not)", () => {
		// A (backlog) depends on B.  B starts in backlog, moves to in_progress,
		// then is trashed.  The auto-start trigger only fires when the trashed
		// task was in REVIEW (matching the task lifecycle model).
		const b0 = createBoard();
		const { board: b1, task: taskA } = addTaskToColumn(
			b0,
			"backlog",
			{ prompt: "Waiting task A", baseRef: "main" },
			() => "task-a",
		);
		const { board: b2, task: taskB } = addTaskToColumn(
			b1,
			"backlog",
			{ prompt: "Task B (backlog)", baseRef: "main" },
			() => "task-b",
		);

		const linked = addTaskDependency(b2, taskA.id, taskB.id);
		expect(linked.added).toBe(true);

		// Move B to in_progress (simulating it being started but not reviewed).
		const moved = moveTaskToColumn(linked.board, taskB.id, "in_progress");
		expect(moved.moved).toBe(true);

		// Trash from in_progress — should NOT surface A as ready.
		const result = trashTaskAndGetReadyLinkedTaskIds(moved.board, taskB.id);
		expect(result.moved).toBe(true);
		expect(result.readyTaskIds).toHaveLength(0);
	});

	it("trashing from review with two linked backlog tasks surfaces both", () => {
		// Two backlog tasks (A and C) both depend on B (review).
		// Trashing B surfaces both A and C.
		const b0 = createBoard();
		const { board: b1, task: taskA } = addTaskToColumn(
			b0,
			"backlog",
			{ prompt: "Task A", baseRef: "main" },
			() => "task-a",
		);
		const { board: b2, task: taskC } = addTaskToColumn(
			b1,
			"backlog",
			{ prompt: "Task C", baseRef: "main" },
			() => "task-c",
		);
		const { board: b3, task: taskB } = addTaskToColumn(
			b2,
			"review",
			{ prompt: "Prerequisite B", baseRef: "main" },
			() => "task-b",
		);

		const l1 = addTaskDependency(b3, taskA.id, taskB.id);
		expect(l1.added).toBe(true);
		const l2 = addTaskDependency(l1.board, taskC.id, taskB.id);
		expect(l2.added).toBe(true);

		const result = trashTaskAndGetReadyLinkedTaskIds(l2.board, taskB.id);

		expect(result.moved).toBe(true);
		expect(result.readyTaskIds).toContain(taskA.id);
		expect(result.readyTaskIds).toContain(taskC.id);
	});

	it("backlog task with no dependencies is never surfaced by trashTaskAndGetReadyLinkedTaskIds", () => {
		const b0 = createBoard();
		const { board: b1, task: taskA } = addTaskToColumn(
			b0,
			"backlog",
			{ prompt: "Standalone A", baseRef: "main" },
			() => "task-a",
		);
		const { board: b2, task: taskB } = addTaskToColumn(
			b1,
			"review",
			{ prompt: "Unrelated B", baseRef: "main" },
			() => "task-b",
		);

		// No dependency created between A and B.
		const result = trashTaskAndGetReadyLinkedTaskIds(b2, taskB.id);

		expect(result.moved).toBe(true);
		// A has no dependency on B, so it must NOT appear in readyTaskIds.
		expect(result.readyTaskIds).not.toContain(taskA.id);
		expect(result.readyTaskIds).toHaveLength(0);
	});
});
