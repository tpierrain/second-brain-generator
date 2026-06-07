// ─────────────────────────────────────────────────────────────────────────────
// repo-status.mjs — décide la ligne « repo » de la bannière SessionStart à partir
// de faits git déjà collectés (pas d'I/O ici → testable). Inclut le garde-fou
// FAIL-LOUD : si des notes du vault sont restées NON committées, c'est le symptôme
// d'un auto-commit qui n'a pas tourné (typiquement hooks muets sous nvm / PATH
// minimal de l'app desktop) → on CRIE au lieu d'afficher un ✅ trompeur.
// ─────────────────────────────────────────────────────────────────────────────

// Compte les entrées de `git status --porcelain` qui concernent le vault. Le
// format porcelain = 2 caractères de statut + espace + chemin (ex. « ?? vault/x.md »,
// «  M vault/y.md ») → on isole le chemin (slice 3) et on garde ceux sous vault/.
export function countVaultUncommitted(porcelainOut) {
  return porcelainOut
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .filter((l) => l.slice(3).startsWith("vault/"))
    .length;
}

// Champs attendus :
//   pullOk          : bool   — le `git pull --rebase` a réussi (ou pas de remote → true)
//   pullOut         : string — sa sortie (pour détecter « à jour »)
//   short           : string — HEAD court
//   changedCount    : number — fichiers changés par le pull (si mise à jour)
//   uncommittedVault: number — fichiers du vault non committés (porcelain filtré)
export function repoStatusLine({ pullOk, pullOut, short, changedCount = 0, uncommittedVault = 0 }) {
  // Priorité au garde-fou : des notes non committées au démarrage = l'auto-commit
  // n'a pas tourné. On le signale fort, avant tout statut « à jour » rassurant.
  if (uncommittedVault > 0) {
    return (
      `⚠️ ${uncommittedVault} note(s) du vault NON committée(s) — l'auto-commit n'a pas ` +
      `tourné (hooks muets ?). Tes notes sont SUR LE DISQUE mais pas versionnées. ` +
      `Vérifie les hooks (scripts/run-node.sh trouve-t-il node ?), ou commit à la main : ` +
      `git add -A && git commit.`
    );
  }
  if (!pullOk) return "⚠️ Pull échoué — vérifier manuellement.";
  if (/already up to date|déjà à jour/i.test(pullOut)) return `✅ Repo à jour (commit ${short}).`;
  return `📥 Repo mis à jour — ${changedCount} fichier(s) modifié(s) (commit ${short}).`;
}
