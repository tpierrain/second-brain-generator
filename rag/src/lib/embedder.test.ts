import { test } from "node:test";
import assert from "node:assert/strict";

// Mutation hardening (Stryker, 2026-07-15): 34.6% → 81.98% (89 killed + 2 timeout
// + 20 survived / 111). To make the network logic testable, the 429-retry/backoff
// (`embedWithRetry`), the Gemini client guard (`buildGeminiClient`) and the progress
// predicate (`shouldLogProgress`) were extracted/exported, and `sleep` was made
// injectable via `EmbedDeps`. The 20 survivors are ALL documented EQUIVALENTS /
// integration-only glue (killable only over the real network / a private field, or
// with no observable contract), so the EFFECTIVE score on non-equivalent mutants is
// 91/91 = 100%. The 2 timeouts are genuine kills (a mutant that turns the retry/
// embed for-loop into an infinite loop, detected via the instant-resolve fake sleep).
// ⚠️ This score is only reproducible with the tuned concurrency/timeout the rag config
// now carries — the default 13 runners over-subscribe the CPU and inflate every kill
// into a FALSE timeout (a bogus 100%); see maintainers/mutation/RESULTS.md.
// Grouped by reason:
//   - Real Gemini/quota wiring (10): getClient()'s lazy singleton (`if(!client)`
//     flips + emptied body), buildGeminiClient's `new GoogleGenAI({apiKey})`→`({})`,
//     the module-level `UsageTracker({...})` config, and defaultDeps() — all wire the
//     REAL client/tracker/deps, observable only over the network or an SDK-private
//     field. Every unit test injects `EmbedDeps`/`QuotaGuard`/`sleepFn` fakes, so
//     these bodies never run; the PURE guard behind them (buildGeminiClient's
//     throw-on-missing-key, the whole retry loop) is fully killed below.
//   - Real timer sleep() (2): the production `setTimeout` body — tests inject fakes.
//   - console.error MESSAGE TEXT (3): empty message + `attempt±1` / `delay*1000`
//     INSIDE the log template — cosmetic; the backoff delays, the retry cadence and
//     the once-per-50 heartbeat ARE pinned below.
//   - Unreachable post-loop `return []` (1): the retry loop always returns (success)
//     or throws (non-429 / exhausted 429) inside its body → the trailing return is dead.
//   - selectEmbedder's openai-compatible baseURL/apiKey `?? ""` defaults (4): the value
//     lands in OpenAiCompatibleEmbedder's PRIVATE config, observable only through the
//     adapter's injected fetch — which selectEmbedder does not wire (real global fetch).
//     Same class as buildGeminiClient's apiKey; the adapter's own request shaping is
//     covered directly by openai-compatible-embedder.test.ts, and model/dimension
//     defaults (exposed via the public `identity`) ARE killed.
import {
  createEmbedder,
  selectEmbedder,
  embedQuery,
  embedTexts,
  embedWithRetry,
  buildGeminiClient,
  shouldLogProgress,
  GeminiEmbedder,
  type QuotaGuard,
} from "./embedder.js";

// A fake of the GoogleGenAI surface embedWithRetry touches: a scripted
// `models.embedContent` that returns/throws per call, recording how often it ran.
function fakeAi(responder: (call: number) => unknown) {
  let call = 0;
  const seen: unknown[] = [];
  return {
    ai: {
      models: {
        embedContent: async (req: unknown) => {
          seen.push(req);
          const out = responder(call++);
          if (out instanceof Error) throw out;
          return out;
        },
      },
    } as unknown as Parameters<typeof embedWithRetry>[0],
    get calls() {
      return call;
    },
    seen,
  };
}

// Spies on which quota path is consumed, without touching the network.
class SpyGuard implements QuotaGuard {
  calls: string[] = [];
  consume(): void {
    this.calls.push("index");
  }
  consumePriority(): void {
    this.calls.push("priority");
  }
}

test("GeminiEmbedder exposes its identity (provider/model/dimension) for the stamp", () => {
  const embedder = new GeminiEmbedder({
    usage: new SpyGuard(),
    embedOne: async () => [],
    sleep: async () => {},
  });

  assert.deepEqual(embedder.identity, {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  });
});

test("createEmbedder(): single selection point → a Gemini Embedder by default", () => {
  assert.equal(createEmbedder().identity.providerId, "gemini");
});

test("createEmbedder() memoizes: the same embedder is shared across calls (hot ONNX session)", () => {
  assert.equal(createEmbedder(), createEmbedder());
});

test("selectEmbedder: provider 'openai-compatible' → stamped OpenAI-compatible adapter", () => {
  const embedder = selectEmbedder({
    EMBEDDING_PROVIDER: "openai-compatible",
    EMBEDDING_BASE_URL: "http://localhost:11434/v1",
    EMBEDDING_API_KEY: "",
    EMBEDDING_MODEL_NAME: "bge-m3",
    EMBEDDING_DIMENSION: "1024",
  });

  assert.deepEqual(embedder.identity, {
    providerId: "openai-compatible",
    model: "bge-m3",
    dimension: 1024,
  });
});

test("selectEmbedder: 'openai-compatible' with no env fields falls back to empty model / dimension 0", () => {
  // Pins the `?? ""` / `?? 0` defaults: a missing model reads back "" (not a
  // canary), and a missing dimension parses to 0 (not NaN from a canary string).
  const embedder = selectEmbedder({ EMBEDDING_PROVIDER: "openai-compatible" });

  assert.equal(embedder.identity.model, "");
  assert.equal(embedder.identity.dimension, 0);
});

test("selectEmbedder: provider 'in-process' → transformers-js adapter, no URL or key", () => {
  const embedder = selectEmbedder({ EMBEDDING_PROVIDER: "in-process" });

  assert.deepEqual(embedder.identity, {
    providerId: "transformers-js",
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });
});

test("selectEmbedder: 'in-process' accepts a custom model/dimension via the env", () => {
  const embedder = selectEmbedder({
    EMBEDDING_PROVIDER: "in-process",
    EMBEDDING_MODEL_NAME: "Xenova/bge-m3",
    EMBEDDING_DIMENSION: "1024",
  });

  assert.equal(embedder.identity.model, "Xenova/bge-m3");
  assert.equal(embedder.identity.dimension, 1024);
});

test("embedQuery consumes on the priority path (never blocked by indexing)", async () => {
  const guard = new SpyGuard();
  await embedQuery("q", {
    usage: guard,
    embedOne: async () => [1, 2, 3],
    sleep: async () => {},
  });
  assert.deepEqual(guard.calls, ["priority"]);
});

test("embedTexts consumes on the indexing path, once per text", async () => {
  const guard = new SpyGuard();
  const out = await embedTexts(["a", "b"], {
    usage: guard,
    embedOne: async (t) => [t.length],
    sleep: async () => {},
  });
  assert.deepEqual(guard.calls, ["index", "index"]);
  assert.deepEqual(out, [[1], [1]]);
});

test("embedTexts paces between docs but NOT after the last (≈750ms = 80/min)", async () => {
  const guard = new SpyGuard();
  const delays: number[] = [];
  await embedTexts(["a", "b", "c"], {
    usage: guard,
    embedOne: async (t) => [t.length],
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  // Three docs → two inter-doc pauses (the guard `i < texts.length - 1`); each is
  // Math.ceil(60_000 / 80) = 750ms (the 80-calls-per-minute throttle).
  assert.deepEqual(delays, [750, 750]);
});

test("embedTexts emits a progress heartbeat exactly once per 50 chunks", async () => {
  const errors: string[] = [];
  const realError = console.error;
  console.error = (msg: string) => errors.push(String(msg));
  try {
    await embedTexts(Array.from({ length: 50 }, (_, i) => `t${i}`), {
      usage: new SpyGuard(),
      embedOne: async () => [0],
      sleep: async () => {},
    });
  } finally {
    console.error = realError;
  }
  // The 50th chunk (i=49) trips the heartbeat; nothing before it does → exactly one.
  assert.equal(errors.length, 1);
  assert.match(errors[0], /50\/50 chunks embedded/);
});

// --- shouldLogProgress: a heartbeat every 50 embedded chunks ------------------

test("shouldLogProgress fires on every 50th chunk (1-based), nowhere else", () => {
  // i is 0-based → the 50th chunk is i=49, the 100th is i=99.
  assert.equal(shouldLogProgress(49), true);
  assert.equal(shouldLogProgress(99), true);
  assert.equal(shouldLogProgress(0), false);
  assert.equal(shouldLogProgress(48), false);
  assert.equal(shouldLogProgress(50), false);
});

// --- buildGeminiClient: the key-missing guard (user-facing error) -------------

test("buildGeminiClient throws a named, .env-pointing error when the key is missing", () => {
  assert.throws(
    () => buildGeminiClient(undefined),
    /GOOGLE_GEMINI_API_KEY is not set in \.env/
  );
  assert.throws(() => buildGeminiClient(""), /GOOGLE_GEMINI_API_KEY/);
});

test("buildGeminiClient returns a client when a key is present", () => {
  // Construction is offline (no request fired until embed time), so a dummy key
  // is enough to prove the guard lets a present key through.
  assert.ok(buildGeminiClient("dummy-key"));
});

// --- embedWithRetry: success, empty response, 429 backoff, fatal errors -------
const noSleep = async () => {};

test("embedWithRetry returns the embedding values on the first success", async () => {
  const fake = fakeAi(() => ({ embeddings: [{ values: [0.1, 0.2] }] }));

  const out = await embedWithRetry(fake.ai, "hello", 3, noSleep);

  assert.deepEqual(out, [0.1, 0.2]);
  assert.equal(fake.calls, 1, "should not retry a successful call");
});

test("embedWithRetry sends the Gemini model and the text in the expected request shape", async () => {
  const fake = fakeAi(() => ({ embeddings: [{ values: [1] }] }));

  await embedWithRetry(fake.ai, "hello world", 3, noSleep);

  // Pins the request payload Gemini expects: the model name and the nested
  // contents: [{ parts: [{ text }] }] envelope (an emptied/flattened shape would
  // reach the API malformed).
  assert.deepEqual(fake.seen[0], {
    model: "gemini-embedding-001",
    contents: [{ parts: [{ text: "hello world" }] }],
  });
});

test("embedWithRetry returns [] when the response carries no embeddings field", async () => {
  // Pins the FIRST optional-chain link: `response.embeddings?.[0]` — without it,
  // `undefined[0]` throws instead of degrading to [].
  const fake = fakeAi(() => ({}));

  assert.deepEqual(await embedWithRetry(fake.ai, "x", 3, noSleep), []);
});

test("embedWithRetry returns [] when embeddings is an empty array", async () => {
  // Pins the SECOND optional-chain link: `[0]?.values` — and the `?? []` default
  // (a mutated `&& []` would yield undefined, a canary default would leak).
  const fake = fakeAi(() => ({ embeddings: [] }));

  assert.deepEqual(await embedWithRetry(fake.ai, "x", 3, noSleep), []);
});

test("embedWithRetry retries a 429 and backs off 20s then 40s before succeeding", async () => {
  const rateLimited = (call: number) =>
    call < 2
      ? new Error("429 Too Many Requests")
      : { embeddings: [{ values: [9] }] };
  const fake = fakeAi(rateLimited);
  const delays: number[] = [];

  const out = await embedWithRetry(fake.ai, "q", 3, async (ms) => {
    delays.push(ms);
  });

  assert.deepEqual(out, [9]);
  assert.equal(fake.calls, 3, "two 429s then one success");
  // Math.min(60_000, (attempt + 1) * 20_000): attempt 0 → 20s, attempt 1 → 40s.
  assert.deepEqual(delays, [20_000, 40_000]);
});

test("embedWithRetry rethrows a non-429 error at once, without retry or backoff", async () => {
  const fake = fakeAi(() => new Error("500 Internal Server Error"));
  let slept = false;

  await assert.rejects(
    embedWithRetry(fake.ai, "q", 3, async () => {
      slept = true;
    }),
    /500 Internal Server Error/
  );
  assert.equal(fake.calls, 1, "a non-rate-limit error is fatal — no second try");
  assert.equal(slept, false, "no backoff on a fatal error");
});

test("embedWithRetry gives up and rethrows once the 429s outlast the retries", async () => {
  // Always 429: with maxRetries=2, attempts 0 and 1 back off, attempt 2 is the
  // last pass (attempt < maxRetries is false) → the 429 propagates.
  const fake = fakeAi(() => new Error("429 rate limited"));
  const delays: number[] = [];

  await assert.rejects(
    embedWithRetry(fake.ai, "q", 2, async (ms) => {
      delays.push(ms);
    }),
    /429/
  );
  assert.equal(fake.calls, 3, "maxRetries=2 → 3 attempts total");
  assert.deepEqual(delays, [20_000, 40_000], "backed off on the first two only");
});
