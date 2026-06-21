// ─────────────────────────────────────────────────────────────────────────────
// engine-seams.mjs — the REAL I/O seams the reconciler / update-engine wire by
// default (the Gate injects stubs instead). Extracted so BOTH update-engine.mjs and
// reconcile-brain.mjs's auto-finalize child process (ADR 0026) share one definition
// of "actually run npm / reindex / regenerate launchers / count notes" — without a
// circular import between the two top-level scripts.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { listFilesRelPosix } from "./fs-walk.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  buildLocalMirrorShLauncher,
  buildLocalMirrorCmdLauncher,
} from "./rag-launcher.mjs";

// npm is a shell-wrapped `.cmd` on Windows (unlike git, a real .exe) → platform switch.
const npmExe = (platform) => (platform === "win32" ? "npm.cmd" : "npm");

export async function defaultRunInstall({ ragDir, brainDir, platform }) {
  execFileSync(npmExe(platform), ["install"], { cwd: ragDir, stdio: "inherit" });
  // local-mirror deps too, when the brain carries that package (pure JS →
  // no native build, plain install; absent on pre-local-mirror brains → skip).
  const gssDir = join(brainDir, "local-mirror");
  if (existsSync(join(gssDir, "package.json"))) {
    execFileSync(npmExe(platform), ["install"], { cwd: gssDir, stdio: "inherit" });
  }
}

// Reindex the brain's vault. `mode: "full"` (the default — a schema move) re-encodes
// every note via `npm run reindex` (--force). `mode: "incremental"` (the health-note
// pairing, finding #6) runs `npm run index` (--once): the index-manager skips every
// already-indexed note via its content-hash cache, so it's a fast no-op unless a note
// is genuinely missing from the index — exactly the seeded-but-unindexed canary.
export async function defaultRunReindex({ brainDir, platform, mode = "full" }) {
  const script = mode === "incremental" ? "index" : "reindex";
  execFileSync(npmExe(platform), ["run", script], { cwd: join(brainDir, "rag"), stdio: "inherit" });
}

// How many notes the brain holds, for the user-facing recap (F2). The lightest
// deterministic path (ADR 0009): count the vault's Markdown files on disk — no
// native deps, no ABI risk, accurate whatever the index state. The exclusions
// mirror rag/'s document-scanner (`_template.md`, `.gitkeep`, the `.obsidian/`
// dir) so the recap number matches what the indexer actually treats as a note.
export async function defaultCountVaultNotes({ brainDir }) {
  const vaultDir = join(brainDir, "vault");
  if (!existsSync(vaultDir)) return 0;
  const EXCLUDE_NAMES = new Set(["_template.md", ".gitkeep"]);
  return listFilesRelPosix(vaultDir).filter((rel) => {
    if (!rel.endsWith(".md")) return false;
    const parts = rel.split("/");
    if (parts.includes(".obsidian")) return false;
    return !EXCLUDE_NAMES.has(parts[parts.length - 1]);
  }).length;
}

// Rebuild BOTH launcher halves from the (freshly-updated) rag-launcher.mjs builders.
// Machine-independent output → no per-host divergence; both `.sh` and `.cmd` always
// written (ADR 0015), whatever the host platform.
export async function defaultRegenerateLaunchers({ brainDir }) {
  writeFileSync(join(brainDir, "rag", "launch.sh"), buildShLauncher());
  writeFileSync(join(brainDir, "rag", "launch.cmd"), buildCmdLauncher());
  writeFileSync(join(brainDir, "local-mirror", "launch.sh"), buildLocalMirrorShLauncher());
  writeFileSync(join(brainDir, "local-mirror", "launch.cmd"), buildLocalMirrorCmdLauncher());
  writeFileSync(join(brainDir, "scripts", "run-node.sh"), buildNodeRunnerSh());
  writeFileSync(join(brainDir, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
}
