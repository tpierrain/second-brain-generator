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
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchSource as defaultFetchSource,
  resolveLatestTag as defaultResolveLatestTag,
  readTargetManifest,
} from "./lib/engine-fetch.mjs";
import { computeApplyPlan } from "./lib/engine-apply-plan.mjs";
import { matchesAny } from "./lib/glob-match.mjs";
import { reconcileMcpServers } from "./lib/mcp-reconcile.mjs";
import { needsReindex } from "./lib/reindex-trigger.mjs";
import { reseedProvenance } from "./lib/engine-source.mjs";
import { listFilesRelPosix } from "./lib/fs-walk.mjs";
import { selectEngineFilesToCopy } from "./lib/engine-copy-select.mjs";
import {
  buildShLauncher,
  buildCmdLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  buildLocalMirrorShLauncher,
  buildLocalMirrorCmdLauncher,
} from "./lib/rag-launcher.mjs";

function copyInto(srcDir, destDir, rel) {
  const dest = join(destDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(srcDir, rel), dest);
}

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
  const { ref, engineVersion, copied, regenerated, reindexed, installedSkills = [], mcpServersAdded = [] } = report;
  const lines = [
    `✅ Engine updated to ${ref} (rag ${engineVersion?.rag}).`,
    `   • ${copied.length} engine file(s) swapped` + (regenerated ? " + launchers regenerated" : ""),
    reindexed
      ? `   • reindexed — the index format changed (your notes were re-encoded, nothing lost)`
      : `   • index format unchanged — no reindex needed`,
  ];
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

  // 2. The write-allowlist (the safety core, Step 3): the ONLY files we may write.
  const plan = computeApplyPlan(target);

  // 3. Apply the COPY buckets — overwrite (`replace`) + the engine-owned scripts
  //    (incl. update-engine.mjs → self-update). Globs are resolved against the files
  //    the fetched source actually carries, then refined by `selectEngineFilesToCopy`
  //    with the SAME two exclusions the INSTALLER applies (so update-engine never
  //    copies more than the install would, PR #10 QA findings): F1 drops the dev-only
  //    files (scripts/lib/eval-*/mcp-search.*), F2 keeps the brain's locale-owned
  //    files (scripts/lib/demo-locale.mjs → no fr→en regression). The launchers
  //    (`regenerate`) are NOT copied — they are rebuilt below. Self-replacement mid-run
  //    is safe: Node caches imported modules, so overwriting the .mjs on disk never
  //    perturbs this process.
  const sourceFiles = listFilesRelPosix(sourceDir);
  const copyGlobs = [...plan.overwrite, ...plan.replaceScripts];
  const copied = selectEngineFilesToCopy({ sourceFiles, copyGlobs });
  for (const rel of copied) copyInto(sourceDir, brainDir, rel);

  // 3.bis Install engine-declared skills the brain is MISSING (ADR 0025): additive,
  //    install-if-absent at the SKILL-DIR level. A skill dir that already exists
  //    (possibly user-customized, e.g. prepare-1-1) is left byte-identical; a
  //    brand-new engine skill (e.g. local-mirror) is copied in so upgraders get it.
  //    Non-declared / custom skills are never in `installSkills` → untouchable.
  const installedSkills = [];
  for (const skillGlob of plan.installSkills) {
    const skillDir = skillGlob.replace(/\/\*\*?$/, ""); // ".../local-mirror/**" → ".../local-mirror"
    if (existsSync(join(brainDir, skillDir))) continue; // present → preserve, never overwrite
    for (const rel of sourceFiles.filter((f) => matchesAny([skillGlob], f))) copyInto(sourceDir, brainDir, rel);
    installedSkills.push(skillDir.split("/").pop()); // the skill name, for the report
  }

  // 3.ter Reconcile .mcp.json against the manifest's engineMcpServers (ADR 0025):
  //    register a newly-shipped engine server (e.g. local-mirror) the brain is
  //    MISSING, taking its definition from the fetched .mcp.json.template with
  //    {{PROJECT_ROOT}} substituted to this brain dir. Existing servers (engine OR
  //    user-added) are preserved; absent template → nothing to reconcile.
  const engineServerIds = target.engineMcpServers ?? [];
  const templatePath = join(sourceDir, ".mcp.json.template");
  const brainMcpPath = join(brainDir, ".mcp.json");
  const mcpServersAdded = [];
  if (engineServerIds.length > 0 && existsSync(templatePath) && existsSync(brainMcpPath)) {
    const projectRoot = brainDir.split("\\").join("/"); // {{PROJECT_ROOT}} is posix (cf. installer toPosix)
    const templateMcp = JSON.parse(readFileSync(templatePath, "utf8").split("{{PROJECT_ROOT}}").join(projectRoot));
    const brainMcp = JSON.parse(readFileSync(brainMcpPath, "utf8"));
    const before = new Set(Object.keys(brainMcp.mcpServers ?? {}));
    const reconciled = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds });
    writeFileSync(brainMcpPath, JSON.stringify(reconciled, null, 2) + "\n");
    mcpServersAdded.push(...Object.keys(reconciled.mcpServers).filter((id) => !before.has(id)));
  }

  // 4. Regenerate the launchers (both halves, ADR 0015).
  const regenerated = plan.regenerate.length > 0;
  if (regenerated) await regenerateLaunchers({ brainDir, platform });

  // 5. npm install in the brain's rag/ (+ local-mirror/ when present).
  await runInstall({ ragDir: join(brainDir, "rag"), brainDir, platform });

  // 6. Reindex IFF the index schema moved (else the existing index stays valid).
  //    The decision is the deterministic `needsReindex` (Step 5, ADR 0009).
  const reindexed = needsReindex({ local, target });
  if (reindexed) await runReindex({ brainDir, platform });

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

  return { ref: updated.source.ref, engineVersion: updated.engineVersion, copied, regenerated, reindexed, installedSkills, mcpServersAdded };
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
