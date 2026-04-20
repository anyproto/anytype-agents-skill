# Anytype Agent Runtime

## What is Anytype

Anytype is a local-first, privacy-focused knowledge management platform. Everything in Anytype is an **object** with a **type**. Types define which properties an object can have. You can:

- Create and manage **objects** (pages, notes, tasks, bookmarks, custom types)
- Organize with **types** (define schemas with properties), **collections** (curated lists), and **tags**
- **Search** across objects using full-text and semantic vector search
- Build structured knowledge bases with typed properties (text, number, date, select, multi_select, checkbox, etc.)
- Properties are **global** — a property key has one format across the entire space

This project uses the Anytype Agent Runtime (a Go-based JS engine) to execute JavaScript that interacts with the Anytype API through the `anytypeHelper` library.

## Setup

Before running scripts, check that `anytype-agent-runtime` is installed:

```bash
which anytype-agent-runtime
```

If not found, install it:

```bash
# Option 0: from github releases:
# check https://github.com/anyproto/anytype-agent-runtime/releases, download binary for current OS and install to PATH.

# Option 1: from source (requires Go)
git clone https://github.com/anyproto/anytype-agent-runtime.git /tmp/anytype-agent-runtime
cd /tmp/anytype-agent-runtime && go install . && cd -

# Option 2: if the repo is already cloned locally
cd /path/to/anytype-agent-runtime && go install . && cd -
```

After install, verify: `anytype-agent-runtime --help`

It also worth checking github/releases to make sure that newest version is installed.

## How to run JS

Write a `.js` file that exports a `main()` function, then execute it. The `-m .` flag makes the current directory a module search path, so `anytypeHelper.js` in this folder is available as `import { createClient } from "anytypeHelper@v1"`.

```bash
anytype-agent-runtime -m . my-script.js
```

Pass arguments as key=value pairs:

```bash
anytype-agent-runtime -m . my-script.js query="search term"
```

Read argument values from files with `key=@filepath`:

```bash
anytype-agent-runtime -m . my-script.js body=@content.md
```

### Runtime output

The runtime prints:
- `trace: /tmp/anytype-trace-XXXX.json` — path to the full trace file
- `res: <value>` — the return value of `main()`
- `err: <message>` — error message if the script failed
- Trace summary — a table of all effects (fetch calls, helper method calls, console.log)

### Traces

Every side effect is recorded in the **trace**. The trace is a JSON map: `{ effectName: { serializedInput: [outputs] } }`.

Two levels of traces:
- **Raw traces** (`fetch`, `fetchBatch`, `sleep`) — low-level HTTP calls with full request/response payloads. Useful for debugging API issues.
- **Wrapped traces** (`anytypeHelper.getObjects`, `anytypeHelper.createObject`, etc.) — high-level helper method calls. These show what the helper did and what it returned. Much more useful for understanding script behavior.

The trace file (`-t file` or the auto-generated temp file) contains everything. The CLI summary prints a condensed version. Use `console.log()` in your scripts — output appears in the trace under `console.log`.

## MANDATORY RULES

1. **ALWAYS use anytypeHelper client methods** — NEVER call fetch() directly to the Anytype API. The helper handles pagination, auth headers, error normalization, and tag creation.
2. **NEVER hardcode credentials** — always use `env.ANYTYPE_API_URL`, `env.ANYTYPE_API_KEY`, `env.ANYTYPE_SPACE_ID`. These are loaded from the `.env` file automatically.
3. **Check existing types first** — call `client.getTypes()` before creating a type. NEVER create types that already exist. Not all spaces have the same types — always check first.
4. **`createObject(typeKey, data)` — first arg is a type KEY string**, not an object. Example: `client.createObject("page", { name: "My Page" })`
5. **`createClient({ apiBaseUrl, apiKey, spaceId })` — use camelCase**, not snake_case. `apiKey` not `api_key`.

## Standard Pattern

```js
import { createClient } from "anytypeHelper@v1";

export function main() {
  var client = createClient({
    apiBaseUrl: env.ANYTYPE_API_URL,
    apiKey: env.ANYTYPE_API_KEY,
    spaceId: env.ANYTYPE_SPACE_ID
  });
  var objects = client.getObjects("page");
  return objects;
}
```

## Credentials & Authentication

### If `.env` already exists

The runtime reads `.env` from the current directory automatically. Required variables:

```
ANYTYPE_API_URL=http://127.0.0.1:31009
ANYTYPE_API_KEY=your-api-key
ANYTYPE_SPACE_ID=your-space-id
```

### If no credentials exist — authentication flow

The Anytype API uses a challenge-based auth. The user must have the **Anytype Desktop app running**.

**Step 1:** Write and run a script to request a challenge. This triggers a 4-digit code display in the user's Anytype Desktop app:
```js
import { requestChallenge } from "anytypeHelper@v1";
export function main() {
  return requestChallenge({ baseUrl: env.ANYTYPE_API_URL || "http://127.0.0.1:31009" });
}
```
Run it: `anytype-agent-runtime -m . step1-challenge.js`

The output includes `challenge_id`. **Ask the user to read the 4-digit code from their Anytype Desktop app.**

**Step 2:** Write and run a script to solve the challenge with the user's code:
```js
import { solveChallenge } from "anytypeHelper@v1";
export function main() {
  return solveChallenge({
    baseUrl: "http://127.0.0.1:31009",
    challenge_id: "CHALLENGE_ID_FROM_STEP_1",
    code: "CODE_FROM_USER"
  });
}
```
Run it: `anytype-agent-runtime -m . step2-solve.js`

The output includes `api_key`.

**Step 3:** Write and run a script to list available spaces:
```js
import { createClient } from "anytypeHelper@v1";
export function main() {
  var client = createClient({ apiBaseUrl: "http://127.0.0.1:31009", apiKey: "API_KEY_FROM_STEP_2" });
  return client.listSpaces();
}
```
Run it: `anytype-agent-runtime -m . step3-spaces.js`

Returns `{ ok: true, spaces: [{ id, name }, ...] }`. **Ask the user which space to use** if there are multiple. Or create a new one: `client.createSpace("My Space")`.

**Step 4:** Write the `.env` file with the obtained credentials:
```
ANYTYPE_API_URL=http://127.0.0.1:31009
ANYTYPE_API_KEY=api-key-from-step-2
ANYTYPE_SPACE_ID=space-id-from-step-3
```

After this, all scripts will use these credentials automatically via `env.ANYTYPE_API_KEY` etc.

## Sobek JS Engine

- No async/await — everything is synchronous
- ALWAYS use named imports: `import { createClient } from "anytypeHelper@v1"`
- `fetch()` auto-parses JSON responses — use `resp.body` directly, NEVER `JSON.parse(resp.body)`
- Use `console.log()` to debug — output appears in the trace
- Use `var` or `const` — both work
- Use `for` loops when in doubt — they always work

## Object Data Model

- `obj.name` — object name
- `obj.id` — object ID for API calls
- `obj.type` — an OBJECT, not a string: `obj.type.name` ("Page"), `obj.type.key` ("page")
- Properties are directly on the object: `obj.genre`, `obj.rating`, `obj.status` — same level as `obj.name`
- `getObjects()` and `search()` return objects **without** `markdown`. Call `getObject(id)` for full content.
- `select`/`multi_select` values are tag **keys** (e.g. `"in_progress"`), not display names (e.g. `"In Progress"`). When writing, pass the display name — the helper resolves it. When reading, you always get the key.

## Types

Always call `client.getTypes()` first to see what types exist in the space. Common types (vary by space):

| Key | Name | Layout | Notes |
|-----|------|--------|-------|
| `page` | Page | basic | Always available |
| `note` | Note | note | May not exist in new spaces |
| `task` | Task | action | May not exist — create with `client.createType({ key: "task", layout: "action" })` |
| `bookmark` | Bookmark | bookmark | Always available |
| `collection` | Collection | collection | Always available |
| `set` | Query | set | Always available |

If a type you need doesn't exist, create it with `client.createType()`. Use `client.describeType("typeKey")` to inspect a type's properties, tag values, and sample objects before writing to it.

Properties are **global** across the space — once a property key is created with a format, that format is locked for all types. Keys are normalized to snake_case by the API (`"myProp"` becomes `"my_prop"`). Always use the key from the API response, not what you passed in.

## anytypeHelper API Reference

See `anytypeHelper.md` for the full API reference including all client methods:

**Queries:** getObjects, getObject, search, getTypes, getProperties, getProperty, describeType, getObjectsByTag, getCollectionObjects, listTags, listSpaces, getSpaceByName

**Mutations:** createObject, updateObject, deleteObject, appendToObject, createType, addTag, setTags, createCollection, addToCollection, removeFromCollection, createSpace

**Auth (standalone imports, not client methods):** requestChallenge, solveChallenge
