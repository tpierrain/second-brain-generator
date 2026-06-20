// ═══════════════════════════════════════════════════════════════════════════
// obsidian-register.mjs — register the brain's vault in Obsidian's `obsidian.json`
// so 🧠 `obsidian://` citation links open without a manual "Open folder as vault".
// Pure builder + guard + thin fail-soft I/O wrapper (modelled on open-env.mjs).
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from "crypto";

// Obsidian identifies each registered vault by a 16-hex id. We derive it
// deterministically from the absolute path (not random): same path → same id,
// which makes registration naturally idempotent and the builder pure/testable.
function vaultIdFor(vaultPath) {
  return createHash("sha256").update(vaultPath).digest("hex").slice(0, 16);
}

// Pure: return a NEW obsidian.json object with `vaultPath` registered. Never
// mutates the input, never clobbers other vaults. Already-registered → keeps the
// existing entry verbatim (preserves its `ts`), so re-registering is a true
// no-op the I/O wrapper can detect and skip writing.
export function addVaultToObsidianConfig(json, vaultPath, { ts = 0 } = {}) {
  const vaults = { ...(json.vaults ?? {}) };
  const id = vaultIdFor(vaultPath);
  if (!vaults[id]) vaults[id] = { path: vaultPath, ts };
  return { ...json, vaults };
}
