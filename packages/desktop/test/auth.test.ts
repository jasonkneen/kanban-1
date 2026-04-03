import { describe, expect, it, vi } from "vitest";
import {
	AUTH_HEADER_NAME,
	buildOriginFilter,
	generateAuthToken,
	installAuthHeaderInterceptor,
	type BeforeSendHeadersCallback,
	type BeforeSendHeadersDetails,
	type ElectronSessionLike,
} from "../src/auth.js";

// ---------------------------------------------------------------------------
// Helper: create a mock ElectronSessionLike
// ---------------------------------------------------------------------------

function createMockSession() {
	const onBeforeSendHeaders = vi.fn();
	const session: ElectronSessionLike = {
		webRequest: { onBeforeSendHeaders },
	};
	return { session, onBeforeSendHeaders };
}

/**
 * Convenience: install the interceptor on a mock session and return a function
 * that simulates an outgoing request, returning the headers the interceptor
 * produces.
 */
function installAndGetListener(token: string, origin: string) {
	const { session, onBeforeSendHeaders } = createMockSession();
	installAuthHeaderInterceptor(session, token, origin);

	// The listener is the second argument of the first call
	const listener = onBeforeSendHeaders.mock.calls[0][1] as (
		details: BeforeSendHeadersDetails,
		callback: BeforeSendHeadersCallback,
	) => void;

	const filter = onBeforeSendHeaders.mock.calls[0][0] as { urls: string[] };

	return { listener, filter, session, onBeforeSendHeaders };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth Token Generation", () => {
	it("generates a 64-character hex string", () => {
		const token = generateAuthToken();
		expect(token).toHaveLength(64);
		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});

	it("generates unique tokens on each call", () => {
		const token1 = generateAuthToken();
		const token2 = generateAuthToken();
		expect(token1).not.toBe(token2);
	});
});

describe("buildOriginFilter", () => {
	it("appends /* to a plain origin", () => {
		expect(buildOriginFilter("http://localhost:3484")).toBe(
			"http://localhost:3484/*",
		);
	});

	it("strips trailing slashes before appending /*", () => {
		expect(buildOriginFilter("http://localhost:3484/")).toBe(
			"http://localhost:3484/*",
		);
		expect(buildOriginFilter("http://localhost:3484///")).toBe(
			"http://localhost:3484/*",
		);
	});
});

describe("installAuthHeaderInterceptor", () => {
	const TOKEN = "a".repeat(64);
	const ORIGIN = "http://localhost:52341";

	it("registers a listener via session.webRequest.onBeforeSendHeaders", () => {
		const { onBeforeSendHeaders } = installAndGetListener(TOKEN, ORIGIN);
		expect(onBeforeSendHeaders).toHaveBeenCalledOnce();
	});

	it("passes the correct URL filter pattern", () => {
		const { filter } = installAndGetListener(TOKEN, ORIGIN);
		expect(filter).toEqual({ urls: ["http://localhost:52341/*"] });
	});

	it("injects the Authorization: Bearer header into matching requests", () => {
		const { listener } = installAndGetListener(TOKEN, ORIGIN);

		const details: BeforeSendHeadersDetails = {
			url: "http://localhost:52341/api/boards",
			requestHeaders: { Accept: "application/json" },
		};

		let result: { requestHeaders: Record<string, string> } | undefined;
		listener(details, (response) => {
			result = response;
		});

		expect(result).toBeDefined();
		expect(result!.requestHeaders[AUTH_HEADER_NAME]).toBe(`Bearer ${TOKEN}`);
		// Preserves existing headers
		expect(result!.requestHeaders["Accept"]).toBe("application/json");
	});

	it("does not mutate the original details.requestHeaders", () => {
		const { listener } = installAndGetListener(TOKEN, ORIGIN);

		const originalHeaders: Record<string, string> = {
			Accept: "text/html",
		};
		const details: BeforeSendHeadersDetails = {
			url: "http://localhost:52341/index.html",
			requestHeaders: originalHeaders,
		};

		listener(details, () => {});
		expect(originalHeaders).not.toHaveProperty(AUTH_HEADER_NAME);
	});

	it("overwrites an existing Authorization header", () => {
		const { listener } = installAndGetListener(TOKEN, ORIGIN);

		const details: BeforeSendHeadersDetails = {
			url: "http://localhost:52341/api/boards",
			requestHeaders: { [AUTH_HEADER_NAME]: "Bearer old-token" },
		};

		let result: { requestHeaders: Record<string, string> } | undefined;
		listener(details, (response) => {
			result = response;
		});

		expect(result!.requestHeaders[AUTH_HEADER_NAME]).toBe(`Bearer ${TOKEN}`);
	});

	it("works with different token and origin values", () => {
		const customToken = "b".repeat(64);
		const customOrigin = "http://127.0.0.1:9999";
		const { listener, filter } = installAndGetListener(
			customToken,
			customOrigin,
		);

		expect(filter).toEqual({ urls: ["http://127.0.0.1:9999/*"] });

		const details: BeforeSendHeadersDetails = {
			url: "http://127.0.0.1:9999/ws",
			requestHeaders: {},
		};

		let result: { requestHeaders: Record<string, string> } | undefined;
		listener(details, (response) => {
			result = response;
		});

		expect(result!.requestHeaders[AUTH_HEADER_NAME]).toBe(
			`Bearer ${customToken}`,
		);
	});
});
