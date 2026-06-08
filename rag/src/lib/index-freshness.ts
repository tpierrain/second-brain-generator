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

/**
 * Prose du confirm-gate (langage naturel), relayée par Claude quand l'index est
 * périmé. Nomme les modèles DYNAMIQUEMENT via l'identité — rien n'est codé en dur
 * « Gemini ». Par défaut on ne réindexe RIEN : on demande, on attend le « oui »
 * (cf. plan embedder-spi §4). Le contrat MCP ne bouge pas : ce n'est que du texte.
 */
export function staleIndexMessage(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): string {
  const avant = stamped ? `avant : ${stamped.model}, ` : "";
  return (
    `Mes capacités de recherche rapide et sémantique reposent sur un indexeur/embedder ; ` +
    `or sa configuration a changé (${avant}maintenant : ${current.model}). ` +
    `Pour continuer à fonctionner, il me faut ré-indexer tes documents — eux ne bougent pas, ` +
    `c'est juste qu'ils doivent être ré-encodés avec le nouveau modèle. ` +
    `Ça peut prendre un peu de temps. Tu veux que je le fasse maintenant ?`
  );
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
