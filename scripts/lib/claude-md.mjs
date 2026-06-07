// ═══════════════════════════════════════════════════════════════════════════
// claude-md.mjs — détection du CLAUDE.md « amorce » (pré-installation).
//
// Le template livre un CLAUDE.md d'amorce porteur d'un marqueur : il signale à
// Claude que le repo n'est pas encore installé et l'invite à guider l'utilisateur
// vers `node installer.mjs`. L'installeur doit pouvoir l'écraser (et SEULEMENT
// lui) par le vrai CLAUDE.md généré — sans jamais écraser une vraie constitution
// utilisateur.
// ═══════════════════════════════════════════════════════════════════════════

export const INSTALLER_STUB_MARKER = "<!-- second-brain-generator:installer-stub -->";

// Vrai si le contenu d'un CLAUDE.md porte le marqueur d'amorce.
export function isInstallerStub(content) {
  return content.includes(INSTALLER_STUB_MARKER);
}
