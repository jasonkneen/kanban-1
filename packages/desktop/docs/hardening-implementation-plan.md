# Desktop App Hardening Implementation Plan

This document focuses on making the Electron desktop app **robust**, **diagnosable**, and **recoverable**.

It is separate from the desktop feature implementation work. The feature branch now largely works on the happy path, but repeated packaging/startup regressions show that the desktop app still needs a dedicated hardening pass.

The goal of this plan is to reduce the frequency and severity of regressions where:

- a new packaged build breaks startup,
- the app falls into a blank or opaque failure state,
- the user cannot tell what failed,
- desktop and terminal Kanban runtimes coexist confusingly,
- Electron crashes leave behind stale runtime or descriptor state,
- support has no structured data to diagnose what happened.

---

## Goals

1. **Fail clearly, not silently.**
   Replace blank-window / `about:blank` behavior with explicit startup failure states.

2. **Validate packaging assumptions early.**
   Detect missing preload/runtime-child/shim/native-addon issues before the app gets deep into boot.

3. **Handle coexistence safely.**
   Developers may already have Kanban running in a terminal when they launch the desktop app. That must be non-destructive and understandable.

4. **Recover cleanly from desktop crashes.**
   Desktop-owned runtimes and descriptors must not poison the next launch.

5. **Produce useful diagnostics for support.**
   Future customer reports should include structured, redacted diagnostic snapshots.

6. **Make regressions testable.**
   Hardening work should result in explicit regression tests, not just better logging.

---

## Current problems

### 1. `about:blank` is being used as a failure sink

In `packages/desktop/src/connection-manager.ts`, local or WSL startup failures can currently degrade to:

- `console.error(...)`
- set URL to `about:blank`
- continue the flow

This keeps the process alive, but creates a poor user experience and weak observability.

### 2. Startup is a broad imperative block instead of a structured boot pipeline

`packages/desktop/src/main.ts` currently performs many startup steps inside a single `app.whenReady()` path:

- create `BrowserWindow`
- initialize `ConnectionStore`
- create `RuntimeChildManager`
- compute CLI shim path
- instantiate `ConnectionManager`
- initialize connection
- register resume handling
- show interrupted-task notification

This makes it difficult to:

- identify which stage failed,
- classify failure type,
- attach recovery behavior,
- generate consistent diagnostics.

### 3. Too many failures are best-effort or console-only

Examples:

- runtime descriptor write/cleanup is best-effort
- OAuth relay failures are console-only
- runtime crash mostly logs + maybe generic modal
- shutdown failures are console-only
- resource existence is assumed rather than validated

### 4. Desktop vs terminal runtime coexistence is under-specified

A developer can:

- already be running `kanban` in a terminal,
- then launch the desktop app,
- then use helper commands or agents,
- then crash/relaunch the desktop app.

Today, the app does not clearly model ownership of:

- desktop-owned local runtime,
- terminal-owned runtime,
- remote runtime,
- WSL runtime,
- orphaned prior desktop runtime.

That creates ambiguity in descriptor handling, CLI fallback, and crash recovery.

### 5. No support-grade diagnostics snapshot exists

There is currently no explicit desktop support/export flow that captures:

- startup phase,
- failure code,
- resource validation results,
- connection/runtime ownership state,
- descriptor state,
- child crash metadata,
- safeStorage availability,
- platform/build identity.

### 6. Descriptor logic is currently duplicated

`packages/desktop/src/main.ts` currently has inline desktop descriptor publish/clear helpers while `src/core/runtime-descriptor.ts` already contains shared descriptor logic.

If we add ownership/session metadata, the implementation must **consolidate on the shared core descriptor module** instead of evolving two separate descriptor implementations.

### 7. `detectInterruptedTasks` currently uses a dynamic import

`packages/desktop/src/main.ts` currently contains a pre-existing dynamic import path when loading from `kanban`.

That conflicts with the repository rule in `AGENTS.md` to avoid inline/dynamic imports. Since startup refactoring will touch this area anyway, hardening work should explicitly remove or replace that dynamic import during the boot-state refactor.

### 8. There is a mini-boot path in `activate`

The macOS `activate` handler can recreate the main window, reinstall auth interception, and reload the runtime URL.

That means startup behavior is not only defined by the initial `app.whenReady()` path. Hardening work must either:

- make `activate` participate in the same diagnostics/phase system, or
- treat it as a secondary boot path with equivalent structured logging.

### 9. There is also a restart path outside initial boot

The runtime restart flow used by resume/health-check handling is another startup-like path that can create or replace runtime state.

Hardening work must include this restart path in the same boot/diagnostics/failure model, not just the initial launch path and `activate` path.

### 10. Persisted connection state uses synchronous I/O

`ConnectionStore` currently uses synchronous file I/O for persisted state loading/writing.

That may be acceptable for a very small JSON file, but the boot-state design should acknowledge that `load-persisted-state` is currently synchronous, and shutdown/persist behavior should be reviewed with main-process responsiveness in mind.

### 11. WSL-adjacent code currently contains a pre-existing `any`

`wsl-launch.ts` currently contains a pre-existing `any` in a promise-settling helper.

That is not the main hardening target, but because the `about:blank` WSL failure path and WSL launch behavior are adjacent to this area, implementers should avoid spreading that pattern further and should clean it up opportunistically if they are already refactoring the surrounding code.

---

## Hardening principles

### Principle 1 — Never fail to a blank app state

If startup or runtime initialization fails, the user should land in an explicit **desktop failure surface**, not `about:blank`.

### Principle 2 — Classify failures, don’t just log them

Every important failure should map to a normalized category such as:

- `PRELOAD_LOAD_FAILED`
- `RUNTIME_CHILD_ENTRY_MISSING`
- `RUNTIME_CHILD_START_FAILED`
- `PACKAGED_SHIM_MISSING`
- `CONNECTION_STORE_CORRUPT`
- `REMOTE_CONNECTION_UNREACHABLE`
- `REMOTE_AUTH_REJECTED`
- `DESCRIPTOR_STALE`
- `DESKTOP_RUNTIME_ORPHANED`
- `RUNTIME_HEALTHCHECK_FAILED`

### Principle 3 — Explicit ownership beats implicit assumptions

The desktop app must know whether a runtime is:

- desktop-owned,
- terminal-owned,
- remote-owned,
- WSL-managed,
- or orphaned from a prior crashed desktop session.

### Principle 4 — Boot should be observable as a state machine

Startup should move through named phases instead of being a single opaque operation.

### Principle 5 — Support data must be redacted and exportable

Never export raw auth tokens or secrets. Export booleans and metadata only.

---

## Proposed workstreams

## Workstream 1 — Startup preflight validation

### Goal
Validate packaging/runtime assumptions before main startup proceeds.

### What to validate

- preload path exists and is readable
- runtime child entry exists and is readable **after applying the same `app.asar` → `app.asar.unpacked` resolution that `RuntimeChildManager` uses**
- packaged CLI shim exists in packaged mode
- `kanban-dev` shim exists in dev mode
- critical unpacked paths exist when packaged
- optional: `node-pty` can be resolved/loaded

### Recommended output

Create a preflight result structure like:

```ts
interface DesktopPreflightResult {
	ok: boolean;
	failures: DesktopPreflightFailure[];
	resources: {
		preloadExists: boolean;
		runtimeChildEntryExists: boolean;
		cliShimExists: boolean;
		nodePtyLoadable: boolean | null;
	};
}
```

### Expected UX

If preflight fails:

- do not proceed to normal runtime boot
- show explicit failure UI or modal with failure category
- allow exporting diagnostics

### Likely files

- `packages/desktop/src/main.ts`
- new file: `packages/desktop/src/desktop-preflight.ts`

### Important note

The preflight check must validate the **resolved child script path**, not just the raw source-relative path. Otherwise it can miss the exact packaging failure that happens when the app needs the unpacked child entry at runtime.

---

## Workstream 2 — Boot state machine

### Goal
Refactor startup into explicit boot phases.

### Proposed phases

- `preflight`
- `create-window`
- `load-persisted-state`
- `initialize-connections`
- `start-local-runtime`
- `connect-remote-runtime`
- `load-renderer`
- `ready`
- `failed`

### Proposed structure

Create a boot controller or boot state model that tracks:

```ts
type DesktopBootPhase =
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

### Why this matters

This lets us attach:

- structured logs,
- diagnostics snapshots,
- targeted retry behavior,
- precise failure messages,
- test assertions.

### Likely files

- `packages/desktop/src/main.ts`
- new file: `packages/desktop/src/desktop-boot-state.ts`

### Important note

The boot-state work must also cover the window re-creation path in the macOS `activate` handler, not just the initial `app.whenReady()` flow.

This is also the right time to remove the pre-existing dynamic import path in `main.ts` so startup refactoring stays aligned with repository rules.

It should also cover the restart flow used by resume/power-monitor recovery, since that path recreates runtime state outside the initial boot pipeline.

If `startRuntimeChildDirectly()` is still present as a legacy path, this refactor is the right time to either remove it or explicitly document it as intentional backward compatibility.

---

## Workstream 3 — Replace `about:blank` with a real failure surface

### Goal
Never leave the user in a dead window with no recovery guidance.

### Current problem

`ConnectionManager` currently falls back to `about:blank` on some failures.

This currently happens in **two separate paths** and both must be handled:

- local runtime startup failure in `switchToLocal()`
- WSL runtime startup failure in `switchToWsl()`

### Proposed replacement

Introduce a desktop-level failure surface with:

- failure title
- normalized failure code
- user-facing explanation
- retry button
- fallback to Local button (when relevant)
- export diagnostics button
- open logs button

### Options

1. Minimal native modal: use Electron dialog first
2. Better long-term: load a local failure page in BrowserWindow

Recommended path:

- short term: native blocking error with structured text
- medium term: dedicated failure HTML/renderer route

### Likely files

- `packages/desktop/src/connection-manager.ts`
- `packages/desktop/src/main.ts`
- new file: `packages/desktop/src/desktop-failure.ts`

---

## Workstream 4 — Runtime ownership and coexistence policy

### Goal
Make desktop + terminal + remote + WSL coexistence explicit and deterministic.

### Coexistence rules to define

#### Case A — terminal Kanban already running, desktop launches

Desired behavior:

- desktop app still starts successfully
- desktop local mode uses its own auto-assigned port
- desktop does not try to kill or take over terminal runtime
- diagnostics clearly show desktop runtime URL and ownership

#### Case B — desktop app crashes while terminal runtime exists

Desired behavior:

- next desktop launch should not be confused by stale desktop descriptor
- terminal runtime should remain untouched
- orphaned desktop-owned runtime should be detected and handled explicitly

### Ownership model to introduce

```ts
type RuntimeOwner =
	| "desktop-local"
	| "terminal"
	| "remote"
	| "wsl"
	| "unknown";
```

The ownership type and descriptor field definitions should live in the **shared descriptor/core layer** so both desktop and CLI code read the same source of truth.

Desktop-specific ownership policy and recovery decisions should stay in the desktop package.

### Descriptor hardening

The descriptor should include enough metadata to identify desktop ownership safely.

Suggested fields:

```json
{
	"source": "desktop",
	"owner": "desktop-local",
	"desktopSessionId": "...",
	"pid": 12345,
	"url": "http://127.0.0.1:40123",
	"updatedAt": "..."
}
```

### `desktopSessionId` generation

Generate a session identifier once per desktop app launch, as early as practical in main-process startup, store it in module-level state, and write it into every desktop-owned descriptor update.

That ID is what allows the app to distinguish:

- current-session desktop runtime state
- prior-session orphaned desktop runtime state

### Startup rule

Before trusting a desktop descriptor:

- verify PID liveness
- verify ownership/source
- if stale: ignore and delete
- if orphaned desktop runtime is alive: choose explicit policy

### Recommended orphan policy

For a prior desktop-owned orphan runtime:

- prefer **replace-or-cleanup**, not silent trust
- never interfere with runtimes not marked desktop-owned

### Likely files

- `packages/desktop/src/main.ts`
- `src/core/runtime-descriptor.ts`
- `src/core/runtime-endpoint.ts`

If a dedicated ownership helper file is added, it should be evaluated carefully: shared descriptor-facing types belong in `src/core/runtime-descriptor.ts`, while desktop-only policy helpers can live under `packages/desktop/src/`.

---

## Workstream 5 — Crash recovery and shutdown hardening

### Goal
Make crash/relaunch behavior deterministic.

### Problems to address

- stale descriptor after crash
- live orphan runtime after crash
- ambiguous runtime reuse on next launch
- shutdown loops / recursive quit behavior

### Specific hardening items

1. Ensure `before-quit` / `will-quit` cleanup is idempotent
2. Detect and clean stale desktop descriptor on next launch
3. Detect prior orphaned desktop-owned runtime on next launch
4. Decide explicit policy: reconnect vs replace vs ignore
5. Emit structured crash metadata when runtime child exits unexpectedly

### Important note on current behavior

The existing `before-quit` handler uses a subtle but intentional pattern:

- it sets `isQuitting = true`
- calls `event.preventDefault()`
- awaits async cleanup
- then calls `app.quit()` again

On the second `app.quit()` call, `before-quit` runs again but returns early because `isQuitting` is already true. That allows `will-quit` to proceed after cleanup.

This pattern is subtle, so hardening work should either:

- preserve this behavior intentionally, or
- replace it with a clearer equivalent without regressing shutdown ordering.

### Likely files

- `packages/desktop/src/main.ts`
- `packages/desktop/src/runtime-child.ts`

---

## Workstream 6 — Support diagnostics snapshot / export

### Goal
Collect structured, redacted diagnostic data users can send in bug reports.

### Data to capture

#### App identity

- app version
- runtime version
- platform
- architecture
- packaged vs dev mode

#### Boot/runtime state

- current boot phase
- last successful boot phase
- active connection type
- active connection id
- runtime URL
- app PID
- runtime child PID

#### Failure state

- failure code
- failure message
- stack trace if present
- child exit code/signal
- renderer crash details if available

#### Resource checks

- preload exists
- runtime child entry exists
- CLI shim exists
- `safeStorage.isEncryptionAvailable()` result
- descriptor exists
- descriptor PID alive

#### Environment/coexistence context

- whether terminal-like runtime env vars were already present
- whether another Kanban runtime appears to be running
- whether `connections.json` was readable/corrupt

### Redaction rules

Never include:

- raw auth tokens
- provider API keys
- OAuth refresh/access tokens
- full environment dumps

Instead include booleans such as:

- `authTokenPresent: true`
- `apiKeyConfigured: true`

### UX proposal

Add:

- extend the existing diagnostics/menu infrastructure instead of creating a disconnected parallel path
- keep the existing diagnostics entry point in mind when adding export actions
- add `Help -> Export Diagnostics` or extend the existing diagnostics flow with export
- optional `Copy Diagnostics Summary`
- automatically persist last startup failure snapshot

### Likely files

- `packages/desktop/src/main.ts`
- `packages/desktop/src/preload.ts`
- `web-ui/src/components/diagnostics-dialog.tsx`
- new files:
  - `packages/desktop/src/desktop-diagnostics.ts`
  - `packages/desktop/src/desktop-failure-codes.ts`

### Important note

The diagnostics snapshot should include the runtime child exit code and signal explicitly, not just a generic failure message.

---

## Workstream 7 — Structured logging and failure categories

### Goal
Make logs useful across builds and customer reports.

### Additions

- normalized failure codes
- startup phase logging
- runtime child lifecycle logging
- descriptor trust/delete/recovery logging
- connection switch outcome logging

### Important constraint

Do **not** log secrets.

### Suggested log shape

```ts
interface DesktopDiagnosticEvent {
	timestamp: string;
	phase: string;
	event: string;
	failureCode?: string;
	details?: Record<string, string | number | boolean | null>;
}
```

---

## Workstream 8 — Robustness regression tests

### Goal
Translate hardening work into durable regression coverage.

### Test categories

#### Unit / integration

- descriptor stale PID ignored
- orphaned desktop descriptor cleaned on startup
- `connections.json` corrupted → verify the existing safe fallback remains correct
- missing shim path → preflight failure category
- missing runtime child entry → preflight failure category
- startup phase transitions are recorded correctly

#### Audit areas to verify explicitly

- WSL auth interceptor/cookie cleanup during shutdown
- restart/resume path logs and phase tracking

### Existing behavior to preserve and test

`ConnectionStore.load()` already handles corrupted or unreadable persisted state by falling back to defaults. The hardening goal here is to **verify and lock in** that behavior, not to invent a fallback that does not exist.

#### Electron E2E

- startup failure surface shown when preflight fails
- terminal Kanban already running → desktop launch still succeeds
- desktop crash/relaunch cleans stale descriptor
- orphaned desktop runtime handled explicitly
- diagnostics export contains redacted structured data

#### CI smoke

- packaged build preflight catches missing resources early
- app does not regress to blank window on common packaging failures

---

## Recommended implementation order

### Phase 1 — make failures explicit

1. Startup preflight validation
2. Failure categories
3. Replace `about:blank` with structured failure handling

### Phase 2 — make ownership/coexistence safe

4. Runtime ownership model
5. Descriptor hardening
6. Crash recovery policy

### Phase 3 — make support/debugging practical

7. Diagnostics snapshot/export
8. Structured logging

### Phase 4 — lock it down with tests

9. Regression tests for preflight/failure categories
10. Electron E2E around coexistence/crash recovery
11. Packaged CI smoke

---

## Concrete first tasks to implement

If we want the fastest reduction in breakage pain, start with these:

### Task A
Add `desktop-preflight.ts` and block startup when required resources are missing.

### Task B
Stop using `about:blank` as a startup-failure path.

### Task C
Add stale desktop descriptor detection + PID liveness check before trust.

### Task D
Record normalized startup phase + failure code in memory for diagnostics.

### Task E
Add `Export Diagnostics` support snapshot action.

---

## Success criteria

We should consider the desktop app hardened when:

1. Packaging regressions fail early with explicit diagnosis
2. Users no longer land in blank or unexplained failure states
3. Desktop and terminal Kanban runtimes can coexist without ambiguity
4. Desktop crashes do not leave behind confusing stale runtime state
5. Support can collect structured redacted diagnostics from users
6. The common failure modes are covered by repeatable tests

---

## Short version

The desktop app does not mainly need more features right now — it needs a **robustness layer**.

That layer should provide:

- startup preflight checks,
- explicit boot phases,
- structured failure categories,
- safe runtime ownership rules,
- crash recovery policy,
- support-grade diagnostics export,
- and regression tests for all of the above.
