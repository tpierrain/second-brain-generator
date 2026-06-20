// ═══════════════════════════════════════════════════════════════════════════
// obsidian-register.mjs — register the brain's vault in Obsidian's `obsidian.json`
// so 🧠 `obsidian://` citation links open without a manual "Open folder as vault".
// Pure builder + guard + thin fail-soft I/O wrapper (modelled on open-env.mjs).
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from "crypto";
import { posix, win32 } from "path";

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

// Pure: where Obsidian keeps its `obsidian.json` (the vault registry) on this OS.
// macOS: ~/Library/Application Support/obsidian; Windows: %APPDATA%\obsidian;
// Linux: $XDG_CONFIG_HOME or ~/.config/obsidian.
export function obsidianConfigPath(platform, env, home) {
  if (platform === "darwin") {
    return posix.join(home, "Library", "Application Support", "obsidian", "obsidian.json");
  }
  if (platform === "win32") {
    const appData = env.APPDATA ?? win32.join(home, "AppData", "Roaming");
    return win32.join(appData, "obsidian", "obsidian.json");
  }
  if (platform === "linux") {
    const configHome = env.XDG_CONFIG_HOME ?? posix.join(home, ".config");
    return posix.join(configHome, "obsidian", "obsidian.json");
  }
  return null;
}

// Guard: should we even attempt to register the vault? Opt-in by default, but
// false in automated/headless contexts where writing Obsidian's config would be
// pointless or surprising. Opt-out via SBG_NO_OBSIDIAN_REGISTER / CI.
export function shouldRegisterObsidian(env, platform) {
  if (env.SBG_NO_OBSIDIAN_REGISTER) return false;
  if (env.CI) return false;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  return true;
}

// Thin, fail-soft I/O wrapper: register the brain's vault in Obsidian's config so
// 🧠 `obsidian://` citation links open without a manual "Open folder as vault".
// All I/O is injected (testable). NEVER throws — any failure falls soft to a
// `{ registered: false, reason }` the caller relays as the manual instruction.
//   reason: "unsupported-platform" | "not-installed" | "running"
//         | "unreadable-config" | "already-registered" | "registered"
export function registerVaultInObsidian(vaultPath, seams) {
  const {
    platform, env, home, now,
    existsSync, readFileSync, writeFileSync, copyFileSync,
    isObsidianRunning,
  } = seams;
  const configPath = obsidianConfigPath(platform, env, home);
  if (!configPath) return { registered: false, reason: "unsupported-platform" };
  // No config file = Obsidian has never run here = treat as not installed.
  if (!existsSync(configPath)) return { registered: false, reason: "not-installed" };
  // Obsidian rewrites obsidian.json from memory on quit → editing it now would be
  // clobbered. Only safe to touch the file while Obsidian is closed.
  if (isObsidianRunning()) return { registered: false, reason: "running" };

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { registered: false, reason: "unreadable-config" };
  }

  const updated = addVaultToObsidianConfig(config, vaultPath, { ts: now() });
  // Already registered → the builder returns an equal config → nothing to write.
  if (JSON.stringify(updated) === JSON.stringify(config)) {
    return { registered: true, reason: "already-registered" };
  }
  // Back up the existing config before overwriting, then write.
  copyFileSync(configPath, `${configPath}.sbg-backup`);
  writeFileSync(configPath, JSON.stringify(updated), "utf8");
  return { registered: true, reason: "registered" };
}
