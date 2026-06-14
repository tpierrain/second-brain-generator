// ─────────────────────────────────────────────────────────────────────────────
// fs-walk.mjs — the ONE recursive file walk shared by the engine-manifest consumers
// (engine-source's provenance scan, update-engine's apply-from-source), so "which
// files live under this dir" has a single, identical answer everywhere.
//
// Returns every FILE path under `dir`, relative to `dir` + POSIX-separated, skipping
// VCS/build directories (.git, node_modules) — never Engine content, and absent at
// install time anyway.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export function listFilesRelPosix(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      out.push(...listFilesRelPosix(join(dir, entry.name), base));
    } else if (entry.isFile()) {
      out.push(relative(base, join(dir, entry.name)).split(sep).join("/"));
    }
  }
  return out;
}
