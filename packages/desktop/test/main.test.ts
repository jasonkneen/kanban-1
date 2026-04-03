import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	type WindowState,
	loadWindowState,
	resolveWindowStatePath,
	saveWindowState,
} from "../src/window-state.js";

// ---------------------------------------------------------------------------
// resolveWindowStatePath
// ---------------------------------------------------------------------------

describe("resolveWindowStatePath", () => {
	it("joins userData path with window-state.json", () => {
		const result = resolveWindowStatePath("/home/user/.config/Kanban");
		expect(result).toBe(
			path.join("/home/user/.config/Kanban", "window-state.json"),
		);
	});

	it("works with trailing separator", () => {
		const result = resolveWindowStatePath(
			`/home/user/.config/Kanban${path.sep}`,
		);
		expect(result).toBe(
			path.join("/home/user/.config/Kanban", "window-state.json"),
		);
	});
});

// ---------------------------------------------------------------------------
// loadWindowState / saveWindowState
// ---------------------------------------------------------------------------

describe("Window state persistence", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(path.join(tmpdir(), "kanban-main-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	// -------------------------------------------------------------------
	// loadWindowState
	// -------------------------------------------------------------------

	describe("loadWindowState", () => {
		it("returns undefined when file does not exist", () => {
			const result = loadWindowState(tempDir);
			expect(result).toBeUndefined();
		});

		it("returns undefined when file contains invalid JSON", () => {
			const filePath = resolveWindowStatePath(tempDir);
			writeFileSync(filePath, "not json", "utf-8");
			expect(loadWindowState(tempDir)).toBeUndefined();
		});

		it("returns undefined when width is missing", () => {
			const filePath = resolveWindowStatePath(tempDir);
			writeFileSync(
				filePath,
				JSON.stringify({ height: 900, isMaximized: false }),
				"utf-8",
			);
			expect(loadWindowState(tempDir)).toBeUndefined();
		});

		it("returns undefined when height is missing", () => {
			const filePath = resolveWindowStatePath(tempDir);
			writeFileSync(
				filePath,
				JSON.stringify({ width: 1400, isMaximized: false }),
				"utf-8",
			);
			expect(loadWindowState(tempDir)).toBeUndefined();
		});

		it("returns undefined when isMaximized is missing", () => {
			const filePath = resolveWindowStatePath(tempDir);
			writeFileSync(
				filePath,
				JSON.stringify({ width: 1400, height: 900 }),
				"utf-8",
			);
			expect(loadWindowState(tempDir)).toBeUndefined();
		});

		it("returns undefined when width is not a number", () => {
			const filePath = resolveWindowStatePath(tempDir);
			writeFileSync(
				filePath,
				JSON.stringify({ width: "big", height: 900, isMaximized: false }),
				"utf-8",
			);
			expect(loadWindowState(tempDir)).toBeUndefined();
		});

		it("loads a valid state with x and y", () => {
			const filePath = resolveWindowStatePath(tempDir);
			const state: WindowState = {
				x: 100,
				y: 200,
				width: 1400,
				height: 900,
				isMaximized: false,
			};
			writeFileSync(filePath, JSON.stringify(state), "utf-8");
			expect(loadWindowState(tempDir)).toEqual(state);
		});

		it("loads a valid state without x and y", () => {
			const filePath = resolveWindowStatePath(tempDir);
			const stored = { width: 1200, height: 800, isMaximized: true };
			writeFileSync(filePath, JSON.stringify(stored), "utf-8");

			expect(loadWindowState(tempDir)).toEqual({
				x: undefined,
				y: undefined,
				width: 1200,
				height: 800,
				isMaximized: true,
			});
		});

		it("treats non-number x/y as undefined", () => {
			const filePath = resolveWindowStatePath(tempDir);
			const stored = {
				x: "left",
				y: null,
				width: 1000,
				height: 700,
				isMaximized: false,
			};
			writeFileSync(filePath, JSON.stringify(stored), "utf-8");

			expect(loadWindowState(tempDir)).toEqual({
				x: undefined,
				y: undefined,
				width: 1000,
				height: 700,
				isMaximized: false,
			});
		});
	});

	// -------------------------------------------------------------------
	// saveWindowState
	// -------------------------------------------------------------------

	describe("saveWindowState", () => {
		it("creates the file with the given state", () => {
			const state: WindowState = {
				x: 50,
				y: 75,
				width: 1400,
				height: 900,
				isMaximized: false,
			};

			saveWindowState(tempDir, state);

			const filePath = resolveWindowStatePath(tempDir);
			expect(existsSync(filePath)).toBe(true);

			const raw = readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(raw);
			expect(parsed).toEqual(state);
		});

		it("overwrites an existing file", () => {
			const state1: WindowState = {
				x: 0,
				y: 0,
				width: 800,
				height: 600,
				isMaximized: false,
			};
			const state2: WindowState = {
				x: 100,
				y: 200,
				width: 1920,
				height: 1080,
				isMaximized: true,
			};

			saveWindowState(tempDir, state1);
			saveWindowState(tempDir, state2);

			expect(loadWindowState(tempDir)).toEqual(state2);
		});

		it("does not throw when directory does not exist", () => {
			const state: WindowState = {
				x: 0,
				y: 0,
				width: 1000,
				height: 700,
				isMaximized: false,
			};

			expect(() =>
				saveWindowState("/nonexistent/deeply/nested/path", state),
			).not.toThrow();
		});
	});

	// -------------------------------------------------------------------
	// round-trip
	// -------------------------------------------------------------------

	describe("round-trip", () => {
		it("save then load returns the same state", () => {
			const state: WindowState = {
				x: 42,
				y: 84,
				width: 1600,
				height: 1000,
				isMaximized: false,
			};

			saveWindowState(tempDir, state);
			expect(loadWindowState(tempDir)).toEqual(state);
		});

		it("round-trips maximized state with undefined x/y", () => {
			const state: WindowState = {
				x: undefined,
				y: undefined,
				width: 1920,
				height: 1080,
				isMaximized: true,
			};

			saveWindowState(tempDir, state);
			expect(loadWindowState(tempDir)).toEqual({
				x: undefined,
				y: undefined,
				width: 1920,
				height: 1080,
				isMaximized: true,
			});
		});
	});
});
