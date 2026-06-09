import type { Embedder, EmbedderIdentity } from "./embedder.js";

/** Quantification ONNX du modèle (q8 = défaut : léger, qualité quasi pleine). */
export type Dtype = "fp32" | "q8" | "q4";

/**
 * Prompts de tâche d'un modèle. Certains modèles (EmbeddingGemma) sont entraînés
 * avec un préfixe distinct côté question vs document et perdent en qualité sans —
 * d'autres (bge-m3) n'en veulent pas. Absent = texte brut.
 */
export interface TaskPrompts {
  query: string;
  document: string;
}

/**
 * Plafond de lot par défaut. L'attention ONNX est en O(seq²)×batch : envoyer tous
 * les chunks d'une note longue d'un coup fait exploser la RAM (mesuré : note de 78
 * chunks → 8,5 Go et stall). Balayage 4/8/16 sur corpus dense (264 notes) : le PETIT
 * lot gagne sur les deux axes (RAM ET temps) — 4 = pic ~3,2 Go / 5,3 min, vs 16 =
 * 5,4 Go / 7,4 min. La qualité est inchangée (chaque texte est embeddé
 * indépendamment). Voir plan Étape 4-ter + eval-set.md.
 */
export const EMBED_BATCH = 4;

/** Config de l'adaptateur in-process (modèle ONNX + dimension + quantification + prompts). */
export interface InProcessConfig {
  model: string;
  dimension: number;
  dtype?: Dtype;
  prompts?: TaskPrompts;
  /** Taille max d'un sous-lot envoyé au pipeline (borne la RAM). Défaut : `EMBED_BATCH`. */
  batchSize?: number;
}

/** Tenseur de sortie minimal dont l'adaptateur a besoin (sous-ensemble de Transformers.js). */
export interface FeatureExtractionTensor {
  tolist(): number[][];
}

/** Le pipeline `feature-extraction` de Transformers.js, réduit à ce qu'on appelle. */
export type FeatureExtractor = (
  input: string | string[],
  opts: { pooling: "mean"; normalize: boolean }
) => Promise<FeatureExtractionTensor>;

/** Charge (et télécharge au 1ᵉʳ usage) le pipeline ONNX — injectable pour tester sans poids. */
export type LoadExtractor = () => Promise<FeatureExtractor>;

// Prompts officiels d'EmbeddingGemma (model card) : un préfixe distinct côté
// recherche vs document. Ollama les applique en interne ; en in-process c'est à
// nous de les poser, sinon la qualité chute (cf. mesure Étape 4-bis).
const EMBEDDING_GEMMA_PROMPTS: TaskPrompts = {
  query: "task: search result | query: ",
  document: "title: none | text: ",
};

/**
 * Prompts de tâche à appliquer pour un modèle donné, ou `undefined` si le modèle
 * n'en attend pas (bge-m3, e5…). Connaissance modèle isolée ici (pure, testable) :
 * la sélection l'utilise pour configurer l'adaptateur sans coder en dur le modèle.
 */
export function promptsForModel(model: string): TaskPrompts | undefined {
  return /embeddinggemma/i.test(model) ? EMBEDDING_GEMMA_PROMPTS : undefined;
}

/**
 * Chargeur réel par défaut : importe Transformers.js **paresseusement** (dynamic
 * import) et construit le pipeline `feature-extraction` pour le modèle/quantif voulus.
 * Les poids sont téléchargés+cachés au 1ᵉʳ appel, puis tout tourne offline et CPU.
 * Isolé ici pour que les tests unitaires injectent un faux extractor (zéro poids).
 */
function makeDefaultLoad(config: InProcessConfig): LoadExtractor {
  return async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", config.model, {
      dtype: config.dtype ?? "q8",
    });
    return extractor as unknown as FeatureExtractor;
  };
}

/**
 * Adaptateur du port `Embedder` qui charge le modèle **dans le process Node** via
 * Transformers.js (runtime ONNX), sans serveur ni app à installer (ni Ollama).
 * « Gemma inside » : `npm i` tire l'embedder, les poids se téléchargent+cachent au
 * 1ᵉʳ usage puis tout est offline. Voir étude §3 ter + plan Étape 4-bis.
 */
export class InProcessEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  // Pipeline mémoïsé : chargé une seule fois (modèle coûteux à monter en mémoire),
  // réutilisé pour tous les embeds. Sur échec, on ne cache rien → l'appel suivant réessaie.
  private extractorPromise: Promise<FeatureExtractor> | null = null;

  constructor(
    private readonly config: InProcessConfig,
    private readonly loadExtractor: LoadExtractor = makeDefaultLoad(config)
  ) {
    this.identity = {
      providerId: "transformers-js",
      model: config.model,
      dimension: config.dimension,
    };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const prefix = this.config.prompts?.document ?? "";
    return this.embed(texts.map((t) => prefix + t));
  }

  async embedQuery(text: string): Promise<number[]> {
    const prefix = this.config.prompts?.query ?? "";
    const vectors = await this.embed([prefix + text]);
    return vectors[0];
  }

  /**
   * Encode les textes par **sous-lots bornés** (pooling moyen + normalisation L2).
   * Le plafond évite l'explosion RAM d'onnxruntime sur les notes longues ; les
   * vecteurs sont reconcaténés dans l'ordre d'origine.
   */
  private async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const batchSize = this.config.batchSize ?? EMBED_BATCH;
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const tensor = await extractor(texts.slice(i, i + batchSize), {
        pooling: "mean",
        normalize: true,
      });
      vectors.push(...tensor.tolist());
    }
    return vectors;
  }

  /**
   * Charge le pipeline. Si le chargement échoue (poids non téléchargeables, runtime
   * absent…), on lève une erreur **bruyante** qui nomme le modèle — jamais un vecteur
   * vide silencieux qui empoisonnerait l'index.
   */
  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadExtractor().catch((cause) => {
        // Échec → on oublie la promesse pour qu'un prochain appel réessaie de charger.
        this.extractorPromise = null;
        throw new Error(
          `Impossible de charger le modèle in-process « ${this.config.model} » ` +
            `(Transformers.js). Cause : ${cause instanceof Error ? cause.message : cause}`
        );
      });
    }
    return this.extractorPromise;
  }
}
