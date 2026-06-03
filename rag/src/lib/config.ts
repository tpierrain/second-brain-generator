import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const projectRoot = resolve(__dirname, "../../..");

const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
}

export const VAULT_DIR = resolve(projectRoot, "vault");
export const CACHE_DIR = resolve(__dirname, "../../.cache");
export const DB_PATH = resolve(CACHE_DIR, "vault.db");
export const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY ?? "";

// Choix de la clé Gemini à utiliser, PUR (testable) : si une clé non vide est déjà
// chargée en mémoire, on la garde ; sinon on relit le .env via `reloadFromEnvFile`.
// Couvre le scénario d'onboarding : l'utilisateur colle sa clé dans .env APRÈS avoir
// déjà lancé Claude Code (le process MCP tournait alors avec une clé vide).
export function resolveKey(
  current: string | undefined,
  reloadFromEnvFile: () => string | undefined
): string {
  if (current) return current;
  return reloadFromEnvFile() ?? "";
}

// Clé Gemini « live » : relit le .env à la volée si la clé manquait au démarrage,
// pour qu'une clé collée après coup soit prise en compte SANS reconnecter le MCP.
// `override: true` est sûr ici car on ne recharge que si la clé courante est vide
// (cas du `.env` livré avec `GOOGLE_GEMINI_API_KEY=` vide → process.env fige "").
export function readGeminiKey(): string {
  return resolveKey(process.env.GOOGLE_GEMINI_API_KEY, () => {
    if (existsSync(envPath)) config({ path: envPath, override: true });
    return process.env.GOOGLE_GEMINI_API_KEY;
  });
}
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const CHUNK_MAX_CHARS = 8000;
export const SEARCH_DEFAULT_LIMIT = 5;

// Garde-fou A : plafond dur de requêtes d'embedding par jour (réinit. minuit Pacifique).
// Depuis le passage au tier PAYANT Gemini (2026-06-01), ce n'est plus aligné sur les
// 1000/jour du free tier : c'est désormais un simple filet anti-emballement (boucle folle,
// ré-index redondant), et c'est lui la vraie contrainte (plus de mur Google à 1000).
// Défaut 7600 (×4 de l'ancien 1900). Surchargeable via .env.
export const MAX_EMBED_REQUESTS_PER_DAY = Number(
  process.env.MAX_EMBED_REQUESTS_PER_DAY ?? 7600
);

// Réserve de quota dédiée aux requêtes de recherche : l'indexation s'arrête à
// MAX_EMBED_REQUESTS_PER_DAY − QUERY_RESERVE, garantissant que « parler » (search)
// n'est jamais bloqué par un gros jour d'indexation. Surchargeable via .env.
export const QUERY_RESERVE = Number(process.env.QUERY_RESERVE ?? 50);
