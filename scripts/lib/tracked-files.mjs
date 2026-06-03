// ═══════════════════════════════════════════════════════════════════════════
// tracked-files.mjs — parsing PUR de la sortie `git ls-files -z`. Aucune I/O.
// ═══════════════════════════════════════════════════════════════════════════

// `git ls-files -z` sépare chaque chemin par un NUL (\0) — robuste aux espaces
// et accents dans les noms — et termine la liste par un NUL final. On découpe
// sur \0 et on jette l'entrée vide de fin (et toute entrée vide éventuelle).
export function parseLsFilesZ(output) {
  return output.split("\0").filter((p) => p !== "");
}

// Fichiers SUIVIS du launcher à NE PAS copier dans le cerveau : ils ne concernent
// que le développement du générateur lui-même (cf. plan §3.4). DEVELOPING.md est
// tracké (donc listé par `ls-files`) mais ne doit pas atterrir chez l'utilisateur.
const DEV_ONLY = new Set(["DEVELOPING.md"]);

// Retient, parmi les chemins suivis, ceux à copier dans le cerveau généré.
export function filterCopyable(paths) {
  return paths.filter((p) => !DEV_ONLY.has(p));
}
