import type { Embedder, EmbedderIdentity } from "./embedder.js";

/**
 * Adaptateur déterministe du port `Embedder`, sans réseau ni clé : un même texte
 * donne toujours le même vecteur (hash des caractères replié sur une dimension
 * fixe). Sert en test ET prouve que le port tient pour une impl non-Gemini —
 * sans être un « 2ᵉ embedder réel » (cf. plan embedder-spi §2 et décision §0.2).
 */
export class FakeEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  constructor(
    dimension = 8,
    providerId = "fake",
    model = "fake-deterministic"
  ) {
    this.identity = { providerId, model, dimension };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorOf(t));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorOf(text);
  }

  private vectorOf(text: string): number[] {
    const dim = this.identity.dimension;
    const v = new Array<number>(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      v[i % dim] += text.charCodeAt(i);
    }
    return v;
  }
}
