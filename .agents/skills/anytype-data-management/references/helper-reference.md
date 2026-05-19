# Helper Reference

## Sobek JS runtime notes

- No `async` or `await`.
- Use named imports, for example `import { createClient } from "anytypeHelper@v1"`.
- `fetch()` auto-parses JSON responses, but skill workflows should still prefer `anytypeHelper` instead of raw HTTP.
- `console.log()` output is captured in the runtime trace.

## Object model reminders

- `obj.name`: object name
- `obj.id`: object ID
- `obj.type`: object with fields such as `obj.type.name` and `obj.type.key`
- custom properties: exposed as flat top-level fields like `obj.status` or `obj.rating`

`getObjects()` and `search()` return summary objects without `markdown`. Use `getObject(id)` when the body is needed.

## Common built-in types

| Key | Name | Layout | Notes |
| --- | --- | --- | --- |
| `page` | Page | basic | Always available |
| `note` | Note | note | May not exist in new spaces |
| `task` | Task | action | Often absent until created |
| `bookmark` | Bookmark | bookmark | Always available |
| `collection` | Collection | collection | Always available |
| `set` | Query | set | Always available |

Check the actual space before creating or assuming a type.

## Recommended helper methods

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

Auth helpers:

- `requestChallenge({ baseUrl })`
- `solveChallenge({ baseUrl, challenge_id, code })`

## Important Anytype quirks

- Properties are global across the whole space, not local to one type.
- Property keys are normalized to snake_case by the API.
- Select and multi-select reads return tag keys. Writes should use display labels so the helper can resolve or create tags.
- `createType()` may rename requested property keys when an existing global property conflicts on format. Inspect `renamed_properties` and use the renamed keys on later object creation.