/**
 * Electron main process entry point.
 *
 * Creates a BrowserWindow and manages the application lifecycle.
 * Wires up the connection store, connection manager, and connection menu
 * so the user can switch between local and remote Kanban servers.
 */

import { app, BrowserWindow } from "electron";
import path from "node:path";
import { RuntimeChildManager } from "./runtime-child.js";
import { ConnectionStore } from "./connection-store.js";
import { ConnectionManager } from "./connection-manager.js";
import { installConnectionMenu } from "./connection-menu.js";

/** The single application window. Null until created. */
let mainWindow: BrowserWindow | null = null;

/** Connection manager — created after the window is ready. */
let connectionManager: ConnectionManager | null = null;

/** Connection store — shared between manager and menu rebuilder. */
let connectionStore: ConnectionStore | null = null;

function createMainWindow(): BrowserWindow {
	const window = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		title: "Kanban",
		backgroundColor: "#1F2428",
		webPreferences: {
			preload: path.join(import.meta.dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	return window;
}

/**
 * Rebuild the Connection menu (called after any connection change).
 */
function rebuildMenu(): void {
	if (!mainWindow || !connectionManager || !connectionStore) return;
	installConnectionMenu({
		store: connectionStore,
		manager: connectionManager,
		window: mainWindow,
	});
}

app.whenReady().then(async () => {
	mainWindow = createMainWindow();

	// -- Connection infrastructure -------------------------------------------
	const store = new ConnectionStore(app.getPath("userData"));
	connectionStore = store;

	const childManager = new RuntimeChildManager({
		childScriptPath: path.join(
			import.meta.dirname,
			"..",
			"node_modules",
			"kanban",
			"dist",
			"runtime-child.js",
		),
	});

	connectionManager = new ConnectionManager({
		window: mainWindow,
		childManager,
		store,
		onConnectionChanged: rebuildMenu,
	});

	// Build initial menu.
	installConnectionMenu({
		store,
		manager: connectionManager,
		window: mainWindow,
	});

	// Initialize the active connection (starts local or loads remote).
	await connectionManager.initialize();

	// macOS: re-create window when dock icon is clicked and no windows exist.
	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			mainWindow = createMainWindow();

			connectionManager = new ConnectionManager({
				window: mainWindow,
				childManager,
				store,
				onConnectionChanged: rebuildMenu,
			});

			installConnectionMenu({
				store,
				manager: connectionManager,
				window: mainWindow,
			});

			await connectionManager.initialize();
		}
	});
});

// Quit when all windows are closed (except on macOS where apps stay in the
// dock until the user explicitly quits with Cmd+Q).
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", () => {
	if (connectionManager) {
		void connectionManager.shutdown();
	}
});

export { mainWindow, connectionManager };
