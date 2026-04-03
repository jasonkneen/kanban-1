import { describe, expect, it } from "vitest";
import { isInsecureRemoteUrl } from "../src/connection-utils.js";

describe("ConnectionManager", () => {
	describe("isInsecureRemoteUrl", () => {
		it("returns true for http:// with non-localhost host", () => {
			expect(isInsecureRemoteUrl("http://example.com")).toBe(true);
			expect(isInsecureRemoteUrl("http://192.168.1.1:3000")).toBe(true);
			expect(isInsecureRemoteUrl("http://kanban.myserver.io/path")).toBe(true);
		});

		it("returns false for http://localhost", () => {
			expect(isInsecureRemoteUrl("http://localhost")).toBe(false);
			expect(isInsecureRemoteUrl("http://localhost:3000")).toBe(false);
		});

		it("returns false for http://127.0.0.1", () => {
			expect(isInsecureRemoteUrl("http://127.0.0.1")).toBe(false);
			expect(isInsecureRemoteUrl("http://127.0.0.1:8080")).toBe(false);
		});

		it("returns false for http://[::1]", () => {
			expect(isInsecureRemoteUrl("http://[::1]")).toBe(false);
			expect(isInsecureRemoteUrl("http://[::1]:9000")).toBe(false);
		});

		it("returns false for https:// URLs", () => {
			expect(isInsecureRemoteUrl("https://example.com")).toBe(false);
			expect(isInsecureRemoteUrl("https://kanban.myserver.io")).toBe(false);
		});

		it("returns false for invalid URLs", () => {
			expect(isInsecureRemoteUrl("not-a-url")).toBe(false);
			expect(isInsecureRemoteUrl("")).toBe(false);
		});
	});
});
