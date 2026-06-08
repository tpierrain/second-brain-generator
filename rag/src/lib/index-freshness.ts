import type { EmbedderIdentity } from "./vector-store.js";

/**
 * Verdict de fraîcheur de l'index face à l'embedder courant. Quand il est périmé,
 * il porte **les deux identités** (estampillée vs courante) pour un message
 * actionnable côté conversation (cf. confirm-gate, plan embedder-spi §4).
 */
export type FreshnessVerdict =
  | { fresh: true }
  | {
      fresh: false;
      stamped: EmbedderIdentity | null;
      current: EmbedderIdentity;
    };

/**
 * Compare l'identité estampillée dans l'index à celle de l'embedder courant.
 * Mismatch → périmé. Plutôt qu'une recherche qui ment en silence, on remonte un
 * signal explicite (esprit fail-loud du projet).
 */
/**
 * Faut-il (ré)estampiller l'index après ce run ? On ne pose une **nouvelle**
 * identité que quand l'index la reflète vraiment : soit un `force` (tout est
 * ré-encodé avec l'embedder courant), soit un index encore vierge d'estampille
 * (install neuve / index d'avant ce plan). En incrémental sur un index déjà
 * estampillé, on n'y touche pas : si l'embedder a changé hors du gate, le garde
 * le détecte toujours (on ne maquille jamais l'index en « frais »).
 */
export function shouldStamp(
  force: boolean,
  existing: EmbedderIdentity | null
): boolean {
  return force || existing === null;
}

export function checkIndexFreshness(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): FreshnessVerdict {
  if (
    stamped !== null &&
    stamped.providerId === current.providerId &&
    stamped.model === current.model &&
    stamped.dimension === current.dimension
  ) {
    return { fresh: true };
  }
  return { fresh: false, stamped, current };
}
