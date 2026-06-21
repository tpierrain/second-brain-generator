// ─────────────────────────────────────────────────────────────────────────────
// self-heal-message.mjs — the ONE-TIME bootstrap reassurance line (ADR 0026),
// localized by the brain's BRAIN_LOCALE. SessionStart hooks are English-only; this is
// the FIRST runtime/user-facing string the engine localizes, because it is shown to the
// user (not a log). The fr text is a deliberate PRODUCT localization — the brain speaks
// the user's language — so it is correct French, not an artifact to anglicize.
// Fail-soft: any unknown / missing locale falls back to English.
// ─────────────────────────────────────────────────────────────────────────────
import { BRAIN_LOCALE } from "./demo-locale.mjs";

const MESSAGES = {
  en:
    "⚠️ One-time engine update — finishing the wiring of your brain's new self-healing in " +
    "the background. Just RESTART Claude once (close it and reopen) and you're all set — " +
    "nothing else to do.",
  fr:
    "⚠️ Mise à jour unique du moteur — finalisation de l'auto-réparation de votre cerveau en " +
    "arrière-plan. REDÉMARREZ simplement Claude une fois (fermez-le puis rouvrez-le) et tout " +
    "est en place — rien d'autre à faire.",
};

export function bootstrapReassuranceMessage(locale = BRAIN_LOCALE) {
  return MESSAGES[locale] ?? MESSAGES.en;
}
