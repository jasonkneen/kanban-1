import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mock Electron's safeStorage — tests run outside Electron so we provide a
// simple encrypt/decrypt pair that mirrors the real API surface.
// vi.hoisted ensures the mock object is defined before vi.mock (which is
// hoisted to the top of the file by vitest).
// ---------------------------------------------------------------------------

const safeStorageMock = vi.hoisted(() => ({
	isEncryptionAvailable: vi.fn(() => true),
	encryptString: vi.fn((plaintext: string) => Buffer.from(`encrypted:${plaintext}`)),
	decryptString: vi.fn((buffer: Buffer) => {
		const str = buffer.toString();
		if (!str.startsWith("encrypted:")) {
			throw new Error("Unable to decrypt string");
		}
		return str.slice("encrypted:".length);
	}),
}));

vi.mock("electron", () => ({
	safeStorage: safeStorageMock,
}));

import { ConnectionStore } from "../src/connection-store.js";

describe("ConnectionStore", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-store-test-"));
		// Reset call counts from previous tests.
		vi.clearAllMocks();
		// Default: encryption is available.
		safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
		safeStorageMock.encryptString.mockImplementation(
			(plaintext: string) => Buffer.from(`encrypted:${plaintext}`),
		);
		safeStorageMock.decryptString.mockImplementation((buffer: Buffer) => {
			const str = buffer.toString();
			if (!str.startsWith("encrypted:")) {
				throw new Error("Unable to decrypt string");
			}
			return str.slice("encrypted:".length);
		});
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("initializes with a local connection as default", () => {
		const store = new ConnectionStore(tmpDir);
		const connections = store.getConnections();
		expect(connections).toHaveLength(1);
		expect(connections[0]!.id).toBe("local");
		expect(connections[0]!.label).toBe("Local");
		expect(store.getActiveConnectionId()).toBe("local");
	});

	it("persists and reloads connections", () => {
		const store1 = new ConnectionStore(tmpDir);
		store1.addConnection({
			label: "Remote 1",
			serverUrl: "https://example.com",
			authToken: "tok123",
		});

		const store2 = new ConnectionStore(tmpDir);
		const connections = store2.getConnections();
		expect(connections).toHaveLength(2);
		expect(connections[1]!.label).toBe("Remote 1");
		expect(connections[1]!.serverUrl).toBe("https://example.com");
		expect(connections[1]!.authToken).toBe("tok123");
	});

	it("always keeps local as the first connection", () => {
		const store = new ConnectionStore(tmpDir);
		store.addConnection({ label: "A", serverUrl: "https://a.com" });
		store.addConnection({ label: "B", serverUrl: "https://b.com" });
		const connections = store.getConnections();
		expect(connections[0]!.id).toBe("local");
		expect(connections).toHaveLength(3);
	});

	it("cannot remove the local connection", () => {
		const store = new ConnectionStore(tmpDir);
		store.removeConnection("local");
		expect(store.getConnections()).toHaveLength(1);
		expect(store.getConnections()[0]!.id).toBe("local");
	});

	it("removes a remote connection", () => {
		const store = new ConnectionStore(tmpDir);
		const conn = store.addConnection({
			label: "Remote",
			serverUrl: "https://remote.com",
		});
		expect(store.getConnections()).toHaveLength(2);

		store.removeConnection(conn.id);
		expect(store.getConnections()).toHaveLength(1);
	});

	it("resets active connection to local when active is removed", () => {
		const store = new ConnectionStore(tmpDir);
		const conn = store.addConnection({
			label: "Remote",
			serverUrl: "https://remote.com",
		});
		store.setActiveConnection(conn.id);
		expect(store.getActiveConnectionId()).toBe(conn.id);

		store.removeConnection(conn.id);
		expect(store.getActiveConnectionId()).toBe("local");
	});

	it("updates a remote connection", () => {
		const store = new ConnectionStore(tmpDir);
		const conn = store.addConnection({
			label: "Old",
			serverUrl: "https://old.com",
		});

		store.updateConnection(conn.id, {
			label: "New",
			serverUrl: "https://new.com",
			authToken: "newtoken",
		});

		const updated = store.getConnections().find((c) => c.id === conn.id);
		expect(updated!.label).toBe("New");
		expect(updated!.serverUrl).toBe("https://new.com");
		expect(updated!.authToken).toBe("newtoken");
	});

	it("cannot update the local connection", () => {
		const store = new ConnectionStore(tmpDir);
		store.updateConnection("local", { label: "Hacked" });
		expect(store.getConnections()[0]!.label).toBe("Local");
	});

	it("setActiveConnection ignores unknown IDs", () => {
		const store = new ConnectionStore(tmpDir);
		store.setActiveConnection("nonexistent");
		expect(store.getActiveConnectionId()).toBe("local");
	});

	it("getActiveConnection falls back to local for stale IDs", () => {
		const store = new ConnectionStore(tmpDir);
		// Manually write a bad file.
		const filePath = path.join(tmpDir, "connections.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				connections: [{ id: "local", label: "Local", serverUrl: "" }],
				activeConnectionId: "deleted-id",
			}),
		);

		const store2 = new ConnectionStore(tmpDir);
		expect(store2.getActiveConnection().id).toBe("local");
	});

	it("handles corrupt JSON gracefully", () => {
		const filePath = path.join(tmpDir, "connections.json");
		fs.writeFileSync(filePath, "NOT VALID JSON");

		const store = new ConnectionStore(tmpDir);
		expect(store.getConnections()).toHaveLength(1);
		expect(store.getConnections()[0]!.id).toBe("local");
	});

	// -- WSL connection --------------------------------------------------

	it("enableWslConnection inserts WSL after local", () => {
		const store = new ConnectionStore(tmpDir);
		store.enableWslConnection();
		const conns = store.getConnections();
		expect(conns).toHaveLength(2);
		expect(conns[0]!.id).toBe("local");
		expect(conns[1]!.id).toBe("wsl");
		expect(conns[1]!.label).toBe("WSL");
	});

	it("enableWslConnection is idempotent", () => {
		const store = new ConnectionStore(tmpDir);
		store.enableWslConnection();
		store.enableWslConnection();
		expect(store.getConnections()).toHaveLength(2);
	});

	it("hasWslConnection returns false when not enabled", () => {
		const store = new ConnectionStore(tmpDir);
		expect(store.hasWslConnection()).toBe(false);
	});

	it("hasWslConnection returns true after enabling", () => {
		const store = new ConnectionStore(tmpDir);
		store.enableWslConnection();
		expect(store.hasWslConnection()).toBe(true);
	});

	it("WSL connection persists across reloads", () => {
		const store1 = new ConnectionStore(tmpDir);
		store1.enableWslConnection();
		const store2 = new ConnectionStore(tmpDir);
		expect(store2.hasWslConnection()).toBe(true);
		expect(store2.getConnections()[1]!.id).toBe("wsl");
	});

	it("cannot update the WSL connection", () => {
		const store = new ConnectionStore(tmpDir);
		store.enableWslConnection();
		store.updateConnection("wsl", { label: "Hacked" });
		expect(store.getConnections().find((c) => c.id === "wsl")!.label).toBe("WSL");
	});

	it("WSL connection appears before remote connections", () => {
		const store = new ConnectionStore(tmpDir);
		store.addConnection({ label: "Remote", serverUrl: "https://r.com" });
		store.enableWslConnection();
		const conns = store.getConnections();
		expect(conns[0]!.id).toBe("local");
		expect(conns[1]!.id).toBe("wsl");
		expect(conns[2]!.label).toBe("Remote");
	});

	// -- safeStorage encryption ------------------------------------------

	it("isEncryptionAvailable returns true when safeStorage is available", () => {
		safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
		const store = new ConnectionStore(tmpDir);
		expect(store.isEncryptionAvailable).toBe(true);
	});

	it("isEncryptionAvailable returns false when safeStorage is unavailable", () => {
		safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
		const store = new ConnectionStore(tmpDir);
		expect(store.isEncryptionAvailable).toBe(false);
	});

	it("encrypts auth tokens on disk when safeStorage is available", () => {
		const store = new ConnectionStore(tmpDir);
		store.addConnection({
			label: "Encrypted",
			serverUrl: "https://enc.com",
			authToken: "secret-token",
		});

		// Read the raw JSON from disk — the token should be encrypted.
		const raw = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "connections.json"), "utf-8"),
		);
		const remoteConn = raw.connections.find(
			(c: { id: string }) => c.id !== "local",
		);
		expect(remoteConn.isEncrypted).toBe(true);
		// The on-disk token is base64 of "encrypted:secret-token".
		expect(remoteConn.authToken).toBe(
			Buffer.from("encrypted:secret-token").toString("base64"),
		);
		// The in-memory value should still be plaintext.
		const conns = store.getConnections();
		expect(conns.find((c) => c.id !== "local")!.authToken).toBe("secret-token");
	});

	it("decrypts auth tokens when loading from disk", () => {
		// Persist a connection with an encrypted token.
		const store1 = new ConnectionStore(tmpDir);
		store1.addConnection({
			label: "Remote",
			serverUrl: "https://remote.com",
			authToken: "my-secret",
		});

		// Load in a new store instance — token should be decrypted.
		const store2 = new ConnectionStore(tmpDir);
		const conn = store2.getConnections().find((c) => c.id !== "local");
		expect(conn!.authToken).toBe("my-secret");
		expect(safeStorageMock.decryptString).toHaveBeenCalled();
	});

	it("stores auth tokens as plaintext when safeStorage is unavailable", () => {
		safeStorageMock.isEncryptionAvailable.mockReturnValue(false);

		const store = new ConnectionStore(tmpDir);
		store.addConnection({
			label: "Plaintext",
			serverUrl: "https://plain.com",
			authToken: "plain-token",
		});

		// Read the raw JSON from disk — the token should be unencrypted.
		const raw = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "connections.json"), "utf-8"),
		);
		const remoteConn = raw.connections.find(
			(c: { id: string }) => c.id !== "local",
		);
		expect(remoteConn.isEncrypted).toBeUndefined();
		expect(remoteConn.authToken).toBe("plain-token");
		expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
	});

	it("reads plaintext tokens from disk without attempting decryption", () => {
		// Write a file with a plaintext (non-encrypted) token.
		const filePath = path.join(tmpDir, "connections.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				connections: [
					{ id: "local", label: "Local", serverUrl: "" },
					{
						id: "remote-1",
						label: "Legacy",
						serverUrl: "https://legacy.com",
						authToken: "legacy-plain",
					},
				],
				activeConnectionId: "local",
			}),
		);

		const store = new ConnectionStore(tmpDir);
		const conn = store.getConnections().find((c) => c.id === "remote-1");
		expect(conn!.authToken).toBe("legacy-plain");
		// decryptString should NOT have been called — no isEncrypted flag.
		expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
	});

	it("clears auth token when decryption fails", () => {
		// Write a file with isEncrypted: true but a garbled ciphertext.
		const filePath = path.join(tmpDir, "connections.json");
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				connections: [
					{ id: "local", label: "Local", serverUrl: "" },
					{
						id: "remote-1",
						label: "Broken",
						serverUrl: "https://broken.com",
						authToken: Buffer.from("garbled-data").toString("base64"),
						isEncrypted: true,
					},
				],
				activeConnectionId: "local",
			}),
		);

		const store = new ConnectionStore(tmpDir);
		const conn = store.getConnections().find((c) => c.id === "remote-1");
		// Decryption of "garbled-data" will fail (no "encrypted:" prefix) so
		// the token should be cleared.
		expect(conn!.authToken).toBeUndefined();
	});

	it("connections without auth tokens are unaffected by encryption", () => {
		const store = new ConnectionStore(tmpDir);
		store.addConnection({
			label: "No Token",
			serverUrl: "https://notok.com",
		});

		const raw = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "connections.json"), "utf-8"),
		);
		const remoteConn = raw.connections.find(
			(c: { id: string }) => c.id !== "local",
		);
		expect(remoteConn.isEncrypted).toBeUndefined();
		expect(remoteConn.authToken).toBeUndefined();
		// encryptString should not have been called for a token-less connection.
		expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
	});
});
