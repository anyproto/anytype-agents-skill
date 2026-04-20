// __main_source
/**
 * Anytype API Library for JS programs
 */

const DEFAULT_API_VERSION = "2025-11-08";

// ==================== UTILITY HELPERS ====================

// Properties are now a flat POJO after normalizeObject: { title: "Dune", rating: 9 }
// These helpers are kept for backward compat but just do obj.properties[propKey] || obj[propKey]

export function getProp(obj, propKey) {
  if (!obj) return null;
  if (obj.properties && obj.properties[propKey] !== undefined) return obj.properties[propKey];
  if (obj[propKey] !== undefined) return obj[propKey];
  return null;
}

export function getText(obj, propKey) {
  var val = getProp(obj, propKey);
  return typeof val === "string" ? val : null;
}

export function getNumber(obj, propKey) {
  var val = getProp(obj, propKey);
  return typeof val === "number" ? val : null;
}

export function getCheckbox(obj, propKey) {
  var val = getProp(obj, propKey);
  return typeof val === "boolean" ? val : false;
}

export function getTagKeys(obj, propKey) {
  var val = getProp(obj, propKey);
  if (Array.isArray(val)) return val;
  return [];
}

export function getSelectKey(obj, propKey) {
  var val = getProp(obj, propKey);
  return typeof val === "string" ? val : null;
}

/**
 * Get display name for any object.
 * Note-layout objects have empty `name` — their title is the first line of snippet/body.
 * Falls back to snippet first line, then "Untitled".
 */
export function getDisplayName(obj) {
  if (!obj) return "Untitled";
  if (obj.name) return obj.name;
  if (obj.snippet) {
    var newline = obj.snippet.indexOf("\n");
    return newline !== -1 ? obj.snippet.substring(0, newline) : obj.snippet;
  }
  return "Untitled";
}

/**
 * Extract JavaScript code from markdown code blocks
 * Handles code fences like triple-backtick javascript
 */
export function extractCode(markdown) {
  if (!markdown) return null;

  var fencePatterns = ["\`\`\`javascript", "\`\`\`js", "\`\`\`"];
  var start = -1;
  for (var i = 0; i < fencePatterns.length; i++) {
    start = markdown.indexOf(fencePatterns[i]);
    if (start !== -1) break;
  }
  if (start === -1) return markdown;

  var codeStart = markdown.indexOf("\n", start);
  if (codeStart === -1) return null;
  codeStart += 1;

  var codeEnd = markdown.indexOf("\`\`\`", codeStart);
  if (codeEnd === -1) return markdown.substring(codeStart);

  return markdown.substring(codeStart, codeEnd);
}

/**
 * Extract a section from markdown by heading name
 * Returns content between the heading and the next heading of same or higher level
 */
export function extractMarkdownSection(markdown, sectionName) {
  if (!markdown) return null;

  const lines = markdown.split("\n");
  let capturing = false;
  let captureLevel = 0;
  const captured = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (capturing) {
        // Stop if we hit same or higher level heading
        if (level <= captureLevel) break;
      }

      if (title.toLowerCase() === sectionName.toLowerCase()) {
        capturing = true;
        captureLevel = level;
        continue;
      }
    }

    if (capturing) {
      captured.push(line);
    }
  }

  return captured.length > 0 ? captured.join("\n").trim() : null;
}

export function getAllText(obj, propKey) {
    var val = getProp(obj, propKey);
    return typeof val === "string" ? val : "";
  }

// ==================== SEARCH/REPLACE DIFF (used by client.applyDiff) ====================
// Pure helpers for aider-style search/replace blocks. No client, no fetch — just
// string manipulation. Three escalating match strategies (exact substring,
// normalized line-by-line, head/tail anchor) so the LLM doesn't need pixel-perfect
// SEARCH text.

function _diffNormalize(s) {
  return s.trim()
    .replace(/\\_/g, "_")
    .replace(/\\\*/g, "*")
    .replace(/\\\`/g, "\`")
    .replace(/\\\|/g, "|");
}

function _diffCharOffsetOfLine(lines, lineIdx) {
  var offset = 0;
  for (var i = 0; i < lineIdx && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

function _diffExactMatch(source, search) {
  var first = source.indexOf(search);
  if (first === -1) return { count: 0, start: -1 };
  var second = source.indexOf(search, first + 1);
  if (second !== -1) {
    var count = 2;
    var pos = source.indexOf(search, second + 1);
    while (pos !== -1) { count++; pos = source.indexOf(search, pos + 1); }
    return { count: count, start: first };
  }
  return { count: 1, start: first };
}

function _diffNormalizedLineMatch(source, search) {
  var sourceLines = source.split("\n");
  var searchLines = search.split("\n");
  if (searchLines.length === 0) return { count: 0, charStart: -1, charEnd: -1 };
  var matches = [];
  var windowSize = searchLines.length;
  for (var i = 0; i <= sourceLines.length - windowSize; i++) {
    var match = true;
    for (var j = 0; j < windowSize; j++) {
      if (_diffNormalize(sourceLines[i + j]) !== _diffNormalize(searchLines[j])) {
        match = false; break;
      }
    }
    if (match) matches.push(i);
  }
  if (matches.length === 0) return { count: 0, charStart: -1, charEnd: -1 };
  return {
    count: matches.length,
    charStart: _diffCharOffsetOfLine(sourceLines, matches[0]),
    charEnd: _diffCharOffsetOfLine(sourceLines, matches[0] + windowSize)
  };
}

function _diffAnchorMatch(source, search) {
  var sourceLines = source.split("\n");
  var searchLines = search.split("\n");
  if (searchLines.length < 4) return { count: 0, charStart: -1, charEnd: -1 };
  var headSize = 2, tailSize = 2;
  var spanLength = searchLines.length;
  var headLines = searchLines.slice(0, headSize);
  var tailLines = searchLines.slice(searchLines.length - tailSize);
  var matches = [];
  for (var i = 0; i <= sourceLines.length - spanLength; i++) {
    var headOk = true;
    for (var h = 0; h < headSize; h++) {
      if (_diffNormalize(sourceLines[i + h]) !== _diffNormalize(headLines[h])) { headOk = false; break; }
    }
    if (!headOk) continue;
    var tailStart = i + spanLength - tailSize;
    var tailOk = true;
    for (var t = 0; t < tailSize; t++) {
      if (_diffNormalize(sourceLines[tailStart + t]) !== _diffNormalize(tailLines[t])) { tailOk = false; break; }
    }
    if (tailOk) matches.push(i);
  }
  if (matches.length === 0) return { count: 0, charStart: -1, charEnd: -1 };
  return {
    count: matches.length,
    charStart: _diffCharOffsetOfLine(sourceLines, matches[0]),
    charEnd: _diffCharOffsetOfLine(sourceLines, matches[0] + spanLength)
  };
}

function _diffApplySingleBlock(source, block, blockIndex) {
  var label = "block " + (blockIndex + 1);
  var exact = _diffExactMatch(source, block.search);
  if (exact.count === 1) {
    return {
      ok: true,
      result: source.substring(0, exact.start) + block.replace + source.substring(exact.start + block.search.length)
    };
  }
  if (exact.count > 1) return { ok: false, error: label + ": ambiguous match, " + exact.count + " occurrences" };

  var norm = _diffNormalizedLineMatch(source, block.search);
  if (norm.count === 1) {
    return {
      ok: true,
      result: source.substring(0, norm.charStart) + block.replace + source.substring(norm.charEnd)
    };
  }
  if (norm.count > 1) return { ok: false, error: label + ": ambiguous normalized match, " + norm.count + " occurrences" };

  var anchor = _diffAnchorMatch(source, block.search);
  if (anchor.count === 1) {
    return {
      ok: true,
      result: source.substring(0, anchor.charStart) + block.replace + source.substring(anchor.charEnd)
    };
  }
  if (anchor.count > 1) return { ok: false, error: label + ": ambiguous anchor match, " + anchor.count + " occurrences" };

  var preview = block.search.split("\n").slice(0, 3).join("\n");
  return { ok: false, error: label + ": no match found in source. Search text:\n" + preview };
}

function _diffApplyBlocksToSource(source, blocks) {
  if (!blocks || blocks.length === 0) return { ok: false, error: "No diff blocks" };
  var current = source;
  for (var i = 0; i < blocks.length; i++) {
    var r = _diffApplySingleBlock(current, blocks[i], i);
    if (!r.ok) return r;
    current = r.result;
  }
  return { ok: true, result: current };
}

function _diffStripCodeFence(text) {
  var trimmed = text.trim();
  if (trimmed.indexOf("\`\`\`") === 0) {
    var firstNewline = trimmed.indexOf("\n");
    if (firstNewline === -1) return trimmed;
    var inner = trimmed.substring(firstNewline + 1);
    var lastFence = inner.lastIndexOf("\`\`\`");
    if (lastFence !== -1) inner = inner.substring(0, lastFence);
    return inner;
  }
  return text;
}

function _diffFindDelimiter(text, fromPos, type) {
  var char = type === "SEARCH" ? "<" : ">";
  var lower = type.toLowerCase();
  var patterns = [
    char.repeat(7) + " " + type,
    char.repeat(7) + type,
    char.repeat(7) + " " + lower,
    char.repeat(4) + " " + type
  ];
  var best = -1;
  for (var i = 0; i < patterns.length; i++) {
    var idx = text.indexOf(patterns[i], fromPos);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function _diffFindSeparator(text, fromPos) {
  var lines = text.substring(fromPos).split("\n");
  var offset = fromPos;
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (trimmed.length >= 3 && trimmed.replace(/=/g, "").length === 0) return offset;
    offset += lines[i].length + 1;
  }
  return -1;
}

// Extract aider-style search/replace blocks from LLM output. Public via
// client.parseDiffBlocks. Returns [{search, replace}, ...].
function _parseDiffBlocks(text) {
  if (!text) return [];
  var stripped = _diffStripCodeFence(text);
  var blocks = [];
  var pos = 0;
  while (pos < stripped.length) {
    var searchStart = _diffFindDelimiter(stripped, pos, "SEARCH");
    if (searchStart === -1) break;
    var contentStart = stripped.indexOf("\n", searchStart);
    if (contentStart === -1) break;
    contentStart += 1;
    var sepStart = _diffFindSeparator(stripped, contentStart);
    if (sepStart === -1) break;
    var searchText = stripped.substring(contentStart, sepStart);
    var replaceStart = stripped.indexOf("\n", sepStart);
    if (replaceStart === -1) break;
    replaceStart += 1;
    var replaceEnd = _diffFindDelimiter(stripped, replaceStart, "REPLACE");
    if (replaceEnd === -1) break;
    var replaceText = stripped.substring(replaceStart, replaceEnd);
    if (searchText.length > 0 && searchText[searchText.length - 1] === "\n") searchText = searchText.substring(0, searchText.length - 1);
    if (replaceText.length > 0 && replaceText[replaceText.length - 1] === "\n") replaceText = replaceText.substring(0, replaceText.length - 1);
    blocks.push({ search: searchText, replace: replaceText });
    pos = stripped.indexOf("\n", replaceEnd);
    if (pos === -1) break;
    pos += 1;
  }
  return blocks;
}

export const VALID_COLORS = [
  "grey", "yellow", "orange", "red", "pink",
  "purple", "blue", "ice", "teal", "lime"
];

// ==================== AUTH ====================

/**
 * Request a challenge from Anytype. This triggers a 4-digit code display
 * in the Anytype Desktop app. Returns the challenge_id needed for solveChallenge().
 *
 * @param {object} params
 * @param {string} params.baseUrl      - API base URL (e.g. "http://127.0.0.1:31009")
 * @param {string} [params.appName]    - App name shown in Anytype Desktop (default: "anytype_agent")
 * @param {string} [params.apiVersion] - API version header (default: "2025-11-08")
 * @returns {{ ok: boolean, challenge_id?: string, error?: object }}
 */
export function requestChallenge(params) {
  var baseUrl = params.baseUrl || params.apiBaseUrl;
  var appName = params.appName || "anytype_agent";
  var apiVersion = params.apiVersion || DEFAULT_API_VERSION;

  var res = fetch(baseUrl + "/v1/auth/challenges", {
    method: "POST",
    headers: {
      "Anytype-Version": apiVersion,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ app_name: appName })
  });

  if (!res.ok) {
    return { ok: false, error: res.body || { message: "Challenge request failed with status " + res.status } };
  }

  var challengeId = res.body.challenge_id;
  if (!challengeId) {
    return { ok: false, error: { message: "No challenge_id in response" } };
  }

  return { ok: true, challenge_id: challengeId };
}

/**
 * Solve a challenge with the 4-digit code the user read from Anytype Desktop.
 * Returns an api_key that can be used for all subsequent API calls.
 *
 * @param {object} params
 * @param {string} params.baseUrl       - API base URL
 * @param {string} params.challenge_id  - From requestChallenge()
 * @param {string} params.code          - 4-digit code from Anytype Desktop
 * @param {string} [params.apiVersion]  - API version header (default: "2025-11-08")
 * @returns {{ ok: boolean, api_key?: string, error?: object }}
 */
export function solveChallenge(params) {
  var baseUrl = params.baseUrl || params.apiBaseUrl;
  var apiVersion = params.apiVersion || DEFAULT_API_VERSION;

  var headers = {
    "Anytype-Version": apiVersion,
    "Content-Type": "application/json"
  };

  var tokenRes = fetch(baseUrl + "/v1/auth/api_keys", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ challenge_id: params.challenge_id, code: params.code })
  });

  if (!tokenRes.ok) {
    return { ok: false, error: tokenRes.body || { message: "Auth failed with status " + tokenRes.status } };
  }

  var apiKey = tokenRes.body.api_key;
  if (!apiKey) {
    return { ok: false, error: { message: "No api_key in response" } };
  }

  return { ok: true, api_key: apiKey };
}

/**
 * List spaces accessible with the given api_key.
 * Useful after authenticate() to discover available space IDs.
 */
export function listSpaces(params) {
  var baseUrl = params.baseUrl || params.apiBaseUrl;
  var apiVersion = params.apiVersion || DEFAULT_API_VERSION;

  var res = fetch(baseUrl + "/v1/spaces", {
    method: "GET",
    headers: {
      "Anytype-Version": apiVersion,
      "Authorization": "Bearer " + params.api_key
    }
  });

  if (!res.ok) {
    return { ok: false, error: res.body || { message: "Failed to list spaces: " + res.status } };
  }

  return { ok: true, spaces: res.body.data || [] };
}

// ==================== KEY NORMALIZATION ====================

// Replicate Go strcase.ToSnake() used by the Anytype API for key normalization.
// The API normalizes all type, property, and tag keys through this transformation.
// E.g. "myProp2" → "my_prop_2", "CamelCase" → "camel_case", "HTMLParser" → "html_parser"
function toSnake(s) {
  if (!s) return s;
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
  s = s.replace(/([a-z])([A-Z])/g, "$1_$2");
  s = s.replace(/([a-zA-Z])(\d)/g, "$1_$2");
  s = s.replace(/(\d)([a-zA-Z])/g, "$1_$2");
  return s.toLowerCase();
}

// ==================== CLIENT ====================

export function createClient(params = {}) {
  const baseUrl = params.apiBaseUrl || params.baseUrl;
  const spaceId = params.spaceId;
  const apiVersion = params.apiVersion || DEFAULT_API_VERSION;
  const apiKey = params.apiKey;

  const buildQuery = (obj) => {
    const parts = [];
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null) {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]));
      }
    }
    return parts.length > 0 ? "?" + parts.join("&") : "";
  };

  const api = (method, path, body) => {
    const opts = {
      method,
      headers: {
        "Anytype-Version": apiVersion,
        "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = fetch(baseUrl + path, opts);
    var data = res.body;
    // Normalize data: if body came back as a JSON string, try to parse it
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch(e) { /* leave as string */ }
    }
    var error = null;
    if (!res.ok) {
      error = (data && data.message) || ("HTTP " + res.status);
    }
    return { ok: res.ok, status: res.status, data: data, error: error };
  };

  // Helper for downstream methods to extract a human-readable error string
  // from an api() result. Use when a method wraps api() and needs to propagate
  // the error in a consistent format.
  const _extractError = (apiResult) => {
    if (typeof apiResult.error === "string") return apiResult.error;
    if (apiResult.data && apiResult.data.message) return apiResult.data.message;
    return "Unknown error (HTTP " + apiResult.status + ")";
  };

  const spacePath = `/v1/spaces/${spaceId}`;

  // ==================== LOCAL FUNCTIONS (for internal use) ====================

  // Normalize object name: Notes (layout="note") have empty name — their title
  // is the first line of the body, visible in the snippet field.
  // Reverse Anytype's markdown export escaping on text outside code blocks.
  // Export adds: _ → \_, * → \*, ` → \`, | → \|
  // Also adds trailing spaces and extra newlines before closing ``` in code blocks.
  function unescapeMarkdown(md) {
    if (!md) return md;
    var result = "";
    var pos = 0;
    while (pos < md.length) {
      var codeStart = md.indexOf("```", pos);
      if (codeStart === -1) {
        result += unescapeText(md.substring(pos));
        break;
      }
      result += unescapeText(md.substring(pos, codeStart));
      var codeEnd = md.indexOf("```", codeStart + 3);
      if (codeEnd === -1) {
        result += md.substring(codeStart);
        break;
      }
      // Copy code block verbatim, but trim trailing newlines before closing ```
      var blockContent = md.substring(codeStart, codeEnd);
      blockContent = blockContent.replace(/\n+$/, "\n");
      result += blockContent + "```";
      pos = codeEnd + 3;
    }
    return result;
  }

  function unescapeText(text) {
    text = text.replace(/\\_/g, "_");
    text = text.replace(/\\\*/g, "*");
    text = text.replace(/\\`/g, "`");
    text = text.replace(/\\\|/g, "|");
    // Remove trailing spaces Anytype adds to lines
    text = text.replace(/ +\n/g, "\n");
    text = text.replace(/ +$/g, "");
    // Anytype drops blank lines before --- in its roundtrip. Without a blank line,
    // a text line followed by --- is parsed as a Setext h2 heading on re-send.
    // Restore the blank line so --- is treated as a horizontal rule.
    text = text.replace(/([^\n])\n([ \t]*---+[ \t]*)\n/g, "$1\n\n$2\n");
    return text;
  }

  // Cache: per-client closure, maps object ID → display name. Populated lazily
  // by _resolveRef. Holds only strings; tiny memory footprint even on big runs.
  var _refCache = {};

  // Resolve an object-reference ID to its display name. Used by normalizeObject
  // when flattening `objects`-format property values so the LLM sees names
  // (e.g. "Anatolii") instead of bafyrei… IDs. Uses raw api() rather than
  // getObject() to avoid re-entering normalizeObject (and thus recursion).
  function _resolveRef(id) {
    if (_refCache.hasOwnProperty(id)) return _refCache[id];
    var res = api("GET", spacePath + "/objects/" + id);
    var name = null;
    if (res && res.ok && res.data && res.data.object) {
      var raw = res.data.object;
      name = raw.name || (raw.snippet ? raw.snippet.split("\n")[0] : "") || "Untitled";
    }
    _refCache[id] = name;
    return name;
  }

  // Fields on the normalized object that are sacred — a property with a
  // colliding `key` does NOT overwrite them.
  var _RESERVED_TOP_LEVEL = {
    id: 1, name: 1, type: 1, markdown: 1, snippet: 1,
    archived: 1, icon: 1, object: 1, layout: 1
  };

  function normalizeObject(obj, opts) {
    if (!obj) return obj;
    // opts.resolveRefs === false keeps objects-format property values as raw
    // ID arrays instead of mapping them through _resolveRef. Internal lookups
    // that follow ref-links (e.g. memory anchor → chat history) need IDs.
    var resolveRefs = !(opts && opts.resolveRefs === false);
    if (!obj.name && obj.snippet) {
      var newline = obj.snippet.indexOf("\n");
      obj.name = newline !== -1 ? obj.snippet.substring(0, newline) : obj.snippet;
    }
    if (obj.markdown) {
      obj.markdown = unescapeMarkdown(obj.markdown);
    }
    // Flatten obj.type from the full schema object down to just its display name.
    if (obj.type && typeof obj.type === "object" && obj.type.name) {
      obj.type = obj.type.name;
    }
    // space_id is noise for the LLM — the helper's closure already knows the space.
    if (obj.hasOwnProperty("space_id")) delete obj.space_id;

    // Flatten the raw property array onto obj top-level by p.key. No wrapper.
    if (Array.isArray(obj.properties)) {
      for (var i = 0; i < obj.properties.length; i++) {
        var p = obj.properties[i];
        if (!p || !p.key) continue;
        if (_RESERVED_TOP_LEVEL.hasOwnProperty(p.key)) continue;
        var val = null;
        if (p.text !== undefined && p.text !== null) val = p.text;
        else if (p.number !== undefined && p.number !== null) val = p.number;
        else if (p.checkbox !== undefined) val = !!p.checkbox;
        else if (p.select) val = p.select.key || p.select;
        else if (p.multi_select) {
          val = [];
          for (var j = 0; j < p.multi_select.length; j++) {
            val.push(p.multi_select[j].key || p.multi_select[j]);
          }
        }
        else if (p.objects) {
          if (resolveRefs) {
            val = [];
            for (var oi = 0; oi < p.objects.length; oi++) {
              val.push(_resolveRef(p.objects[oi]));
            }
          } else {
            val = p.objects.slice();
          }
        }
        else if (p.date) val = p.date;
        else if (p.url) val = p.url;
        else if (p.email) val = p.email;
        else if (p.phone) val = p.phone;
        obj[p.key] = val;
      }
      delete obj.properties;
    }
    return obj;
  }

  function normalizeObjects(arr, opts) {
    for (var i = 0; i < arr.length; i++) {
      normalizeObject(arr[i], opts);
    }
    return arr;
  }

  function getObjects(typeKey, options) {
    options = options || {};
    var limit = options.limit || 100;
    var offset = options.offset || 0;
    var all = [];
    var total = 0;

    while (true) {
      var params = { offset: offset, limit: limit };
      if (typeKey) params.type = toSnake(typeKey);
      var query = buildQuery(params);
      var res = api("GET", spacePath + "/objects" + query);
      if (!res.ok) {
        all.error = res.error;
        break;
      }
      var page = res.data.data || [];
      var pagination = res.data.pagination || {};
      total = pagination.total || 0;
      normalizeObjects(page, options);
      for (var i = 0; i < page.length; i++) {
        all.push(page[i]);
      }
      if (!pagination.has_more) break;
      offset += page.length;
    }

    var result = all;
    // Attach pagination metadata so callers can access .total
    result.pagination = { total: total };
    return result;
  }

  function getObject(objId, opts) {
    const res = api("GET", spacePath + "/objects/" + objId);
    if (!res.ok) {
      console.log("getObject(" + objId + ") error: " + res.error);
      return null;
    }
    return normalizeObject(res.data.object, opts);
  }

  // Compact LLM-facing shape for a type definition. Drops IDs (type.id and
  // every property's id/object field) — the LLM picks types by `key` and
  // properties by `key`, never by id. properties becomes a flat map
  // { propKey: format } so schema is one line per type.
  function normalizeType(t) {
    if (!t) return t;
    var out = {
      key: t.key,
      name: t.name,
      plural_name: t.plural_name,
      layout: t.layout,
      archived: !!t.archived
    };
    if (t.icon) out.icon = t.icon;
    if (Array.isArray(t.properties)) {
      var propsMap = {};
      for (var i = 0; i < t.properties.length; i++) {
        var p = t.properties[i];
        if (p && p.key) propsMap[p.key] = p.format || "";
      }
      out.properties = propsMap;
    }
    return out;
  }

  function getTypes(opts) {
    const res = api("GET", spacePath + "/types");
    if (!res.ok) {
      var result = [];
      result.error = res.error;
      return result;
    }
    var raw = res.data.data || [];
    // opts.raw === true returns the API shape unchanged (full type objects with
    // properties as an array of {id, key, name, format}). Internal callers that
    // need to follow property IDs or iterate the array form (normalizeProperties,
    // ensureSelectOptions, createType) use this. Default returns the LLM-facing
    // compact shape via normalizeType.
    if (opts && opts.raw) return raw;
    var normalized = [];
    for (var i = 0; i < raw.length; i++) {
      normalized.push(normalizeType(raw[i]));
    }
    return normalized;
  }

  function getProperties() {
    const res = api("GET", spacePath + "/properties");
    if (!res.ok) {
      var result = [];
      result.error = res.error;
      return result;
    }
    return res.data.data || [];
  }

  // Normalize properties to the API-expected array format: [{ key, text/number/checkbox/... }]
  // Accepts three formats LLMs commonly produce:
  //   1. Flat array (correct):  [{ key: "title", text: "Dune" }, { key: "pages", number: 412 }]
  //   2. Object shorthand:      { title: "Dune", pages: 412 }
  //   3. Value-wrapped array:   [{ key: "title", value: { text: "Dune" } }]
  // When typeKey is provided, looks up property formats to disambiguate text vs select/multi_select.
  function normalizeProperties(props, typeKey) {
    if (!props) return undefined;

    // Build property format map from type definition (if typeKey provided).
    // Type keys are normalized by the API via toSnake(), so also try the normalized typeKey.
    var formatMap = null;
    if (typeKey) {
      formatMap = {};
      // raw:true — we need the array-of-property-objects shape with id/format,
      // not the LLM-facing {propKey: format} POJO that getTypes() returns by default.
      var types = getTypes({ raw: true });
      var normalizedTypeKey = toSnake(typeKey);
      for (var ti = 0; ti < types.length; ti++) {
        if ((types[ti].key === typeKey || types[ti].key === normalizedTypeKey) && types[ti].properties) {
          for (var pi = 0; pi < types[ti].properties.length; pi++) {
            var tp = types[ti].properties[pi];
            formatMap[tp.key] = tp.format;
          }
          break;
        }
      }
    }

    // Format 2: plain object { key: value, ... }
    if (!Array.isArray(props) && typeof props === "object") {
      var normalized = [];
      for (var k in props) {
        if (props.hasOwnProperty(k)) {
          var val = props[k];
          // Normalize key to match API's snake_case (e.g. "myProp2" → "my_prop_2")
          var normalizedKey = toSnake(k);
          var entry = { key: normalizedKey };
          var fmt = formatMap ? (formatMap[normalizedKey] || formatMap[k]) : null;
          if (typeof val === "number") {
            entry.number = val;
          } else if (typeof val === "boolean") {
            entry.checkbox = val;
          } else if (typeof val === "string") {
            // Use type format to decide: select → select, multi_select → multi_select, else text
            if (fmt === "select") {
              entry.select = val;
            } else if (fmt === "multi_select") {
              entry.multi_select = [val];
            } else {
              entry.text = val;
            }
          } else if (Array.isArray(val)) {
            // Use format map to distinguish objects from multi_select
            if (fmt === "objects") {
              entry.objects = val;
            } else {
              entry.multi_select = val;
            }
          } else if (val && typeof val === "object") {
            // Pass through as-is (e.g. { select: { key: "..." } })
            for (var vk in val) {
              if (val.hasOwnProperty(vk)) entry[vk] = val[vk];
            }
          }
          normalized.push(entry);
        }
      }
      return normalized;
    }

    // Format 1 or 3: array
    if (Array.isArray(props)) {
      var result = [];
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        // Format 3: { key: "title", value: { text: "Dune" } } → flatten
        if (p.key && p.value && typeof p.value === "object") {
          var flat = { key: p.key };
          if (p.name) flat.name = p.name;
          for (var vk in p.value) {
            if (p.value.hasOwnProperty(vk)) flat[vk] = p.value[vk];
          }
          result.push(flat);
        } else {
          result.push(p);
        }
      }
      return result;
    }

    return props;
  }

  // Ensure select/multi_select option tags exist on properties before creating/updating an object.
  // Scans normalized properties array for select/multi_select values and creates missing tag options.
  function ensureSelectOptions(normalizedProps, typeKey) {
    if (!normalizedProps || !typeKey) return;

    // Build a map of property key → format from the type definition.
    // Normalize typeKey via toSnake() to match API's key normalization.
    // raw:true — need the array form with .format and .id per property.
    var formatMap = {};
    var types = getTypes({ raw: true });
    var normalizedTypeKey = toSnake(typeKey);
    for (var ti = 0; ti < types.length; ti++) {
      if ((types[ti].key === typeKey || types[ti].key === normalizedTypeKey) && types[ti].properties) {
        for (var pi = 0; pi < types[ti].properties.length; pi++) {
          var tp = types[ti].properties[pi];
          formatMap[tp.key] = { format: tp.format, id: tp.id };
        }
        break;
      }
    }

    // Also check space-level properties for IDs (type properties might not have IDs)
    var spaceProps = getProperties();
    var spacePropById = {};
    for (var i = 0; i < spaceProps.length; i++) {
      spacePropById[spaceProps[i].key] = spaceProps[i];
    }

    for (var i = 0; i < normalizedProps.length; i++) {
      var prop = normalizedProps[i];
      var propInfo = formatMap[prop.key] || spacePropById[prop.key];
      if (!propInfo) continue;

      var propId = propInfo.id;
      if (!propId) continue;

      var valuesToEnsure = [];
      if (prop.select && typeof prop.select === "string") {
        valuesToEnsure.push(prop.select);
      }
      if (prop.multi_select && Array.isArray(prop.multi_select)) {
        for (var j = 0; j < prop.multi_select.length; j++) {
          if (typeof prop.multi_select[j] === "string") {
            valuesToEnsure.push(prop.multi_select[j]);
          }
        }
      }

      if (valuesToEnsure.length === 0) continue;

      // Get existing tags for this property
      var existingTags = listTags(propId);
      var existingKeys = {};
      for (var j = 0; j < existingTags.length; j++) {
        existingKeys[existingTags[j].key] = true;
        existingKeys[existingTags[j].name] = true;
      }

      // Build a name→key map from existing tags. We store both an exact-name
      // entry AND a normalized-name entry (lowercased + whitespace-collapsed)
      // so that "in progress", "In Progress", and " In  Progress " all
      // resolve to the same existing tag instead of fragmenting.
      var nameToKey = {};
      var normalizedToKey = {};
      function normalizeTagName(name) {
        if (typeof name !== "string") return "";
        return name.toLowerCase().replace(/\s+/g, " ").trim();
      }
      for (var j = 0; j < existingTags.length; j++) {
        nameToKey[existingTags[j].name] = existingTags[j].key;
        var nrm = normalizeTagName(existingTags[j].name);
        if (nrm) normalizedToKey[nrm] = existingTags[j].key;
      }

      function resolveTagValue(val) {
        // Returns existing key if val matches an existing tag (by key, exact
        // name, or normalized name), null otherwise.
        if (existingKeys[val]) {
          // val is already a key, or matches an exact name → look up the key
          return nameToKey[val] || val;
        }
        var nrm = normalizeTagName(val);
        if (nrm && normalizedToKey[nrm]) return normalizedToKey[nrm];
        return null;
      }

      for (var j = 0; j < valuesToEnsure.length; j++) {
        var val = valuesToEnsure[j];
        var resolved = resolveTagValue(val);
        if (resolved === null) {
          // Don't pass explicit key — let the API generate/reuse it.
          // Passing key causes global collisions across properties.
          var tagResult = createTag(propId, val, "grey");
          if (tagResult.ok && tagResult.tag) {
            nameToKey[val] = tagResult.tag.key;
            var newNrm = normalizeTagName(val);
            if (newNrm) normalizedToKey[newNrm] = tagResult.tag.key;
            existingKeys[val] = true;
            existingKeys[tagResult.tag.key] = true;
          }
        }
      }

      // Rewrite prop.select / prop.multi_select values: resolve each value to
      // the existing tag key (via exact OR normalized name match) if possible.
      if (prop.select && typeof prop.select === "string") {
        var r = resolveTagValue(prop.select);
        if (r) prop.select = r;
      }
      if (prop.multi_select && Array.isArray(prop.multi_select)) {
        for (var j = 0; j < prop.multi_select.length; j++) {
          if (typeof prop.multi_select[j] === "string") {
            var r2 = resolveTagValue(prop.multi_select[j]);
            if (r2) prop.multi_select[j] = r2;
          }
        }
      }
    }
  }

  // Auto-detect icon format from payload shape so callers don't need to specify it.
  // { emoji: "⭐" } → { format: "emoji", emoji: "⭐" }
  // { name: "star", color: "blue" } → { format: "icon", name: "star", color: "blue" }
  // { file: "bafy..." } → { format: "file", file: "bafy..." }
  // Already has format → pass through unchanged.
  // String shorthand: "⭐" → { format: "emoji", emoji: "⭐" }
  function normalizeIcon(icon) {
    if (!icon) return icon;
    if (typeof icon === "string") return { format: "emoji", emoji: icon };
    if (icon.format) return icon;
    if (icon.emoji) return Object.assign({ format: "emoji" }, icon);
    if (icon.file) return Object.assign({ format: "file" }, icon);
    if (icon.name) return Object.assign({ format: "icon" }, icon);
    return icon;
  }

  function createObject(typeKey, data) {
    data = data || {};

    // Extract top-level property fields that LLMs pass outside of data.properties.
    // Known data fields are: name, body, markdown, icon, properties, tags, template_id.
    // Anything else is assumed to be a property value.
    var KNOWN_FIELDS = { name: 1, body: 1, markdown: 1, icon: 1, properties: 1, tags: 1, template_id: 1 };
    var extraProps = null;
    for (var k in data) {
      if (data.hasOwnProperty(k) && !KNOWN_FIELDS[k]) {
        if (!extraProps) extraProps = {};
        extraProps[k] = data[k];
      }
    }
    if (extraProps) {
      // Merge extra props into data.properties (object shorthand format)
      if (!data.properties) {
        data.properties = extraProps;
      } else if (!Array.isArray(data.properties) && typeof data.properties === "object") {
        // Both are objects — merge
        for (var k in extraProps) {
          if (extraProps.hasOwnProperty(k) && !data.properties.hasOwnProperty(k)) {
            data.properties[k] = extraProps[k];
          }
        }
      }
      // If data.properties is already an array, skip — can't merge cleanly
    }

    // Normalize type key to match API's snake_case convention
    var normalizedTypeKey = toSnake(typeKey);
    const reqBody = { type_key: normalizedTypeKey };
    if (data.name) reqBody.name = data.name;
    if (data.icon) reqBody.icon = normalizeIcon(data.icon);
    // POST uses "body" field, not "markdown"
    if (data.markdown) reqBody.body = data.markdown;
    if (data.body) reqBody.body = data.body;
    if (data.properties) reqBody.properties = normalizeProperties(data.properties, typeKey);
    if (data.template_id) reqBody.template_id = data.template_id;

    // Auto-create select/multi_select option tags before creating the object
    if (reqBody.properties) ensureSelectOptions(reqBody.properties, typeKey);

    const res = api("POST", spacePath + "/objects", reqBody);
    var result = { ok: res.ok, object: res.ok ? normalizeObject(res.data.object) : null, error: res.ok ? null : res.error };
    if (result.ok && result.object) {
      result.id = result.object.id;
    }

    // Inline tag support: data.tags = ["sci-fi", "classic"] or data.tags = [{ name: "sci-fi", color: "blue" }]
    if (result.ok && result.object && data.tags) {
      var tags = data.tags;
      var tagResults = [];
      for (var i = 0; i < tags.length; i++) {
        var t = tags[i];
        if (!t) continue; // skip null/undefined
        var tagName = (typeof t === "string") ? t : (t && t.name);
        if (!tagName) continue; // skip invalid entries
        var tagColor = (typeof t === "string") ? "blue" : (t.color || "blue");
        var tagKey = (typeof t === "string") ? undefined : t.key;
        var tagRes = addTag(result.object.id, tagName, tagKey, tagColor);
        tagResults.push(tagRes);
      }
      if (tagResults.length > 0) {
        // Trim each tag_result to just the useful fields — addTag returns the
        // full updated object with every tag added, which is a ~500-char blob
        // repeated per tag. The caller already has result.object from the
        // initial createObject response; re-emitting it N times is noise.
        var trimmedTagResults = [];
        for (var tri = 0; tri < tagResults.length; tri++) {
          var tr = tagResults[tri];
          trimmedTagResults.push({
            ok: !!tr.ok,
            tag_key: tr.tag_key || null,
            error: tr.error || null
          });
        }
        result.tag_results = trimmedTagResults;
        var tagWarnings = [];
        for (var i = 0; i < tagResults.length; i++) {
          if (!tagResults[i].ok) {
            tagWarnings.push((tagResults[i].error && tagResults[i].error.message) || "unknown tag error");
          }
        }
        if (tagWarnings.length > 0) {
          result.tag_warnings = tagWarnings;
        }
      }
    }

    return result;
  }

  function updateObject(objId, data) {
    // PATCH uses "markdown" field, not "body" — normalize for consistency with createObject
    if (data && data.body && !data.markdown) {
      data = Object.assign({}, data);
      data.markdown = data.body;
      delete data.body;
    }

    // Normalize icon format (same as createObject)
    if (data && data.icon) {
      data = Object.assign({}, data);
      data.icon = normalizeIcon(data.icon);
    }

    // Extract top-level property fields (same as createObject)
    if (data) {
      var UPDATE_KNOWN_FIELDS = { name: 1, body: 1, markdown: 1, icon: 1, properties: 1, tags: 1, template_id: 1, typeKey: 1 };
      var extraProps = null;
      for (var k in data) {
        if (data.hasOwnProperty(k) && !UPDATE_KNOWN_FIELDS[k]) {
          if (!extraProps) extraProps = {};
          extraProps[k] = data[k];
        }
      }
      if (extraProps) {
        data = Object.assign({}, data);
        if (!data.properties) {
          data.properties = extraProps;
        } else if (!Array.isArray(data.properties) && typeof data.properties === "object") {
          for (var k in extraProps) {
            if (extraProps.hasOwnProperty(k) && !data.properties.hasOwnProperty(k)) {
              data.properties[k] = extraProps[k];
            }
          }
        }
      }
    }

    if (data && data.properties) {
      data = Object.assign({}, data);
      // Resolve typeKey for format-aware normalization:
      // 1. Caller can pass typeKey explicitly in data
      // 2. Otherwise, fetch the object to get its type key
      var typeKey = data.typeKey || null;
      if (!typeKey) {
        var obj = getObject(objId);
        if (obj && obj.type) typeKey = obj.type.key || null;
      }
      if (typeKey) delete data.typeKey; // don't send to API
      data.properties = normalizeProperties(data.properties, typeKey);
      // Auto-create select/multi_select option tags before updating
      if (typeKey) ensureSelectOptions(data.properties, typeKey);
    }
    const res = api("PATCH", spacePath + "/objects/" + objId, data);
    return { ok: res.ok, id: objId, object: res.ok ? normalizeObject(res.data.object) : null, error: res.ok ? null : res.error };
  }

  function deleteObject(objId) {
    const res = api("DELETE", spacePath + "/objects/" + objId);
    return { ok: res.ok, id: objId, error: res.ok ? null : res.error };
  }

  function appendToObject(objId, text) {
    var obj = getObject(objId);
    if (!obj) {
      return { ok: false, id: objId, object: null, error: "Object not found: " + objId };
    }
    var current = obj.markdown || "";
    var updated = current ? current + "\n" + text : text;
    return updateObject(objId, { markdown: updated });
  }

  // Surgical edit of an object's markdown via aider-style search/replace blocks.
  // Accepts either a parsed array of {search, replace} blocks OR raw LLM text
  // containing <<<<<<< SEARCH / ======= / >>>>>>> REPLACE delimiters.
  // Three escalating match strategies (exact substring, normalized line-by-line,
  // 2-line head/tail anchor) so the search text doesn't need to be byte-perfect.
  function applyDiff(objId, blocksOrText) {
    var blocks;
    if (Array.isArray(blocksOrText)) {
      blocks = blocksOrText;
    } else if (typeof blocksOrText === "string") {
      blocks = _parseDiffBlocks(blocksOrText);
      if (blocks.length === 0) {
        return { ok: false, id: objId, error: "No diff blocks parsed from text — expected <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format" };
      }
    } else {
      return { ok: false, id: objId, error: "applyDiff: blocksOrText must be Array or String" };
    }
    var obj = getObject(objId);
    if (!obj) return { ok: false, id: objId, error: "Object not found: " + objId };
    var oldMarkdown = obj.markdown || "";
    var applied = _diffApplyBlocksToSource(oldMarkdown, blocks);
    if (!applied.ok) {
      return { ok: false, id: objId, error: applied.error, lengthBefore: oldMarkdown.length };
    }
    var upd = updateObject(objId, { markdown: applied.result });
    if (!upd.ok) return { ok: false, id: objId, error: "updateObject failed: " + upd.error };
    return {
      ok: true,
      id: objId,
      blocksApplied: blocks.length,
      lengthBefore: oldMarkdown.length,
      lengthAfter: applied.result.length
    };
  }

  // Parse aider-style search/replace blocks from raw LLM text. Pure helper —
  // useful when you want to inspect/transform blocks before calling applyDiff.
  function parseDiffBlocks(text) {
    return _parseDiffBlocks(text);
  }

  function search() {
    // Accept multiple queries: search("q1", "q2") or search({query:"q1"}, {query:"q2"})
    // Single query still works: search("q1") or search({query:"q1"})
    var queries = [];
    for (var i = 0; i < arguments.length; i++) {
      var q = arguments[i];
      if (typeof q === "string") {
        queries.push({ query: q });
      } else {
        queries.push(q);
      }
    }
    if (queries.length === 0) {
      queries.push({});
    }

    var seen = {};
    var combined = [];
    var errors = [];
    var totalSum = 0;

    for (var qi = 0; qi < queries.length; qi++) {
      var query = queries[qi];
      // Normalize type keys in the types filter
      if (query.types && Array.isArray(query.types)) {
        query.types = query.types.map(function(t) { return toSnake(t); });
      }
      var res = api("POST", spacePath + "/search", query);
      if (!res.ok) {
        errors.push(res.error);
        continue;
      }
      var objects = normalizeObjects(res.data.data || []);
      var pagination = res.data.pagination || { total: objects.length };
      totalSum += pagination.total;
      for (var oi = 0; oi < objects.length; oi++) {
        if (!seen[objects[oi].id]) {
          seen[objects[oi].id] = true;
          combined.push(objects[oi]);
        }
      }
    }

    // Unify text field: vector results use matched_chunk.text, FTS results use snippet
    for (var ti = 0; ti < combined.length; ti++) {
      var obj = combined[ti];
      if (obj.matched_chunk && obj.matched_chunk.text) {
        obj.text = obj.matched_chunk.text;
      } else if (obj.snippet) {
        obj.text = obj.snippet;
      } else {
        obj.text = "";
      }
    }

    // Cap at 10 results
    var result = combined.length > 10 ? combined.slice(0, 10) : combined;
    if (errors.length > 0) {
      result.error = errors.join("; ");
    }
    return result;
  }

  function getProperty(propKey) {
    const props = getProperties();
    for (var i = 0; i < props.length; i++) {
      if (props[i].key === propKey) return props[i];
    }
    return null;
  }

  // describeType bundles type metadata + property formats + existing
  // select/multi_select tag values + an object count + one sample object
  // into a single comprehensive response. Use this BEFORE writing
  // createObject for any existing type — especially built-in or
  // pre-configured types — to avoid trial-and-error discovery of valid
  // tag keys and property names.
  //
  // Anytype quirk: properties are SPACE-GLOBAL, not type-bound. A type's
  // `properties` array only lists properties registered at createType time,
  // but objects of that type may have any global property set. So we ALSO
  // look at the sample object's actual fields and surface any property
  // present there that wasn't in the type's registered list — flagged with
  // `inferred_from_sample: true`.
  function describeType(typeKey) {
    const allTypes = getTypes();
    if (allTypes.error) return null;
    var matched = null;
    for (var ti = 0; ti < allTypes.length; ti++) {
      if (allTypes[ti].key === typeKey) { matched = allTypes[ti]; break; }
    }
    if (!matched) return null;

    // Pre-fetch global properties so we can look up format for sample-only fields
    const allGlobalProps = getProperties();
    const globalByKey = {};
    if (allGlobalProps && !allGlobalProps.error) {
      for (var gpi = 0; gpi < allGlobalProps.length; gpi++) {
        globalByKey[allGlobalProps[gpi].key] = allGlobalProps[gpi];
      }
    }

    function buildPropEntry(p, fromSample) {
      const entry = { key: p.key, name: p.name, format: p.format };
      if (fromSample) entry.inferred_from_sample = true;
      if (p.format === "select" || p.format === "multi_select") {
        const tags = listTags(p.key);
        if (tags && !tags.error) {
          const tagSummaries = [];
          for (var tagI = 0; tagI < tags.length; tagI++) {
            tagSummaries.push({
              key: tags[tagI].key,
              name: tags[tagI].name,
              color: tags[tagI].color,
              id: tags[tagI].id
            });
          }
          entry.existing_tags = tagSummaries;
        } else {
          entry.existing_tags = [];
          if (tags && tags.error) entry.existing_tags_error = tags.error;
        }
      }
      return entry;
    }

    const props = [];
    const seenKeys = {};
    const typeProps = matched.properties || [];
    for (var pi = 0; pi < typeProps.length; pi++) {
      props.push(buildPropEntry(typeProps[pi], false));
      seenKeys[typeProps[pi].key] = true;
    }

    // Fetch sample object + count
    const objs = getObjects(typeKey, { limit: 1 });
    const objCount = (objs && objs.pagination) ? objs.pagination.total : (objs ? objs.length : 0);
    const sample = (objs && objs.length > 0 && !objs.error) ? objs[0] : null;

    // Look at the sample for properties not in the type's registered list.
    // Anytype objects expose properties as flat top-level fields plus an
    // optional .properties dict. We check both. Skip system fields and
    // anything that's already in seenKeys.
    if (sample) {
      const SYSTEM_FIELDS = {
        id: 1, name: 1, type: 1, layout: 1, archived: 1, snippet: 1,
        markdown: 1, icon: 1, space_id: 1, object: 1, properties: 1
      };
      const candidates = [];
      // Top-level fields
      for (var sk in sample) {
        if (SYSTEM_FIELDS[sk]) continue;
        if (seenKeys[sk]) continue;
        candidates.push(sk);
      }
      // .properties dict (some objects expose properties here too)
      if (sample.properties && typeof sample.properties === "object") {
        for (var pk in sample.properties) {
          if (SYSTEM_FIELDS[pk]) continue;
          if (seenKeys[pk]) continue;
          // dedup
          var already = false;
          for (var cdi = 0; cdi < candidates.length; cdi++) {
            if (candidates[cdi] === pk) { already = true; break; }
          }
          if (!already) candidates.push(pk);
        }
      }

      for (var ci = 0; ci < candidates.length; ci++) {
        var k = candidates[ci];
        var globalProp = globalByKey[k];
        if (!globalProp) continue;  // not a real property; probably a system field we missed
        // Skip object/file/relation formats — focus on data properties relevant for createObject
        if (globalProp.format === "objects" || globalProp.format === "object") continue;
        props.push(buildPropEntry(globalProp, true));
        seenKeys[k] = true;
      }
    }

    return {
      type: {
        key: matched.key,
        name: matched.name,
        layout: matched.layout,
        plural_name: matched.plural_name,
        icon: matched.icon,
        archived: matched.archived,
        id: matched.id
      },
      properties: props,
      object_count: objCount,
      sample: sample
    };
  }

  function getCollectionObjects(collectionId, viewId) {
    if (!viewId) {
      const viewsRes = api("GET", spacePath + "/lists/" + collectionId + "/views");
      if (!viewsRes.ok || !viewsRes.data.data || viewsRes.data.data.length === 0) {
        var empty = [];
        empty.error = viewsRes.error || "failed to discover views for collection " + collectionId;
        return empty;
      }
      viewId = viewsRes.data.data[0].id;
    }
    const res = api("GET", spacePath + "/lists/" + collectionId + "/views/" + viewId + "/objects");
    if (!res.ok) {
      var empty = [];
      empty.error = res.error;
      return empty;
    }
    return normalizeObjects(res.data.data || []);
  }

  function getObjectsByTag(typeKey, propKey, tagKey) {
    const objects = getObjects(typeKey);
    const result = [];
    for (var i = 0; i < objects.length; i++) {
      const tags = getTagKeys(objects[i], propKey);
      for (var j = 0; j < tags.length; j++) {
        if (tags[j] === tagKey) {
          result.push(objects[i]);
          break;
        }
      }
    }
    return result;
  }

  function getTools() {
    const objects = getObjects("anytype_program");
    const tools = [];
    if (objects.error) tools.error = objects.error;

    for (var i = 0; i < objects.length; i++) {
      const obj = objects[i];
      var tags = getProp(obj, "tag");
      if (!Array.isArray(tags)) continue;

      var hasToolTag = false;
      for (var j = 0; j < tags.length; j++) {
        if (tags[j] === "anytype_tool") {
          hasToolTag = true;
          break;
        }
      }

      if (hasToolTag) {
        tools.push({
          id: obj.id,
          name: obj.name,
          description: getAllText(obj, "description") || obj.snippet || "",
          programName: obj.__anytype_program_name || obj.name,
          programVersion: obj.__anytype_program_version || "v1"
        });
      }
    }

    return tools;
  }

  function getToolDescription(toolId) {
    const obj = getObject(toolId);
    if (!obj) return null;

    const description = extractMarkdownSection(obj.markdown, "Tool Description");

    return {
      tool: {
        id: obj.id,
        name: obj.name,
        programName: obj.__anytype_program_name,
        programVersion: obj.__anytype_program_version
      },
      description: description || "No tool description available."
    };
  }

  function getToolSchema(toolId) {
    const obj = getObject(toolId);
    if (!obj) return null;

    const schema = extractMarkdownSection(obj.markdown, "Tool Schema");

    return {
      tool: {
        id: obj.id,
        name: obj.name,
        programName: obj.__anytype_program_name,
        programVersion: obj.__anytype_program_version
      },
      schema: schema || "No tool schema available."
    };
  }

  // ==================== PROGRAMS ====================

  // Internal: scan all program objects once, return array of { id, name, version, title, obj }
  function _scanPrograms() {
    var objects = getObjects("anytype_program");
    var programs = [];
    if (objects.error) programs.error = objects.error;
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      programs.push({
        id: obj.id,
        name: obj.__anytype_program_name || obj.name,
        version: obj.__anytype_program_version || "v1",
        title: obj.name,
        obj: obj
      });
    }
    return programs;
  }

  // Internal: find program property keys in the space, creating the type if needed
  function _programPropKeys() {
    var allProps = getProperties();
    var nameKey = null, versionKey = null;
    for (var i = 0; i < allProps.length; i++) {
      if (allProps[i].name === "__anytype_program_name") nameKey = allProps[i].key;
      if (allProps[i].name === "__anytype_program_version") versionKey = allProps[i].key;
    }
    if (nameKey && versionKey) return { nameKey: nameKey, versionKey: versionKey };

    // Bootstrap: create anytype_program type with required properties
    var typeRes = createType({
      key: "anytype_program",
      name: "Program",
      plural_name: "Programs",
      icon: { name: "code-slash", color: "teal" },
      properties: [
        { key: "__anytype_program_name", format: "text" },
        { key: "__anytype_program_version", format: "text" }
      ]
    });
    if (!typeRes.ok) return { nameKey: null, versionKey: null };

    // Re-scan properties after creation
    allProps = getProperties();
    for (var i = 0; i < allProps.length; i++) {
      if (allProps[i].name === "__anytype_program_name") nameKey = allProps[i].key;
      if (allProps[i].name === "__anytype_program_version") versionKey = allProps[i].key;
    }
    return { nameKey: nameKey, versionKey: versionKey };
  }

  function listPrograms() {
    var programs = _scanPrograms();
    // Strip internal obj field from results
    var result = [];
    for (var i = 0; i < programs.length; i++) {
      result.push({ id: programs[i].id, name: programs[i].name, version: programs[i].version, title: programs[i].title });
    }
    // Sort by name
    result.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    // Propagate error from getObjects if present
    if (programs.error) result.error = programs.error;
    return result;
  }

  function getProgram(name, version) {
    version = version || "v1";
    var programs = _scanPrograms();
    for (var i = 0; i < programs.length; i++) {
      if (programs[i].name === name && programs[i].version === version) {
        var full = getObject(programs[i].id);
        if (!full) return null;
        var source = extractCode(full.markdown);
        return { id: programs[i].id, name: name, version: version, title: full.name, source: source, markdown: full.markdown };
      }
    }
    console.log("getProgram: program '" + name + "@" + version + "' not found");
    return null;
  }

  function runProgram(name, args, version) {
    var prog = getProgram(name, version);
    if (!prog || !prog.source) {
      var nameWithVersion = version ? (name + "@" + version) : name;
      return { ok: false, error: "Program '" + nameWithVersion + "' not found. Use client.listPrograms() to see available programs." };
    }
    // Merge client credentials into args so the child runtime can create its own client
    var mergedArgs = {
      apiBaseUrl: baseUrl,
      apiKey: apiKey,
      spaceId: spaceId
    };
    if (args) {
      for (var k in args) {
        if (args.hasOwnProperty(k)) mergedArgs[k] = args[k];
      }
    }
    var evalResult = js.eval(prog.source, mergedArgs);
    return {
      ok: !evalResult.error,
      result: evalResult.result,
      error: evalResult.error || null,
      traces: evalResult.traces,
      program: { name: prog.name, version: prog.version, id: prog.id }
    };
  }

  function saveProgram(opts) {
    // Accept both { name, version } and legacy { programName, programVersion }
    var progName = opts.name || opts.programName;
    var version = opts.version || opts.programVersion || "v1";
    var title = opts.title || progName;

    if (!progName) return { ok: false, error: "name is required" };
    if (!opts.source) return { ok: false, error: "source is required" };

    var keys = _programPropKeys();
    if (!keys.nameKey || !keys.versionKey) {
      return { ok: false, error: "Program properties not found in space" };
    }

    // Check for existing program with same name+version
    var programs = _scanPrograms();
    var existingId = null;
    for (var i = 0; i < programs.length; i++) {
      if (programs[i].name === progName && programs[i].version === version) {
        existingId = programs[i].id;
        break;
      }
    }

    // Wrap source in markdown code block with __main_source marker
    var sourceCode = opts.source;
    if (sourceCode.indexOf("// __main_source") === 0) {
      sourceCode = sourceCode.substring("// __main_source".length);
      if (sourceCode.charAt(0) === "\n") sourceCode = sourceCode.substring(1);
    }
    var codeBlock = "\`\`\`javascript\n// __main_source\n" + sourceCode + "\n\`\`\`";

    var result;
    if (existingId) {
      // Update existing.
      // If appendMarkdown is provided, the caller owns the full non-code content —
      // rebuild from scratch to avoid duplicating sections on each redeploy.
      // Otherwise preserve existing non-code sections (Tool Description, Schema, etc.).
      var markdown;
      if (opts.appendMarkdown) {
        markdown = codeBlock + "\n\n" + opts.appendMarkdown;
      } else {
        var fullObj = getObject(existingId);
        markdown = _replaceCodeBlock(fullObj ? fullObj.markdown : null, codeBlock);
      }

      result = updateObject(existingId, {
        name: title,
        markdown: markdown,
        properties: [
          { key: keys.nameKey, text: progName },
          { key: keys.versionKey, text: version }
        ]
      });
    } else {
      // Create new
      var markdown = codeBlock;
      if (opts.appendMarkdown) markdown += "\n\n" + opts.appendMarkdown;

      result = createObject("anytype_program", {
        name: title,
        markdown: markdown,
        properties: [
          { key: keys.nameKey, text: progName },
          { key: keys.versionKey, text: version }
        ]
      });
    }

    if (!result.ok) return { ok: false, error: result.error };

    return { ok: true, object: result.object, name: progName, version: version };
  }

  // Internal: replace __main_source code block in existing markdown, or return codeBlock if none found
  function _replaceCodeBlock(existingMarkdown, codeBlock) {
    if (!existingMarkdown) return codeBlock;

    var markerIdx = existingMarkdown.indexOf("// __main_source");
    if (markerIdx !== -1) {
      var fenceStart = existingMarkdown.lastIndexOf("\`\`\`", markerIdx);
      var afterMarker = existingMarkdown.indexOf("\`\`\`", markerIdx);
      var fenceEnd = afterMarker !== -1 ? afterMarker + 3 : -1;
      if (fenceStart !== -1 && fenceEnd !== -1) {
        return existingMarkdown.substring(0, fenceStart) + codeBlock + existingMarkdown.substring(fenceEnd);
      }
    }

    // No __main_source marker — find first code block and replace
    var firstFence = existingMarkdown.indexOf("\`\`\`");
    if (firstFence !== -1) {
      var closeFence = existingMarkdown.indexOf("\`\`\`", firstFence + 3);
      if (closeFence !== -1) {
        return existingMarkdown.substring(0, firstFence) + codeBlock + existingMarkdown.substring(closeFence + 3);
      }
    }

    // No code blocks at all — prepend source
    return codeBlock + "\n\n" + existingMarkdown;
  }

  // saveTool — agent-facing function for registering tools.
  // Wraps saveProgram() but requires schema and auto-tags as anytype_tool.
  // opts: { name, source, schema, version?, title? }
  //   schema: markdown string with "## Tool Description" and "## Tool Schema" sections
  function saveTool(opts) {
    if (!opts.name) return { ok: false, error: "name is required" };
    if (!opts.source) return { ok: false, error: "source is required" };
    if (!opts.schema) return { ok: false, error: "schema is required — must contain '## Tool Description' and '## Tool Schema' sections" };

    // Post-check: validate schema structure before saving
    var schemaCheck = _validateToolSchema(opts.schema);
    if (!schemaCheck.ok) return { ok: false, error: "Invalid schema: " + schemaCheck.error };

    // Save as program with schema appended as markdown
    var saveResult = saveProgram({
      name: opts.name,
      source: opts.source,
      version: opts.version || "v1",
      title: opts.title || opts.name,
      appendMarkdown: opts.schema
    });

    if (!saveResult.ok) return saveResult;

    // Auto-tag as anytype_tool
    var tagResult = addTag(saveResult.object.id, "anytype_tool");
    if (!tagResult.ok) {
      console.log("saveTool: warning — saved but failed to add anytype_tool tag: " + tagResult.error);
    }

    return { ok: true, object: saveResult.object, name: saveResult.name, version: saveResult.version };
  }

  // Validate tool schema structure:
  // - "## Tool Description" section exists and is non-empty
  // - "## Tool Schema" section exists with at least one method heading
  // - Method has parameter descriptions (lines starting with "- ")
  function _validateToolSchema(schema) {
    if (!schema || typeof schema !== "string") {
      return { ok: false, error: "schema must be a non-empty string" };
    }

    // Check Tool Description
    var descIdx = schema.indexOf("## Tool Description");
    if (descIdx === -1) {
      return { ok: false, error: "missing '## Tool Description' section" };
    }
    // Check there's non-empty content after the heading
    var descContentStart = schema.indexOf("\n", descIdx);
    if (descContentStart === -1) {
      return { ok: false, error: "'## Tool Description' section is empty" };
    }
    var descContent = schema.substring(descContentStart + 1);
    // Content until next ## heading or end
    var nextHeading = descContent.indexOf("\n## ");
    var descText = nextHeading !== -1 ? descContent.substring(0, nextHeading) : descContent;
    if (descText.trim().length === 0) {
      return { ok: false, error: "'## Tool Description' section is empty" };
    }

    // Check Tool Schema
    var schemaIdx = schema.indexOf("## Tool Schema");
    if (schemaIdx === -1) {
      return { ok: false, error: "missing '## Tool Schema' section" };
    }

    // Check for at least one method heading (### something)
    var schemaContent = schema.substring(schemaIdx);
    var methodMatch = schemaContent.match(/\n### .+/);
    if (!methodMatch) {
      return { ok: false, error: "'## Tool Schema' has no method headings (expected ### methodName)" };
    }

    // Check method has parameter descriptions (at least one "- " line after the method heading)
    var methodStart = schemaContent.indexOf(methodMatch[0]);
    var afterMethod = schemaContent.substring(methodStart + methodMatch[0].length);
    var nextMethodOrEnd = afterMethod.indexOf("\n### ");
    var methodBody = nextMethodOrEnd !== -1 ? afterMethod.substring(0, nextMethodOrEnd) : afterMethod;
    if (methodBody.indexOf("\n- ") === -1) {
      return { ok: false, error: "method has no parameter descriptions (expected lines starting with '- ')" };
    }

    return { ok: true };
  }

  function setTags(objId, propKey, tagKeys) {
    return updateObject(objId, { properties: [{ key: propKey, multi_select: tagKeys }] });
  }

  function listTags(propIdOrKey) {
    // Resolve propKey to propId if it doesn't look like a bafyrei... ID
    var propId = propIdOrKey;
    if (propIdOrKey && propIdOrKey.indexOf("bafyrei") !== 0) {
      var prop = getProperty(propIdOrKey);
      if (!prop) {
        var result = [];
        result.error = "Property '" + propIdOrKey + "' not found";
        return result;
      }
      propId = prop.id;
    }

    var all = [];
    var offset = 0;
    var limit = 100;
    while (true) {
      var res = api("GET", spacePath + "/properties/" + propId + "/tags?offset=" + offset + "&limit=" + limit);
      if (!res.ok || !res.data || !res.data.data) {
        all.error = res.error || ("Failed to list tags (HTTP " + res.status + ")");
        break;
      }
      all = all.concat(res.data.data);
      if (!res.data.pagination || !res.data.pagination.has_more) break;
      offset += limit;
    }
    return all;
  }

  // Anytype object IDs are CIDv1 (base32) — they start with "bafy" and are
  // ~58 chars. Property keys are short snake_case identifiers. This lets
  // addTag's first arg be either, with no other ambiguity.
  function _looksLikeObjectId(s) {
    return typeof s === "string" && s.length > 40 && s.indexOf("bafy") === 0;
  }

  // Add a tag option to a select/multi_select PROPERTY (no object involved).
  // Used by addTag when the first arg is a property key, not an object id.
  function _addTagOptionToProperty(propKey, tagName, tagKey, color) {
    color = color || "blue";
    var prop = getProperty(propKey);
    if (!prop) return { ok: false, error: "Property '" + propKey + "' not found" };
    if (prop.format !== "select" && prop.format !== "multi_select") {
      return { ok: false, error: "Property '" + propKey + "' has format '" + prop.format + "', not select/multi_select — cannot add a tag option to it" };
    }
    var existingTags = listTags(prop.id);
    for (var i = 0; i < existingTags.length; i++) {
      if (existingTags[i].name === tagName || existingTags[i].key === tagName) {
        return {
          ok: true, property_key: propKey, tag_key: existingTags[i].key,
          message: "Tag option '" + tagName + "' already exists on property '" + propKey + "'"
        };
      }
    }
    var tagResult = createTag(prop.id, tagName, color, tagKey);
    if (!tagResult.ok || !tagResult.tag) {
      return { ok: false, error: tagResult.error || "Failed to create tag option" };
    }
    return { ok: true, property_key: propKey, tag_key: tagResult.tag.key, created: true };
  }

  function addTag(firstArg, tagName, tagKey, color) {
    // Polymorphic dispatch:
    //   addTag(objId, tagName, ...)        — add tag to object's built-in `tag` property
    //   addTag(propKey, tagName, ...)      — add a tag option to ANY select/multi_select property
    if (!_looksLikeObjectId(firstArg)) {
      return _addTagOptionToProperty(firstArg, tagName, tagKey, color);
    }

    var objId = firstArg;
    // Default tag property key is "tag"
    var tagPropKey = "tag";
    color = color || "blue";
    // Only use explicit key if caller provided one; otherwise let API generate it

    // Get the tag property to find its ID
    var tagProp = null;
    var allProps = getProperties();
    for (var i = 0; i < allProps.length; i++) {
      if (allProps[i].key === tagPropKey && allProps[i].format === "multi_select") {
        tagProp = allProps[i];
        break;
      }
    }

    if (!tagProp) {
      return { ok: false, error: "Tag property not found" };
    }

    // Lookup-first: find existing tag option by name before trying to create
    var newlyCreated = false;
    var actualTagKey = null;
    var existingTags = listTags(tagProp.id);
    for (var i = 0; i < existingTags.length; i++) {
      if (existingTags[i].name === tagName) {
        actualTagKey = existingTags[i].key;
        break;
      }
    }

    if (!actualTagKey) {
      // Tag option doesn't exist yet — create it
      var tagResult = createTag(tagProp.id, tagName, color, tagKey);
      if (tagResult.ok && tagResult.tag) {
        actualTagKey = tagResult.tag.key;
        newlyCreated = true;
      } else {
        return { ok: false, error: tagResult.error || "Failed to create tag" };
      }
    }

    if (!actualTagKey) {
      return { ok: false, error: "Could not determine tag key" };
    }

    // Wait for newly created tags to propagate in the backend
    if (newlyCreated && typeof sleep === "function") {
      sleep(300);
    }

    // Get existing tag keys on the object
    var obj = getObject(objId);
    if (!obj) {
      return { ok: false, error: "Object not found: " + objId };
    }

    var existingTagKeys = [];
    if (Array.isArray(obj[tagPropKey])) {
      existingTagKeys = obj[tagPropKey].slice(0);
    }

    // Check if tag already on object
    for (var i = 0; i < existingTagKeys.length; i++) {
      if (existingTagKeys[i] === actualTagKey) {
        return { ok: true, object: obj, tag_key: actualTagKey, message: "Tag already exists on object" };
      }
    }

    // Add new tag key and update
    existingTagKeys.push(actualTagKey);
    var updateResult = setTags(objId, tagPropKey, existingTagKeys);
    updateResult.tag_key = actualTagKey;
    return updateResult;
  }

  function createTag(propId, name, color, key) {
    var body = { name: name, color: color };
    if (key) body.key = key;
    const res = api("POST", spacePath + "/properties/" + propId + "/tags", body);
    return { ok: res.ok, tag: res.ok ? res.data.tag : null, error: res.ok ? null : res.error };
  }

  function createCollection(name, emoji) {
    var result = createObject("collection", { name: name, icon: emoji ? { emoji: emoji } : undefined });
    // Add shortcuts: LLMs try result.id, result.collection.id, and result.object.id
    if (result.ok && result.object) {
      result.id = result.object.id;
      result.collection = result.object;
    }
    return result;
  }

  function addToCollection(collectionId, objectIds) {
    // Leniency: accept either an array of ids or a single id string. The API
    // wants an array; either shape from the caller ends up wrapped uniformly.
    var ids = Array.isArray(objectIds) ? objectIds : [objectIds];
    const res = api("POST", spacePath + "/lists/" + collectionId + "/objects", { objects: ids });
    return { ok: res.ok, collectionId: collectionId, objectIds: ids, error: res.ok ? null : res.error };
  }

  function removeFromCollection(collectionId, objectId) {
    const res = api("DELETE", spacePath + "/lists/" + collectionId + "/objects/" + objectId);
    return { ok: res.ok, collectionId: collectionId, objectId: objectId, error: res.ok ? null : res.error };
  }

  // ==================== TYPE MANAGEMENT ====================

  function createType(opts) {
    opts = opts || {};
    if (!opts.key) return { ok: false, error: "key is required" };
    var hasExplicitName = !!opts.name;
    var hasExplicitIcon = !!opts.icon;
    if (!opts.name) opts.name = opts.key;
    if (!opts.plural_name) opts.plural_name = opts.name + "s";
    if (!opts.layout) opts.layout = "basic";

    var desiredProps = opts.properties || [];

    // Properties are GLOBAL in Anytype — check all space properties for format conflicts
    var spaceProps = getProperties();
    var spacePropMap = {};
    for (var i = 0; i < spaceProps.length; i++) {
      spacePropMap[spaceProps[i].key] = spaceProps[i];
    }

    // Properties are GLOBAL space-wide. If a requested key already exists with
    // a DIFFERENT format, the API would coerce silently to the existing format.
    // We don't want that — the LLM asked for a specific format. Instead, prepend
    // the type key to make a fresh property and warn so the LLM can use the new
    // key when creating objects of this type.
    var propertyWarnings = [];
    var renamedKeys = {};  // original key → prefixed key (for caller awareness)
    for (var i = 0; i < desiredProps.length; i++) {
      var dp = desiredProps[i];
      var sp = spacePropMap[dp.key];
      if (sp && dp.format && sp.format && dp.format !== sp.format) {
        var prefixedKey = opts.key + "_" + dp.key;
        propertyWarnings.push(
          "Property '" + dp.key + "' already exists space-wide as '" + sp.format +
          "' (you requested '" + dp.format + "'). Renamed to '" + prefixedKey +
          "' on this type so your format is preserved. Use '" + prefixedKey +
          "' as the property key when creating/updating objects of type '" + opts.key + "'."
        );
        renamedKeys[dp.key] = prefixedKey;
        desiredProps[i] = { key: prefixedKey, name: dp.name || dp.key, format: dp.format };
      }
    }

    // Check if type already exists. raw:true — need array-of-{id,key,name,format}
    // properties for the array iteration below.
    var existingTypes = getTypes({ raw: true });
    var existing = null;
    for (var i = 0; i < existingTypes.length; i++) {
      if (existingTypes[i].key === opts.key) {
        existing = existingTypes[i];
        break;
      }
    }

    if (existing) {
      // Type exists — find missing properties (format already coerced above)
      var existingPropMap = {};
      if (existing.properties) {
        for (var i = 0; i < existing.properties.length; i++) {
          existingPropMap[existing.properties[i].key] = existing.properties[i];
        }
      }

      var missingProps = [];
      for (var i = 0; i < desiredProps.length; i++) {
        if (!existingPropMap[desiredProps[i].key]) {
          missingProps.push(desiredProps[i]);
        }
      }

      // Check if name/icon/plural_name need updating
      var needsMetaUpdate = false;
      if (hasExplicitName && opts.name !== existing.name) needsMetaUpdate = true;
      if (hasExplicitIcon) needsMetaUpdate = true;

      if (missingProps.length === 0 && !needsMetaUpdate) {
        var ret = { ok: true, type: existing, created: false, message: "Type already exists with all properties" };
        if (propertyWarnings.length > 0) ret.property_warnings = propertyWarnings;
        return ret;
      }

      // PATCH: add missing properties and/or update name/icon
      var allProps = [];
      if (existing.properties) {
        for (var i = 0; i < existing.properties.length; i++) {
          var p = existing.properties[i];
          allProps.push({ key: p.key, name: p.name, format: p.format });
        }
      }
      for (var i = 0; i < missingProps.length; i++) {
        var mp = missingProps[i];
        allProps.push({ key: mp.key, name: mp.name || mp.key, format: mp.format || "text" });
      }

      var patchBody = { properties: allProps };
      if (hasExplicitName) {
        patchBody.name = opts.name;
        patchBody.plural_name = opts.plural_name;
      }
      if (hasExplicitIcon) patchBody.icon = normalizeIcon(opts.icon);

      var patchRes = api("PATCH", spacePath + "/types/" + existing.id, patchBody);
      if (!patchRes.ok) {
        return { ok: false, error: "Failed to update existing type: " + _extractError(patchRes) };
      }
      var ret = { ok: true, type: patchRes.data.type || patchRes.data, created: false };
      if (missingProps.length > 0) ret.added_properties = missingProps.map(function(p) { return p.key; });
      if (needsMetaUpdate) ret.updated_meta = true;
      if (propertyWarnings.length > 0) ret.property_warnings = propertyWarnings;
      if (Object.keys(renamedKeys).length > 0) ret.renamed_properties = renamedKeys;
      return ret;
    }

    // Type does not exist — create it (formats already coerced to match existing global props)
    var reqBody = {
      key: opts.key,
      name: opts.name,
      plural_name: opts.plural_name,
      layout: opts.layout
    };
    if (opts.icon) reqBody.icon = normalizeIcon(opts.icon);

    if (desiredProps.length > 0) {
      reqBody.properties = desiredProps.map(function(p) {
        return { key: p.key, name: p.name || p.key, format: p.format || "text" };
      });
    }

    var res = api("POST", spacePath + "/types", reqBody);
    if (!res.ok) {
      return { ok: false, error: _extractError(res) };
    }

    // Post-creation verification: detect if API silently coerced any formats
    var createdType = res.data.type || res.data;
    if (createdType && createdType.properties) {
      var createdPropMap = {};
      for (var i = 0; i < createdType.properties.length; i++) {
        createdPropMap[createdType.properties[i].key] = createdType.properties[i];
      }
      for (var i = 0; i < desiredProps.length; i++) {
        var dp = desiredProps[i];
        var cp = createdPropMap[dp.key];
        if (cp && dp.format && cp.format && dp.format !== cp.format) {
          propertyWarnings.push("Property '" + dp.key + "' was created as '" + cp.format + "' instead of '" + dp.format + "'. Use '" + cp.format + "' format when setting values.");
        }
      }
    }

    var ret = { ok: true, type: createdType, created: true };
    if (propertyWarnings.length > 0) ret.property_warnings = propertyWarnings;
    if (Object.keys(renamedKeys).length > 0) ret.renamed_properties = renamedKeys;

    // Warn if keys were normalized (mangled) by the API
    if (createdType) {
      var keyWarnings = [];
      if (createdType.key !== opts.key) {
        keyWarnings.push("Type key normalized: '" + opts.key + "' → '" + createdType.key + "'. Use '" + createdType.key + "' in subsequent calls.");
      }
      if (createdType.properties) {
        for (var i = 0; i < desiredProps.length; i++) {
          var dp = desiredProps[i];
          var normalizedKey = toSnake(dp.key);
          if (normalizedKey !== dp.key) {
            keyWarnings.push("Property key normalized: '" + dp.key + "' → '" + normalizedKey + "'.");
          }
        }
      }
      if (keyWarnings.length > 0) ret.key_warnings = keyWarnings;
    }

    return ret;
  }

  // ==================== TRACE INSPECTION ====================

  function fetchTraceSchema(traceObjectId) {
    var obj = getObject(traceObjectId);
    if (!obj || !obj.markdown) return null;
    return extractMarkdownSection(obj.markdown, "Trace Schema");
  }

  function fetchTrace(traceObjectId) {
    var obj = getObject(traceObjectId);
    if (!obj || !obj.markdown) return null;
    var section = extractMarkdownSection(obj.markdown, "Trace");
    if (!section) return null;
    var json = extractCode(section);
    if (!json) return null;
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  // ==================== RETURN CLIENT OBJECT ====================

  // Wrap methods with __wrapTrace if available (enables trace recording + mock replay).
  // When running with mocks, wrapped methods return mocked results without calling the real
  // function — this prevents duplicate side effects on re-execution (see tracer AD1/AD5).
  var w = (typeof __wrapTrace === "function")
    ? function(name, fn) { return __wrapTrace("anytypeHelper." + name, fn); }
    : function(name, fn) { return fn; };

  // Per-tool trace-cleanup hook. toolcall_core discovers this on the facade
  // and chains all tools' hooks during tool_result prep. Every wrapped method
  // above also calls `fetch(baseUrl + ...)` internally — those inner `fetch`
  // entries are pure duplication of the outer `anytypeHelper.X` trace and
  // leak the Authorization header, so we drop them here.
  var hostPrefix = (baseUrl || "").replace(/\/+$/, "");
  function __prepareTraces(traces) {
    if (!traces || !traces.fetch || !hostPrefix) return traces;
    var kept = {};
    var any = false;
    for (var input in traces.fetch) {
      if (!traces.fetch.hasOwnProperty(input)) continue;
      var url = "";
      try {
        var parsed = JSON.parse(input);
        if (Array.isArray(parsed) && typeof parsed[0] === "string") url = parsed[0];
        else if (typeof parsed === "string") url = parsed;
      } catch (e) {}
      if (url && url.indexOf(hostPrefix) === 0) continue;
      kept[input] = traces.fetch[input];
      any = true;
    }
    var out = {};
    for (var k in traces) {
      if (k === "fetch") continue;
      out[k] = traces[k];
    }
    if (any) out.fetch = kept;
    return out;
  }

  return {
    api: api,
    _extractError: _extractError,
    config: { baseUrl: baseUrl, spaceId: spaceId, apiVersion: apiVersion, spacePath: spacePath },
    __prepareTraces: __prepareTraces,

    // Queries
    getObjects: w("getObjects", getObjects),
    getObject: w("getObject", getObject),
    getObjectsByTag: w("getObjectsByTag", getObjectsByTag),
    search: w("search", search),
    getTypes: w("getTypes", getTypes),
    getProperties: w("getProperties", getProperties),
    getProperty: w("getProperty", getProperty),
    describeType: w("describeType", describeType),
    getCollectionObjects: w("getCollectionObjects", getCollectionObjects),

    // Tool discovery
    getTools: w("getTools", getTools),
    getToolDescription: w("getToolDescription", getToolDescription),
    getToolSchema: w("getToolSchema", getToolSchema),

    // Trace inspection
    fetchTraceSchema: fetchTraceSchema,
    fetchTrace: fetchTrace,

    // Mutations
    createObject: w("createObject", createObject),
    updateObject: w("updateObject", updateObject),
    deleteObject: w("deleteObject", deleteObject),
    appendToObject: w("appendToObject", appendToObject),
    applyDiff: w("applyDiff", applyDiff),
    parseDiffBlocks: w("parseDiffBlocks", parseDiffBlocks),
    setTags: w("setTags", setTags),
    addTag: w("addTag", addTag),
    listTags: w("listTags", listTags),
    createCollection: w("createCollection", createCollection),
    addToCollection: w("addToCollection", addToCollection),
    removeFromCollection: w("removeFromCollection", removeFromCollection),
    listPrograms: w("listPrograms", listPrograms),
    getProgram: w("getProgram", getProgram),
    runProgram: w("runProgram", runProgram),
    saveProgram: w("saveProgram", saveProgram),
    saveTool: w("saveTool", saveTool),
    createType: w("createType", createType)
  };
}

export function main(args) {
  return "anytypeHelper module loaded";
}
