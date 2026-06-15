// ═══════════════════════════════════════════════════════════════════════════
// node-compat.mjs — PURE preflight: is the running Node inside the engine's
// supported window? No I/O. Fail-loud BEFORE `npm install` (ADR 0009).
//
// The only ABI-bound surface is native modules (better-sqlite3 — onnxruntime
// ships broad prebuilds). better-sqlite3@12 declares Node 20–26, so a version
// below the floor will fail to build the binding cryptically; we catch it here
// with an actionable message instead.
// ═══════════════════════════════════════════════════════════════════════════

// The supported Node window for the engine's native deps. Floor = better-sqlite3@12's
// declared minimum (20.x); ceiling = its highest declared major (26.x). MUST stay in
// sync with `rag/package.json` "engines.node" and the CI matrix (ADR 0020).
export const NODE_WINDOW = { min: 20, max: 26 };

export function checkNode(version, window) {
  const major = Number(String(version).split(".")[0]);
  if (major < window.min) {
    return {
      ok: false,
      message:
        `Node ${version} detected — this engine's native deps need Node ≥ ${window.min}. ` +
        `Switch with nvm/volta (or install from https://nodejs.org) then re-run.`,
    };
  }
  if (major > window.max) {
    return {
      ok: true,
      warn: true,
      message:
        `Node ${version} detected — newer than the tested ceiling (Node ${window.max}). ` +
        `Proceeding; if the native build fails, fall back to Node ${window.max}.`,
    };
  }
  return { ok: true };
}
