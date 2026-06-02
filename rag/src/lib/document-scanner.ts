import { readdir, stat } from "fs/promises";
import { resolve, relative } from "path";
import { VAULT_DIR } from "./config.js";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
}

const EXCLUDE_NAMES = new Set(["_template.md", ".gitkeep"]);
const EXCLUDE_DIRS = new Set([".obsidian"]);

async function walkDir(dir: string, files: ScannedFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, files);
    } else if (entry.name.endsWith(".md") && !EXCLUDE_NAMES.has(entry.name)) {
      files.push({
        absolutePath: fullPath,
        relativePath: relative(VAULT_DIR, fullPath),
      });
    }
  }
}

export async function scanVault(): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  await walkDir(VAULT_DIR, files);
  return files;
}
