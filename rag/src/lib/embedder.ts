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
 * Le port SPI de l'embedding (contrat interne, agnostique fournisseur). Chaque
 * adaptateur (Gemini aujourd'hui ; demain OpenAI-compatible / local) l'implémente
 * et traduit l'intention (`embedDocuments` vs `embedQuery`) dans le dialecte natif
 * de son backend — ou l'ignore. Voir plan embedder-spi §2.
 */
export interface Embedder {
  /** Qui je suis — estampillé dans l'index, clé d'invalidation au swap. */
  readonly identity: EmbedderIdentity;
  /** Chemin indexation : « j'encode des documents à ranger ». */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Chemin recherche (prioritaire) : « j'encode une question posée ». */
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Identité de l'embedder qui a rempli l'index (provider/modèle/dimension). La
 * dimension est la clé d'invalidation : deux modèles de dimensions différentes
 * produisent des vecteurs incomparables (cf. plan embedder-spi §1).
 */
export interface EmbedderIdentity {
  providerId: string;
  model: string;
  dimension: number;
}

// Dimension de sortie de gemini-embedding-001 (défaut du modèle). Fait partie de
// l'identité Gemini : c'est elle qui dit à l'index « ces vecteurs font 3072 ».
const GEMINI_DIMENSION = 3072;

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
    // Relit .env à la volée : si la clé a été collée après le 1er lancement de
    // Claude Code, la prochaine requête la prend en compte sans reconnecter le MCP.
    const key = readGeminiKey();
    if (!key) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not set in .env");
    }
    client = new GoogleGenAI({ apiKey: key });
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

/**
 * L'adaptateur Gemini du port `Embedder` — la seule impl concrète réelle. Tout
 * le contenu Gemini (client GoogleGenAI, retry 429, quota, EMBEDDING_MODEL) vit
 * ici, derrière le port. Les `deps` restent injectables pour les tests.
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
      // Garde-fou A : chemin d'indexation → réserve 1 crédit *indexation* avant
      // chaque requête réelle. Lève DailyCapExceededError au plafond indexation
      // → le lot s'arrête proprement, et la réserve garde la recherche vivante.
      this.deps.usage.consume(1);
      const embedding = await this.deps.embedOne(texts[i]);
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

  async embedQuery(query: string): Promise<number[]> {
    // Requête de recherche → consommation *prioritaire* : « parler » n'est jamais
    // bloqué par l'indexation (la réserve lui est dédiée).
    this.deps.usage.consumePriority(1);
    return this.deps.embedOne(query);
  }
}

/** Variables d'environnement lues pour choisir/configurer l'embedder. */
export interface EmbedderEnv {
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_BASE_URL?: string;
  EMBEDDING_API_KEY?: string;
  EMBEDDING_MODEL_NAME?: string;
  EMBEDDING_DIMENSION?: string;
}

/**
 * Sélection PURE de l'embedder à partir d'une config (testable sans toucher à
 * `process.env`). Défaut : Gemini natif. `EMBEDDING_PROVIDER=openai-compatible`
 * bascule sur l'adaptateur à URL/clé configurables (OpenAI, Azure, passerelle,
 * Mistral, ou Ollama local sur `http://localhost:11434/v1`).
 */
// Défauts de l'adaptateur in-process « Gemma inside » : EmbeddingGemma-300m en ONNX,
// 768 dimensions (cf. plan Étape 4-bis), quantif q8 portée par le chargeur par défaut.
const IN_PROCESS_DEFAULT_MODEL = "onnx-community/embeddinggemma-300m-ONNX";
const IN_PROCESS_DEFAULT_DIMENSION = 768;

export function selectEmbedder(env: EmbedderEnv): Embedder {
  if (env.EMBEDDING_PROVIDER === "in-process") {
    const model = env.EMBEDDING_MODEL_NAME ?? IN_PROCESS_DEFAULT_MODEL;
    return new InProcessEmbedder({
      model,
      dimension: Number(env.EMBEDDING_DIMENSION ?? IN_PROCESS_DEFAULT_DIMENSION),
      // EmbeddingGemma exige ses prompts de tâche (Ollama les pose en interne) ; ici
      // c'est à nous de les poser, sinon le modèle est mal utilisé (cf. model card).
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

// Embedder mémoïsé au niveau process : choisi une fois, partagé par TOUS les
// appelants (search_vault à chaque requête ET l'auto-reindex du serveur MCP). Sans
// ce partage, l'in-process recrée une session ONNX par recherche → ~440 ms de
// rechargement à CHAQUE requête, et deux sessions concurrentes (recherche +
// indexation) sur-réservent les cœurs → recherche jusqu'à ×50 plus lente (mesuré,
// cf. rag/scripts/measure-contention.mts). Une seule session chaude : recherche
// ~40 ms au repos, ~0,7 s pendant une indexation de fond. Le provider est figé à
// la 1ʳᵉ sélection ; un swap passe déjà par un redémarrage de Claude Code (nouvel
// .env). La clé Gemini reste lue paresseusement à l'embed → coller la clé après
// coup marche toujours.
let memoizedEmbedder: Embedder | null = null;

/**
 * Point de sélection UNIQUE de l'embedder (port `Embedder`). Lit l'environnement
 * et délègue à `selectEmbedder` — la bascule de provider vit ICI et NULLE PART
 * AILLEURS, sans toucher au harnais ni au port MCP. Mémoïsé (cf. ci-dessus) : le
 * même embedder est rendu à tous les appels du process.
 *
 * Vit dans `embedder.ts` (et non `config.ts` comme esquissé au plan) pour éviter
 * un cycle d'import : `embedder.ts` dépend déjà de `config.ts`. Le foyer naturel
 * d'une fabrique reste de toute façon auprès des implémentations qu'elle choisit.
 */
export function createEmbedder(): Embedder {
  if (!memoizedEmbedder) {
    memoizedEmbedder = selectEmbedder(process.env);
  }
  return memoizedEmbedder;
}

// Fonctions libres conservées le temps de la transition : elles délèguent au port
// via une instance à deps explicites. Les consommateurs migreront vers `Embedder`
// (injecté par createEmbedder) au pas suivant, après quoi elles disparaîtront.
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
