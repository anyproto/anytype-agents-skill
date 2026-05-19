# Setup And Auth

## Prerequisites

- A running Anytype Desktop app. The local API is exposed by the desktop app.
- `anytype-agent-runtime` on `PATH`.
- A local checkout of the canonical upstream repository so `anytypeHelper@v1` resolves from the repo root.

If the repository is not already present, clone it first and work from that directory:

```bash
git clone https://github.com/anyproto/anytype-agents-skill.git
cd anytype-agents-skill
```

Check the runtime first:

```bash
which anytype-agent-runtime
```

If it is missing, install it yourself. Typical options:

```bash
# Option 0: download the current release binary from GitHub releases.

# Option 1: build from source.
git clone https://github.com/anyproto/anytype-agent-runtime.git /tmp/anytype-agent-runtime
cd /tmp/anytype-agent-runtime && go install . && cd -
```

Verify the install:

```bash
anytype-agent-runtime --help
```

## Running scripts

Write a `.js` file that exports `main()` and run it from the cloned repository root:

```bash
anytype-agent-runtime -m . my-script.js
```

Pass scalar arguments as `key=value`:

```bash
anytype-agent-runtime -m . my-script.js query="search term"
```

Pass file-backed arguments as `key=@filepath`:

```bash
anytype-agent-runtime -m . my-script.js body=@content.md
```

## Runtime output

The runtime prints:

- `trace: /tmp/anytype-trace-XXXX.json`
- `res: <value>`
- `err: <message>` when execution fails

The trace includes raw network effects and wrapped `anytypeHelper.*` method traces. Prefer the wrapped traces first when debugging.

## Environment-based auth

If a `.env` file already exists in the repo root, the runtime loads it automatically. Required variables:

```text
ANYTYPE_API_URL=http://127.0.0.1:31009
ANYTYPE_API_KEY=your-api-key
ANYTYPE_SPACE_ID=your-space-id
```

## First-time challenge flow

Use this when no API key exists yet. The Anytype Desktop app must be open.

### Step 1: request a challenge

```js
import { requestChallenge } from "anytypeHelper@v1";

export function main() {
  return requestChallenge({
    baseUrl: env.ANYTYPE_API_URL || "http://127.0.0.1:31009"
  });
}
```

Run it:

```bash
anytype-agent-runtime -m . step1-challenge.js
```

The response includes `challenge_id`, and the desktop app shows a 4-digit code.

### Step 2: solve the challenge

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

Run it:

```bash
anytype-agent-runtime -m . step2-solve.js
```

The response includes `api_key`.

### Step 3: choose a space

```js
import { createClient } from "anytypeHelper@v1";

export function main() {
  var client = createClient({
    apiBaseUrl: "http://127.0.0.1:31009",
    apiKey: "API_KEY_FROM_STEP_2"
  });

  return client.listSpaces();
}
```

Run it:

```bash
anytype-agent-runtime -m . step3-spaces.js
```

Pick the desired `space.id` from the result.

### Step 4: write `.env`

```text
ANYTYPE_API_URL=http://127.0.0.1:31009
ANYTYPE_API_KEY=api-key-from-step-2
ANYTYPE_SPACE_ID=space-id-from-step-3
```

After that, new scripts can authenticate through `env.ANYTYPE_API_URL`, `env.ANYTYPE_API_KEY`, and `env.ANYTYPE_SPACE_ID`.