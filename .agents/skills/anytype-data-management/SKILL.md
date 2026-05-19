---
name: anytype-data-management
description: Create, update, search, and organize Anytype objects, types, properties, tags, collections, and spaces through anytype-agent-runtime and anytypeHelper. Use when the user wants to work with Anytype data, bootstrap Anytype API access, or script Anytype from an agent.
license: MIT
compatibility: Requires a local checkout of https://github.com/anyproto/anytype-agents-skill.git, a running Anytype Desktop app, and anytype-agent-runtime on PATH.
metadata:
  author: anyproto
  repo: anyproto/anytype-agents-skill
  version: "1.0.0"
---

# Anytype Data Management

Anytype is a local-first knowledge platform where everything is an object with a type. Use this skill for work involving objects, types, properties, tags, collections, spaces, or Anytype search.

Use this skill when the task is about reading or mutating data in an Anytype space, such as:

- creating or updating Anytype objects
- defining types and properties
- searching notes, pages, tasks, or bookmarks
- organizing content with tags or collections
- bootstrapping local Anytype API access for the first time

## Core workflow

1. Make sure the canonical repository is checked out locally:

  ```bash
  git clone https://github.com/anyproto/anytype-agents-skill.git
  cd anytype-agents-skill
  ```

2. Check that `anytype-agent-runtime` is available.
3. Use `anytype-agent-runtime -m . your-script.js` from the repository root so `anytypeHelper@v1` resolves to the bundled helper in this repo.
4. Import helper functions with named imports, for example `import { createClient } from "anytypeHelper@v1"`.
5. Initialize the client with `env.ANYTYPE_API_URL`, `env.ANYTYPE_API_KEY`, and `env.ANYTYPE_SPACE_ID`.
6. Prefer the helper's high-level methods over raw API calls.

If the runtime is missing, install it yourself rather than asking the user to do that. See `references/setup-and-auth.md` for install paths and first-time auth flow.

## Mandatory rules

1. Always use `anytypeHelper` client methods. Do not call `fetch()` directly against the Anytype API.
2. Never hardcode Anytype credentials. Read them from environment variables loaded via `.env`.
3. Check existing types before creating a type. Types vary by space.
4. Call `createObject(typeKey, data)` with a type key string as the first argument.
5. Use `createClient({ apiBaseUrl, apiKey, spaceId })` with camelCase option names.

## Default pattern

```js
import { createClient } from "anytypeHelper@v1";

export function main() {
  var client = createClient({
    apiBaseUrl: env.ANYTYPE_API_URL,
    apiKey: env.ANYTYPE_API_KEY,
    spaceId: env.ANYTYPE_SPACE_ID
  });

  return client.getObjects("page");
}
```

## Setup and auth

- If the repository is not already present locally, clone the canonical upstream repo and work from its root:

  ```bash
  git clone https://github.com/anyproto/anytype-agents-skill.git
  cd anytype-agents-skill
  ```

- Check `which anytype-agent-runtime` before writing scripts.
- Run scripts from the repository root with `anytype-agent-runtime -m . my-script.js`.
- Pass scalar arguments as `key=value` and file-backed arguments as `key=@filepath`.
- If `.env` already exists, rely on `ANYTYPE_API_URL`, `ANYTYPE_API_KEY`, and `ANYTYPE_SPACE_ID`.
- If no credentials exist, use the challenge flow with `requestChallenge`, ask the user for the 4-digit desktop code, then solve the challenge and list spaces.

## Runtime output and debugging

- The runtime prints `trace:`, `res:`, and `err:` lines.
- Prefer wrapped traces such as `anytypeHelper.getObjects` and `anytypeHelper.createObject` before inspecting low-level fetch traces.
- Use `console.log()` when you need script-side debugging. The output is recorded in the trace.

## Sobek runtime notes

- No `async` or `await`.
- Use named imports such as `import { createClient } from "anytypeHelper@v1"`.
- `var` and `const` both work.
- Prefer simple `for` loops if compatibility is unclear.

## Behavior notes

- `getObjects()` and `search()` do not include full markdown content. Use `getObject(id)` when you need the full body.
- Anytype object properties are exposed as flat top-level fields on the returned object.
- Select and multi-select values are returned as tag keys, not display labels.
- Properties are global across the entire space. If a property key already exists with a different format, the helper may rename your requested property on a type. Check `renamed_properties` in type creation responses.

## Object and type model

- `obj.name` is the object name.
- `obj.id` is the Anytype object ID.
- `obj.type` is an object, not a string. Expect fields like `obj.type.name` and `obj.type.key`.
- Common built-in types include `page`, `note`, `task`, `bookmark`, `collection`, and `set`, but spaces vary, so check with `getTypes()` first.
- Keys are normalized to snake_case by the API. Use the keys the API returns, not assumptions based on display names.

## Common helper methods

Queries:

- `getObjects(typeKey)`
- `getObject(id)`
- `search(query, ...keywords)`
- `getTypes()`
- `getProperties()`
- `getProperty(key)`
- `describeType(typeKey)`
- `getObjectsByTag(tagName)`
- `getCollectionObjects(collectionId)`
- `listTags()`
- `listSpaces()`
- `getSpaceByName(name)`

Mutations:

- `createObject(typeKey, data)`
- `updateObject(id, data)`
- `deleteObject(id)`
- `appendToObject(id, markdown)`
- `createType(spec)`
- `addTag(id, tagName)`
- `setTags(id, tags)`
- `createCollection(name, options)`
- `addToCollection(collectionId, objectId)`
- `removeFromCollection(collectionId, objectId)`
- `createSpace(name)`

## Good task fits

- Search my Anytype space for notes about quarterly planning.
- Create a `task` titled `Review PR #42` with status `In Progress`.
- List all properties on the `book` type.
- Create a new type if it does not already exist, then add objects of that type.
- Help me authenticate this repository against my local Anytype app.

## References

- Setup and auth: [references/setup-and-auth.md](references/setup-and-auth.md)
- Helper API summary: [references/helper-reference.md](references/helper-reference.md)
- Full helper API docs in this repo: `anytypeHelper.md`

If a task needs more detail than this file provides, read the reference files above before proceeding. They carry forward the detailed operational guidance that used to live only in the root compatibility shim.