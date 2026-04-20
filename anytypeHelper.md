## Tool Description

Anytype API client for managing objects, types, properties, tags, and collections in an Anytype space. Provides high-level methods that handle idempotent type creation, property format normalization, inline tag assignment, and global property conflict detection.

## Tool Schema

### setup [setup]

`anytypeHelper` is pre-bound as a kernel global. Do not import or instantiate it — call its methods directly, e.g. `anytypeHelper.getObjects("page")`.

`env` is a GLOBAL variable. Never use `args.env`.

---

### property_types [setup]

Properties are flattened directly onto the object. Access them as `obj.genre`, `obj.rating`, `obj.status` — same level as `obj.name` and `obj.id`.

| Property format | Value type | Example |
|---|---|---|
| text, url, email, phone | string | `obj.genre === "sci-fi"` |
| number | number | `obj.rating === 9` |
| checkbox | boolean | `obj.watched === true` |
| date | string (ISO 8601) | `obj.due_date === "2024-01-15T10:00:00Z"` |
| select | string — the tag **KEY** | `obj.status === "in_progress"` ← NOT the display name |
| multi_select | string[] — array of tag **keys** | `obj.categories === ["action", "sci_fi"]` ← NOT display names |
| objects | string[] — array of object IDs | `obj.assignee === ["bafyrei..."]` |

**select/multi_select return tag KEYS, not display names.** When you pass `status: "In Progress"` to `createObject`, the helper creates a tag with key `"in_progress"`. Reading it back gives `obj.status === "in_progress"`.

---

### createType(opts) [mutator]

Create a type or ensure it exists (idempotent). Properties are GLOBAL in Anytype — a property key has one format space-wide. If a requested property key already exists with a DIFFERENT format, the helper renames it on this type by prepending the type key (e.g. `creator` → `tv_show_creator`) so your requested format is preserved. The original→prefixed mapping is returned in `renamed_properties` so the caller knows which keys to use when creating objects of this type. **Always check `renamed_properties` in the response and use those keys, not the originals.**

**Input:**
- `opts.key` (string, required) — unique type key, e.g. `"recipe"`. Use lowercase + underscores.
- `opts.name` (string) — display name; defaults to `opts.key`
- `opts.plural_name` (string) — defaults to `opts.name + "s"`
- `opts.layout` (string) — defaults to `"basic"`. Options: `"basic"`, `"todo"`, `"profile"`, `"note"`.
- `opts.icon` (object or string) — optional, e.g. `"🎬"` or `{ emoji: "🎬" }` or `{ name: "star", color: "blue" }`. Format is auto-detected.
- `opts.properties` (array) — property definitions:
  - `{ key: string, name?: string, format: string }`
  - `name` defaults to `key` if omitted
  - Valid formats: `"text"`, `"number"`, `"date"`, `"checkbox"`, `"url"`, `"email"`, `"phone"`, `"select"`, `"multi_select"`, `"objects"`

**Output:**
```js
{
  ok: boolean,
  error: string | null,          // ALWAYS a string on failure, null/absent on success
  type: {
    id: string,
    key: string,
    name: string,
    plural_name: string,
    layout: string,
    properties: [{ id, key, name, format }]  // all properties on this type
  },
  created: boolean,              // true if newly created, false if already existed
  added_properties?: string[],   // keys added to an already-existing type
  property_warnings?: string[],  // format conflicts: explanation per renamed property
  renamed_properties?: { [originalKey]: prefixedKey },  // map of any keys that were prefixed due to format collision
  key_warnings?: string[]        // keys that were normalized by the API (e.g. "myKey" → "my_key")
}
```

**Behavior:**
- Type exists with all requested properties → `ok: true, created: false`, no changes
- Type exists but missing properties → adds them (PATCH), returns `added_properties`
- Requested property key exists space-wide with DIFFERENT format → renames to `<typeKey>_<originalKey>` on this type so the requested format is preserved. Adds entry to `renamed_properties` and `property_warnings`. Caller MUST use the prefixed key when creating/updating objects of this type.
- After creation, verifies actual formats match requested (catches silent API coercion)

**Example:**
```js
var result = anytypeHelper.createType({
  key: "movie",
  name: "Movie",
  properties: [
    { key: "genre", format: "text" },
    { key: "rating", format: "number" },
    { key: "watched", format: "checkbox" },
    { key: "status", format: "select" },
    { key: "categories", format: "multi_select" }
  ]
});
// result.ok === true, result.created === true, result.type.id === "bafyrei..."
```

---

### createObject(typeKey, data?) [mutator]

Create an object. The type must already exist (call `createType` first). Pass human-readable values for properties — the helper detects formats, creates missing select/multi_select tag options automatically.

**Input:**
- `typeKey` (string, required) — type **KEY** (e.g. `"movie"`), NOT the type ID
- `data.name` (string) — display name
- `data.body` (string) — markdown body content
- `data.icon` (object or string) — optional icon, e.g. `"⭐"` or `{ emoji: "⭐" }`. Format is auto-detected.
- `data.template_id` (string) — optional template ID
- `data.tags` (string[] or object[]) — inline tag creation + assignment on the built-in `"tag"` multi_select property. Each entry: a string tag name, or `{ name, color?, key? }`.
- `data.properties` (object | array) — explicit properties. Object shorthand `{ key: value }` is the easiest form.
- Any extra **top-level fields** in `data` are automatically treated as property values.

**Property value formats when writing:**
- `string` → `text` (default), or `select` / `multi_select` if the property has that format (auto-detected from type)
- `number` → `number`
- `boolean` → `checkbox`
- `string[]` → `multi_select` tag names (created if missing)

**Example:**
```js
var result = anytypeHelper.createObject("movie", {
  name: "Dune",
  genre: "sci-fi",              // text
  rating: 9,                    // number
  watched: true,                // checkbox
  status: "In Progress",        // select — tag created with key "in_progress"
  categories: ["Action", "Sci-Fi"],  // multi_select — tags created with keys "action", "sci_fi"
  tags: ["classic"],            // built-in tag property
  body: "# Dune\n\nSet in a distant future."
});

var obj = result.object;
// obj.genre === "sci-fi"
// obj.rating === 9
// obj.watched === true
// obj.status === "in_progress"       ← tag KEY, not display name
// obj.categories === ["action", "sci_fi"]  ← tag KEYS
```

**Output:**
```js
{
  ok: boolean,
  id: string | undefined,          // shortcut for object.id (only on success)
  object: {
    id: string,
    name: string,
    type: { id, key, name },
    // Properties are flattened onto the object: obj.genre, obj.rating, etc.
    layout: string,
    archived: boolean,
    snippet: string
    // NO markdown field — call getObject(id) to get markdown
  } | null,
  error: string | null,            // ALWAYS a string on failure, null on success
  tag_results?: [{ ok, object, tag_key }],   // one entry per data.tags item
  tag_warnings?: string[]                    // tag failures
}
```

---

### updateObject(objId, data) [mutator]

PATCH an existing object. Same property handling as `createObject` — pass values as top-level fields. Only fields present in `data` are changed; everything else is preserved.

**Input:**
- `objId` (string, required) — object ID
- `data` — same shape as `createObject`'s data. Top-level fields are extracted as properties.
- `data.body` (string) — markdown content (normalized to `markdown` for the PATCH endpoint)
- `data.typeKey` (string, optional) — pass to avoid an extra `getObject` fetch for select/multi_select format resolution

**Example:**
```js
anytypeHelper.updateObject(objId, { name: "Dune: Part Two", rating: 10, watched: false });
anytypeHelper.updateObject(objId, { body: "# Updated\n\nNew content." });
anytypeHelper.updateObject(objId, { status: "Done", typeKey: "movie" });  // typeKey avoids extra fetch
```

**Output:** `{ ok: boolean, id: string, object: { ...same shape as createObject... } | null, error: string | null }`
- `id` — echo of the `objId` passed in (always present, even on error)

---

### deleteObject(objId) [mutator]

Archive (soft-delete) an object. Anytype does not permanently delete — the object is marked `archived: true`.

**Input:** `objId` (string)

**Output:** `{ ok: boolean, id: string, error: string | null }`

After delete: `getObject(id)` returns `null` or an object with `archived: true`.

---

### appendToObject(objId, text) [mutator]

Append text to an object's existing markdown. Fetches current content, concatenates, and PATCHes. Fails early with a clear error if the object doesn't exist.

**Input:**
- `objId` (string) — object ID
- `text` (string) — markdown text to append (a `"\n"` separator is added before it)

**Output:** `{ ok: boolean, id: string, object: { ... } | null, error: string | null }`
- `id` — echo of the `objId` passed in (always present, even on error)
- On success: `ok: true`, `error: null`, `object` contains the updated object
- On failure (object not found): `ok: false`, `error` is a string like `"Object not found: <objId>"`, `object: null`

**Example:**
```js
anytypeHelper.appendToObject(noteId, "\n## New Section\nSome additional content.");

// Error handling:
var res = anytypeHelper.appendToObject("bad_id", "text");
// res.ok === false, res.error === "Object not found: bad_id", res.object === null
```

---

### applyDiff(objId, blocksOrText) [mutator]

Surgical edit of an object's markdown via aider-style search/replace blocks. Fetches the object, applies blocks against its current markdown, writes the result back via `updateObject`. Use this instead of `updateObject({body: ...})` when you only want to change a section of a long page — much cheaper than re-emitting the whole body.

Three escalating match strategies, transparent to the caller:
1. **Exact substring** — fastest, must match byte-for-byte.
2. **Normalized line-by-line** — trims whitespace and unescapes Anytype's `\_ \* \` \|`.
3. **Head/tail anchor** — first 2 + last 2 lines must match (only for blocks ≥ 4 lines).

If a block matches more than once at any strategy, the call fails with an "ambiguous match" error rather than guessing.

**Input:**
- `objId` (string, required) — object ID.
- `blocksOrText` (Array | string, required) — either a parsed `[{search, replace}, ...]` array OR raw LLM text containing `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` delimiters (parsed automatically via `parseDiffBlocks`).

**Output:**
- Success: `{ ok: true, id, blocksApplied, lengthBefore, lengthAfter }`
- Failure: `{ ok: false, id, error, lengthBefore? }` — `error` names the failing block ("block 2: ambiguous match, 3 occurrences", "block 1: no match found in source. Search text: ...").

**When to use vs. neighbours:**
- `updateObject(id, {body})` — replacing the whole body (or any properties).
- `appendToObject(id, text)` — only adding to the end.
- `applyDiff(id, blocks)` — editing one or more sections in place, preserving everything else.

**Example:**
```js
// As an array of blocks
var res = anytypeHelper.applyDiff(pageId, [
  { search: "## Old heading\nold body line", replace: "## New heading\nnew body line" }
]);
// res === { ok: true, id: pageId, blocksApplied: 1, lengthBefore: 2304, lengthAfter: 2310 }

// Or hand it raw LLM output verbatim
var llmReply =
  "<<<<<<< SEARCH\n" +
  "## Old heading\n" +
  "old body line\n" +
  "=======\n" +
  "## New heading\n" +
  "new body line\n" +
  ">>>>>>> REPLACE\n";
anytypeHelper.applyDiff(pageId, llmReply);
```

---

### parseDiffBlocks(text) [getter]

Pure helper — parse aider-style search/replace blocks out of raw LLM text. Returns `[{search, replace}, ...]` (empty array if no delimiters found). Useful when you want to inspect or transform blocks before passing them to `applyDiff`. Safe to call with arbitrary text; tolerates surrounding markdown code fences.

**Input:**
- `text` (string) — LLM output containing one or more `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE` blocks.

**Output:** `Array<{ search: string, replace: string }>`.

**Example:**
```js
var blocks = anytypeHelper.parseDiffBlocks(llmReply);
// [{ search: "old body line", replace: "new body line" }, ...]
console.log("LLM emitted " + blocks.length + " edit(s)");
anytypeHelper.applyDiff(pageId, blocks);
```

---

### getObjects(typeKey?, options?) [getter]

List all objects in the space. Auto-paginates through all pages. Returns **partial data — no `markdown` field**.

**Input:**
- `typeKey` (string, optional) — filter by type key (e.g. `"movie"`). Omit to get all objects.
- `options.limit` (number) — page size per API call, default 100
- `options.offset` (number) — starting offset, default 0

**Output:** Array of partial objects with attached `.pagination` and optional `.error` properties:
```js
var objs = anytypeHelper.getObjects("movie");
objs.length             // number of objects returned
objs.pagination.total   // total count in space matching the filter
objs.error              // string on API failure (e.g. bad type key), undefined on success
objs[0] = {
  id: string,
  name: string,
  snippet: string,    // first ~100 chars of body (Note-layout objects use this as name)
  type: { id, key, name, layout, properties },
  // Properties flattened onto the object: obj.genre, obj.status, etc.
  layout: string,
  archived: boolean
  // NO markdown — call getObject(id) for full content
}
```

**Error handling:** When the API returns an error (e.g. invalid type key), the returned array is empty (`[]`) with `.error` set to a human-readable string. A valid type with zero objects returns `[]` with NO `.error` (this is success, not failure). Always check `.error` when `length === 0` to distinguish "no objects" from "bad query".

**Warning:** Without `typeKey`, this returns system objects too (types, properties, collections, programs). Usually you want to filter by type.

---

### getObject(objId) [getter]

Fetch a single object **with full markdown content**.

**Input:** `objId` (string)

**Output:**
```js
{
  id: string,
  name: string,
  snippet: string,
  type: { id, key, name, layout, properties },
  // Properties flattened onto the object: obj.genre, obj.status, etc.
  layout: string,
  archived: boolean,
  markdown: string   // full body — unescaped (backslashes removed from _, *, `, |)
} | null   // null if not found, deleted, or on error
```

**Error handling:** Returns `null` on any failure (not found, bad ID, server error). Errors are logged via `console.log` for trace visibility — look for `getObject(<id>) error: <message>` in the runtime output.

**Example:**
```js
var obj = anytypeHelper.getObject("bafyrei...");
if (obj) {
  console.log(obj.markdown);                // full content
  console.log(obj.rating);       // 9
  console.log(obj.status);       // "in_progress"  (tag KEY)
}
// If obj is null, check runtime traces for error details
```

---

### search(...queries) [getter]

Hybrid search combining full-text search with semantic vector search. Accepts one or more queries (strings or objects). Results from all queries are combined and deduplicated by object ID.

**Input:** One or more arguments, each a `string` or `{ query: string, types?: string[] }`. Multiple arguments run separate API searches whose results are merged (deduped by ID).

**Output:** Array of **objects** normalized and deduplicated. Every result has a unified `.text` field:

- `obj.text` — relevant text excerpt. For vector matches: the matched chunk text. For FTS-only results: the object snippet (beginning of body).
- `obj.name`, `obj.id`, `obj.type`, `obj.properties` — standard object fields.

Use `obj.text` directly instead of fetching the full object with `getObject(id)` — it already contains relevant content.

Returns max 10 results. `.error` is set if some queries failed.

**Example:**
```js
// Single query
var results = anytypeHelper.search("how to manage emotions");
results[0].text // "Cognitive behavioral therapy helps identify..."

// Multiple queries — parallel, deduplicated
var results = anytypeHelper.search("Dune", "sci-fi", "Herbert");

// With type filter
var results = anytypeHelper.search(
  { query: "recipe", types: ["page"] },
  "ingredients"
);

// Use .text directly — no need for getObject
for (var i = 0; i < results.length; i++) {
  console.log(results[i].name + ": " + results[i].text);
}
```

---

### getTypes() [getter]

All types defined in the space (including system built-in types).

**Output:** `Array<{ key, name, plural_name, layout, archived, icon?, properties: { propKey: format, ... } }>`

- `key` is the stable typeKey to pass to `createObject(typeKey, ...)` / `describeType(typeKey)`.
- `properties` is a flat `{ propKey: format }` map — exactly the shape the LLM uses when writing. IDs are intentionally omitted (you never reference types or properties by id).

**Example:**
```js
var types = anytypeHelper.getTypes();
types[0];
// { key: "book", name: "Book", plural_name: "Books", layout: "basic", archived: false,
//   icon: {name: "book", color: "green", format: "icon"},
//   properties: { title: "text", author: "text", rating: "number", status: "select",
//                 tags: "multi_select", created_date: "date" } }
```

**Error handling:** On API failure, returns an empty array (`[]`) with `.error` set to a human-readable string. On success, `.error` is absent. Always check `.error` when the array is empty to distinguish "no types" from "API failure".

---

### getProperties() [getter]

All properties in the space. Properties are **GLOBAL** — one key maps to exactly one format across the entire space.

**Output:** `[{ id: string, key: string, name: string, format: string }]`

**Error handling:** On API failure, returns an empty array (`[]`) with `.error` set to a human-readable string. On success, `.error` is absent. Always check `.error` when the array is empty to distinguish "no properties" from "API failure".

---

### getProperty(propKey) [getter]

Look up a single property by its key.

**Input:** `propKey` (string) — e.g. `"genre"`, `"rating"`, `"tag"`

**Output:** `{ id: string, key: string, name: string, format: string }` or `null` if not found

Returns `null` when the property key does not exist in the space. This is expected behavior (not an error) — use it to check whether a property has been created.

**Example:**
```js
var prop = anytypeHelper.getProperty("tag");   // { id: "bafyrei...", key: "tag", name: "Tag", format: "multi_select" }
var tagPropId = prop.id;                // use this ID for listTags / createTag (or just pass "tag" key directly)

var missing = anytypeHelper.getProperty("nonexistent");  // null
```

---

### describeType(typeKey) [getter]

Returns a comprehensive snapshot of a type in ONE call: metadata, all properties with their formats, existing select/multi_select tag values, object count, and a sample existing object. Use this BEFORE writing `createObject` for any existing type — especially built-in or pre-configured types — to avoid 2-3 turns of trial-and-error discovery of valid tag keys and property formats.

**Input:** `typeKey` (string) — the type key to describe (e.g. `"project"`, `"movie"`)

**Output:**
```js
{
  type: {
    key: string,
    name: string,
    layout: string,
    plural_name: string,
    icon: object | string | null,
    archived: boolean,
    id: string
  },
  properties: [
    {
      key: string,
      name: string,
      format: string,
      // For select / multi_select properties only:
      existing_tags?: [
        { key: string, name: string, color: string, id: string }
      ],
      existing_tags_error?: string,  // present only on listTags failure
      // Anytype properties are SPACE-GLOBAL: a type's registered properties
      // are only those passed to createType, but objects of that type may
      // have any global property set. describeType inspects the sample
      // object and adds any extra properties found there. They're tagged:
      inferred_from_sample?: boolean
    }
  ],
  object_count: number,
  sample: object | null   // first existing object of this type, or null if none
}
```

Returns `null` if no type with that key exists in the space.

**Why use this:** for `select`/`multi_select` properties, the helper will create new tag options if you pass display names that don't exist. That's fine for fresh types, but creates fragmentation on built-in or pre-configured types that already have a defined set of tags. `describeType` lets you see what tags exist BEFORE calling `createObject`, so you can use the existing tag names directly and rely on the helper resolving them to the existing keys instead of creating duplicates.

**Example:**
```js
var info = anytypeHelper.describeType("project");
// info.properties might include:
//   { key: "status", format: "select", existing_tags: [
//     { key: "63454ad0...", name: "To Do",       color: "blue"   },
//     { key: "63454af2...", name: "In Progress", color: "yellow" },
//     { key: "63454af7...", name: "Done",        color: "green"  }
//   ]}

// Now write createObject with confidence — pass the EXISTING tag name
// and the helper resolves it to the right key:
anytypeHelper.createObject("project", { name: "My App", status: "In Progress" });
```

**Use when:**
- You're about to write `createObject` against a type you didn't create in this session
- You need to know what valid `select`/`multi_select` values exist
- You want a count + sample of existing objects of a type

**Skip when:**
- You just called `createType` yourself in this session — you already know the schema
- You only need to read objects (just call `getObjects(typeKey)` directly)

---

### getObjectsByTag(typeKey, propKey, tagKey) [getter]

Filter objects of a given type to those that have a specific tag key on a multi_select property. Client-side filter (calls `getObjects(typeKey)` then filters).

**Input:**
- `typeKey` (string) — type key to filter by
- `propKey` (string) — property key of the multi_select property (e.g. `"tag"`, `"categories"`)
- `tagKey` (string) — the tag **KEY** to filter by (e.g. `"action"`, not `"Action"`)

**Output:** Array of partial objects (same as `getObjects`) that have `tagKey` in their `properties[propKey]` array.

**Example:**
```js
var actionMovies = anytypeHelper.getObjectsByTag("movie", "categories", "action");
// returns all movie objects where obj.categories includes "action"
```

---

### getCollectionObjects(collectionId, viewId?) [getter]

Fetch the objects inside a collection (list). Auto-discovers the first view if `viewId` is not provided.

**Input:**
- `collectionId` (string) — ID of the collection object
- `viewId` (string, optional) — view ID within the collection; defaults to first view

**Output:** Array of **partial objects** (same shape as `getObjects` — no markdown). On failure (bad collection ID, view discovery fails), returns `[]` with `.error` (string) attached to the array.

**Example:**
```js
var items = anytypeHelper.getCollectionObjects(collectionId);
// items.length === 2
// items[0].name === "My Object"

// Error handling:
var bad = anytypeHelper.getCollectionObjects("nonexistent_id");
// bad.length === 0, bad.error === "failed to get list"
```

---

### listTags(propIdOrKey) [getter]

List all tag options for a property. Paginates automatically. Accepts either a property **key** (e.g. `"tag"`) or a property **ID** (e.g. `"bafyrei..."`). When a key is passed, it is resolved to an ID internally via `getProperty()`.

**Input:** `propIdOrKey` (string) — the property **key** (e.g. `"tag"`, `"categories"`) or property **ID** (`"bafyrei..."`).

**Output:** `[{ id: string, key: string, name: string, color: string }]`

On failure, the returned array has an `.error` string property attached: `result.error` (string).

**Example:**
```js
// Using property key (preferred — simpler)
var tags = anytypeHelper.listTags("tag");            // [{ key: "sci_fi", name: "Sci-Fi", color: "blue" }, ...]

// Using property ID (also works)
var prop = anytypeHelper.getProperty("tag");         // { id: "bafyrei...", ... }
var tags = anytypeHelper.listTags(prop.id);          // same result

// Error handling
var bad = anytypeHelper.listTags("nonexistent_key");
// bad.length === 0, bad.error === "Property 'nonexistent_key' not found"
```

---

### addTag(objIdOrPropKey, tagName, tagKey?, color?) [mutator]

Polymorphic on the first argument:

1. **`addTag(objId, tagName, ...)`** — when `objId` is an Anytype object id (looks like `bafy…`, length > 40): create the tag option if it doesn't exist on the built-in `"tag"` multi_select property, then assign it to the object. Idempotent.
2. **`addTag(propertyKey, tagName, ...)`** — when the first arg is any other string (treated as a property key): add a tag option to that select / multi_select property. Doesn't touch any object. Idempotent.

The two forms cover both common use cases — tagging an object, and growing the option list of a select/multi_select property — without requiring a separate method.

**Input:**
- `objIdOrPropKey` (string) — object id (form 1) OR property key (form 2)
- `tagName` (string) — tag display name (e.g. `"Sci-Fi"`)
- `tagKey` (string, optional) — tag key; auto-generated from `tagName` if omitted (lowercased, non-alphanumeric → `_`)
- `color` (string, optional) — default `"blue"`. Options: `grey`, `yellow`, `orange`, `red`, `pink`, `purple`, `blue`, `ice`, `teal`, `lime`

**Output (form 1, object id):**
```js
{
  ok: boolean,
  object: { ... },      // updated object (with markdown if fetched)
  error: string | null,
  tag_key: string       // the actual tag key used (useful when auto-generated)
}
```

**Output (form 2, property key):**
```js
{
  ok: boolean,
  property_key: string, // echo of input
  tag_key: string,      // the actual tag key (existing or newly created)
  created?: boolean,    // true if a new option was created; absent if it already existed
  message?: string,     // present when the option already existed
  error: string | null
}
```

**Example:**
```js
// Form 1 — object tag
var res = anytypeHelper.addTag(objId, "Sci-Fi", undefined, "purple");
// res.tag_key === "sci_fi"
// obj.tag now includes "sci_fi"

// Form 2 — property option
var res2 = anytypeHelper.addTag("status", "To Watch", undefined, "blue");
// res2.tag_key === "to_watch"
// status property now offers "To Watch" as a valid value
```

---

### setTags(objId, propKey, tagKeys) [mutator]

Replace **all** tags on an object's multi_select property with the given tag keys. Non-additive — existing tags are removed.

**Input:**
- `objId` (string) — object ID
- `propKey` (string) — property key of the multi_select property (e.g. `"tag"`, `"categories"`)
- `tagKeys` (string[]) — array of tag **keys** (not display names). Pass `[]` to clear all tags.

**Output:** `{ ok: boolean, id: string, object: { ... } | null, error: string | null }`

**Example:**
```js
// Set exactly two tags (removes any previously set tags)
anytypeHelper.setTags(objId, "tag", ["sci_fi", "classic"]);

// Clear all tags
anytypeHelper.setTags(objId, "tag", []);
```

---

### createCollection(name, emoji?) [mutator]

Create a collection (curated list of objects).

**Input:**
- `name` (string) — display name
- `emoji` (string, optional) — emoji icon, e.g. `"📚"`

**Output:**
```js
{
  ok: boolean,
  object: { id, name, type, properties, ... },
  id: string,           // shortcut: same as object.id
  collection: object,   // alias: same reference as object
  error: object | null
}
```

**Example:**
```js
var res = anytypeHelper.createCollection("My Watchlist", "🎬");
var collectionId = res.id;   // or res.object.id or res.collection.id — all identical
```

---

### addToCollection(collectionId, objectIds) [mutator]

Add objects to a collection in a single API call.

**Input:**
- `collectionId` (string) — collection object ID
- `objectIds` (string | string[]) — object ID or array of object IDs. A single string is wrapped into a one-element array; both forms do one API call.

**Output:**
```js
{
  ok: boolean,
  collectionId: string,       // echo of input collectionId
  objectIds: string[],         // always an array (single-string input gets wrapped)
  error: string | null         // string on failure, null on success
}
```

**Example:**
```js
// Batch — preferred, one round-trip
anytypeHelper.addToCollection(colId, movies.map(function(m){ return m.id; }));

// Single — also fine
anytypeHelper.addToCollection(colId, someObj.id);
```

---

### removeFromCollection(collectionId, objectId) [mutator]

Remove a **single** object from a collection.

**Input:**
- `collectionId` (string) — collection object ID
- `objectId` (string) — **single** object ID to remove (not an array — unlike `addToCollection`)

**Output:**
```js
{
  ok: boolean,
  collectionId: string,       // echo of input collectionId
  objectId: string,            // echo of input objectId
  error: string | null         // string on failure, null on success
}
```

---

### listPrograms() [program]

List all programs in the space (objects of type `anytype_program` that have `__anytype_program_name` set).

**Output:** `[{ id: string, name: string, version: string, title: string }]` — sorted by `name`.

**Error handling:** On API failure, the returned array may have `.error` (string) attached — same pattern as `getObjects()`. On success, `.error` is absent.

---

### getProgram(name, version?) [program]

Fetch a program's source code by name.

**Input:**
- `name` (string) — program identifier
- `version` (string, optional) — defaults to `"v1"`

**Output:**
```js
{
  id: string,
  name: string,
  version: string,
  title: string,          // display name (the object's name field)
  source: string | null,  // extracted JS source code
  markdown: string        // full object markdown
} | null   // null if not found
```

**Error handling:** Returns `null` when no program matches `name@version`. A `console.log` message is emitted for trace visibility: `getProgram: program '<name>@<version>' not found`.

---

### runProgram(name, args?, version?) [program]

Load and execute a program. Client credentials (`apiBaseUrl`, `apiKey`, `spaceId`) are automatically merged into args so the child program can create its own anytypeHelper.

**Input:**
- `name` (string) — program name
- `args` (object, optional) — additional arguments passed to the program's `main(args)`
- `version` (string, optional) — program version (defaults to `"v1"`)

**Output:**
```js
{
  ok: boolean,
  result: any,            // return value of main()
  error: string | null,   // error message string (not object) — null on success
  traces: object,         // fetch traces from the child execution
  program: {
    name: string,
    version: string,
    id: string
  }
}
```

**Example:**
```js
var res = anytypeHelper.runProgram("summarizer", { objectId: "bafyrei..." });
if (res.ok) console.log(res.result);
else console.log(res.error);  // res.error is a string
```

---

### saveProgram(opts) [program]

Save or update a program. Creates if new, updates source if name+version already exists (preserving non-source sections like Tool Description). **Always use this — never `createObject("anytype_program", ...)`.**

**Input:**
- `opts.name` (string, required) — program identifier
- `opts.source` (string, required) — JS source (must contain `export function main(args)`)
- `opts.version` (string, optional) — defaults to `"v1"`
- `opts.title` (string, optional) — display name; defaults to `opts.name`
- `opts.appendMarkdown` (string, optional) — extra markdown to append after the code block (e.g. Tool Description section). Replaces any existing non-code content on each save.

**Output:** `{ ok: boolean, object: { id, name, ... } | null, name: string, version: string, error: string | null }`

On failure, `error` is always a string (e.g. `"name is required"`, `"source is required"`, `"Program properties not found in space"`, or the underlying `createObject`/`updateObject` error string). Never an object.

**Example:**
```js
var res = anytypeHelper.saveProgram({
  name: "fetcher",
  source: 'import { createClient } from "anytypeHelper@v1";\nexport function main(args) { return "ok"; }',
  title: "My Fetcher",
  appendMarkdown: "## Tool Description\nFetches things."
});
// res.name === "fetcher", res.version === "v1"
```

---

### getTools() [program]

Find all objects tagged with `anytype_tool` (the built-in `"tag"` multi_select property must contain `"anytype_tool"`).

**Output:** `[{ id: string, name: string, description: string, programName: string | null, programVersion: string | null }]`

- `description` — from the `description` property or object snippet
- `programName` / `programVersion` — from `__anytype_program_name` / `__anytype_program_version` properties
- `.error` (string | undefined) — set on the returned array if `getObjects()` fails (e.g. network error). Check `tools.error` to distinguish "no tools found" from "failed to list objects".

---

### getToolDescription(toolId) [program]

Extract the `## Tool Description` section from an object's markdown.

**Input:** `toolId` (string) — object ID

**Output:**
```js
{
  tool: { id: string, name: string, programName: string | null, programVersion: string | null },
  description: string   // content of the "Tool Description" section, or "No tool description available."
} | null   // null if object not found
```

---

### getToolSchema(toolId) [program]

Extract the `## Tool Schema` section from an object's markdown.

**Input:** `toolId` (string) — object ID

**Output:**
```js
{
  tool: { id: string, name: string, programName: string | null, programVersion: string | null },
  schema: string   // content of the "Tool Schema" section, or "No tool schema available."
} | null
```

---

### fetchTraceSchema(traceObjectId) [getter]

Extract the `## Trace Schema` section from an object's markdown.

**Output:** `string | null`

---

### fetchTrace(traceObjectId) [getter]

Extract and JSON-parse the `## Trace` section from an object's markdown.

**Output:** parsed object or `null` (if section missing or JSON invalid)

---

### key_concepts [setup]

1. **Properties are GLOBAL** — once a property key is created with a format, that format is locked space-wide. `createType` handles this automatically.
2. **Partial vs Full objects** — `getObjects()` and `search()` return objects **WITHOUT** `markdown`. Call `getObject(id)` to get full content including markdown.
3. **Properties are on the object directly** — `obj.genre`, `obj.rating`, `obj.status`. Same level as `obj.name` and `obj.id`.
4. **select/multi_select values are tag KEYS** — `"in_progress"`, not `"In Progress"`. When writing, you can pass the display name and the helper resolves it. When reading, you always get the key.
5. **`listTags(propIdOrKey)` accepts either a property key or ID** — e.g. `anytypeHelper.listTags("tag")` or `anytypeHelper.listTags(prop.id)`. Key is resolved internally.
6. **`removeFromCollection` takes a single ID** — unlike `addToCollection` which takes an array.
7. **Type deletion is soft** — archived types keep their key reserved forever. You cannot recreate a type with the same key.
8. **Keys are normalized to snake_case** — the API converts all type, property, and tag keys via `toSnake()`. E.g. `"myProp2"` → `"my_prop_2"`, `"CamelCase"` → `"camel_case"`. The helper auto-normalizes keys, but prefer snake_case to avoid surprises. `createType` returns `key_warnings` when normalization occurs. Always use the key from the API response (`result.type.key`) rather than the one you passed in.
