// ═══════════════════════════════════════════════════════════════════════════
// locale.mjs — pure mapping from a free-form language label (--lang) to the
// locale code that selects which set of generated artefacts (constitution,
// skills, demo vault) gets installed into the brain. No I/O.
// ═══════════════════════════════════════════════════════════════════════════

// Recognised aliases per locale. Matching is accent-insensitive and
// case-insensitive; anything unrecognised (or absent) falls back to `en`.
const FRENCH_ALIASES = ["fr", "français", "francais", "french"];

export function resolveLocale(lang) {
  const norm = String(lang ?? "")
    .trim()
    .toLowerCase();
  if (FRENCH_ALIASES.includes(norm)) return "fr";
  return "en";
}

// Given the resolved locale and the locale dirs actually present under
// `templates/`, returns the locale to overlay from. Falls back to `en`, then to
// `null` (no localized templates yet → keep the legacy artefacts already copied
// at the brain root). Pure: `available` is injected (the installer lists dirs).
export function chooseLocale(requested, available) {
  if (available.includes(requested)) return requested;
  if (available.includes("en")) return "en";
  return null;
}
