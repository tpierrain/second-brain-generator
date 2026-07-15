import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const projectRoot = resolve(__dirname, "../../..");

// Relocatable paths (engine-packaging Phase 0): the Engine reads where the vault,
// cache and .env live from the environment, defaulting to today's relative paths.
// Pure + unit-testable: a non-empty env value wins (resolved to absolute),
// otherwise the historical fallback is kept verbatim (regression guard).
export function resolvePath(
  envValue: string | undefined,
  fallback: string
): string {
  return envValue && envValue.trim() ? resolve(envValue) : fallback;
}

/** Injected I/O for {@link loadEnvFile} — real fs + dotenv by default, faked in tests. */
export interface EnvLoadDeps {
  existsSync: (path: string) => boolean;
  loadConfig: (opts: { path: string; override: boolean }) => void;
}

const defaultEnvLoadDeps: EnvLoadDeps = {
  existsSync,
  loadConfig: (opts) => {
    config(opts);
  },
};

/**
 * Loads a `.env` file into `process.env` — but ONLY if it exists (a missing file
 * is a no-op, never a crash). `override` re-reads a key that was empty at startup
 * (onboarding: key pasted after the MCP launched). Pure decision + injected I/O so
 * the "load only if present, with the right path/override" glue is unit-testable.
 */
export function loadEnvFile(
  path: string,
  override = false,
  deps: EnvLoadDeps = defaultEnvLoadDeps
): void {
  if (deps.existsSync(path)) deps.loadConfig({ path, override });
}

export const ENV_PATH = resolvePath(
  process.env.SBG_ENV_PATH,
  resolve(projectRoot, ".env")
);
loadEnvFile(ENV_PATH);

export const VAULT_DIR = resolvePath(process.env.VAULT_DIR, resolve(projectRoot, "vault"));
export const CACHE_DIR = resolvePath(
  process.env.CACHE_DIR,
  resolve(__dirname, "../../.cache")
);
export const DB_PATH = resolve(CACHE_DIR, "vault.db");
export const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY ?? "";

// Picks the Gemini key to use, PURE (testable): if a non-empty key is already
// loaded in memory, we keep it; otherwise we re-read the .env via `reloadFromEnvFile`.
// Covers the onboarding scenario: the user pastes their key into .env AFTER having
// already launched Claude Code (the MCP process was then running with an empty key).
export function resolveKey(
  current: string | undefined,
  reloadFromEnvFile: () => string | undefined
): string {
  if (current) return current;
  return reloadFromEnvFile() ?? "";
}

// "Live" Gemini key: re-reads the .env on the fly if the key was missing at startup,
// so a key pasted after the fact is taken into account WITHOUT reconnecting the MCP.
// `override: true` is safe here because we only reload if the current key is empty
// (the case of the `.env` shipped with `GOOGLE_GEMINI_API_KEY=` empty → process.env freezes "").
export function readGeminiKey(): string {
  return resolveKey(process.env.GOOGLE_GEMINI_API_KEY, () => {
    loadEnvFile(ENV_PATH, true);
    return process.env.GOOGLE_GEMINI_API_KEY;
  });
}
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const CHUNK_MAX_CHARS = 8000;
export const SEARCH_DEFAULT_LIMIT = 8;

// Guardrail A: hard cap on embedding requests per day (resets at Pacific midnight).
// Since moving to the PAID Gemini tier (2026-06-01), this is no longer aligned with the
// free tier's 1000/day: it is now simply a runaway safety net (infinite loop,
// redundant re-index), and it is the real constraint (no more Google wall at 1000).
// Default 7600 (×4 of the former 1900). Overridable via .env.
export const MAX_EMBED_REQUESTS_PER_DAY = Number(
  process.env.MAX_EMBED_REQUESTS_PER_DAY ?? 7600
);

// Quota reserve dedicated to search requests: indexing stops at
// MAX_EMBED_REQUESTS_PER_DAY − QUERY_RESERVE, guaranteeing that "talking" (search)
// is never blocked by a heavy indexing day. Overridable via .env.
export const QUERY_RESERVE = Number(process.env.QUERY_RESERVE ?? 50);
