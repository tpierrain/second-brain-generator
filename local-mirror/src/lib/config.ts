// Path + environment resolution for the composition root. Mirrors the RAG's
// `resolvePath` contract (rag/src/lib/config.ts): a non-empty env value wins
// (resolved to absolute), otherwise the historical relative default is kept.
//
// We load `.env` here so the per-source Notion token (named by `token_env`) is
// visible to `process.env` even when the desktop app starts the server with a
// bare environment — exactly as the RAG does. The token itself is NEVER read,
// logged or persisted here: only made available for the connector to pick up.

import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');

/** A non-empty env value wins (resolved to absolute); otherwise the fallback. Pure + testable. */
export function resolvePath(envValue: string | undefined, fallback: string): string {
  return envValue && envValue.trim() ? resolve(envValue) : fallback;
}

/**
 * Resolves the `.env` path FRESH from the current environment (SBG_ENV_PATH or the repo-root
 * default). Computed at call-time, not frozen at boot, so the fresh-token reader (F3) and the
 * boot-time dotenv load agree on the same file.
 */
export function resolveEnvPath(): string {
  return resolvePath(process.env.SBG_ENV_PATH, resolve(projectRoot, '.env'));
}

/** DI seam for the boot-time `.env` load, so the composition-root glue is unit-testable. */
export interface EnvLoadDeps {
  existsSync: (p: string) => boolean;
  loadDotenv: (opts: { path: string }) => void;
}
const defaultEnvLoadDeps: EnvLoadDeps = { existsSync, loadDotenv: (opts) => loadDotenv(opts) };

/**
 * Loads the `.env` at `path` into `process.env` iff it exists. Returns whether it loaded.
 * Extracted so the "test the glue too" convention applies to this side-effecting boot line.
 */
export function loadEnvIfPresent(path: string, deps: EnvLoadDeps = defaultEnvLoadDeps): boolean {
  if (deps.existsSync(path)) {
    deps.loadDotenv({ path });
    return true;
  }
  return false;
}

loadEnvIfPresent(resolveEnvPath());

/** Vault root — same default as the RAG (`<root>/vault`), overridable via VAULT_DIR. */
export const VAULT_DIR = resolvePath(process.env.VAULT_DIR, resolve(projectRoot, 'vault'));

/**
 * Committed-but-NOT-indexed sidecar holding per-source state (PRD §7/§10): it lives
 * at the repo root, outside `VAULT_DIR`, so the FileWatcher never indexes it while
 * `git add .` still commits it.
 */
export const SIDECAR_DIR = resolvePath(
  process.env.LOCAL_MIRROR_SIDECAR_DIR,
  resolve(projectRoot, '.local-mirror'),
);

/** Versioned source of truth for declared sources, written by `setup_source` (PRD §20.2). */
export const CONFIG_PATH = resolvePath(
  process.env.LOCAL_MIRROR_CONFIG,
  resolve(projectRoot, 'local-mirror.config.json'),
);
