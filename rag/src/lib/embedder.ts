import { GoogleGenAI } from "@google/genai";
import {
  readGeminiKey,
  EMBEDDING_MODEL,
  MAX_EMBED_REQUESTS_PER_DAY,
  QUERY_RESERVE,
} from "./config.js";
import { UsageTracker } from "./usage-tracker.js";
import { OpenAiCompatibleEmbedder } from "./openai-compatible-embedder.js";
import { InProcessEmbedder, promptsForModel } from "./in-process-embedder.js";

/**
 * The embedding SPI port (internal, provider-agnostic contract). Each adapter
 * (Gemini today; OpenAI-compatible / local tomorrow) implements it and translates
 * the intent (`embedDocuments` vs `embedQuery`) into its backend's native dialect —
 * or ignores it. See the embedder-spi plan §2.
 */
export interface Embedder {
  /** Who I am — stamped into the index, the invalidation key on swap. */
  readonly identity: EmbedderIdentity;
  /** Indexing path: "I'm encoding documents to file away". */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Search path (priority): "I'm encoding a question being asked". */
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Identity of the embedder that filled the index (provider/model/dimension). The
 * dimension is the invalidation key: two models of different dimensions produce
 * incomparable vectors (cf. embedder-spi plan §1).
 */
export interface EmbedderIdentity {
  providerId: string;
  model: string;
  dimension: number;
}

// Output dimension of gemini-embedding-001 (the model's default). Part of the
// Gemini identity: it's what tells the index "these vectors are 3072 wide".
const GEMINI_DIMENSION = 3072;

let client: GoogleGenAI | null = null;

// Guardrail A: daily cap shared across processes (MCP server + CLI) via a
// persisted counter. Indexing stops at MAX − QUERY_RESERVE; the reserve keeps
// search (consumePriority) alive up to the full cap.
const usage = new UsageTracker({
  maxPerDay: MAX_EMBED_REQUESTS_PER_DAY,
  reserveForPriority: QUERY_RESERVE,
});

/**
 * Builds the Gemini client from a key, or throws the named, .env-pointing error
 * the install flow relies on when the key is missing. Pure (no memoization, no
 * env read) → testable; the construction is offline (no request until embed time).
 */
export function buildGeminiClient(key: string | undefined): GoogleGenAI {
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set in .env");
  }
  return new GoogleGenAI({ apiKey: key });
}

function getClient(): GoogleGenAI {
  if (!client) {
    // Re-reads .env on the fly: if the key was pasted after Claude Code's first
    // launch, the next request picks it up without reconnecting the MCP.
    client = buildGeminiClient(readGeminiKey());
  }
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A progress heartbeat fires once every 50 embedded chunks (i is 0-based). */
export function shouldLogProgress(i: number): boolean {
  return (i + 1) % 50 === 0;
}

/**
 * Embeds one text with a bounded 429-retry/backoff loop. `sleepFn` is injectable
 * so the backoff is testable without real wall-clock delays. Non-rate-limit errors
 * (and a rate-limit that outlasts the retries) propagate; an empty response → [].
 */
export async function embedWithRetry(
  ai: GoogleGenAI,
  text: string,
  maxRetries = 3,
  sleepFn: (ms: number) => Promise<void> = sleep
): Promise<number[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
      });
      return response.embeddings?.[0]?.values ?? [];
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error && err.message.includes("429");
      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.min(60_000, (attempt + 1) * 20_000);
        console.error(
          `[embedder] Rate limit hit, waiting ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`
        );
        await sleepFn(delay);
        continue;
      }
      throw err;
    }
  }
  return [];
}

/** Subset of UsageTracker the embedder needs (injectable in tests). */
export interface QuotaGuard {
  /** Indexing consumption (stops at `maxPerDay − reserve`). */
  consume(n?: number): void;
  /** Priority consumption (query): goes up to the full cap. */
  consumePriority(n?: number): void;
}

/** Injectable embedder dependencies (network + quota + pacing), stubbable in tests. */
export interface EmbedDeps {
  usage: QuotaGuard;
  embedOne: (text: string) => Promise<number[]>;
  /** Inter-document pause (the 80-calls/min throttle); injectable to avoid real waits. */
  sleep: (ms: number) => Promise<void>;
}

function defaultDeps(): EmbedDeps {
  return {
    usage,
    embedOne: (text) => embedWithRetry(getClient(), text),
    sleep,
  };
}

/**
 * The Gemini adapter for the `Embedder` port — the only real concrete impl. All
 * the Gemini specifics (GoogleGenAI client, 429 retry, quota, EMBEDDING_MODEL)
 * live here, behind the port. The `deps` stay injectable for tests.
 */
export class GeminiEmbedder implements Embedder {
  readonly identity: EmbedderIdentity = {
    providerId: "gemini",
    model: EMBEDDING_MODEL,
    dimension: GEMINI_DIMENSION,
  };

  constructor(private readonly deps: EmbedDeps = defaultDeps()) {}

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    const CALLS_PER_MINUTE = 80;
    const DELAY_MS = Math.ceil(60_000 / CALLS_PER_MINUTE);

    for (let i = 0; i < texts.length; i++) {
      // Guardrail A: indexing path → reserve 1 *indexing* credit before each
      // real request. Throws DailyCapExceededError at the indexing cap → the
      // batch stops cleanly, and the reserve keeps search alive.
      this.deps.usage.consume(1);
      const embedding = await this.deps.embedOne(texts[i]);
      allEmbeddings.push(embedding);

      if (i < texts.length - 1) {
        await this.deps.sleep(DELAY_MS);
      }

      if (shouldLogProgress(i)) {
        console.error(`[embedder] ${i + 1}/${texts.length} chunks embedded...`);
      }
    }

    return allEmbeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    // Search query → *priority* consumption: "talking" is never blocked by
    // indexing (the reserve is dedicated to it).
    this.deps.usage.consumePriority(1);
    return this.deps.embedOne(query);
  }
}

/** Environment variables read to choose/configure the embedder. */
export interface EmbedderEnv {
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_BASE_URL?: string;
  EMBEDDING_API_KEY?: string;
  EMBEDDING_MODEL_NAME?: string;
  EMBEDDING_DIMENSION?: string;
}

/**
 * PURE embedder selection from a config (testable without touching
 * `process.env`). Default: native Gemini. `EMBEDDING_PROVIDER=openai-compatible`
 * switches to the configurable-URL/key adapter (OpenAI, Azure, gateway, Mistral,
 * or local Ollama on `http://localhost:11434/v1`).
 */
// Defaults for the in-process "Gemma inside" adapter: EmbeddingGemma-300m in ONNX,
// 768 dimensions (cf. Step 4-bis plan), q8 quantization carried by the default loader.
const IN_PROCESS_DEFAULT_MODEL = "onnx-community/embeddinggemma-300m-ONNX";
const IN_PROCESS_DEFAULT_DIMENSION = 768;

export function selectEmbedder(env: EmbedderEnv): Embedder {
  if (env.EMBEDDING_PROVIDER === "in-process") {
    const model = env.EMBEDDING_MODEL_NAME ?? IN_PROCESS_DEFAULT_MODEL;
    return new InProcessEmbedder({
      model,
      dimension: Number(env.EMBEDDING_DIMENSION ?? IN_PROCESS_DEFAULT_DIMENSION),
      // EmbeddingGemma requires its task prompts (Ollama sets them internally); here
      // it's up to us to set them, otherwise the model is misused (cf. model card).
      prompts: promptsForModel(model),
    });
  }
  if (env.EMBEDDING_PROVIDER === "openai-compatible") {
    return new OpenAiCompatibleEmbedder({
      baseURL: env.EMBEDDING_BASE_URL ?? "",
      apiKey: env.EMBEDDING_API_KEY ?? "",
      model: env.EMBEDDING_MODEL_NAME ?? "",
      dimension: Number(env.EMBEDDING_DIMENSION ?? 0),
    });
  }
  return new GeminiEmbedder();
}

// Process-level memoized embedder: chosen once, shared by ALL callers (search_vault
// on every query AND the MCP server's auto-reindex). Without this sharing, the
// in-process adapter recreates an ONNX session per search → ~440 ms of reloading on
// EVERY query, and two concurrent sessions (search + indexing) over-subscribe the
// cores → search up to ×50 slower (measured, cf. rag/scripts/measure-contention.mts).
// A single hot session: search ~40 ms at rest, ~0.7 s during a background indexing.
// The provider is frozen at the first selection; a swap already goes through a Claude
// Code restart (new .env). The Gemini key stays read lazily at embed time → pasting
// the key after the fact still works.
let memoizedEmbedder: Embedder | null = null;

/**
 * The SINGLE selection point for the embedder (the `Embedder` port). Reads the
 * environment and delegates to `selectEmbedder` — the provider switch lives HERE
 * and NOWHERE ELSE, without touching the harness or the MCP port. Memoized (cf.
 * above): the same embedder is returned to every call in the process.
 *
 * Lives in `embedder.ts` (and not `config.ts` as sketched in the plan) to avoid an
 * import cycle: `embedder.ts` already depends on `config.ts`. A factory's natural
 * home is, in any case, alongside the implementations it chooses.
 */
export function createEmbedder(): Embedder {
  if (!memoizedEmbedder) {
    memoizedEmbedder = selectEmbedder(process.env);
  }
  return memoizedEmbedder;
}

// Free functions kept for the duration of the transition: they delegate to the
// port via an instance with explicit deps. Consumers will migrate to `Embedder`
// (injected by createEmbedder) in the next step, after which they'll disappear.
export function embedTexts(
  texts: string[],
  deps: EmbedDeps = defaultDeps()
): Promise<number[][]> {
  return new GeminiEmbedder(deps).embedDocuments(texts);
}

export function embedQuery(
  query: string,
  deps: EmbedDeps = defaultDeps()
): Promise<number[]> {
  return new GeminiEmbedder(deps).embedQuery(query);
}
