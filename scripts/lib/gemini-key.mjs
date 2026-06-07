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
