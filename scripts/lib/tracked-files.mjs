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
//   - EN-QUOI-C-EST-DIFFERENT.md : fiche de positionnement du générateur (pour qui
//     évalue le launcher) — renvoie aux ADR de maintainers/, sans intérêt dans un cerveau.
//   - maintainers/  : tout le contexte de dev (décisions, plans, archives).
//   - l'outillage d'EVAL-SET (scripts/run-eval.mjs, scripts/lib/eval-*, mcp-search) :
//     l'instrument qui sert à CHOISIR l'embedder du launcher (mesure Gemini vs locaux).
//     Aucune valeur dans un cerveau utilisateur (notes Flemmr purgées → tout FAIL).
//     Exclu par PRÉFIXE → couvre d'un coup les .mjs ET leurs .test.mjs.
//   - rag/scripts/ : outillage de MESURE du moteur (measure-batch — caler EMBED_BATCH
//     sur corpus dense ; measure-contention — prouver que recherche et indexation
//     partagent une session chaude). Dev-only : importe la source TS et vise par défaut
//     un vault local confidentiel ; aucune valeur (ni place) dans un cerveau utilisateur.
const DEV_ONLY_FILES = new Set(["DEVELOPING.md", "EN-QUOI-C-EST-DIFFERENT.md"]);
const DEV_ONLY_PREFIXES = [
  "maintainers/",
  "scripts/run-eval.mjs",
  "scripts/lib/eval-",
  "scripts/lib/mcp-search",
  "rag/scripts/",
];

// Retient, parmi les chemins suivis, ceux à copier dans le cerveau généré.
export function filterCopyable(paths) {
  return paths.filter(
    (p) =>
      !DEV_ONLY_FILES.has(p) && !DEV_ONLY_PREFIXES.some((dir) => p.startsWith(dir)),
  );
}
