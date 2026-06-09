// ═══════════════════════════════════════════════════════════════════════════
// embedder-choice.mjs — logique PURE du choix d'embedder à l'installation.
// Aucune I/O : reçoit { platform, arch, totalMemBytes }, rend la reco, le menu
// des 3 options et les lignes .env correspondantes. Décision D1 (ADR 0007).
// ═══════════════════════════════════════════════════════════════════════════

// L'embedder in-process (Transformers.js + onnxruntime-node 1.24.3) n'a PAS de
// binaire pré-buildé pour Mac Intel (darwin/x64) → option indisponible là-bas.
export function inProcessAvailable({ platform, arch }) {
  return !(platform === "darwin" && arch === "x64");
}

// Seuil RAM (figé par Thomas, D1) au-dessus duquel l'in-process est recommandé.
// En-dessous, il monte à ~6 Go en indexation d'un vrai vault → swappe → la clé
// d'API (RAM ~0) est plus sûre. Pic RAM mesuré à l'Étape 4-ter.
const IN_PROCESS_MIN_RAM_BYTES = 12 * 1024 ** 3;

// Reco adaptative D1 : in-process si la machine le supporte ET a assez de RAM ;
// sinon la clé d'API (repli sûr, RAM ~0).
export function recommendedEmbedderKey({ platform, arch, totalMemBytes }) {
  if (inProcessAvailable({ platform, arch }) && totalMemBytes >= IN_PROCESS_MIN_RAM_BYTES) {
    return "in-process";
  }
  return "api";
}

// Les 3 options du menu d'install, en ordre de confidentialité décroissante (ADR
// 0007 addendum D1). Sur Mac Intel l'option in-process est retirée (indisponible)
// et les numéros se resserrent. L'option recommandée pour CETTE machine porte ⭐.
export function buildEmbedderOptions({ platform, arch, totalMemBytes }) {
  const recommended = recommendedEmbedderKey({ platform, arch, totalMemBytes });
  const keys = ["in-process", "api", "ollama"].filter(
    (k) => k !== "in-process" || inProcessAvailable({ platform, arch }),
  );
  return keys.map((key, i) => ({
    num: i + 1,
    key,
    recommended: key === recommended,
  }));
}

// Traduit un choix d'embedder en lignes à écrire dans .env + un drapeau disant si
// une clé Gemini reste requise. La clé (Gemini ou EMBEDDING_API_KEY) n'est JAMAIS
// portée ici : elle est saisie/collée à part dans .env (jamais un argument).
export function envConfigForEmbedder(key, details = {}) {
  if (key === "in-process") {
    return { lines: ["EMBEDDING_PROVIDER=in-process"], needsGeminiKey: false };
  }
  if (key === "gemini") {
    // Provider par défaut (selectEmbedder) → rien à écrire ; seule la clé compte.
    return { lines: [], needsGeminiKey: true };
  }
  if (key === "openai-compatible") {
    return {
      lines: [
        "EMBEDDING_PROVIDER=openai-compatible",
        `EMBEDDING_BASE_URL=${details.baseURL}`,
        `EMBEDDING_MODEL_NAME=${details.model}`,
        `EMBEDDING_DIMENSION=${details.dimension}`,
      ],
      needsGeminiKey: false,
    };
  }
  if (key === "ollama") {
    // Ollama = l'adaptateur openai-compatible pointé sur le serveur local (ADR 0007).
    // Défauts EmbeddingGemma (768) ; surchargeables (ex. bge-m3/1024).
    return envConfigForEmbedder("openai-compatible", {
      baseURL: details.baseURL ?? "http://localhost:11434/v1",
      model: details.model ?? "embeddinggemma",
      dimension: details.dimension ?? 768,
    });
  }
  throw new Error(`Choix d'embedder inconnu : ${key}`);
}
