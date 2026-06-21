// ═══════════════════════════════════════════════════════════════════════════
// obsidian-register.mjs — register the brain's vault in Obsidian's `obsidian.json`
// so 🧠 `obsidian://` citation links open without a manual "Open folder as vault".
// Pure builder + guard + thin fail-soft I/O wrapper (modelled on open-env.mjs).
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from "crypto";
import { posix, win32 } from "path";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Obsidian identifies each registered vault by a 16-hex id. We derive it
// deterministically from the absolute path (not random): same path → same id,
// which makes registration naturally idempotent and the builder pure/testable.
function vaultIdFor(vaultPath) {
  return createHash("sha256").update(vaultPath).digest("hex").slice(0, 16);
}

// Normalise a vault path for equality: drop any trailing slash/backslash so
// ".../vault" and ".../vault/" match, and case-fold when the host filesystem is
// case-insensitive (macOS/Windows) so ".../Brain/vault" and ".../brain/vault" — the
// SAME folder there — match too. On a case-sensitive FS (Linux) those are genuinely
// distinct folders, so case is preserved.
const normalizeVaultPath = (p, caseInsensitive) => {
  const stripped = String(p ?? "").replace(/[\\/]+$/, "");
  return caseInsensitive ? stripped.toLowerCase() : stripped;
};

// Pure: return a NEW obsidian.json object with `vaultPath` registered. Never
// mutates the input, never clobbers other vaults. Dedup is by PATH, not only by our
// SHA-derived id: the user may already have registered this very folder via Obsidian's
// "Open folder as vault", which stores it under Obsidian's OWN random id — adding our
// id-keyed entry would then show the vault twice in the switcher. If ANY existing entry
// already points at this path (per the host's case-sensitivity), the config is returned
// verbatim (preserving its id + ts), so re-registering is a true no-op the I/O wrapper
// can detect and skip writing. `caseInsensitive` is injected by the I/O wrapper from the
// platform (default false → safe on a case-sensitive FS).
export function addVaultToObsidianConfig(json, vaultPath, { ts = 0, caseInsensitive = false } = {}) {
  const vaults = { ...(json.vaults ?? {}) };
  const target = normalizeVaultPath(vaultPath, caseInsensitive);
  const alreadyByPath = Object.values(vaults).some((v) => normalizeVaultPath(v?.path, caseInsensitive) === target);
  if (!alreadyByPath) vaults[vaultIdFor(vaultPath)] = { path: vaultPath, ts };
  return { ...json, vaults };
}

// Is the host filesystem case-insensitive for path equality? macOS (APFS default) and
// Windows are; Linux is not. Used to decide vault-path dedup above.
export function isCaseInsensitiveFs(platform) {
  return platform === "darwin" || platform === "win32";
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

// Is Obsidian currently running? Used to avoid editing obsidian.json while it is
// open (it rewrites the file on quit). `exec(command, args)` is injected and must
// return `{ status, stdout }`. Fail-soft: if we can't tell (unknown OS / exec
// throws) we ASSUME running → skip the edit rather than risk a clobbered no-op.
export function isObsidianRunning(platform, exec) {
  try {
    if (platform === "darwin" || platform === "linux") {
      return exec("pgrep", ["-i", "obsidian"]).status === 0;
    }
    if (platform === "win32") {
      // tasklist always exits 0 → detect by the image name in its output.
      const { stdout } = exec("tasklist", ["/FI", "IMAGENAME eq Obsidian.exe", "/NH"]);
      return /obsidian\.exe/i.test(stdout ?? "");
    }
    return true;
  } catch {
    return true;
  }
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

  const updated = addVaultToObsidianConfig(config, vaultPath, {
    ts: now(),
    caseInsensitive: isCaseInsensitiveFs(platform),
  });
  // Already registered → the builder returns an equal config → nothing to write.
  if (JSON.stringify(updated) === JSON.stringify(config)) {
    return { registered: true, reason: "already-registered" };
  }
  // Back up the existing config before overwriting, then write.
  copyFileSync(configPath, `${configPath}.sbg-backup`);
  writeFileSync(configPath, JSON.stringify(updated), "utf8");
  return { registered: true, reason: "registered" };
}

// Production glue: assemble the real I/O seams (node:fs + spawnSync + Date.now)
// for registerVaultInObsidian, so callers stay one-liners. Untested real-I/O
// wiring on purpose (the branching logic lives in the seam-injected functions
// above). `platform`/`env`/`home` are passed in for determinism.
export function defaultObsidianSeams({ platform, env, home }) {
  return {
    platform,
    env,
    home,
    now: () => Date.now(),
    existsSync,
    readFileSync,
    writeFileSync,
    copyFileSync,
    isObsidianRunning: () =>
      isObsidianRunning(platform, (command, args) => {
        const r = spawnSync(command, args, { encoding: "utf8" });
        return { status: r.status, stdout: r.stdout ?? "" };
      }),
  };
}
