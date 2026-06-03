// ═══════════════════════════════════════════════════════════════════════════
// claude-md.mjs — détection du CLAUDE.md « amorce » (pré-installation).
//
// Le template livre un CLAUDE.md d'amorce porteur d'un marqueur : il signale à
// Claude que le repo n'est pas encore installé et l'invite à guider l'utilisateur
// vers `node bootstrap.mjs`. Le bootstrap doit pouvoir l'écraser (et SEULEMENT
// lui) par le vrai CLAUDE.md généré — sans jamais écraser une vraie constitution
// utilisateur.
// ═══════════════════════════════════════════════════════════════════════════

export const BOOTSTRAP_STUB_MARKER = "<!-- second-brain-starter:bootstrap-stub -->";

// Vrai si le contenu d'un CLAUDE.md porte le marqueur d'amorce.
export function isBootstrapStub(content) {
  return content.includes(BOOTSTRAP_STUB_MARKER);
}
