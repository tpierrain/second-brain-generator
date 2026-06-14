// ─────────────────────────────────────────────────────────────────────────────
// update-engine.mjs — THE CORE (plan Step 4). Opt-in, non-destructive re-pull: it
// brings an already-installed brain up to a newer Engine pinned in the launcher,
// WITHOUT ever touching the user's notes, `.env`, constitution, settings or custom
// skills (ADR 0003/0012/0014). The deterministic engine; the conversational UX is
// a thin skill on top (Step 6, ADR 0016).
//
// It wires the Step 1→3 pure libs + four injected SEAMS (so the Gate runs offline):
//   1. fetchSource          → shallow-clone the recorded `source: {repo, ref}` (Step 2)
//   2. computeApplyPlan      → the write-allowlist from the fetched manifest (Step 3)
//   3. copy overwrite + engine-owned scripts (incl. update-engine itself → self-update)
//   4. regenerateLaunchers   → rebuild the .sh/.cmd launchers (ADR 0015; NOT copied —
//                              they are pure, untracked rag-launcher.mjs output)
//   5. runInstall            → `npm install` in the brain's rag/
//   6. runReindex            → reindex IFF the index schema moved (else the index stays)
//   7. record the new engineVersion + the pulled ref in the brain's manifest
// Everything outside the plan is untouchable BY CONSTRUCTION (the plan is an
// allowlist) — the Gate asserts byte-identity of the user's sacred files.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";

import { fetchSource as defaultFetchSource, readTargetManifest } from "./lib/engine-fetch.mjs";
import { computeApplyPlan } from "./lib/engine-apply-plan.mjs";
import { matchesAny } from "./lib/glob-match.mjs";
import { listFilesRelPosix } from "./lib/fs-walk.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
} from "./lib/rag-launcher.mjs";

function copyInto(srcDir, destDir, rel) {
  const dest = join(destDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(srcDir, rel), dest);
}

// npm is a shell-wrapped `.cmd` on Windows (unlike git, a real .exe) → platform switch.
const npmExe = (platform) => (platform === "win32" ? "npm.cmd" : "npm");

// ─── Default seams (the real CLI wiring; the Gate injects stubs instead) ──────
async function defaultRunInstall({ ragDir, platform }) {
  execFileSync(npmExe(platform), ["install"], { cwd: ragDir, stdio: "inherit" });
}

async function defaultRunReindex({ brainDir, platform }) {
  execFileSync(npmExe(platform), ["run", "reindex"], { cwd: join(brainDir, "rag"), stdio: "inherit" });
}

// Rebuild BOTH launcher halves from the (freshly-updated) rag-launcher.mjs builders.
// Machine-independent output → no per-host divergence; both `.sh` and `.cmd` always
// written (ADR 0015), whatever the host platform.
async function defaultRegenerateLaunchers({ brainDir }) {
  writeFileSync(join(brainDir, "rag", "launch.sh"), buildShLauncher());
  writeFileSync(join(brainDir, "rag", "launch.cmd"), buildCmdLauncher());
  writeFileSync(join(brainDir, "scripts", "run-node.sh"), buildNodeRunnerSh());
  writeFileSync(join(brainDir, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
}

export async function updateEngine({
  brainDir,
  platform = process.platform,
  fetchSource = defaultFetchSource,
  regenerateLaunchers = defaultRegenerateLaunchers,
  runInstall = defaultRunInstall,
  runReindex = defaultRunReindex,
}) {
  const manifestPath = join(brainDir, "engine-manifest.json");
  const local = JSON.parse(readFileSync(manifestPath, "utf8"));
  const source = local.source ?? {};

  // 1. Fetch the pinned launcher source + read its (target) manifest.
  const sourceDir = await fetchSource({ repo: source.repo, ref: source.ref });
  const target = readTargetManifest(sourceDir);

  // 2. The write-allowlist (the safety core, Step 3): the ONLY files we may write.
  const plan = computeApplyPlan(target);

  // 3. Apply the COPY buckets — overwrite (`replace`) + the engine-owned scripts
  //    (incl. update-engine.mjs → self-update). Globs are resolved against the files
  //    the fetched source actually carries. The launchers (`regenerate`) are NOT
  //    copied — they are rebuilt below. Self-replacement mid-run is safe: Node caches
  //    imported modules, so overwriting the .mjs on disk never perturbs this process.
  const copyGlobs = [...plan.overwrite, ...plan.replaceScripts];
  const copied = [];
  for (const rel of listFilesRelPosix(sourceDir)) {
    if (matchesAny(copyGlobs, rel)) {
      copyInto(sourceDir, brainDir, rel);
      copied.push(rel);
    }
  }

  // 4. Regenerate the launchers (both halves, ADR 0015).
  const regenerated = plan.regenerate.length > 0;
  if (regenerated) await regenerateLaunchers({ brainDir, platform });

  // 5. npm install in the brain's rag/.
  await runInstall({ ragDir: join(brainDir, "rag"), platform });

  // 6. Reindex IFF the index schema moved (else the existing index stays valid).
  const reindexed = target.indexSchemaVersion !== local.indexSchemaVersion;
  if (reindexed) await runReindex({ brainDir, platform });

  // 7. Record the new engine version + the ref we pulled. (Re-seeding `provenance`
  //    for the new `merge` files is Step 5 — out of this step's scope.)
  const updated = {
    ...local,
    engineVersion: target.engineVersion,
    indexSchemaVersion: target.indexSchemaVersion,
    source: { ...source, ref: target.source?.ref ?? source.ref },
  };
  writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + "\n");

  return { ref: updated.source.ref, engineVersion: updated.engineVersion, copied, regenerated, reindexed };
}
