// ═══════════════════════════════════════════════════════════════════════════
// tracked-files.mjs — parsing PUR de la sortie `git ls-files -z`. Aucune I/O.
// ═══════════════════════════════════════════════════════════════════════════

// `git ls-files -z` sépare chaque chemin par un NUL (\0) — robuste aux espaces
// et accents dans les noms — et termine la liste par un NUL final. On découpe
// sur \0 et on jette l'entrée vide de fin (et toute entrée vide éventuelle).
export function parseLsFilesZ(output) {
  return output.split("\0").filter((p) => p !== "");
}

// Fichiers/dossiers SUIVIS du launcher à NE PAS copier dans le cerveau : ils ne
// concernent que le développement du générateur lui-même. Tous sont trackés (donc
// listés par `ls-files`) et voyagent entre les machines du mainteneur, mais ne
// doivent jamais atterrir chez l'utilisateur final.
//   - DEVELOPING.md : la notice de dev à la racine.
//   - maintainers/  : tout le contexte de dev (décisions, plans, archives).
const DEV_ONLY_FILES = new Set(["DEVELOPING.md"]);
const DEV_ONLY_DIRS = ["maintainers/"];

// Retient, parmi les chemins suivis, ceux à copier dans le cerveau généré.
export function filterCopyable(paths) {
  return paths.filter(
    (p) =>
      !DEV_ONLY_FILES.has(p) && !DEV_ONLY_DIRS.some((dir) => p.startsWith(dir)),
  );
}
