// ═══════════════════════════════════════════════════════════════════════════
// tracked-files.mjs — parsing PUR de la sortie `git ls-files -z`. Aucune I/O.
// ═══════════════════════════════════════════════════════════════════════════

// `git ls-files -z` sépare chaque chemin par un NUL (\0) — robuste aux espaces
// et accents dans les noms — et termine la liste par un NUL final. On découpe
// sur \0 et on jette l'entrée vide de fin (et toute entrée vide éventuelle).
export function parseLsFilesZ(output) {
  return output.split("\0").filter((p) => p !== "");
}
