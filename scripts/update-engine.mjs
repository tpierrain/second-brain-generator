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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchSource as defaultFetchSource,
  resolveLatestTag as defaultResolveLatestTag,
  readTargetManifest,
} from "./lib/engine-fetch.mjs";
import { reconcileBrain } from "./lib/reconcile-brain.mjs";
import { reseedProvenance } from "./lib/engine-source.mjs";
import { listFilesRelPosix } from "./lib/fs-walk.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  buildLocalMirrorShLauncher,
  buildLocalMirrorCmdLauncher,
} from "./lib/rag-launcher.mjs";

// npm is a shell-wrapped `.cmd` on Windows (unlike git, a real .exe) → platform switch.
const npmExe = (platform) => (platform === "win32" ? "npm.cmd" : "npm");

// ─── Default seams (the real CLI wiring; the Gate injects stubs instead) ──────
async function defaultRunInstall({ ragDir, brainDir, platform }) {
  execFileSync(npmExe(platform), ["install"], { cwd: ragDir, stdio: "inherit" });
  // local-mirror deps too, when the brain carries that package (pure JS →
  // no native build, plain install; absent on pre-local-mirror brains → skip).
  const gssDir = join(brainDir, "local-mirror");
  if (existsSync(join(gssDir, "package.json"))) {
    execFileSync(npmExe(platform), ["install"], { cwd: gssDir, stdio: "inherit" });
  }
}

async function defaultRunReindex({ brainDir, platform }) {
  execFileSync(npmExe(platform), ["run", "reindex"], { cwd: join(brainDir, "rag"), stdio: "inherit" });
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
async function defaultRegenerateLaunchers({ brainDir }) {
  writeFileSync(join(brainDir, "rag", "launch.sh"), buildShLauncher());
  writeFileSync(join(brainDir, "rag", "launch.cmd"), buildCmdLauncher());
  writeFileSync(join(brainDir, "local-mirror", "launch.sh"), buildLocalMirrorShLauncher());
  writeFileSync(join(brainDir, "local-mirror", "launch.cmd"), buildLocalMirrorCmdLauncher());
  writeFileSync(join(brainDir, "scripts", "run-node.sh"), buildNodeRunnerSh());
  writeFileSync(join(brainDir, "scripts", "run-node.cmd"), buildNodeRunnerCmd());
}

// Human summary the brain-side `update-engine` skill shows the user (Step 6, ADR
// 0016). Pure so the wording is unit-tested; the CLI entry only wires the I/O.
export function formatReport(report) {
  const { ref, engineVersion, copied, regenerated, reindexed, vaultNoteCount, installedSkills = [], mcpServersAdded = [] } = report;
  const lines = [
    `✅ Engine updated to ${ref} (rag ${engineVersion?.rag}).`,
    `   • ${copied.length} engine file(s) swapped` + (regenerated ? " + launchers regenerated" : ""),
    reindexed
      ? `   • reindexed — the index format changed (your notes were re-encoded, nothing lost)`
      : `   • index format unchanged — no reindex needed`,
  ];
  // F2: the number the USER cares about — how many notes the brain holds. When a
  // reindex is running, searchability catches up as indexing finishes.
  if (typeof vaultNoteCount === "number") {
    const noun = vaultNoteCount === 1 ? "note" : "notes";
    lines.push(
      `   • your vault holds ${vaultNoteCount} ${noun}` +
        (reindexed ? " — searchable as the reindex finishes" : "")
    );
  }
  // Surface newly-delivered engine skills / MCP servers (ADR 0025) — the whole point
  // of an additive update: an upgrader must SEE they finally have the feature.
  if (installedSkills.length > 0) {
    lines.push(`   • new engine skill(s) installed: ${installedSkills.join(", ")}`);
  }
  if (mcpServersAdded.length > 0) {
    lines.push(`   • new MCP server(s) registered: ${mcpServersAdded.join(", ")}`);
  }
  lines.push(`   Your notes, .env, constitution, settings and custom skills were left untouched.`);
  return lines.join("\n");
}

export async function updateEngine({
  brainDir,
  platform = process.platform,
  fetchSource = defaultFetchSource,
  resolveLatestTag = defaultResolveLatestTag,
  regenerateLaunchers = defaultRegenerateLaunchers,
  runInstall = defaultRunInstall,
  runReindex = defaultRunReindex,
  countVaultNotes = defaultCountVaultNotes,
}) {
  const manifestPath = join(brainDir, "engine-manifest.json");
  const local = JSON.parse(readFileSync(manifestPath, "utf8"));
  const source = local.source ?? {};

  // 1. Resolve the LATEST semver release tag on the remote (ADR 0017) — that is the
  //    engine version we pull and the new `source.ref` we record, so the displayed
  //    Version actually advances. No tag / offline → fall back to the pinned ref (the
  //    committed launcher manifest has no `source`, so we never read `target.source`).
  const ref = (await resolveLatestTag({ repo: source.repo })) ?? source.ref;

  //    Fetch the launcher at that ref + read its (target) manifest.
  const sourceDir = await fetchSource({ repo: source.repo, ref });
  const target = readTargetManifest(sourceDir);

  // 2.→6. CONVERGE the brain's on-disk engine state to the target manifest (ADR 0026):
  //    compute the write-allowlist, copy the engine files (F1/F2 refinements), install
  //    -if-absent the engine-declared skills, reconcile .mcp.json against
  //    engineMcpServers, regenerate the launchers, run install, reindex IFF the schema
  //    moved, and count the vault notes — all behind the deterministic, idempotent
  //    `reconcileBrain`. Extracted so the SAME converger runs at auto-finalize (a fresh
  //    child process at the end of this function) and at SessionStart self-heal.
  const { copied, regenerated, reindexed, vaultNoteCount, installedSkills, mcpServersAdded } =
    await reconcileBrain({
      brainDir,
      platform,
      sourceDir,
      target,
      local,
      regenerateLaunchers,
      runInstall,
      runReindex,
      countVaultNotes,
    });

  // 7. Record the new engine version + the ref we pulled, and RE-SEED `provenance`
  //    (Step 5): refresh the 3-way base for the merge files the engine just
  //    re-delivered (the engine-owned scripts, read back from disk), while the user's
  //    untouched merge files (CLAUDE.md/settings/skills) keep their prior base — so a
  //    future Phase 2 3-way still detects the user's edits.
  const deliveredFileMap = Object.fromEntries(
    copied.map((rel) => [rel, readFileSync(join(brainDir, rel), "utf8")]),
  );
  const updated = {
    ...local,
    engineVersion: target.engineVersion,
    indexSchemaVersion: target.indexSchemaVersion,
    source: { ...source, ref },
    provenance: reseedProvenance({
      priorProvenance: local.provenance ?? {},
      manifest: target,
      deliveredFileMap,
    }),
  };
  writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + "\n");

  return { ref: updated.source.ref, engineVersion: updated.engineVersion, copied, regenerated, reindexed, vaultNoteCount, installedSkills, mcpServersAdded };
}

// ── CLI entry (the command the brain-side `update-engine` skill runs) ─────────
// Guarded so importing this module in tests does NOT run it. Operates on the brain
// the script lives in (<brain>/scripts/update-engine.mjs → brainDir = its parent),
// with the real git/npm/ONNX seams. FAIL LOUD (the project's strategy): on any
// error, print it to stderr and exit non-zero — never pretend it worked.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const brainDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  updateEngine({ brainDir })
    .then((report) => {
      process.stdout.write(formatReport(report) + "\n");
      process.exit(0);
    })
    .catch((e) => {
      process.stderr.write(`\n❌ update-engine failed — the brain was NOT changed past this point.\n${e?.message ?? e}\n`);
      process.exit(1);
    });
}
