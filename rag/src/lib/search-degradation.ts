import { DailyCapExceededError } from "./usage-tracker.js";

/**
 * Message de dégradation gracieuse pour `search_vault` quand l'embedding de la
 * requête bute sur le plafond journalier. Renvoie `null` pour toute autre erreur
 * (qu'on laisse remonter, pour ne pas masquer un vrai problème).
 *
 * Ceinture + bretelles : avec la réserve de quota (item 2), la recherche ne
 * devrait quasi jamais arriver ici.
 */
export function capExceededSearchMessage(err: unknown): string | null {
  if (err instanceof DailyCapExceededError) {
    return (
      "Quota d'embeddings du jour atteint — la recherche sémantique reprend demain " +
      "(réinitialisation à minuit Pacifique). L'index déjà construit reste interrogeable " +
      "via list_documents / get_document."
    );
  }
  return null;
}
