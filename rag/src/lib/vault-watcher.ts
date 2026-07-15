import { watch, type FSWatcher, type ChokidarOptions } from "chokidar";
import { VAULT_DIR } from "./config.js";

export interface VaultWatcherOptions {
  /** Called on every detected write, with the path of the affected file. */
  onChange: (path: string) => void;
  /** Watched directory (default: VAULT_DIR). */
  vaultDir?: string;
}

/**
 * Segments never watched. `vault/` contains neither `.git`, nor `node_modules`,
 * nor `.cache` (the RAG cache lives in `rag/.cache`, outside the vault) → the
 * anti-loop guard is already ensured by the scope, but we make it explicit for safety.
 */
const IGNORED_SEGMENTS = [".cache", ".git", "node_modules"];

/**
 * True when `p` sits inside (or terminates on) an ignored segment — matched on
 * full `/segment/` boundaries so a note like `.gitignore` is NOT mistaken for `.git`.
 * Pure + unit-tested.
 */
export function isIgnoredPath(p: string): boolean {
  return IGNORED_SEGMENTS.some(
    (seg) => p.includes(`/${seg}/`) || p.endsWith(`/${seg}`)
  );
}

/** Creates the underlying filesystem watcher — injectable so wiring is unit-testable. */
export type WatchFactory = (dir: string, options: ChokidarOptions) => FSWatcher;

const defaultWatch: WatchFactory = (dir, options) => watch(dir, options);

/**
 * Thin I/O layer: a filesystem watcher (chokidar) on the vault that notifies on
 * every write. All the debounce/coalescing logic lives in `ReindexScheduler`
 * (tested separately) — here we just relay the event.
 */
export function startVaultWatcher(
  opts: VaultWatcherOptions,
  watchFactory: WatchFactory = defaultWatch
): FSWatcher {
  const dir = opts.vaultDir ?? VAULT_DIR;
  const watcher = watchFactory(dir, {
    // The startup reindex already covers existing files → we only react to writes.
    ignoreInitial: true,
    ignored: (p: string) => isIgnoredPath(p),
    persistent: true,
  });
  watcher.on("add", (p) => opts.onChange(p));
  watcher.on("change", (p) => opts.onChange(p));
  watcher.on("unlink", (p) => opts.onChange(p));
  return watcher;
}
