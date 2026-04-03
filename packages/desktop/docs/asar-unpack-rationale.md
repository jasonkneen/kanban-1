# asarUnpack Rationale

This document explains why each entry in `electron-builder.yml`'s
`asarUnpack` list exists and what happens if it is removed.

## Background

Electron packages app files into an ASAR archive for faster reads and to
avoid filesystem path-length issues on Windows. However, certain files
**must** live on the real filesystem:

1. **Fork targets** — `child_process.fork()` needs a real file path.
2. **Native addons** — `.node` files are loaded via `dlopen()`, which
   cannot read from virtual ASAR paths.
3. **ESM detection** — Node.js reads `package.json` from disk to detect
   `"type": "module"` for the forked child process.

## Current Unpack List

### `package.json`

**Why:** The runtime child process is forked with Node.js, which walks up
the directory tree looking for `package.json` to determine module type. If
this file is inside the ASAR archive, Node.js cannot detect
`"type": "module"` and the ESM entry point fails to load.

**Risk if removed:** `ERR_UNKNOWN_FILE_EXTENSION` or `ERR_MODULE_NOT_FOUND`
when the child process starts.

### `**/runtime-child-entry.js`

**Why:** This is the entry point passed to `child_process.fork()`. The fork
syscall requires a path on the real filesystem — it cannot resolve virtual
paths inside an ASAR archive.

**Risk if removed:** `ENOENT` when attempting to fork the runtime child.

### `**/node_modules/node-pty/**`

**Why:** node-pty is a native C++ addon that ships platform-specific
`.node` binaries (e.g., `pty.node`, `conpty.node`). These are loaded via
`dlopen()` at runtime. Present both as a top-level dependency and nested
inside the `kanban` package.

**Risk if removed:** `Error: Module did not self-register` or `ENOENT` when
the terminal/PTY subsystem initializes.

### `**/node_modules/better-sqlite3/**`

**Why:** better-sqlite3 is a native C++ addon (`better_sqlite3.node`) used
by the kanban runtime for persistent workspace storage. Loaded via
`dlopen()`.

**Risk if removed:** Database operations fail with `MODULE_NOT_FOUND` or
segfault on `dlopen()` from ASAR.

### `**/node_modules/@anthropic-ai/claude-agent-sdk/**`

**Why:** The Claude Agent SDK ships vendored native `.node` binaries for
audio capture functionality across all platforms. These are loaded via
`dlopen()`.

**Risk if removed:** Agent SDK features that depend on native audio capture
fail to load.

### `**/node_modules/@img/**`

**Why:** The `@img` scope contains platform-specific sharp binaries (e.g.,
`@img/sharp-darwin-arm64`). These are native addons loaded via `dlopen()`.

**Risk if removed:** Image processing operations fail with
`MODULE_NOT_FOUND`.

## Intentionally NOT Unpacked

### `tree-kill`

Pure JavaScript module. Uses `child_process.exec('taskkill')` on Windows
and `process.kill()` on Unix. No native bindings. Works fine from inside
the ASAR archive.

### `electron-updater`

Pure JavaScript module. No native bindings.

### All other `node_modules`

Modules without native `.node` binaries work correctly from inside the ASAR
archive. Keeping them packed reduces I/O overhead and app size on disk.

## How to Validate

After changing the unpack list:

1. Build the app: `npm run build:mac` (or `build:linux`, `build:win`)
2. Launch the packaged app (not dev mode)
3. Verify:
   - Runtime child starts (check console for `Runtime ready at ...`)
   - Open a terminal tab — PTY works
   - Create/modify a workspace — SQLite works
   - No `MODULE_NOT_FOUND` errors in the console
4. Inspect the unpacked directory:
   ```bash
   # macOS
   ls "Kanban.app/Contents/Resources/app.asar.unpacked/"

   # Linux (AppImage must be mounted or extracted)
   ls "<extracted>/resources/app.asar.unpacked/"
   ```
   Confirm only the expected modules are present.
