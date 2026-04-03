# Desktop App Branch Summary

This document summarizes what `feature/desktop-app` adds beyond the existing browser-based Kanban experience, and outlines how it compares with a potential PWA direction.

## What this branch accomplishes

- Adds a real **Electron desktop app** under `packages/desktop/`
- Lets Kanban launch as a **native desktop application** instead of requiring terminal startup
- Bundles and manages a **Kanban runtime child process** from the desktop app
- Extracts a reusable **`startRuntime()`** entrypoint so the runtime can be embedded outside the CLI
- Adds **desktop auth token** generation and Electron-level request header injection
- Wires **runtime auth middleware** for HTTP + WebSocket protection
- Adds **desktop↔CLI runtime bridging** so helper commands can find the desktop-managed runtime
- Adds **VS Code-style env propagation** so PTY-launched agents can run `kanban task create`
- Adds **packaged/dev CLI shims** for desktop-managed agent workflows
- Adds **connection management** for Local / Remote / WSL modes
- Adds **saved remote connection UI** with add/remove/switch flows
- Adds **persist / restore active connection** on relaunch
- Adds **runtime child health checks, restart behavior, and shutdown handling**
- Adds **secure BrowserWindow defaults** and desktop hardening
- Fixes **packaged app startup** from `/Applications` with ESM / ASAR support
- Narrows **`asarUnpack`** to required runtime/native-addon paths
- Expands **Linux packaging** to AppImage `x64` + `arm64`
- Adds **desktop-focused tests**, including desktop agent task creation coverage

## Feature-by-feature comparison

Kanban includes more than a browser UI alone. Its workflow also involves launching and supervising local runtimes, managing long-lived terminal sessions, handling local/remote connection switching, and coordinating task worktrees. As a result, the browser launch flow, Electron app, and a PWA each cover somewhat different capabilities.

| Feature | Current browser launch (`npx kanban` opens browser) | Electron desktop app | PWA | Notes for Kanban |
| --- | --- | --- | --- | --- |
| Open / install UX | No desktop install; CLI launches a browser tab | Native install, dock/taskbar presence, dedicated app window | Installable from browser with lighter footprint than Electron | Browser launch minimizes install overhead; Electron and PWA each add an app-style entrypoint |
| Local runtime startup | CLI starts the local runtime directly | App starts and owns the runtime child process | Browser cannot directly start the local backend in the same way | Current browser flow and Electron align more closely with Kanban's local runtime model |
| Child process supervision | CLI owns the process for that launch | App can monitor, restart, and stop the runtime | Browser context does not typically supervise OS child processes | Electron adds the most built-in process lifecycle management |
| Terminal / long-lived agent sessions | Works when runtime is already running | Works with desktop lifecycle around it | UI can render sessions, but browser does not control OS process lifecycle | Electron and the current browser flow both fit the existing runtime architecture |
| Remote server access | Available, but more manual | Includes saved connection flows | Naturally suited to browser-based remote access | Electron and PWA both map well to remote usage, with different tradeoffs |
| Saved remote connections | Limited/manual | Persisted connection menu and switching | Possible, but would require app-level implementation in the web client | Electron currently provides a dedicated shell for this |
| Auth token handling for remote | Manual/user-managed | Token can be injected outside page context | Would typically require browser-oriented auth/session design | Electron and PWA would likely encourage different auth approaches |
| Secure local/remote switching | Manual | Local, remote, and WSL switching built into shell | Possible in UI, but not with identical runtime control | Electron more closely matches the current connection architecture |
| WSL integration | Limited | Explicit WSL launcher support | Not generally available in browser sandbox | Electron supports platform-specific integration points |
| Deep links / protocol handlers | Limited | Supports `kanban://` flow | Partial and browser-dependent | Electron offers more predictable custom protocol support |
| Window state persistence | Browser/tab controlled | Dedicated window state persistence | Limited to browser behavior | Electron provides its own window lifecycle |
| Menu bar / desktop commands | Browser-controlled | Native menu items and diagnostics actions | Limited compared with desktop menus | Electron exposes more desktop-level controls |
| Sleep/resume / App Nap handling | Depends on browser/runtime behavior | Explicit desktop power-monitor integration | Depends on browser/platform behavior | Electron allows additional handling around OS power events |
| Interrupted-task recovery UX | Possible after reconnecting to the app | Can check for interrupted work on app startup | Possible after page load and reconnect | Electron allows more startup-time orchestration |
| Offline caching of UI assets | Standard browser caching | Possible, though not central to the desktop shell | Service worker-based caching is a common PWA capability | This is one of the clearer areas where a PWA could add browser-specific value |
| Push notifications | Browser-permission dependent | Desktop notification model available | Possible via web push, with browser-specific behavior | Both Electron and PWA can support notifications differently |
| Distribution size / update simplicity | Minimal packaging; CLI-driven | Larger desktop package and release surface | Lighter install/update model than Electron | PWA and browser launch reduce packaging overhead relative to Electron |
| Access to OS features | Minimal | Broader desktop API access | Limited/sandboxed | Electron allows more direct desktop integration |
| Remote-only hosted Kanban usage | Works | Works | Well aligned with browser-hosted deployment | PWA may fit this usage pattern more directly |

## Summary

- **Electron** aligns closely with Kanban's current local-runtime and desktop-integration model.
- **A PWA** would likely align more naturally with browser-installed and remote-hosted usage patterns.
- **The current browser launch flow** remains the most direct zero-install path for local usage.
- Which approach fits best depends on whether the primary goal is local runtime orchestration, remote/browser convenience, or maintaining multiple entrypoints for different workflows.

## Short version

- **Current browser flow = direct CLI-launched browser experience**
- **PWA = installable browser-based experience**
- **Desktop app branch = desktop application with a managed Kanban runtime**