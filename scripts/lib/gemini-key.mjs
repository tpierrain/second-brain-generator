// ═══════════════════════════════════════════════════════════════════════════
// gemini-key.mjs — PURE detection of a Gemini key's presence in a .env.
// No I/O: receives the file content (string), or null/undefined if absent.
// Used by the session-status hook to flag a missing key.
// ═══════════════════════════════════════════════════════════════════════════

// True if a `GOOGLE_GEMINI_API_KEY=<non-empty value>` line is present.
// (Same rule as the installer: the line alone with an empty value does not count.)
export function hasGeminiKey(envContent) {
  if (!envContent) return false;
  return /^GOOGLE_GEMINI_API_KEY=.+/m.test(envContent);
}

// True if the current embedder needs a Gemini key. The default (provider absent
// or `gemini`) = native Gemini → key required. Local/alternative API providers
// (`in-process`, `openai-compatible`, including Ollama) need none → we must
// then NEITHER force it at install, NOR alert on its absence (session-status).
export function geminiKeyRequired(envContent) {
  const m = envContent && /^EMBEDDING_PROVIDER=(.+)$/m.exec(envContent);
  const provider = m ? m[1].trim() : "";
  return provider !== "in-process" && provider !== "openai-compatible";
}

// PURE: the "Gemini key missing" warning string, or null if no warning is due.
// Warns ONLY when a Gemini key is BOTH required (provider gemini/default) AND
// missing — so keyless embedders (in-process / openai-compatible / Ollama) never
// see a bogus warning. Single source of truth shared by the status-line and the
// session-status hook (both surfaces).
export function geminiKeyWarning(envContent) {
  return geminiKeyRequired(envContent) && !hasGeminiKey(envContent)
    ? "⚠️ Gemini key missing"
    : null;
}
