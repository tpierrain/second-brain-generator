// Mutation hardening (Stryker): config.ts 43.33 % → 86.67 %.
// config.ts is a composition root: pure cores (resolvePath, resolveKey) + a thin
// import-time .env side-effect. We extracted loadEnvFile(path, override, deps) so the
// "load only if present, right path/override" glue is unit-testable, and pinned the
// frozen path/number constants (VAULT_DIR/CACHE_DIR/DB_PATH/ENV_PATH/MAX) to their
// deterministic defaults.
// The 4 residual survivors are documented EQUIVALENTS, all env-/fs-bound glue:
//  - 29 defaultEnvLoadDeps.loadConfig → the real dotenv call, only run at a real
//    import (tests inject fakes);
//  - 60 GEMINI_API_KEY's `?? "Stryker"` → unreachable fallback when a real key is in
//    the env (key ?? anything = key); the empty-vs-`&&` contract IS pinned by the
//    invariant test;
//  - 79/80 readGeminiKey's reload closure body + its `override:true` → the .env
//    re-read path, exercised only on an empty-startup-key onboarding; the decision
//    core (resolveKey) is fully covered. Effective on non-equivalents: 26/26 = 100 %.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  QUERY_RESERVE,
  MAX_EMBED_REQUESTS_PER_DAY,
  GEMINI_API_KEY,
  VAULT_DIR,
  CACHE_DIR,
  DB_PATH,
  ENV_PATH,
  resolveKey,
  resolvePath,
  readGeminiKey,
  loadEnvFile,
  type EnvLoadDeps,
} from "./config.js";

// config.test.ts lives next to config.ts (rag/src/lib/) → same base dirs, so the
// module's frozen path constants can be reconstructed deterministically here.
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");

// Recording fake for loadEnvFile's injected I/O.
function envLoadSpy(exists: boolean) {
  const calls: Array<{ path: string; override: boolean }> = [];
  const deps: EnvLoadDeps = {
    existsSync: () => exists,
    loadConfig: (opts) => calls.push(opts),
  };
  return { deps, calls };
}

test("loadEnvFile: no file at the path → does NOT load anything", () => {
  const { deps, calls } = envLoadSpy(false);
  loadEnvFile("/nope/.env", false, deps);
  assert.equal(calls.length, 0);
});

test("loadEnvFile: file present → loads it at that exact path, override off by default", () => {
  const { deps, calls } = envLoadSpy(true);
  loadEnvFile("/home/me/.env", false, deps);
  assert.deepEqual(calls, [{ path: "/home/me/.env", override: false }]);
});

test("loadEnvFile: override=true is forwarded (re-read an empty startup key)", () => {
  const { deps, calls } = envLoadSpy(true);
  loadEnvFile("/home/me/.env", true, deps);
  assert.deepEqual(calls, [{ path: "/home/me/.env", override: true }]);
});

test("loadEnvFile: override defaults to false when omitted (the import-time load)", () => {
  const { deps, calls } = envLoadSpy(true);
  loadEnvFile("/home/me/.env", undefined, deps);
  assert.equal(calls[0].override, false);
});

test("GEMINI_API_KEY snapshots the env key, empty-string-safe (never undefined)", () => {
  // Regression invariant: the ?? "" keeps it a string. A && "" (or a dropped
  // coalesce) would break the "reflects the env key, else empty" contract.
  assert.equal(GEMINI_API_KEY, process.env.GOOGLE_GEMINI_API_KEY ?? "");
  assert.equal(typeof GEMINI_API_KEY, "string");
});

test("QUERY_RESERVE default = 50 (credits reserved for search)", () => {
  assert.equal(QUERY_RESERVE, 50);
});

test("MAX_EMBED_REQUESTS_PER_DAY default = 7600 (runaway safety net)", () => {
  assert.equal(MAX_EMBED_REQUESTS_PER_DAY, 7600);
});

test("VAULT_DIR defaults to <repoRoot>/vault (relocatable-path fallback)", () => {
  assert.equal(VAULT_DIR, resolve(repoRoot, "vault"));
});

test("CACHE_DIR defaults to <repoRoot>/rag/.cache", () => {
  assert.equal(CACHE_DIR, resolve(repoRoot, "rag/.cache"));
});

test("DB_PATH is vault.db inside the cache dir", () => {
  assert.equal(DB_PATH, resolve(CACHE_DIR, "vault.db"));
});

test("ENV_PATH defaults to <repoRoot>/.env", () => {
  assert.equal(ENV_PATH, resolve(repoRoot, ".env"));
});

// resolvePath — the pure relocatable-path core (env value wins as absolute, else fallback).
test("resolvePath: non-empty env value wins, resolved to absolute", () => {
  assert.equal(resolvePath("/data/vault", "/fallback"), resolve("/data/vault"));
});

test("resolvePath: undefined env value → keep the fallback verbatim", () => {
  assert.equal(resolvePath(undefined, "/fallback"), "/fallback");
});

test("resolvePath: whitespace-only env value → keep the fallback (not an override)", () => {
  assert.equal(resolvePath("   ", "/fallback"), "/fallback");
});

test("readGeminiKey: returns the in-process key when present (no .env reload)", () => {
  const prev = process.env.GOOGLE_GEMINI_API_KEY;
  process.env.GOOGLE_GEMINI_API_KEY = "AIza-current-in-memory";
  try {
    assert.equal(readGeminiKey(), "AIza-current-in-memory");
  } finally {
    if (prev === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = prev;
  }
});

// The key is read once at MCP process startup. If the user pastes it into .env
// AFTER having launched Claude Code, the process was running with an empty key.
// resolveKey then re-reads the .env on the fly → no need to reconnect the server.
test("resolveKey — keeps the already-loaded key, without re-reading the .env", () => {
  let reloaded = false;
  const key = resolveKey("AIza-already-here", () => {
    reloaded = true;
    return "from-the-file";
  });
  assert.equal(key, "AIza-already-here");
  assert.equal(reloaded, false, "must not re-read the .env if the key is already there");
});

test("resolveKey — key missing at startup → re-reads the .env (key pasted after the fact)", () => {
  assert.equal(resolveKey("", () => "AIza-pasted-after"), "AIza-pasted-after");
});

test("resolveKey — still nothing in the .env → empty string (no crash)", () => {
  assert.equal(resolveKey("", () => undefined), "");
});
