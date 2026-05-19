# anytype-agents-skill

A portable skill that lets AI coding agents script [Anytype](https://anytype.io) through the [`anytype-agent-runtime`](https://github.com/anyproto/anytype-agent-runtime) — creating objects, managing types/properties, and running full-text and semantic search.

The standards-compliant Agent Skill now lives in [`.agents/skills/anytype-data-management/SKILL.md`](./.agents/skills/anytype-data-management/SKILL.md). The JS client lib is [`anytypeHelper.js`](./anytypeHelper.js), with its API documented in [`anytypeHelper.md`](./anytypeHelper.md). [`AGENTS.md`](./AGENTS.md) and `CLAUDE.md` remain as compatibility shims for clients that still auto-load root instruction files.

## Prerequisites

1. A running Anytype desktop app (the skill talks to its local API).
2. `anytype-agent-runtime` on your `PATH`:
   ```bash
   which anytype-agent-runtime
   ```
   If missing, see installation in [`AGENTS.md`](./AGENTS.md#setup). But your agent should handle that.
3. An `.env` in the skill directory with your Anytype API token (see `AGENTS.md`). This also will be created by agent.

## Installing the skill

Clone the repo and use one of the installation paths below:

```bash
git clone https://github.com/anyproto/anytype-agents-skill.git
cd anytype-agents-skill
```

For clients that scan the standard Agent Skills tree, the skill is available at:

```text
.agents/skills/
   anytype-data-management/
      SKILL.md
      references/
```

For Claude Code marketplace-style installation, register the included manifest:

```bash
/plugin marketplace add ./.claude-plugin/marketplace.json
```

For clients or scripts that want a repo-root manifest, use:

```bash
cat marketplace.json
```

If your client still relies on root instruction files, launch it from the repo root and it can use [`AGENTS.md`](./AGENTS.md) as a compatibility entry point.

## Using it

Once installed, ask the agent what you want to do with Anytype — it'll load the skill on demand. Examples:

- "Search my Anytype space for notes about quarterly planning."
- "Create a new `task` object titled 'Review PR #42' with status `in-progress`."
- "List all properties on the `book` type."

The agent writes a JS script that imports `anytypeHelper` and runs it via `anytype-agent-runtime`. You can also run scripts yourself once agent runtime is installed on your system:

```bash
anytype-agent-runtime -m . your-script.js
```
