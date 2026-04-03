# Desktop App Hardening Implementation Tasks

This document converts `packages/desktop/docs/hardening-implementation-plan.md` into an **execution-ready task list**.

This work is higher priority than broad E2E expansion because the immediate problem is not lack of features — it is that the Electron app is still too easy to break across builds, startup paths, and crash/relaunch edge cases.

The tasks below are written so another agent can pick them up with minimal context.

---

## Priority order

### P0 — Stop the most painful breakages

1. Add startup preflight validation
2. Remove `about:blank` failure fallback
3. Add normalized failure codes + boot phase tracking
4. Add stale descriptor detection and cleanup before trust

### P1 — Make coexistence and recovery safe

5. Add runtime ownership model
6. Add orphan desktop runtime recovery policy
7. Harden shutdown / crash cleanup semantics

### P2 — Make the app diagnosable and supportable

8. Add diagnostics snapshot collection
9. Add Export Diagnostics entry point
10. Add structured logging for startup/runtime failures

### P3 — Lock behavior down with tests

11. Add unit/integration robustness tests
12. Add Electron regression coverage for startup/coexistence/crash recovery

---

## Task 1 — Add startup preflight validation

**Priority:** P0  
**Goal:** Fail early when required packaged/dev resources are missing or invalid.

### Why
Right now the app mostly assumes critical resources exist. When packaging layout changes, preload or runtime child entry can break late and opaquely.

### Implement

Create `packages/desktop/src/desktop-preflight.ts`.

Add a function like:

```ts
export interface DesktopPreflightFailure {
	code:
		| "PRELOAD_MISSING"
		| "RUNTIME_CHILD_ENTRY_MISSING"
		| "CLI_SHIM_MISSING"
		| "NODE_PTY_UNAVAILABLE";
	message: string;
	details?: Record<string, string | boolean | null>;
}

export interface DesktopPreflightResult {
	ok: boolean;
	failures: DesktopPreflightFailure[];
	resources: {
		preloadExists: boolean;
		runtimeChildEntryExists: boolean;
		cliShimExists: boolean;
		nodePtyLoadable: boolean | null;
	};
}

export function runDesktopPreflight(...): DesktopPreflightResult
```

### Validate at minimum

- preload file exists
- runtime child script exists
- validate the **asar-resolved child script path** using the same `resolveChildScriptPath()` logic that `RuntimeChildManager` uses
- packaged CLI shim exists in packaged mode
- dev CLI shim exists in dev mode
- optional: `node-pty` can be resolved

### Wire in

In `packages/desktop/src/main.ts`:

- run preflight before normal connection/runtime startup
- if preflight fails, do not continue with the normal boot path
- record the failure in the new boot/failure state system from Task 3

### Files to read first

- `packages/desktop/src/main.ts`
- `packages/desktop/package.json`
- `packages/desktop/src/runtime-child.ts`

### Important note

This task should reuse shared descriptor/runtime helpers where possible and avoid introducing new desktop-only copies of logic that already exist in core modules.

### Done when

- missing critical resources fail deterministically before runtime boot starts
- startup failure includes explicit failure code/message

---

## Task 2 — Remove `about:blank` as a failure fallback

**Priority:** P0  
**Goal:** Never leave the user in a blank/dead app state after startup failure.

### Why
`about:blank` is currently acting as a failure sink in `connection-manager.ts`, which hides root cause and looks broken.

There are currently **two distinct code paths** to cover:

- local startup failure in `switchToLocal()`
- WSL startup failure in `switchToWsl()`

### Implement

In `packages/desktop/src/connection-manager.ts`:

- find code paths that set local or WSL URL to `about:blank`
- replace that behavior with explicit error propagation

Then add a centralized failure surface strategy in `main.ts`.

### Short-term acceptable behavior

- show a native error dialog with:
  - failure code
  - short explanation
  - next step guidance

### Better medium-term behavior

- load a desktop-owned failure surface into the BrowserWindow instead of a dead page

### Add a small helper

Create `packages/desktop/src/desktop-failure.ts` with helpers like:

```ts
export interface DesktopFailureState {
	code: string;
	title: string;
	message: string;
	canRetry: boolean;
	canFallbackToLocal: boolean;
}
```

### Files to read first

- `packages/desktop/src/connection-manager.ts`
- `packages/desktop/src/main.ts`

### Important note

Do not patch only one `about:blank` path and miss the other. Both local and WSL startup failure behavior need to be migrated together.

Because this work is adjacent to WSL launch code, avoid propagating the pre-existing `any` usage in `wsl-launch.ts`. If you are already refactoring nearby code, clean that type up instead of copying the pattern.

### Done when

- no failure path intentionally loads `about:blank`
- startup/runtime init failures surface explicitly to the user

---

## Task 3 — Add normalized failure codes and boot phase tracking

**Priority:** P0  
**Goal:** Make startup observable and diagnosable.

### Why
The app currently has errors, but not a coherent way to know *where* boot failed or *what category* of failure occurred.

### Implement

Create:

- `packages/desktop/src/desktop-failure-codes.ts`
- `packages/desktop/src/desktop-boot-state.ts`

### Suggested boot phases

```ts
export type DesktopBootPhase =
	| "preflight"
	| "create-window"
	| "load-persisted-state"
	| "initialize-connections"
	| "start-local-runtime"
	| "connect-remote-runtime"
	| "load-renderer"
	| "ready"
	| "failed";
```

### Suggested failure codes

```ts
export type DesktopFailureCode =
	| "PRELOAD_LOAD_FAILED"
	| "RUNTIME_CHILD_ENTRY_MISSING"
	| "RUNTIME_CHILD_START_FAILED"
	| "PACKAGED_SHIM_MISSING"
	| "CONNECTION_STORE_CORRUPT"
	| "REMOTE_CONNECTION_UNREACHABLE"
	| "REMOTE_AUTH_REJECTED"
	| "DESCRIPTOR_STALE"
	| "DESKTOP_RUNTIME_ORPHANED"
	| "RUNTIME_HEALTHCHECK_FAILED"
	| "UNKNOWN_STARTUP_FAILURE";
```

### Track at runtime

Keep an in-memory state object with:

- current phase
- last successful phase
- latest failure code
- latest failure message

### Wire in

Update `main.ts` to move through phases explicitly and record failures centrally.

Also cover the macOS `activate` path that recreates the window and reloads the runtime URL. That path should participate in the same diagnostics/phase system or emit equivalent structured events.

Also cover the `restartRuntimeChild()` resume/recovery path in the same phase tracking and diagnostics model.

This task should also clean up the pre-existing dynamic import startup path in `main.ts` while that code is being refactored, to stay aligned with repository rules.

This is also the right place to evaluate removing `startRuntimeChildDirectly()` if it is dead legacy startup code, since this task is already restructuring the boot flow in `main.ts`.

### Files to read first

- `packages/desktop/src/main.ts`

### Done when

- startup path records phase transitions
- startup failures are categorized, not just stringified

---

## Task 4 — Add stale descriptor detection and cleanup before trust

**Priority:** P0  
**Goal:** Do not trust stale desktop runtime descriptors after crash/restart.

### Why
Electron crashes can leave behind descriptors that point to dead or orphaned desktop-owned runtimes. Those can poison the next launch and helper CLI behavior.

### Implement

Before trusting a descriptor:

1. read descriptor
2. verify descriptor source/owner
3. check PID liveness
4. if PID is dead:
   - classify as `DESCRIPTOR_STALE`
   - delete/ignore descriptor
5. if PID is alive but runtime is desktop-owned from a prior session:
   - hand off to Task 6 orphan handling policy

### Important note

`main.ts` currently contains inline descriptor publish/clear helpers while `src/core/runtime-descriptor.ts` already provides shared descriptor logic. As part of this task, consolidate onto the shared core descriptor module instead of evolving duplicate implementations.

### Likely files

- `src/core/runtime-descriptor.ts`
- `src/core/runtime-endpoint.ts`
- `packages/desktop/src/main.ts`

### Done when

- stale desktop descriptor never silently wins
- startup cleans or ignores stale desktop state deterministically

---

## Task 5 — Add runtime ownership model

**Priority:** P1  
**Goal:** Distinguish desktop-owned runtimes from terminal/remote/WSL runtimes.

### Why
Without explicit ownership, coexistence and crash recovery stay ambiguous.

### Implement

Put shared descriptor-facing ownership types in `src/core/runtime-descriptor.ts` so both desktop and CLI code use the same source of truth.

Desktop-only ownership policy helpers can live in `packages/desktop/src/` if needed.

Shared type shape:

```ts
export type RuntimeOwner =
	| "desktop-local"
	| "terminal"
	| "remote"
	| "wsl"
	| "unknown";
```

### Extend descriptor metadata

Add fields such as:

- `owner`
- `desktopSessionId`
- `updatedAt`

### Behavior

- desktop should mark its own local runtime explicitly
- desktop must never kill or take over terminal-owned runtime
- desktop diagnostics should expose ownership information

### Files to read first

- `src/core/runtime-descriptor.ts`
- `packages/desktop/src/main.ts`

### Done when

- ownership is explicit in metadata and runtime decisions

---

## Task 6 — Add orphan desktop runtime recovery policy

**Priority:** P1  
**Goal:** Define what happens when a prior desktop runtime is still alive after Electron crashes.

### Why
This is one of the biggest operational footguns for developers who already have Kanban running or who relaunch after a crash.

### Policy to implement

For **desktop-owned prior-session runtimes**:

- detect them explicitly
- prefer **replace-or-cleanup** over silent trust

For **non-desktop-owned runtimes**:

- never kill or hijack them

### Recommended first policy

On launch:

- if descriptor says prior desktop-owned runtime is alive but not part of the current session,
  - log a structured event,
  - try to terminate or quarantine it,
  - start a fresh desktop runtime,
  - if cleanup fails, surface warning/diagnostics

### Files to read first

- `packages/desktop/src/main.ts`
- `packages/desktop/src/runtime-child.ts`
- `src/core/runtime-descriptor.ts`

### Done when

- relaunch after desktop crash is deterministic
- terminal runtimes are unaffected

---

## Task 7 — Harden shutdown and crash cleanup semantics

**Priority:** P1  
**Goal:** Make cleanup idempotent and predictable.

### Why
Multiple cleanup paths currently exist (`before-quit`, `will-quit`, runtime shutdown callbacks, descriptor cleanup). These need stronger guarantees.

### Implement

Review and harden:

- `before-quit`
- `will-quit`
- runtime manager shutdown
- descriptor cleanup
- connection manager shutdown

Preserve or intentionally replace the current `before-quit` re-entrancy pattern:

- first `before-quit` call prevents default and awaits cleanup
- second `app.quit()` call re-enters `before-quit`
- `isQuitting` guard allows the second pass to fall through so `will-quit` can fire

That current behavior is subtle but important for shutdown ordering.

### Specific requirements

- cleanup must be safe to call multiple times
- cleanup should not recursively re-trigger quit loops
- descriptor removal should happen even after partial failures
- runtime child disposal should not throw uncaught errors during shutdown

### Files to read first

- `packages/desktop/src/main.ts`
- `packages/desktop/src/runtime-child.ts`
- `packages/desktop/src/connection-manager.ts`

### Done when

- shutdown cleanup is idempotent
- crash/relaunch leaves less stale state behind

---

## Task 8 — Add diagnostics snapshot collection

**Priority:** P2  
**Goal:** Collect structured redacted support/debugging data.

### Why
If builds keep breaking, we need diagnostic data from users/customers that does not depend on them finding logs manually.

### Implement

Create `packages/desktop/src/desktop-diagnostics.ts`.

Add a function like:

```ts
export interface DesktopDiagnosticsSnapshot {
	timestamp: string;
	appVersion: string;
	platform: string;
	arch: string;
	isPackaged: boolean;
	bootPhase: string;
	lastSuccessfulPhase: string | null;
	failureCode: string | null;
	failureMessage: string | null;
	connectionType: string | null;
	connectionId: string | null;
	runtimeUrl: string | null;
	descriptorExists: boolean;
	descriptorPidAlive: boolean | null;
	runtimeChildPid: number | null;
	childExitCode: number | null;
	childExitSignal: string | null;
	safeStorageEncryptionAvailable: boolean;
	resources: {
		preloadExists: boolean;
		runtimeChildEntryExists: boolean;
		cliShimExists: boolean;
	};
	secrets: {
		authTokenPresent: boolean;
	};
}
```

### Redaction rules

Never include raw:

- auth tokens
- provider secrets
- OAuth tokens
- full env var dumps

### Files to read first

- `packages/desktop/src/main.ts`
- `packages/desktop/src/preload.ts`
- `src/core/runtime-descriptor.ts`

### Important note

Map `safeStorageEncryptionAvailable` directly to `safeStorage.isEncryptionAvailable()` so support snapshots reflect the same encryption capability check already used by the connection store.

### Done when

- desktop can produce a structured redacted snapshot at runtime

---

## Task 9 — Add Export Diagnostics entry point

**Priority:** P2  
**Goal:** Give users and support a way to export diagnostics without developer tooling.

### Implement

Add one of:

- `Help -> Export Diagnostics`
- or `Connection/Help -> Export Diagnostics`

Build on the **existing diagnostics menu/IPC flow**, rather than creating a totally parallel path. There is already desktop diagnostics plumbing in the app, so export should extend that experience.

Important implementation detail: the main-process diagnostics data we want here (boot phase, preflight results, descriptor/runtime ownership state, child crash metadata) is not currently available directly in the renderer. This task will need a new or extended IPC channel so renderer/UI actions can request a main-process diagnostics snapshot.

The export should:

1. generate the diagnostics snapshot from Task 8
2. prompt for save location or save to a predictable path
3. write a JSON file
4. optionally show success/failure dialog

### Optional follow-up

- add `Copy Diagnostics Summary`
- persist `last-startup-failure.json`

### Files to read first

- `packages/desktop/src/main.ts`
- `packages/desktop/src/connection-menu.ts`

### Done when

- a non-technical user can export a support snapshot from the app

---

## Task 10 — Add structured logging for startup/runtime failures

**Priority:** P2  
**Goal:** Improve observability without leaking secrets.

### Implement

Create a small desktop logging helper, for example:

- `packages/desktop/src/desktop-logger.ts`

Add structured events for:

- boot phase transitions
- preflight failures
- runtime child ready/crash/restart
- descriptor trust/delete decisions
- connection initialization outcome
- orphan cleanup outcome

### Suggested event shape

```ts
interface DesktopDiagnosticEvent {
	timestamp: string;
	phase: string;
	event: string;
	failureCode?: string;
	details?: Record<string, string | number | boolean | null>;
}
```

### Done when

- critical desktop failures produce structured logs with failure code + phase

---

## Task 11 — Add unit/integration robustness tests

**Priority:** P3  
**Goal:** Protect the hardening behavior with cheap regression tests.

### Add tests for

- missing preload → preflight fails with correct code
- missing runtime child entry → preflight fails with correct code
- missing shim → preflight fails with correct code
- stale descriptor dead PID → ignored/deleted
- corrupted `connections.json` → verify the existing safe fallback remains correct
- boot phase transitions update correctly
- diagnostics snapshot redacts secrets

### Important note

`ConnectionStore.load()` already handles corrupted persisted state by falling back to defaults. Treat this as an existing behavior to lock in with tests, not a brand-new fallback to invent.

### Likely files

- `packages/desktop/test/*.test.ts`
- `test/runtime/core/*.test.ts`
- new test files where needed

### Done when

- the major hardening rules are covered without needing Electron E2E first

---

## Task 12 — Add Electron regression coverage for startup/coexistence/crash recovery

**Priority:** P3  
**Goal:** Verify the hardest runtime ownership and startup failure scenarios in the real app.

### Depends on

This assumes the Electron Playwright harness from `packages/desktop/docs/e2e-test-tasks.md` eventually exists.

### Scenarios

- startup failure surface is shown when preflight fails
- terminal Kanban already running → desktop still launches cleanly
- desktop crash/relaunch cleans stale descriptor
- orphan desktop runtime is handled explicitly
- diagnostics export writes redacted JSON

### Done when

- the fragile cross-build startup and coexistence cases are tested end-to-end

---

## Parallelization guidance

### Can be implemented in parallel after small alignment

- Task 1 — startup preflight
- Task 3 — failure codes + boot phase tracking
- Task 8 — diagnostics snapshot collection
- Task 10 — structured logging

### Should follow the foundational tasks

- Task 2 depends on Task 3 semantics being defined
- Task 4 depends on failure codes + descriptor handling direction
- Task 5 depends on descriptor metadata changes
- Task 6 depends on runtime ownership model
- Task 9 depends on Task 8

### Recommended first execution wave

1. Task 3 — failure codes + boot phase tracking
2. Task 1 — startup preflight
3. Task 2 — remove `about:blank`
4. Task 4 — stale descriptor cleanup

That wave should give the fastest reduction in "new build broke and we don’t know why" pain.

---

## Suggested first milestone

If we want a tight initial milestone, define it as:

### Milestone: “Desktop startup no longer fails opaquely”

Includes:

- Task 1
- Task 2
- Task 3
- Task 4

### Expected outcome

- packaged resource regressions fail early
- users no longer hit `about:blank`
- stale descriptor state is less likely to poison startup
- failures have a category and a known boot phase

---

## Success criteria

This hardening work is successful when:

1. A broken build fails with a specific diagnosis, not a blank window
2. Desktop and terminal Kanban can coexist without confusion or destructive interference
3. Relaunch after crash does not silently trust stale desktop-owned state
4. Support can request/export a structured redacted diagnostics file
5. The highest-risk startup and recovery paths are regression-tested
