import { watch, type FSWatcher } from "chokidar";
import { VAULT_DIR } from "./config.js";

export interface VaultWatcherOptions {
  /** Appelé à chaque écriture détectée, avec le chemin du fichier concerné. */
  onChange: (path: string) => void;
  /** Répertoire surveillé (défaut : VAULT_DIR). */
  vaultDir?: string;
}

/**
 * Segments jamais surveillés. `vault/` ne contient ni `.git`, ni `node_modules`,
 * ni `.cache` (le cache RAG vit dans `rag/.cache`, hors vault) → la garde
 * anti-boucle est déjà acquise par le périmètre, mais on l'explicite par sécurité.
 */
const IGNORED_SEGMENTS = [".cache", ".git", "node_modules"];

/**
 * Fine couche d'I/O : un watcher filesystem (chokidar) sur le vault qui notifie à
 * chaque écriture. Toute la logique de debounce/coalescing vit dans
 * `ReindexScheduler` (testée à part) — ici on se contente de relayer l'évènement.
 * Non testé unitairement : pur glue d'I/O au-dessus de chokidar.
 */
export function startVaultWatcher(opts: VaultWatcherOptions): FSWatcher {
  const dir = opts.vaultDir ?? VAULT_DIR;
  const watcher = watch(dir, {
    // Le reindex de démarrage couvre déjà l'existant → on ne réagit qu'aux écritures.
    ignoreInitial: true,
    ignored: (p: string) =>
      IGNORED_SEGMENTS.some(
        (seg) => p.includes(`/${seg}/`) || p.endsWith(`/${seg}`)
      ),
    persistent: true,
  });
  watcher.on("add", (p) => opts.onChange(p));
  watcher.on("change", (p) => opts.onChange(p));
  watcher.on("unlink", (p) => opts.onChange(p));
  return watcher;
}
