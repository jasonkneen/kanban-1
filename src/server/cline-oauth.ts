// This file is intentionally minimal — the Cline OAuth flow is handled
// directly in login-handler.ts via the /auth/start and /auth/callback endpoints.
//
// Pending token store for the /auth/finalize endpoint.
// After the SDK temp server handles the callback (in the old flow), credentials
// are stored here and consumed by /auth/finalize.
// Kept for backward compatibility — the new flow uses /auth/callback directly.

import { randomBytes } from "node:crypto";

interface PendingToken {
	email: string;
	userId: string | null;
	displayName: string | null;
	expiresAt: number;
}

const pendingTokens = new Map<string, PendingToken>();

export function consumePendingToken(token: string): Omit<PendingToken, "expiresAt"> | null {
	const entry = pendingTokens.get(token);
	if (!entry) return null;
	pendingTokens.delete(token);
	if (entry.expiresAt < Date.now()) return null;
	return { email: entry.email, userId: entry.userId, displayName: entry.displayName };
}

export function getCurrentPendingToken(): string | null {
	return null;
}

export function patchSdkSuccessHtml(_kanbanOrigin: string): void {
	// No-op — patching now happens in scripts/patch-sdk-oauth.js at build time.
}

// Unused — kept for type compatibility with login-handler.ts imports.
export async function startClineOAuth(_remoteAuth: unknown, _kanbanOrigin: string): Promise<string> {
	throw new Error("startClineOAuth: use /auth/start endpoint directly.");
}

export function storePendingToken(data: Omit<PendingToken, "expiresAt">): string {
	const token = randomBytes(24).toString("base64url");
	for (const [k, v] of pendingTokens.entries()) {
		if (v.expiresAt < Date.now()) pendingTokens.delete(k);
	}
	pendingTokens.set(token, { ...data, expiresAt: Date.now() + 60_000 });
	return token;
}
