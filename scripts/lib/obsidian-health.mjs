// ═══════════════════════════════════════════════════════════════════════════
// obsidian-health.mjs — READ-ONLY health view of the Obsidian integration.
// Answers two soft questions: is Obsidian installed, and is THIS brain's vault
// registered? Status is "ok" (installed + registered) or "unknown" (anything
// else) — NEVER "broken": a working RAG never needs Obsidian, so a missing or
// unregistered Obsidian is an OPTIONAL nudge, not a failure (F8.3). The hint
// rides a soft channel separate from formatHealthBanner's broken-capability banner.
// ═══════════════════════════════════════════════════════════════════════════

import { obsidianConfigPath } from "./obsidian-register.mjs";

// Pure: read-only health of the Obsidian integration for `vaultPath`.
// Seams (platform/env/home/existsSync/readFileSync) injected for testability.
// Fail-soft: any read/parse error → unknown, never throws.
export function obsidianHealth(vaultPath, seams) {
  const { platform, env, home, existsSync, readFileSync } = seams;
  const configPath = obsidianConfigPath(platform, env, home);
  if (!configPath || !existsSync(configPath)) {
    return { status: "unknown", installed: false, registered: false };
  }
  let registered = false;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    registered = Object.values(config.vaults ?? {}).some((v) => v.path === vaultPath);
  } catch {
    registered = false; // unreadable config → treat as not registered (fail-soft)
  }
  return {
    status: registered ? "ok" : "unknown",
    installed: true,
    registered,
  };
}

// Pure: a SOFT one-or-two-line nudge for the Obsidian integration, or null when
// all good. Never alarming (Obsidian is optional) — a gentle "install/register to
// open 🧠 directly", separate from the broken-capability banner.
export function formatObsidianHint(health) {
  if (health.status === "ok") return null;
  if (!health.installed) {
    return (
      "ℹ️  Optional: install Obsidian (https://obsidian.md, free) to open your 🧠 notes in a real " +
      "editor over the very same files — then \"Open folder as vault\" → your brain's vault."
    );
  }
  // Installed but this vault isn't registered yet.
  return (
    "ℹ️  Optional: in Obsidian, \"Open folder as vault\" → your brain's vault once, so 🧠 citation " +
    "links open straight in it."
  );
}

// Pure: the RUNTIME nag policy (SessionStart). Surfaces the hint ONLY for the
// actionable, self-resolving case — Obsidian installed but THIS vault not yet
// registered (one "Open folder as vault" fixes it, then this goes quiet forever).
// Stays silent when Obsidian is absent (respect the user's choice — the install
// recommendation is a one-shot install-time message, not a per-session nag) and
// when all is ok. Keeps SessionStart from nagging.
export function runtimeObsidianHint(health) {
  if (health.installed && !health.registered) return formatObsidianHint(health);
  return null;
}
