# Desktop App E2E Test Harness Implementation Plan

This document reframes the desktop E2E work into an **implementable execution plan** for building and rolling out a real Electron test harness for the new Kanban desktop app.

It intentionally focuses on what we can build next in `packages/desktop/` with the current codebase, where the harness needs explicit seams, and how to phase the work so we get useful confidence quickly without introducing a flaky or over-scoped test system.

Related context:

- `packages/desktop/docs/hardening-implementation-plan.md`
- `/Users/johnchoi1/Documents/desktop-app-runtime-architecture.md`
- `docs/desktop-app-branch-summary.md`

---

## Objective

Build a Playwright-driven Electron E2E harness that can launch the real desktop app, observe the desktop-managed runtime, and verify the highest-risk claims of the new architecture:

1. the Electron shell launches successfully,
2. it starts and manages its own runtime child,
3. BrowserWindow-authenticated requests succeed while unauthenticated requests fail,
4. local connection persistence and restore behavior work,
5. diagnostics and disconnect UX reflect actual desktop runtime state,
6. the harness is stable enough to run in CI and later extend to packaged smoke coverage.

---

## Constraints from the current implementation

These are the practical constraints the harness must respect.

### 1. Desktop startup is real Electron startup

The app entrypoint is `packages/desktop/src/main.ts`, compiled to `dist/main.js`, and `package.json` already uses:

- `"main": "dist/main.js"`
- `"build:ts"` to compile the main process and bundle the preload script

That means the first harness should launch the compiled app entrypoint, not invent a fake bootstrap path.

### 2. Runtime startup currently happens through `ConnectionManager`

The real local boot path is not in a special E2E-only launcher. It happens through:

- `ConnectionStore`
- `ConnectionManager.initialize()`
- `RuntimeChildManager.start()`
- `BrowserWindow.loadURL(...)`

So the harness should assert against those behaviors indirectly through the loaded window and reachable runtime, not by mocking internals.

### 3. Auth is injected at the BrowserWindow session layer

Desktop auth depends on `installAuthHeaderInterceptor(...)` and BrowserWindow requests going through the Electron session. So tests must distinguish between:

- requests issued from the renderer/browser context,
- and raw direct HTTP requests made outside that context.

That is essential for verifying the desktop auth model described in the architecture docs.

### 4. Some current docs assume seams that do not exist yet

Examples:

- there is no existing `launchDesktopApp()` fixture,
- there is no Playwright config in `packages/desktop/`,
- there is no stable test-only hook for forcing reconnect states,
- diagnostics can be opened via the real `open-diagnostics` IPC event from the app menu/preload path, but the harness needs a clean helper for that.

So the first task is not “write many specs.” The first task is to create a **credible harness foundation**.

### 5. We should avoid unnecessary production-only test hooks

Per repo guidance, avoid changing product code purely to accommodate tests unless the seam is clearly justified. The harness should prefer:

- real Electron launch,
- real BrowserWindow interactions,
- real userData persistence,
- real runtime child lifecycle,
- and only add narrow seams when a workflow is otherwise impossible or too flaky.

---

## Recommended rollout strategy

Build the harness in four waves.

### Wave 1 — Harness foundation

Create a minimal but real Electron Playwright harness that can:

- build the desktop app if needed,
- launch Electron against `dist/main.js`,
- isolate `userData` per test run,
- discover the active runtime URL,
- get the first BrowserWindow page,
- and shut down cleanly.

### Wave 2 — High-value local-mode E2E coverage

Once the harness is stable, add the core local-mode E2E cases:

- smoke launch,
- runtime child lifecycle,
- auth enforcement,
- local connection persistence/restore,
- diagnostics dialog.

### Wave 3 — Harder stateful scenarios

Add scenarios that are real but need more control or more robustness:

- disconnect/reconnect behavior,
- invalid persisted connection fallback,
- remote connection flows,
- restart/resume behavior.

### Wave 4 — CI and packaged smoke

After the dist-based harness is reliable locally/CI, expand to:

- matrix CI execution,
- packaged artifact smoke,
- and platform-specific smoke where native packaging assumptions matter.

---

## Deliverable 1 — Add the Electron Playwright harness

**Priority:** P0  
**Outcome:** A reusable, deterministic harness for launching the desktop app in tests.

### Files to add

- `packages/desktop/playwright.config.ts`
- `packages/desktop/e2e/fixtures.ts`
- `packages/desktop/e2e/smoke.spec.ts`

### Files to update

- `packages/desktop/package.json`

### Package changes

Add dev dependencies:

- `@playwright/test`

Add scripts:

- `"e2e": "playwright test --config playwright.config.ts"`
- optionally `"e2e:headed": "playwright test --config playwright.config.ts --headed"`

### Playwright config requirements

`packages/desktop/playwright.config.ts` should:

- set `testDir: "./e2e"`
- use a desktop-appropriate timeout such as `60_000`
- run headless by default
- avoid a `webServer` block, because Electron is launching the real app
- keep retries conservative initially (`0` locally, CI may later override)
- avoid adding browser projects we do not need yet

### Fixture responsibilities

`packages/desktop/e2e/fixtures.ts` should export a small harness API, for example:

```ts
interface LaunchedDesktopApp {
	electronApp: ElectronApplication;
	page: Page;
	runtimeUrl: string;
	userDataDir: string;
	cleanup: () => Promise<void>;
}

export async function launchDesktopApp(): Promise<LaunchedDesktopApp>;
```

The fixture should do the following:

1. Ensure the desktop TypeScript build output exists.
   - If `dist/main.js` or `dist/preload.js` is missing, run `npm run build:ts` in `packages/desktop`.

2. Create an isolated temp directory for Electron `userData`.
   - Tests must not reuse a developer's real desktop app state.
   - The harness should pass a dedicated env var or Chromium/Electron override that the app can honor for `userData` if supported cleanly.
   - If the current app does not yet support deterministic userData override, adding a narrow startup seam for this is justified.

3. Launch Electron through Playwright.

```ts
import { _electron as electron } from "@playwright/test";
```

Launch against the compiled entrypoint:

```ts
const electronApp = await electron.launch({
	args: ["dist/main.js"],
	env: {
		...process.env,
		NODE_ENV: "test",
	},
});
```

4. Wait for the first real BrowserWindow.

```ts
const page = await electronApp.firstWindow();
```

5. Discover the runtime URL in a deterministic way.

Recommended order:

- first, inspect the current page URL after the app loads,
- if needed, read runtime state from Electron main-process globals via `electronApp.evaluate(...)`,
- if neither is stable enough, add a narrow main-process helper for test introspection.

The preferred approach is to avoid broad test APIs and instead derive the URL from observable app behavior.

6. Wait for runtime readiness.

The fixture should not assume `firstWindow()` means the runtime is ready. Add polling that waits until:

- the page is on the expected runtime origin,
- and a request like `/api/trpc/runtime.getVersion` succeeds from the renderer context.

7. Return cleanup that always closes Electron and removes temp state.

### Required helper utilities inside the fixture

The fixture should likely include small internal helpers such as:

- `ensureDesktopBuild()`
- `waitForRuntimeUrl(page, electronApp)`
- `waitForRuntimeReady(page, runtimeUrl)`
- `createTempUserDataDir()`

These should stay in the fixture file until reuse clearly justifies further extraction.

### First spec to add

`packages/desktop/e2e/smoke.spec.ts`

Initial coverage should stay minimal:

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
	const { page, runtimeUrl, cleanup } = await launchDesktopApp();
	try {
		const response = await page.request.get(`${runtimeUrl}/api/trpc/runtime.getVersion`);
		expect(response.ok()).toBe(true);
	} finally {
		await cleanup();
	}
});
```

### Implementation note: userData isolation

This is the biggest likely gap between the current product code and a reliable harness.

`main.ts` reads and writes:

- `app.getPath("userData")` for `connections.json`
- `app.getPath("userData")` for window state

The harness must avoid using the developer's real state. If Electron does not already expose a clean launch-time override for this in our setup, add one small startup seam such as:

- honoring a test-only env var before first `app.getPath("userData")` access,
- or setting the path early in startup in a production-safe way.

This is a justified seam because it makes tests deterministic and prevents accidental mutation of real desktop state.

### Verification

```bash
cd /Users/johnchoi1/main/kanban/packages/desktop && npm run e2e
```

---

## Deliverable 2 — Boot lifecycle E2E

**Priority:** P1  
**Depends on:** Deliverable 1

### Goal

Prove that local desktop mode starts the runtime child automatically and tears it down on app exit.

### Tests to add

File: `packages/desktop/e2e/boot-lifecycle.spec.ts`

Add:

1. `desktop app starts runtime child automatically`
   - launch app
   - wait for the main board UI
   - assert the app is not stuck in a disconnected state

2. `closing the desktop app makes the runtime unreachable`
   - launch app
   - capture `runtimeUrl`
   - call harness cleanup
   - poll the URL until it stops responding

### Important harness requirement

The second test should use polling and tolerate normal shutdown latency. Do not make it assume the runtime disappears instantly.

### Claims covered

- Electron desktop app starts and manages its own Kanban runtime child process

---

## Deliverable 3 — Auth enforcement E2E

**Priority:** P1  
**Depends on:** Deliverable 1

### Goal

Prove the desktop auth token model is active and requests are differentiated correctly.

### Tests to add

File: `packages/desktop/e2e/auth.spec.ts`

Add:

1. `authenticated request through the desktop app succeeds`
   - use `page.request` against `${runtimeUrl}/api/trpc/runtime.getVersion`
   - expect success

2. `direct unauthenticated request to runtime is rejected`
   - use `fetch(...)` from the Node test process, not the renderer/browser context
   - expect `401` or `403`

### Important implementation note

This doc's earlier version assumed `page.request` automatically proves BrowserWindow auth interception. In practice, verify how Playwright issues those requests in Electron context before relying on that as the final proof. If it does not traverse the Electron session path reliably enough, prefer one of these stronger assertions:

- execute a renderer `fetch` from `page.evaluate(...)`, or
- validate authenticated browser navigation/XHR from inside the loaded page.

The test should prove the real auth path, not just “some request worked.”

### Claims covered

- Desktop auth token model and runtime auth middleware are active

---

## Deliverable 4 — Connection persistence and default local-mode E2E

**Priority:** P1  
**Depends on:** Deliverable 1

### Goal

Prove the desktop app boots into local mode by default and persists connection metadata in isolated userData.

### Tests to add

File: `packages/desktop/e2e/connection-management.spec.ts`

Start with only the scenarios the current app can support cleanly without extra UI-driving seams:

1. `default startup uses local connection`
   - launch app
   - assert the loaded origin is localhost/127.0.0.1

2. `connections.json persists active connection metadata`
   - launch app
   - locate the isolated test `userDataDir`
   - read `connections.json`
   - assert `local` exists and an active connection id is present

3. `persisted local state is reused across relaunch`
   - launch app and close it
   - relaunch using the same isolated userData dir
   - assert startup still resolves to local mode and valid persisted state

### Do not include yet

Do **not** put these in the first implementation wave unless the harness already has stable support:

- menu-driven remote connection creation
- remote/local switching through dialogs
- insecure HTTP warning assertions
- invalid persisted remote fallback through full UI setup

Those are valid follow-ups, but they require more state orchestration and can easily make the first harness flaky.

### Claims covered

- ConnectionStore + ConnectionManager + persisted active connection are wired into desktop app

---

## Deliverable 5 — Diagnostics dialog E2E

**Priority:** P1  
**Depends on:** Deliverable 1

### Goal

Prove that diagnostics shown in the renderer reflect actual desktop runtime state.

### Tests to add

File: `packages/desktop/e2e/diagnostics.spec.ts`

Initial scenario:

1. `diagnostics dialog shows local connected state`
   - launch app
   - trigger the real diagnostics open flow
   - assert the dialog opens
   - assert local/connected/runtime details are present

### Recommended way to open diagnostics

Prefer one of these, in order:

1. trigger the actual menu item if Playwright/Electron control is straightforward,
2. send the real `open-diagnostics` event through `electronApp.evaluate(...)`,
3. only add a dedicated test seam if neither is reliable.

Because `preload.ts` already exposes `onOpenDiagnostics(...)` and `main.ts` already emits `open-diagnostics`, this scenario should be implementable without introducing a new product abstraction.

### Claims covered

- Desktop diagnostics reflect Local/Remote state, runtime version, websocket state, and auth state

---

## Deliverable 6 — Reconnection and disconnect-state E2E

**Priority:** P2  
**Depends on:** Deliverable 1 and stable control hooks

### Goal

Prove local and remote disconnect UX behave differently and correctly.

### Why this is deferred

The current codebase does not obviously expose a stable test seam for forcing reconnect/disconnect states from Playwright. This should not block the first harness.

### Initial target scenario

File: `packages/desktop/e2e/reconnection.spec.ts`

1. `local runtime disconnect shows full-page disconnected fallback`
   - launch app
   - force the local runtime child to die
   - assert the local disconnected fallback is shown

### Later scenarios

- remote disconnect shows reconnection banner instead of full-page fallback
- reconnect success shows recovered state
- repeated reconnect failure shows retry affordance

### Recommendation

Do this only after Wave 2 is green. If needed, add a small test seam that can terminate the runtime child from the main process in a controlled way.

---

## Deliverable 7 — Dist-based CI execution

**Priority:** P2  
**Depends on:** Deliverable 1 being stable

### Goal

Run the Electron harness against built `dist/` output in CI before attempting full packaged artifact smoke.

### Why dist-first

This is the right intermediate step between “works on one developer machine” and “works in packaged artifacts across platforms.” It verifies:

- Electron boot,
- runtime child startup,
- preload wiring,
- auth interception,
- and basic persistence,

without immediately taking on every packaging-specific failure mode.

### Suggested workflow shape

Add a workflow later such as `.github/workflows/desktop-e2e.yml` that:

1. checks out the repo
2. installs dependencies
3. builds the root/runtime and desktop TypeScript outputs needed by the app
4. installs Playwright browsers/deps
5. runs `packages/desktop` E2E smoke specs

### Initial matrix recommendation

Start with the platform most likely to be used for harness development, then expand. A full cross-platform matrix is a follow-up, not a requirement for the first harness landing.

---

## Deliverable 8 — Packaged artifact smoke

**Priority:** P3  
**Depends on:** Deliverable 7 and packaging hardening

### Goal

Eventually prove packaging assumptions, not just dev/dist assumptions.

### Why this is separate

The hardening plan identifies packaging-specific risks that dist-mode E2E will not fully cover:

- `app.asar` vs `app.asar.unpacked` child entry resolution,
- native addon availability,
- packaged shim layout,
- platform-specific launch behavior.

Those should become packaged smoke checks after the base harness is already trustworthy.

### Packaged-smoke targets

- installed or unpacked app launches
- runtime child entry survives packaging
- preload loads correctly
- auth and runtime reachability still work
- shutdown is clean

---

## Non-Electron work that should proceed in parallel

These do not depend on the Electron harness and should not wait for it.

### 1. CLI bridge integration expansion

Continue/extend integration tests around:

- runtime descriptor write on startup
- runtime descriptor cleanup on shutdown
- descriptor fallback when env vars are absent
- stale descriptor rejection

Relevant shared code:

- `src/core/runtime-descriptor.ts`
- `src/core/runtime-endpoint.ts`

### 2. CLI shim regression tests

Strengthen tests around:

- executable permissions
- script contents
- expected entrypoint targeting
- optional simulated invocation in packaged layout

Relevant files:

- `packages/desktop/build/bin/kanban`
- `packages/desktop/build/bin/kanban-dev`
- `packages/desktop/build/bin/kanban.cmd`

### 3. Connection manager/store gap fill

Continue unit/integration coverage for:

- corrupt `connections.json`
- missing persisted state
- invalid active connection fallback
- local/remote persistence edge cases

Relevant files:

- `packages/desktop/test/connection-manager.test.ts`
- `packages/desktop/test/connection-store.test.ts`
- `packages/desktop/test/main-connection-integration.test.ts`

### 4. Web UI Playwright additions

Extend browser-only coverage for desktop-adjacent UI affordances that do not require Electron.

Relevant files:

- `web-ui/playwright.config.ts`
- `web-ui/tests/`

---

## Recommended implementation order

If we want the fastest path to meaningful confidence, do the work in this order.

### Phase A — build the harness

1. Add `@playwright/test` and desktop Playwright config
2. Add `e2e/fixtures.ts`
3. Add smoke launch/runtime-reachable specs
4. Add deterministic userData isolation

### Phase B — prove the core architecture claims

5. Add boot lifecycle E2E
6. Add auth enforcement E2E
7. Add connection persistence/local default E2E
8. Add diagnostics E2E

### Phase C — expand into failure-state behavior

9. Add disconnect/reconnection scenarios
10. Add remote-switching scenarios
11. Add invalid persisted connection fallback through E2E

### Phase D — automate beyond local development

12. Add dist-based CI run
13. Add packaged smoke checks
14. Expand to platform matrix where justified

---

## Definition of done for the initial harness landing

The first harness milestone should be considered complete when all of the following are true:

1. `packages/desktop` has a runnable Playwright config and `npm run e2e` script.
2. The harness launches the real Electron desktop app from compiled output.
3. Tests run against isolated userData, not developer state.
4. At least one smoke spec proves launch and runtime reachability.
5. At least one auth/lifecycle-oriented spec proves behavior unique to Electron desktop mode.
6. Cleanup is reliable enough that repeated local runs do not leave orphaned app instances or stale test state.

That is the correct first milestone. Everything else should layer on top of that foundation.

---

## Open implementation questions to resolve during execution

These should be answered while building the harness, not before starting.

1. **Best runtime URL discovery path**
   - Is `page.url()` sufficient once the window loads?
   - Do we need a main-process introspection helper?

2. **Best proof of authenticated requests**
   - Does `page.request` use the same auth path we need?
   - Should the test instead use renderer `fetch` via `page.evaluate(...)`?

3. **Best userData override seam**
   - Can we safely override `userData` without invasive startup changes?
   - If not, what is the narrowest production-safe startup hook?

4. **How much remote-mode coverage belongs in the first harness**
   - likely minimal
   - local-mode confidence is the first milestone

5. **When to connect the harness to packaged artifacts**
   - only after dist-mode runs are stable and hardening work has reduced startup ambiguity

---

## Summary

The next step is not “write all desktop E2E tests.” The next step is to land a **real Electron Playwright harness with deterministic state isolation**, then use it to prove the highest-risk desktop-local behaviors first.

That gives us a stable base for the broader hardening plan, keeps the first milestone realistic, and avoids mixing foundational harness work with flaky remote-mode or packaged-app scenarios too early.
