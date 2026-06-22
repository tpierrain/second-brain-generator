// ═══════════════════════════════════════════════════════════════════════════
// node-compat.mjs — PURE preflight: is the running Node inside the engine's
// supported window? No I/O. Fail-loud BEFORE `npm install` (ADR 0009).
//
// The only ABI-bound surface is native modules (better-sqlite3 — onnxruntime
// ships broad prebuilds). A version below the floor fails to build the binding
// cryptically; we catch it here with an actionable message instead.
// ═══════════════════════════════════════════════════════════════════════════

// The supported Node window for the engine's native deps. Floor raised to 22:
// Node 20 is EOL (April 2026) and better-sqlite3 ≥ 12.10 stopped publishing a
// Node-20 (ABI 115) prebuild; ceiling = highest declared major (26.x). MUST stay
// in sync with `rag/package.json` "engines.node" and the CI matrix (ADR 0020).
export const NODE_WINDOW = { min: 22, max: 26 };

export function checkNode(version, window) {
  const major = Number(String(version).split(".")[0]);
  if (major < window.min) {
    return {
      ok: false,
      message:
        `Node ${version} detected — this engine's native deps need Node ≥ ${window.min}. ` +
        `Node 20 is EOL (April 2026) and has no prebuilt binary for better-sqlite3. ` +
        `Install Node ${window.min}+ via nvm/volta (or from https://nodejs.org) then re-run.`,
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

// The Node ABIs (process.versions.modules) better-sqlite3 @12.10 publishes a
// prebuilt binary for: Node 22→127, 23→131, 24→137, 25→141, 26→147. MUST stay in
// sync with NODE_WINDOW (Node 20 / ABI 115 was dropped — no prebuild + EOL).
export const PREBUILT_ABIS = [127, 131, 137, 141, 147];

// The {platform}-{arch} pairs better-sqlite3 ships prebuilds for. Anything else
// (exotic arch / OS) must be built from source → needs a C++ toolchain.
export const PREBUILT_PLATFORMS = [
  "darwin-x64",
  "darwin-arm64",
  "win32-x64",
  "win32-ia32",
  "win32-arm64",
  "linux-x64",
  "linux-arm64",
];

// Best-effort detection of a C/C++ build toolchain, via an injected `probe(cmd, args)`
// → {ok} (the installer's `run` shape). Conservative on purpose: if no compiler
// answers on PATH we report false, which nudges the user to an in-window Node (always
// prebuilt) rather than risking a from-source build that may not be set up. On Windows,
// MSVC's `cl` is only on PATH inside a dev prompt — a false negative there is the safe
// side of the trade-off.
export function detectCppToolchain(probe, platform) {
  const compilers = platform === "win32" ? ["cl", "clang", "gcc"] : ["cc", "clang", "gcc"];
  return compilers.some((cmd) => probe(cmd, ["--version"]).ok);
}

// Does better-sqlite3 ship a prebuilt binary for this {platform, arch, abi}? The
// single source of truth for the matrix — used by the verdict below AND by the
// installer to decide whether it even needs to probe for a C++ toolchain.
export function hasPrebuiltBinary({ platform, arch, abi }) {
  const triple = `${platform}-${arch}`;
  return PREBUILT_PLATFORMS.includes(triple) && PREBUILT_ABIS.includes(Number(abi));
}

export function checkNativePrebuild({ platform, arch, abi }, { hasToolchain } = {}) {
  const triple = `${platform}-${arch}`;
  if (hasPrebuiltBinary({ platform, arch, abi })) return { ok: true };
  if (hasToolchain) {
    return {
      ok: true,
      warn: true,
      message:
        `No prebuilt better-sqlite3 binary for Node ABI ${abi} on ${triple}, but a C++ ` +
        `toolchain is present — it will be built from source (slower, but it works).`,
    };
  }
  return {
    ok: false,
    message:
      `No prebuilt better-sqlite3 binary for Node ABI ${abi} on ${triple}, and no C++ ` +
      `toolchain found to build it from source. Switch to Node 22–26 (nvm/volta) — those ` +
      `ship a prebuilt binary — or install a C++ build toolchain, then re-run.`,
  };
}
