// ─────────────────────────────────────────────────────────────────────────────
// locale-overlay.mjs — overlays templates/<locale>/** onto the brain.
//
// Most localized artifacts (constitution, skills, the demo-locale marker…) share
// the SAME relative paths across locales, so a plain recursive copy overwrites
// them in place. The demo VAULT is different: slugs are renamed per locale
// (e.g. `inertia-trophy.md` vs `trophee-de-l-inertie.md`), so a merge would leave
// the default-locale files lingering as orphans next to the localized ones.
// Those dirs (WHOLESALE_DIRS) are therefore wiped in the target before the copy:
// the locale owns them entirely.
// ─────────────────────────────────────────────────────────────────────────────
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export const WHOLESALE_DIRS = ["vault"];

export function overlayLocale({ templatesRoot, locale, target }) {
  const src = join(templatesRoot, locale);
  for (const dir of WHOLESALE_DIRS) {
    if (existsSync(join(src, dir))) {
      rmSync(join(target, dir), { recursive: true, force: true });
    }
  }
  cpSync(src, target, { recursive: true });
}
