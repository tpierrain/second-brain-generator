import { readdir } from "fs/promises";
import { resolve, relative, sep } from "path";
import { VAULT_DIR } from "./config.js";

// The vault-relative path is a canonical document identifier: downstream consumers
// (frontmatter-parser's folder→type table via `startsWith("topics/")`, its
// `split("/")` filename extraction) all assume POSIX `/`. On Windows `path.relative`
// yields `\`, which would silently break type detection and titles — so normalise to
// forward slashes here, at the single source. `absolutePath` stays native (it must
// remain openable by the filesystem).
const toPosix = (p: string): string => p.split(sep).join("/");

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
}

/** Minimal directory entry shape (a subset of `fs.Dirent`), so the scan is unit-testable. */
export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Reads a directory's entries — injectable so the walk can be tested without touching the disk. */
export type ReadDirPort = (dir: string) => Promise<DirEntry[]>;

const defaultReadDir: ReadDirPort = (dir) =>
  readdir(dir, { withFileTypes: true });

// Only `.md` files reach this set (non-Markdown names are filtered earlier), so a
// `.gitkeep` entry here would be unreachable — `_template.md` is the real exclusion.
const EXCLUDE_NAMES = new Set(["_template.md"]);
const EXCLUDE_DIRS = new Set([".obsidian"]);

async function walkDir(
  dir: string,
  rootDir: string,
  files: ScannedFile[],
  readDir: ReadDirPort
): Promise<void> {
  const entries = await readDir(dir);
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, rootDir, files, readDir);
    } else if (entry.name.endsWith(".md") && !EXCLUDE_NAMES.has(entry.name)) {
      files.push({
        absolutePath: fullPath,
        relativePath: toPosix(relative(rootDir, fullPath)),
      });
    }
  }
}

export async function scanVault(
  rootDir: string = VAULT_DIR,
  readDir: ReadDirPort = defaultReadDir
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  await walkDir(rootDir, rootDir, files, readDir);
  return files;
}
