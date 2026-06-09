import type { Embedder, EmbedderIdentity } from "./embedder.js";

/** Config de l'adaptateur compatible-OpenAI (URL + clé + modèle + dimension). */
export interface OpenAiCompatibleConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  dimension: number;
}

/** Réponse HTTP minimale dont l'adaptateur a besoin (sous-ensemble de `fetch`). */
export interface EmbeddingResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** `fetch`-like injectable : isole l'adaptateur du réseau pour le tester. */
export type EmbeddingFetch = (
  url: string,
  init: RequestInit
) => Promise<EmbeddingResponse>;

/** Enveloppe de réponse compatible-OpenAI : `{ data: [{ embedding: [...] }] }`. */
interface OpenAiEmbeddingPayload {
  data?: { embedding: number[] }[];
}

/**
 * Adaptateur du port `Embedder` parlant l'« espéranto compatible-OpenAI » (ADR 0007
 * §3) : `{ model, input }` → `{ data: [{ embedding }] }`. Un seul adaptateur couvre
 * OpenAI, Azure, passerelle d'entreprise, Mistral, et le local via Ollama
 * (`http://localhost:11434/v1`) — on change de backend en changeant une URL/clé.
 */
export class OpenAiCompatibleEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly fetchFn: EmbeddingFetch = globalThis.fetch as EmbeddingFetch
  ) {
    this.identity = {
      providerId: "openai-compatible",
      model: config.model,
      dimension: config.dimension,
    };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embed(text);
    return vectors[0];
  }

  /** Un aller-retour `/embeddings` : `input` accepte un texte ou un lot (dialecte OpenAI). */
  private async embed(input: string | string[]): Promise<number[][]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // Clé vide = local (Ollama), pas d'auth ; sinon Bearer (OpenAI/Azure/passerelle).
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    const response = await this.fetchFn(`${this.config.baseURL}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.config.model, input }),
    });
    if (!response.ok) {
      // Échec bruyant : on ne renvoie JAMAIS un vecteur vide silencieux (qui
      // empoisonnerait l'index). Le statut HTTP guide le diagnostic (401 = clé,
      // 404 = URL/modèle, etc.).
      throw new Error(
        `Embedding endpoint ${this.config.baseURL} a répondu ${response.status} ` +
          `(modèle ${this.config.model}).`
      );
    }
    const payload = (await response.json()) as OpenAiEmbeddingPayload;
    return (payload.data ?? []).map((d) => d.embedding);
  }
}
