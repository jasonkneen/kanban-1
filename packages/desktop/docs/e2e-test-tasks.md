# Desktop App E2E Test Tasks

This document turns the desktop-app branch verification work into concrete, implementable **red-green TDD task cards**.

The goal is to prove the claims in `docs/desktop-app-branch-summary.md` with automated coverage wherever practical, and to clearly separate:

- tests that can be added immediately with the current harness,
- tests that require a new Electron Playwright harness,
- tests that should stay integration/unit level,
- and tests that likely remain manual or CI smoke checks.

---

## Overall strategy

### First principle
The **first missing foundation** is an Electron Playwright harness in `packages/desktop/`.

Without that harness, we cannot automatically prove packaged desktop claims like:

- the app launches without requiring terminal startup,
- the Electron shell starts and manages the runtime child,
- BrowserWindow-authenticated requests succeed while unauthenticated requests fail,
- connection switching works through the desktop shell,
- diagnostics reflect desktop runtime state.

So the task order is:

1. Add Electron Playwright harness
2. Add Electron E2E tests on top of that harness
3. Fill gaps in CLI/integration/unit coverage that do not need Electron
4. Add CI packaged smoke where feasible

---

## Task 1 — Add Playwright Electron E2E harness + smoke test

**Priority:** P0  
**Type:** New harness  
**Blocks:** Tasks 2, 3, 4, 5, 9, 11

### Goal
Add a Playwright-based Electron E2E harness under `packages/desktop/` so tests can launch the real desktop app and interact with its BrowserWindow.

### Why this exists
`web-ui/playwright.config.ts` only launches the Vite dev server and browser UI. It does **not** exercise Electron, packaged runtime startup, BrowserWindow auth injection, app lifecycle, or connection-manager behavior.

### RED phase — add failing tests first

Create `packages/desktop/e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { launchDesktopApp } from "./fixtures";

test("desktop app launches and shows Kanban UI", async () => {
	const { page, cleanup } = await launchDesktopApp();
	try {
		await expect(page).toHaveTitle(/Kanban/, { timeout: 30_000 });
		await expect(page.getByText("Backlog", { exact: true })).toBeVisible();
	} finally {
		await cleanup();
	}
});

test("runtime becomes reachable after desktop app launch", async () => {
	const { runtimeUrl, page, cleanup } = await launchDesktopApp();
	try {
		const response = await page.request.get(`${runtimeUrl}/api/trpc/runtime.getVersion`);
		expect(response.ok()).toBe(true);
	} finally {
		await cleanup();
	}
});
```

These should fail initially because the fixture and config do not exist.

### GREEN phase — implementation

Add:

- `@playwright/test` to `packages/desktop/devDependencies`
- `packages/desktop/playwright.config.ts`
- `packages/desktop/e2e/fixtures.ts`
- `packages/desktop/e2e/smoke.spec.ts`
- `"e2e": "playwright test --config playwright.config.ts"` to `packages/desktop/package.json`

### Suggested implementation details

#### `packages/desktop/playwright.config.ts`

- `testDir: "./e2e"`
- `timeout: 60_000`
- `use: { headless: true }`
- no `webServer` block; Electron launches the real app

#### `packages/desktop/e2e/fixtures.ts`

Export `launchDesktopApp()` that:

1. Ensures `dist/main.js` exists, otherwise runs `npm run build:ts`
2. Launches Electron with Playwright:

```ts
import { _electron as electron } from "@playwright/test";
```

3. Calls:

```ts
const electronApp = await electron.launch({
	args: ["dist/main.js"],
	env: {
		...process.env,
		NODE_ENV: "development",
	},
});
```

4. Gets the first window:

```ts
const page = await electronApp.firstWindow();
```

5. Waits for the app URL to become reachable and captures `runtimeUrl`
6. Returns:

```ts
{
	electronApp,
	page,
	runtimeUrl,
	cleanup: async () => {
		await electronApp.close();
	},
}
```

### Files to read first

- `packages/desktop/package.json`
- `packages/desktop/src/main.ts`
- `packages/desktop/src/runtime-child-manager.ts`
- `packages/desktop/src/preload.ts`

### Verification

```bash
cd packages/desktop
npm run e2e
```

### Scope

- ONLY modify files in `packages/desktop/`
- DO NOT modify runtime or web-ui production code
- DO NOT commit unless explicitly asked

---

## Task 2 — Desktop boot lifecycle E2E

**Priority:** P1  
**Type:** Electron E2E  
**Depends on:** Task 1

### Goal
Prove the Electron desktop app starts and stops its managed runtime child correctly.

### RED phase — add failing tests

Create `packages/desktop/e2e/boot-lifecycle.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { launchDesktopApp } from "./fixtures";

test("desktop app starts runtime child automatically", async () => {
	const { page, cleanup } = await launchDesktopApp();
	try {
		await expect(page.getByText("Backlog", { exact: true })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText("Disconnected from Cline")).not.toBeVisible();
	} finally {
		await cleanup();
	}
});

test("closing the desktop app makes the runtime unreachable", async () => {
	const { runtimeUrl, cleanup } = await launchDesktopApp();
	await cleanup();

	await expect
		.poll(async () => {
			try {
				const response = await fetch(runtimeUrl);
				return response.ok();
			} catch {
				return false;
			}
		})
		.toBe(false);
});
```

### GREEN phase

No new product code should be required if runtime-child lifecycle is wired correctly. The fixture may need better readiness/wait helpers.

### Code pointers

- `packages/desktop/src/main.ts`
- `packages/desktop/src/runtime-child.ts`
- `packages/desktop/src/runtime-child-manager.ts`

### Coverage claim proved

- “Electron desktop app starts and manages its own Kanban runtime child process”

---

## Task 3 — Desktop auth enforcement E2E

**Priority:** P1  
**Type:** Electron E2E  
**Depends on:** Task 1

### Goal
Prove desktop-authenticated requests succeed while unauthenticated requests are rejected.

### RED phase — add failing tests

Create `packages/desktop/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { launchDesktopApp } from "./fixtures";

test("authenticated request through the desktop app succeeds", async () => {
	const { page, runtimeUrl, cleanup } = await launchDesktopApp();
	try {
		const response = await page.request.get(`${runtimeUrl}/api/trpc/runtime.getVersion`);
		expect(response.ok()).toBe(true);
	} finally {
		await cleanup();
	}
});

test("direct unauthenticated request to runtime is rejected", async () => {
	const { runtimeUrl, cleanup } = await launchDesktopApp();
	try {
		const response = await fetch(`${runtimeUrl}/api/trpc/runtime.getVersion`);
		expect([401, 403]).toContain(response.status);
	} finally {
		await cleanup();
	}
});
```

### GREEN phase

May only require fixture stabilization.

### Code pointers

- `packages/desktop/src/connection-manager.ts` — `installAuthInterceptor()`
- `packages/desktop/src/auth.ts`
- `src/server/auth-middleware.ts`
- `src/server/runtime-server.ts`

### Coverage claim proved

- “Desktop auth token model and runtime auth middleware are active”

---

## Task 4 — Connection management E2E

**Priority:** P1  
**Type:** Electron E2E  
**Depends on:** Task 1

### Goal
Prove local/remote connection switching, persistence, and fallback behavior.

### RED phase — add failing tests

Create `packages/desktop/e2e/connection-management.spec.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktopApp } from "./fixtures";

test("default startup uses local connection", async () => {
	const { page, cleanup } = await launchDesktopApp();
	try {
		expect(page.url()).toMatch(/127\.0\.0\.1|localhost/);
	} finally {
		await cleanup();
	}
});

test("connections.json persists active connection metadata", async () => {
	const { electronApp, cleanup } = await launchDesktopApp();
	try {
		const userDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
		const connectionsPath = path.join(userDataPath, "connections.json");
		const raw = fs.readFileSync(connectionsPath, "utf-8");
		const data = JSON.parse(raw) as {
			connections: Array<{ id: string }>;
			activeConnectionId: string;
		};

		const localIds = data.connections.map((connection) => connection.id);
		expect(localIds).toContain("local");
		expect(data.activeConnectionId).toBeTruthy();
	} finally {
		await cleanup();
	}
});
```

### GREEN phase

Likely no app changes for the initial local-connection tests. Remote-switch tests may need menu-driving helpers in the Electron harness later.

### Code pointers

- `packages/desktop/src/connection-store.ts`
- `packages/desktop/src/connection-manager.ts`
- `packages/desktop/src/connection-menu.ts`
- `packages/desktop/src/main.ts`
- `packages/desktop/test/main-connection-integration.test.ts`

### Follow-up expansions after first green

- Add remote connection via menu dialog
- Switch Local → Remote
- Persist remote connection and restore on relaunch
- Invalid saved connection falls back to Local
- Insecure HTTP warning is shown for non-localhost remote URLs

### Coverage claim proved

- “ConnectionStore + ConnectionManager + persisted active connection are wired into desktop app”

---

## Task 5 — Diagnostics dialog E2E

**Priority:** P1  
**Type:** Electron E2E  
**Depends on:** Task 1

### Goal
Prove diagnostics reflect actual connection/runtime state inside the desktop app.

### RED phase — add failing tests

Create `packages/desktop/e2e/diagnostics.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { launchDesktopApp } from "./fixtures";

test("diagnostics dialog shows local connected state", async () => {
	const { page, electronApp, cleanup } = await launchDesktopApp();
	try {
		await electronApp.evaluate(({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows()[0];
			win?.webContents.send("open-diagnostics");
		});

		await expect(page.getByText("Diagnostics", { exact: true })).toBeVisible();
		await expect(page.getByText("Connection type")).toBeVisible();
		await expect(page.getByText("Local")).toBeVisible();
		await expect(page.getByText("Connected")).toBeVisible();
	} finally {
		await cleanup();
	}
});
```

### GREEN phase

May require using the actual desktop diagnostics hook instead of directly sending a guessed event name, depending on current preload wiring.

### Code pointers

- `packages/desktop/src/preload.ts`
- `packages/desktop/src/main.ts`
- `web-ui/src/App.tsx`
- `web-ui/src/hooks/use-diagnostics.ts`
- `web-ui/src/components/diagnostics-dialog.tsx`

### Coverage claim proved

- “Desktop diagnostics reflect Local/Remote state, runtime version, websocket state, auth state”

---

## Task 6 — CLI bridge integration test expansion

**Priority:** P1  
**Type:** Integration test  
**Depends on:** Nothing

### Goal
Prove runtime descriptor publishing/cleanup and desktop CLI fallback behavior without needing Electron E2E.

### Why this is not Electron-only
Most of the bridge logic lives in shared runtime code and can be tested more cheaply in integration tests.

### Existing coverage to inspect first

- `test/integration/desktop-agent-task-create.integration.test.ts`

### RED phase — add failing tests

Create or extend `test/integration/runtime-descriptor-bridge.integration.test.ts`:

```ts
describe("runtime descriptor bridge", () => {
	it("writes runtime descriptor on startup with url, auth token, and pid", async () => {
		// start runtime, inspect descriptor file
	});

	it("removes runtime descriptor on shutdown", async () => {
		// start runtime, shutdown, ensure descriptor missing
	});

	it("resolveRuntimeConnection uses descriptor when env vars are absent", async () => {
		// write descriptor manually, verify resolved origin/auth token
	});

	it("stale descriptor with dead pid is ignored", async () => {
		// descriptor pid should fail liveness check
	});
});
```

### GREEN phase

Use current implementation in:

- `src/core/runtime-descriptor.ts`
- `src/core/runtime-endpoint.ts`

### Coverage claim proved

- “Desktop↔CLI runtime bridging via descriptor fallback works and fails safely”

---

## Task 7 — CLI shim invocation regression tests

**Priority:** P1  
**Type:** Unit/integration  
**Depends on:** Nothing

### Goal
Prove the packaged CLI shim is executable in practice, not just present on disk.

### Existing coverage to inspect first

- `packages/desktop/test/cli-shim.test.ts`

### RED phase — add failing tests

Add tests like:

```ts
it("packaged shim script has executable permissions", () => {
	// verify mode & existence
});

it("packaged shim points at expected bundled entrypoint", () => {
	// inspect script contents
});

it("dev shim points at expected dev entrypoint", () => {
	// inspect script contents
});
```

### Better follow-up RED case

If practical in CI/dev:

```ts
it("packaged shim can be invoked with --version in simulated packaged layout", async () => {
	// build minimal simulated Resources/bin layout, invoke shim, assert success
});
```

### Code pointers

- `packages/desktop/build/bin/kanban`
- `packages/desktop/build/bin/kanban-dev`
- `packages/desktop/build/bin/kanban.cmd`
- `packages/desktop/test/cli-shim.test.ts`

### Coverage claim proved

- “Desktop-managed agent workflows do not depend on a global Kanban install”

---

## Task 8 — Connection manager/store unit gap fill

**Priority:** P1  
**Type:** Unit  
**Depends on:** Nothing

### Goal
Fill edge-case gaps around restore/fallback/encryption behavior.

### Existing files to inspect first

- `packages/desktop/test/connection-manager.test.ts`
- `packages/desktop/test/connection-store.test.ts`
- `packages/desktop/test/main-connection-integration.test.ts`

### RED phase — add failing tests

#### In `connection-manager.test.ts`

```ts
it("initialize restores persisted remote connection when it exists", async () => {
	// configure store.getActiveConnection() => remote connection
	// expect loadURL(remoteUrl) and child not started
});

it("initialize falls back to local when persisted connection is invalid", async () => {
	// configure invalid active ID / missing connection
	// expect local startup path
});

it("shutdown stops child and WSL launcher when both are active", async () => {
	// start/flag both, call shutdown, assert cleanup
});
```

#### In `connection-store.test.ts`

```ts
it("returns default data when connections.json is corrupted", () => {
	// write invalid JSON, create store, expect only local connection
});

it("returns default data when connections.json is missing", () => {
	// no file, create store, expect defaults
});
```

### Code pointers

- `packages/desktop/src/connection-manager.ts`
- `packages/desktop/src/connection-store.ts`

### Coverage claim proved

- “Persist/restore active connection and fallback behavior are safe”

---

## Task 9 — Reconnection banner E2E

**Priority:** P2  
**Type:** Electron E2E  
**Depends on:** Task 1

### Goal
Prove disconnect UI differs correctly between local and remote mode.

### Why this is harder
Current UI behavior depends on runtime stream state and `isLocal`. There is no obvious stable test-only hook yet for forcing reconnect/disconnect state in Playwright.

### RED phase — add failing tests

Start with local-mode only:

```ts
test("local runtime disconnect shows full-page disconnected fallback", async () => {
	// launch app
	// kill runtime child
	// assert RuntimeDisconnectedFallback is shown
});
```

Then later add remote-mode scenarios once the harness can drive remote connections.

### Remote-mode target scenarios

- Remote disconnect shows top reconnection banner, not full-page fallback
- Successful reconnect shows `Reconnected`
- Repeated reconnect failures show `Connection failed` + Retry button

### Code pointers

- `web-ui/src/App.tsx`
- `web-ui/src/components/reconnection-banner.tsx`
- `web-ui/src/hooks/runtime-disconnected-fallback.tsx`
- `web-ui/src/runtime/use-runtime-state-stream.ts`

### Coverage claim proved

- “Remote reconnection UX is distinct from local runtime-disconnected fallback”

---

## Task 10 — Web UI Playwright additions

**Priority:** P1  
**Type:** Web Playwright  
**Depends on:** Nothing

### Goal
Extend the existing web-ui Playwright suite with stable coverage that does not need Electron.

### Existing harness

- `web-ui/playwright.config.ts`
- `web-ui/tests/smoke.spec.ts`

### RED phase — add failing tests

Create `web-ui/tests/desktop-features.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("settings dialog opens via settings button", async ({ page }) => {
	await page.goto("/");
	await page.getByTestId("open-settings-button").click();
	await expect(page.getByRole("dialog").getByText("Settings", { exact: true })).toBeVisible();
});

test("settings dialog opens via mod+shift+s", async ({ page, browserName }) => {
	await page.goto("/");
	await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+S" : "Control+Shift+S");
	await expect(page.getByRole("dialog").getByText("Settings", { exact: true })).toBeVisible();
});

test("workspace path renders in the top bar", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("workspace-path")).toBeVisible();
});
```

### GREEN phase

Should pass with the current web-ui harness if selectors remain stable.

### Code pointers

- `web-ui/src/components/top-bar.tsx`
- `web-ui/src/hooks/use-app-hotkeys.ts`
- `web-ui/tests/smoke.spec.ts`

### Coverage claim proved

- “Desktop-oriented UI affordances and settings entry points remain functional”

---

## Task 11 — Cross-platform packaged-app smoke CI

**Priority:** P2  
**Type:** CI / automation  
**Depends on:** Task 1

### Goal
Run minimal packaged-app smoke coverage on macOS, Windows, and Linux.

### Why this matters
Many of the desktop-app claims are only truly proven in packaged builds:

- app launches from installed artifact,
- native addon packaging works,
- `asarUnpack` layout is correct,
- child process entrypoint survives packaging,
- platform-specific runtime behavior is sound.

### RED phase

Create a CI workflow that tries to run the Electron E2E smoke on a matrix and initially fails until the harness is robust enough.

### GREEN phase — baseline workflow

Suggested workflow file:

- `.github/workflows/desktop-e2e.yml`

Matrix:

- `macos-latest`
- `windows-latest`
- `ubuntu-latest`

Steps:

1. Checkout
2. Setup Node 22
3. Install repo dependencies
4. Install `packages/desktop` dependencies
5. Build desktop TypeScript output
6. Install Playwright browsers/deps
7. Run `packages/desktop` E2E smoke

### Follow-up expansions

- add actual packaged artifact smoke instead of dist-only smoke
- add Linux AppImage smoke
- add Windows PTY-focused smoke

### Coverage claim proved

- “Cross-platform desktop packaging works beyond local development only”

---

## Recommended implementation waves

### Wave 1 — can run immediately in parallel

These do **not** need the Electron harness:

1. **Task 6** — CLI bridge integration expansion
2. **Task 7** — CLI shim regression tests
3. **Task 8** — Connection manager/store unit gap fill
4. **Task 10** — Web UI Playwright additions

### Wave 2 — foundation

5. **Task 1** — Playwright Electron harness

### Wave 3 — unlocks after Wave 2

6. **Task 2** — Boot lifecycle E2E
7. **Task 3** — Auth E2E
8. **Task 4** — Connection management E2E
9. **Task 5** — Diagnostics E2E
10. **Task 9** — Reconnection banner E2E

### Wave 4 — CI hardening

11. **Task 11** — Cross-platform packaged smoke workflow

---

## Fastest path to meaningful confidence

If time is limited, the highest-value first sequence is:

1. Task 1 — Electron harness
2. Task 2 — desktop boot lifecycle E2E
3. Task 3 — auth E2E
4. Task 6 — CLI bridge integration
5. Task 7 — CLI shim regression test
6. Task 4 — connection management E2E

That sequence proves the biggest branch claims quickly:

- native desktop launch,
- managed runtime lifecycle,
- auth enforcement,
- helper/agent CLI interoperability,
- connection architecture.

---

## Branch claims → recommended proof source

| Claim | Best proof type |
|---|---|
| Native desktop app launches without terminal | Electron E2E |
| Desktop app manages runtime child | Electron E2E |
| Desktop auth token + middleware are active | Electron E2E + integration |
| Desktop↔CLI runtime bridge works | Integration |
| PTY agents can run `kanban task create` | Existing integration + expand if needed |
| CLI shims work in packaged/dev layouts | Unit/integration |
| ConnectionStore/ConnectionManager are wired | Electron E2E + unit |
| Persist / restore active connection works | Electron E2E + unit |
| Diagnostics reflect Local/Remote state | Electron E2E |
| Remote reconnect UX behaves correctly | Electron E2E |
| Cross-platform packaging is viable | CI packaged smoke |

---

## Notes for implementers

- Prefer **small, stable tests** over broad flaky end-to-end flows.
- Avoid changing production code just to make tests easier unless a test seam is clearly justified and low-risk.
- Keep Electron E2E focused on claims that truly require the Electron shell.
- Keep bridge/shim/runtime behavior in integration tests where possible — they are cheaper and more reliable.
- Do not assume the existing web-ui Playwright harness proves desktop behavior. It only proves browser-rendered UI against the dev server.
