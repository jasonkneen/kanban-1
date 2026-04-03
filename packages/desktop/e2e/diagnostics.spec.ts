/**
 * Diagnostics Dialog E2E specs — verify that the diagnostics panel reflects
 * actual desktop runtime state.
 *
 * These tests launch the full Electron app via Playwright, trigger the
 * diagnostics dialog through the real IPC path (`open-diagnostics`), and
 * assert that the rendered information matches the expected local/connected
 * state.
 */

import { test, expect } from "@playwright/test";
import { type LaunchedDesktopApp, launchDesktopApp } from "./fixtures";

test.describe("diagnostics dialog", () => {
	// Generous timeout for Electron startup + runtime child initialization.
	test.setTimeout(120_000);

	test("diagnostics dialog shows local connected state", async () => {
		let launched: LaunchedDesktopApp | undefined;

		try {
			launched = await launchDesktopApp();
			const { page, electronApp } = launched;

			// Wait for the board UI to be fully visible before opening diagnostics.
			await expect(page.getByText("Backlog")).toBeVisible({ timeout: 30_000 });

			// Trigger the diagnostics dialog via the real IPC path.
			// This mirrors exactly what the "View → Diagnostics" menu item does:
			// mainWindow.webContents.send("open-diagnostics")
			await electronApp.evaluate(({ BrowserWindow }) => {
				const windows = BrowserWindow.getAllWindows();
				if (windows.length > 0) {
					windows[0].webContents.send("open-diagnostics");
				}
			});

			// Assert the diagnostics dialog opens — the DialogHeader renders
			// a Radix DialogTitle with text "Diagnostics".
			const dialogTitle = page.getByRole("heading", { name: "Diagnostics" });
			await expect(dialogTitle).toBeVisible({ timeout: 10_000 });

			// Assert connection type is "Local" (desktop app with local runtime).
			const connectionTypeLabel = page.getByText("Connection type");
			await expect(connectionTypeLabel).toBeVisible({ timeout: 5_000 });
			const localValue = page.getByText("Local");
			await expect(localValue).toBeVisible({ timeout: 5_000 });

			// Assert WebSocket state is "Connected" (runtime is healthy and
			// the renderer has received a snapshot by this point).
			const wsStateLabel = page.getByText("WebSocket state");
			await expect(wsStateLabel).toBeVisible({ timeout: 5_000 });
			const connectedValue = page.getByText("Connected");
			await expect(connectedValue).toBeVisible({ timeout: 5_000 });

			// Assert Runtime version is displayed (not the "—" fallback).
			const runtimeVersionLabel = page.getByText("Runtime version");
			await expect(runtimeVersionLabel).toBeVisible({ timeout: 5_000 });
			// The runtime version row should NOT show "—" — it should have a
			// real version string. We locate the row container and verify its
			// text content does not equal the empty-state dash.
			const runtimeVersionRow = page.locator("div").filter({ hasText: "Runtime version" }).filter({ hasText: /\d+\.\d+/ });
			await expect(runtimeVersionRow.first()).toBeVisible({ timeout: 5_000 });

			// Assert Auth status row is present (regardless of authenticated
			// or unauthenticated — it should be visible with some value).
			const authStatusLabel = page.getByText("Auth status");
			await expect(authStatusLabel).toBeVisible({ timeout: 5_000 });

			// Assert Latency row is present (may show a value or "—" depending
			// on timing, but the label should always render).
			const latencyLabel = page.getByText("Latency");
			await expect(latencyLabel).toBeVisible({ timeout: 5_000 });
		} finally {
			await launched?.cleanup();
		}
	});
});
