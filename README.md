# anytype-agents-skill

A portable skill that lets AI coding agents script [Anytype](https://anytype.io) through the [`anytype-agent-runtime`](https://github.com/anyproto/anytype-agent-runtime) — creating objects, managing types/properties, and running full-text and semantic search.

The agent-facing instructions live in [`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` is a symlink to it). The JS client lib is [`anytypeHelper.js`](./anytypeHelper.js), with its API documented in [`anytypeHelper.md`](./anytypeHelper.md).

## Prerequisites

1. A running Anytype desktop app (the skill talks to its local API).
2. `anytype-agent-runtime` on your `PATH`:
   ```bash
   which anytype-agent-runtime
   ```
   If missing, see installation in [`AGENTS.md`](./AGENTS.md#setup). But your agent should handle that.
3. An `.env` in the skill directory with your Anytype API token (see `AGENTS.md`). This also will be created by agent.

## Installing the skill

Clone the repo and start your agent from inside it:

```bash
git clone https://github.com/anyproto/anytype-agents-skill
cd anytype-agents-skill
# then launch your agent here, e.g. `claude`, `codex`, etc.
```

The agent-facing instructions in `AGENTS.md` (and the `CLAUDE.md` symlink) are picked up automatically by Claude Code, OpenAI Codex, Cursor, Gemini CLI, Goose, OpenCode, OpenHands, GitHub Copilot, and other [Agent Skills](https://agentskills.io)-compatible agents when launched from the repo root.

## Using it

Once installed, ask the agent what you want to do with Anytype — it'll load the skill on demand. Examples:

- "Search my Anytype space for notes about quarterly planning."
- "Create a new `task` object titled 'Review PR #42' with status `in-progress`."
- "List all properties on the `book` type."

The agent writes a JS script that imports `anytypeHelper` and runs it via `anytype-agent-runtime`. You can also run scripts yourself once agent runtime is installed on your system:

```bash
anytype-agent-runtime -m . your-script.js
```
