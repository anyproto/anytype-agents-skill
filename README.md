# anytype-agents-skill

A portable skill that lets AI coding agents script [Anytype](https://anytype.io) through the [`anytype-agent-runtime`](https://github.com/anyproto/anytype-agent-runtime) — creating objects, managing types/properties, and running full-text and semantic search.

The agent-facing instructions live in [`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` is a symlink to it). The JS client lib is [`anytypeHelper.js`](./anytypeHelper.js), with its API documented in [`anytypeHelper.md`](./anytypeHelper.md).

## Prerequisites

1. A running Anytype desktop app (the skill talks to its local API).
2. `anytype-agent-runtime` on your `PATH`:
   ```bash
   which anytype-agent-runtime
   ```
   If missing, see installation in [`AGENTS.md`](./AGENTS.md#setup).
3. An `.env` in the skill directory with your Anytype API token (see `AGENTS.md`).

## Installing the skill

This skill follows the open [Agent Skills](https://agentskills.io) format, so every compatible agent installs it the same way: drop the repo into the agent's skills directory. Pick the one you use.

### Claude Code

```bash
git clone https://github.com/anyproto/anytype-agents-skill ~/.claude/skills/anytype-agents
```

Restart Claude Code; the skill becomes discoverable by description. Project-scoped install: clone into `.claude/skills/anytype-agents` inside your repo instead.

### OpenAI Codex

```bash
git clone https://github.com/anyproto/anytype-agents-skill ~/.codex/skills/anytype-agents
```

Codex reads `SKILL.md`/`AGENTS.md` from skills directories automatically. See the [Codex skills docs](https://developers.openai.com/codex/skills/).

### OpenClaw (ClawHub marketplace)

Local install from this repo:

```bash
git clone https://github.com/anyproto/anytype-agents-skill
clawhub install ./anytype-agents-skill
```

Or publish to the registry once you're happy with it:

```bash
clawhub publish ./anytype-agents-skill
```

(Requires a GitHub account at least one week old.) See [OpenClaw skills docs](https://docs.openclaw.ai/tools/skills).

### Hermes Agent

```bash
git clone https://github.com/anyproto/anytype-agents-skill ~/.hermes/skills/anytype-agents
```

Hermes auto-indexes skills in its skills directory on next launch. See the [Hermes skills hub](https://hermes-agent.nousresearch.com/docs/skills/).

### Any other AgentSkills-compatible agent

Cursor, Gemini CLI, Goose, OpenCode, OpenHands, GitHub Copilot, and others all support the same format — consult your agent's docs for the skills directory path and clone this repo into it.

## Using it

Once installed, ask the agent what you want to do with Anytype — it'll load the skill on demand. Examples:

- "Search my Anytype space for notes about quarterly planning."
- "Create a new `task` object titled 'Review PR #42' with status `in-progress`."
- "List all properties on the `book` type."

The agent writes a JS script that imports `anytypeHelper` and runs it via `anytype-agent-runtime`. You can also run scripts yourself:

```bash
anytype-agent-runtime -m . your-script.js
```
