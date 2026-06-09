// ═══════════════════════════════════════════════════════════════════════════
// gemini-key.mjs — détection PURE de la présence d'une clé Gemini dans un .env.
// Aucune I/O : reçoit le contenu du fichier (string), ou null/undefined si absent.
// Utilisé par le hook de statut de session pour baliser une clé manquante.
// ═══════════════════════════════════════════════════════════════════════════

// Vrai si une ligne `GOOGLE_GEMINI_API_KEY=<valeur non vide>` est présente.
// (Même règle que l'installeur : la ligne seule avec valeur vide ne compte pas.)
export function hasGeminiKey(envContent) {
  if (!envContent) return false;
  return /^GOOGLE_GEMINI_API_KEY=.+/m.test(envContent);
}

// Vrai si l'embedder courant a besoin d'une clé Gemini. Le défaut (provider absent
// ou `gemini`) = Gemini natif → clé requise. Les providers locaux/API alternatifs
// (`in-process`, `openai-compatible`, dont Ollama) n'en ont aucun besoin → on ne
// doit alors NI la forcer à l'install, NI alerter sur son absence (session-status).
export function geminiKeyRequired(envContent) {
  const m = envContent && /^EMBEDDING_PROVIDER=(.+)$/m.exec(envContent);
  const provider = m ? m[1].trim() : "";
  return provider !== "in-process" && provider !== "openai-compatible";
}
