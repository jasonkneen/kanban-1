# Proposal: Integrating `pmll-memory-mcp` with Kanban

> **To:** @jasonkneen
> **From:** @drQedwards
> **Package:** [`pmll-memory-mcp`](https://www.npmjs.com/package/pmll-memory-mcp)
> **Date:** April 2026

---

## TL;DR

[`pmll-memory-mcp`](https://www.npmjs.com/package/pmll-memory-mcp) is a lightweight MCP server that gives AI agents fast, session-isolated, short-term key-value memory. By wiring it into Kanban's multi-agent orchestration pipeline, every agent task gets a private scratch-pad that survives across tool calls within a session — unlocking smarter task decomposition, deduplication of redundant work, and richer context hand-off between linked tasks.

---

## Quick Start

```bash
npm install -g pmll-memory-mcp
pmll-memory-mcp
```

That's it. The server starts on stdio and speaks the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP-aware client (Claude, Codex, Cursor, or Kanban's own runtime) can connect immediately.

---

## What `pmll-memory-mcp` Provides

| Capability | Description |
|---|---|
| **Session-isolated KV store** | Each agent session gets its own namespace — no cross-talk between parallel agents |
| **Fast read/write** | In-memory storage designed for sub-millisecond access during tool-call loops |
| **Q-promise deduplication** | Tracks queued async promises to prevent redundant execution of identical operations |
| **MCP-native transport** | Speaks stdio MCP out of the box — zero glue code needed for MCP clients |

---

## Why This Matters for Kanban

Kanban already excels at running many CLI agents in parallel across isolated git worktrees. Adding `pmll-memory-mcp` as an MCP server complements this architecture in several concrete ways:

### 1. Per-Task Agent Memory

Each Kanban card spawns an agent in its own terminal and worktree. By attaching a `pmll-memory-mcp` instance per task, the agent gains a private key-value store for the duration of its work. This is useful for:

- **Caching intermediate analysis** — e.g. dependency graphs, file indexes, or symbol lookups that the agent computed once and needs again later in the same session.
- **Tracking progress state** — the agent can checkpoint its own progress (steps completed, files reviewed, tests run) so it can resume intelligently after interruptions.
- **Accumulating context** — as the agent makes tool calls, it can store extracted facts and decisions, reducing redundant LLM calls for information it already derived.

### 2. Smarter Task Linking and Hand-Off

Kanban supports task linking where completing one card auto-starts linked downstream tasks. With `pmll-memory-mcp`, the upstream agent can write structured hand-off notes (decisions made, files changed, gotchas discovered) into its memory store. A lightweight bridge could serialize this memory and seed the downstream agent's session, creating a richer context hand-off than the current git-diff-only approach.

### 3. Q-Promise Deduplication Across Tool Calls

When agents make many parallel tool calls (file reads, grep searches, test runs), some of these may be redundant within a single session. `pmll-memory-mcp`'s Q-promise deduplication layer can track and deduplicate these, reducing wasted compute and API calls — especially valuable when running dozens of agents simultaneously.

### 4. Complementing the Skills Migration

Kanban is actively migrating from MCP tools to the Skills + CLI architecture. `pmll-memory-mcp` doesn't compete with this direction — it fills a different niche. Skills handle *what agents can do* (task CRUD, board management). Memory handles *what agents remember* during execution. The two are complementary:

```
┌─────────────────────────────────────────────┐
│                Kanban Board                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Task A  │→ │ Task B  │→ │ Task C  │     │
│  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │             │             │          │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐     │
│  │ Agent A │  │ Agent B │  │ Agent C │     │
│  │ + worktree│ │ + worktree│ │ + worktree│  │
│  │ + memory │  │ + memory │  │ + memory │  │
│  └─────────┘  └─────────┘  └─────────┘     │
│       ↕             ↕             ↕          │
│  pmll-memory   pmll-memory   pmll-memory    │
│  (isolated)    (isolated)    (isolated)     │
└─────────────────────────────────────────────┘
```

---

## Proposed Integration Path

### Phase 1: Side-Car Configuration

Add `pmll-memory-mcp` as a configurable MCP server in Kanban's agent launch pipeline. When a task starts, Kanban spawns a `pmll-memory-mcp` instance alongside the agent's terminal session.

**Configuration example** (for Kanban settings or `.kanban.json`):

```json
{
  "mcpServers": {
    "pmll-memory": {
      "command": "pmll-memory-mcp",
      "args": [],
      "transport": "stdio",
      "perTask": true
    }
  }
}
```

The `"perTask": true` flag indicates Kanban should spawn a separate instance for each task card, maintaining session isolation.

### Phase 2: Agent Hook Integration

Leverage Kanban's existing hook system (`src/commands/hooks.ts`) to manage memory lifecycle:

- **`to_in_progress`** hook → Start the `pmll-memory-mcp` instance for the task
- **`to_review`** hook → Optionally snapshot memory state for review/debugging
- **Task completion** → Serialize relevant memory entries for linked downstream tasks, then terminate the instance

### Phase 3: Context Bridge for Linked Tasks

Build a lightweight adapter that, on task completion:
1. Reads key-value pairs from the completing agent's memory
2. Filters for entries tagged as "hand-off" or "context"
3. Seeds these into the next linked task's memory instance on startup

This creates an automated context chain that flows through the Kanban board's dependency graph.

---

## For the Fork

If you're maintaining a fork of Kanban, `pmll-memory-mcp` can be integrated even more tightly:

- **Custom skill definition** — Create a `pmll-memory` skill that wraps the memory operations as CLI commands (`kanban memory set <key> <value>`, `kanban memory get <key>`), aligning with Kanban's skills-first direction.
- **Board-level memory dashboard** — Surface memory contents in the web UI's task detail panel, giving reviewers visibility into what the agent "knew" during execution.
- **Persistent cross-session memory** — While `pmll-memory-mcp` is designed for short-term session memory, a fork could add an optional persistence layer (write to SQLite on task completion) for long-running projects.

---

## Summary

| Integration Point | Effort | Impact |
|---|---|---|
| Side-car MCP server per task | Low | Immediate per-agent memory |
| Hook-based lifecycle management | Medium | Clean startup/teardown |
| Context bridge for linked tasks | Medium | Smarter multi-agent workflows |
| Custom skill wrapper | Medium | Aligns with skills migration |
| Web UI memory panel | Higher | Full observability |

The core integration (Phase 1) requires minimal code — Kanban already has MCP client infrastructure in `src/cline-sdk/cline-mcp-runtime-service.ts` and supports stdio, SSE, and HTTP transports. Adding `pmll-memory-mcp` as a configured server is a natural extension of the existing architecture.

---

## References

- **Package:** https://www.npmjs.com/package/pmll-memory-mcp
- **Source:** https://github.com/drqsatoshi/Pmll
- **MCP Protocol:** https://modelcontextprotocol.io
- **Kanban Docs:** https://docs.cline.bot/kanban/overview
- **Kanban MCP Runtime:** `src/cline-sdk/cline-mcp-runtime-service.ts`
