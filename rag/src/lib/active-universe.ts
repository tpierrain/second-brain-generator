import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { VAULT_RAG_DIR } from "./config.js";
import { DEFAULT_UNIVERSE } from "./universe.js";

/**
 * The active universe (ADR 0034) is a per-machine session pointer: a plain-text
 * file holding a single universe name. It lives in <brain>/.vault-rag/ (the same
 * dir the brain-side `/switch` writer uses) so the engine and the writer agree on
 * the path by construction. The file itself is gitignored (per-machine session
 * state: "which context am I in on THIS machine"), while the sibling registry is
 * committed. A missing file means the single-universe default → today's behaviour.
 */
export const ACTIVE_UNIVERSE_PATH = resolve(VAULT_RAG_DIR, "active-universe");

/** Injected fs for {@link readActiveUniverse} — real fs by default, faked in tests. */
export interface ActiveUniverseDeps {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
}

/**
 * Pure core: the active universe from the state file, defaulting to the default
 * universe when the file is absent or blank. Injected I/O so the read is testable.
 */
export function readActiveUniverseWith(
  deps: ActiveUniverseDeps,
  path: string = ACTIVE_UNIVERSE_PATH
): string {
  if (!deps.existsSync(path)) return DEFAULT_UNIVERSE;
  const raw = deps.readFileSync(path).trim();
  return raw || DEFAULT_UNIVERSE;
}

/** Reads the active universe from the real state file (.vault-rag/active-universe). */
export function readActiveUniverse(): string {
  return readActiveUniverseWith({
    existsSync,
    readFileSync: (p) => readFileSync(p, "utf-8"),
  });
}
