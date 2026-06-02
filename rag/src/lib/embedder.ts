import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_API_KEY,
  EMBEDDING_MODEL,
  MAX_EMBED_REQUESTS_PER_DAY,
  QUERY_RESERVE,
} from "./config.js";
import { UsageTracker } from "./usage-tracker.js";

let client: GoogleGenAI | null = null;

// Garde-fou A : plafond journalier partagé entre processus (serveur MCP + CLI)
// via un compteur persisté. L'indexation s'arrête à MAX − QUERY_RESERVE ; la
// réserve garde la recherche (consumePriority) vivante jusqu'au plafond plein.
const usage = new UsageTracker({
  maxPerDay: MAX_EMBED_REQUESTS_PER_DAY,
  reserveForPriority: QUERY_RESERVE,
});

function getClient(): GoogleGenAI {
  if (!client) {
    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not set in .env");
    }
    client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(
  ai: GoogleGenAI,
  text: string,
  maxRetries = 3
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
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  return [];
}

/** Sous-ensemble du UsageTracker dont l'embedder a besoin (injectable en test). */
export interface QuotaGuard {
  /** Consommation indexation (s'arrête à `maxPerDay − réserve`). */
  consume(n?: number): void;
  /** Consommation prioritaire (requête) : va jusqu'au plafond plein. */
  consumePriority(n?: number): void;
}

/** Dépendances injectables de l'embedder (réseau + quota), stubables en test. */
export interface EmbedDeps {
  usage: QuotaGuard;
  embedOne: (text: string) => Promise<number[]>;
}

function defaultDeps(): EmbedDeps {
  return { usage, embedOne: (text) => embedWithRetry(getClient(), text) };
}

export async function embedTexts(
  texts: string[],
  deps: EmbedDeps = defaultDeps()
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const CALLS_PER_MINUTE = 80;
  const DELAY_MS = Math.ceil(60_000 / CALLS_PER_MINUTE);

  for (let i = 0; i < texts.length; i++) {
    // Garde-fou A : chemin d'indexation → réserve 1 crédit *indexation* avant
    // chaque requête réelle. Lève DailyCapExceededError au plafond indexation
    // → le lot s'arrête proprement, et la réserve garde la recherche vivante.
    deps.usage.consume(1);
    const embedding = await deps.embedOne(texts[i]);
    allEmbeddings.push(embedding);

    if (i < texts.length - 1) {
      await sleep(DELAY_MS);
    }

    if ((i + 1) % 50 === 0) {
      console.error(`[embedder] ${i + 1}/${texts.length} chunks embedded...`);
    }
  }

  return allEmbeddings;
}

export async function embedQuery(
  query: string,
  deps: EmbedDeps = defaultDeps()
): Promise<number[]> {
  // Requête de recherche → consommation *prioritaire* : « parler » n'est jamais
  // bloqué par l'indexation (la réserve lui est dédiée).
  deps.usage.consumePriority(1);
  return deps.embedOne(query);
}
