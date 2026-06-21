// ─────────────────────────────────────────────────────────────────────────────
// reconcile-brain.mjs — the RECONCILE half of update-engine (ADR 0026). Makes the
// brain's on-disk engine state MATCH a desired-state `target` manifest, deterministic
// and idempotent: copy the engine files, install-if-absent the engine-declared skills,
// reconcile `.mcp.json` against `engineMcpServers`, add-if-absent the engine-owned
// SessionStart hook entries into `settings.json`, regenerate the launchers, run install,
// and reindex IFF the index schema moved. It NEVER touches the vault, `.env`, the
// constitution, user-added `.mcp.json` servers, user-authored `settings.json` entries or
// any non-declared / custom skill (the write-allowlist safety core is `computeApplyPlan`;
// the `.mcp.json` and hook-entry merges are additive side-channels OUTSIDE it — ADR 0026).
//
// Why standalone (ADR 0026): the same reconciler runs at TWO points —
//   • auto-finalize: re-exec'd as a fresh child process at the end of update-engine,
//     so the JUST-INSTALLED converge logic runs in one invocation (kills the 2-cycle);
//   • SessionStart self-heal: a brain that received code but never reconciled converges
//     silently at the next session start.
// It takes a `sourceDir` (the files to converge FROM) + the four I/O seams, so it runs
// offline. It does NOT fetch and does NOT record the engine version — those are
// update-engine's fetch-result concerns (step 7).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeApplyPlan } from "./engine-apply-plan.mjs";
import { matchesAny } from "./glob-match.mjs";
import { installStagedSkills } from "./staged-skills.mjs";
import { seedHealthNote } from "./staged-health-note.mjs";
import { reconcileMcpServers } from "./mcp-reconcile.mjs";
import { reconcileHooks } from "./hooks-reconcile.mjs";
import { needsReindex } from "./reindex-trigger.mjs";
import { listFilesRelPosix } from "./fs-walk.mjs";
import { selectEngineFilesToCopy } from "./engine-copy-select.mjs";
import {
  defaultRunInstall,
  defaultRunReindex,
  defaultCountVaultNotes,
  defaultRegenerateLaunchers,
} from "./engine-seams.mjs";

// Copies `rel` from srcDir into destDir. Returns true if it copied, false if it
// SKIPPED a self-copy: in SessionStart self-heal mode srcDir === brainDir, so a file
// would be copied onto itself — on Linux `copyFileSync(f, f)` truncates the dest before
// copying (it would zero the engine file; ADR 0015 cross-platform safety). Skip it.
function copyInto(srcDir, destDir, rel) {
  const src = join(srcDir, rel);
  const dest = join(destDir, rel);
  if (resolve(src) === resolve(dest)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

export async function reconcileBrain({
  brainDir,
  platform = process.platform,
  sourceDir,
  target,
  local,
  regenerateLaunchers,
  runInstall,
  runReindex,
  countVaultNotes,
}) {
  // 1. The write-allowlist (the safety core, Step 3): the ONLY files we may write.
  const plan = computeApplyPlan(target);

  // 2. Apply the COPY buckets — overwrite (`replace`) + the engine-owned scripts
  //    (incl. update-engine.mjs → self-update). Globs are resolved against the files
  //    the source actually carries, then refined by `selectEngineFilesToCopy` with the
  //    SAME two exclusions the INSTALLER applies (PR #10 QA findings): F1 drops the
  //    dev-only files (scripts/lib/eval-*/mcp-search.*), F2 keeps the brain's
  //    locale-owned files (scripts/lib/demo-locale.mjs → no fr→en regression).
  const sourceFiles = listFilesRelPosix(sourceDir);
  const copyGlobs = [...plan.overwrite, ...plan.replaceScripts];
  const copied = [];
  for (const rel of selectEngineFilesToCopy({ sourceFiles, copyGlobs })) {
    if (copyInto(sourceDir, brainDir, rel)) copied.push(rel);
  }

  // 2.bis Install engine-declared skills the brain is MISSING (ADR 0025): additive,
  //    install-if-absent at the SKILL-DIR level. A skill dir that already exists
  //    (possibly user-customized) is left byte-identical; a brand-new engine skill is
  //    copied in. Non-declared / custom skills are never in `installSkills` → untouchable.
  const installedSkills = [];
  for (const skillGlob of plan.installSkills) {
    const skillDir = skillGlob.replace(/\/\*\*?$/, ""); // ".../local-mirror/**" → ".../local-mirror"
    if (existsSync(join(brainDir, skillDir))) continue; // present → preserve, never overwrite
    for (const rel of sourceFiles.filter((f) => matchesAny([skillGlob], f))) copyInto(sourceDir, brainDir, rel);
    installedSkills.push(skillDir.split("/").pop()); // the skill name, for the report
  }

  // 2.bis-staged Install STAGED engine skills (F-B7 2d, ADR 0026): a new upgrader-bound
  //    skill (local-mirror) can't ride in under `.claude/skills/` (the sacred scrub forbids
  //    it), so its source ships at the NON-sacred `engine-skills/<name>/` path (a `replace`
  //    file → pass-1 delivers it). install-if-absent each into `.claude/skills/<name>/`,
  //    alongside the merge-skill install above; fold the names into the same report.
  installedSkills.push(...installStagedSkills({ sourceDir, brainDir }));

  // 2.ter Reconcile .mcp.json against the engine's MCP servers (ADR 0025): register a
  //    newly-shipped engine server the brain is MISSING, taking its definition from the
  //    source's .mcp.json.template with {{PROJECT_ROOT}} substituted to this brain dir.
  //    The set of engine servers is derived from the DELIVERED template's keys (F-B7 2e) —
  //    NOT the frozen `manifest.engineMcpServers`, which update-engine never refreshes (the
  //    root cause of the pre-3.3.0 non-convergence). Existing servers (engine OR user-added)
  //    are preserved.
  const templatePath = join(sourceDir, ".mcp.json.template");
  const brainMcpPath = join(brainDir, ".mcp.json");
  const mcpServersAdded = [];
  if (existsSync(templatePath) && existsSync(brainMcpPath)) {
    const projectRoot = brainDir.split("\\").join("/"); // {{PROJECT_ROOT}} is posix (cf. installer toPosix)
    const templateMcp = JSON.parse(readFileSync(templatePath, "utf8").split("{{PROJECT_ROOT}}").join(projectRoot));
    const engineServerIds = Object.keys(templateMcp.mcpServers ?? {}); // desired-state = delivered template keys
    const brainMcp = JSON.parse(readFileSync(brainMcpPath, "utf8"));
    const before = new Set(Object.keys(brainMcp.mcpServers ?? {}));
    const reconciled = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds });
    writeFileSync(brainMcpPath, JSON.stringify(reconciled, null, 2) + "\n");
    mcpServersAdded.push(...Object.keys(reconciled.mcpServers).filter((id) => !before.has(id)));
  }

  // 2.quinquies Reconcile settings.json HOOK ENTRIES against the source's
  //    settings.json.template (ADR 0026): the THIRD additive surface, twin of the
  //    .mcp.json reconcile (2.ter). settings.json is SACRED to the write-allowlist
  //    (`computeApplyPlan` never lists it), so this is a surgical SIDE-CHANNEL: the ONLY
  //    write the reconciler ever makes to it, and purely ADDITIVE — wire the engine-owned
  //    hook entries the brain is MISSING (e.g. a v3.1.0 brain that never got
  //    session-self-heal / session-health / session-obsidian-hint), dedup by the engine
  //    script each hook runs, with the brain's OWN node interpreter + dir substituted into
  //    the template placeholders. Never overwrite, never remove, never touch a user entry;
  //    WRITE ONLY when something is actually added → a converged brain is byte-identical
  //    (no auto-commit churn). settings.json.template is itself an engine-delivered file
  //    (`replace` regime), so a brain that received the engine code CARRIES it — which means
  //    self-heal (sourceDir === brainDir) reads the brain's OWN template and DOES wire the
  //    hooks. That is exactly how a pre-3.2 brain converges at the next restart: the
  //    session-status bootstrap tick spawns this reconcile in self-heal mode (no 2nd update
  //    needed). Upgraders from v3.3.0+ converge the same way in-band via auto-finalize.
  const hooksAdded = [];
  const settingsTemplatePath = join(sourceDir, ".claude", "settings.json.template");
  const brainSettingsPath = join(brainDir, ".claude", "settings.json");
  if (existsSync(settingsTemplatePath) && existsSync(brainSettingsPath)) {
    const projectRoot = brainDir.split("\\").join("/"); // {{PROJECT_ROOT}} is posix (cf. step 2.ter)
    const brainSettings = JSON.parse(readFileSync(brainSettingsPath, "utf8"));
    const templateSettings = JSON.parse(readFileSync(settingsTemplatePath, "utf8"));
    const { hooks, hooksAdded: added } = reconcileHooks({
      brainHooks: brainSettings.hooks ?? {},
      templateHooks: templateSettings.hooks ?? {},
      projectRoot,
    });
    if (added.length > 0) {
      writeFileSync(brainSettingsPath, JSON.stringify({ ...brainSettings, hooks }, null, 2) + "\n");
      hooksAdded.push(...added);
    }
  }

  // 2.quater Ensure the engine-owned health-check note is present AND indexed (ADR 0026
  //    amended): the ONE narrow, nominative carve-out to the vault-sacred invariant. The
  //    note's runtime home `vault/engine-health/health-check.md` is SACRED, so its source
  //    ships at the NON-sacred staged path `engine-health/health-check.md` (a `replace`
  //    file the engine DELIVERS); `seedHealthNote` write-if-absent's it into the vault from
  //    that staged copy — NEVER overwrite, NEVER delete, NEVER any other vault path. This
  //    converges in BOTH update (sourceDir !== brainDir) AND self-heal (sourceDir ===
  //    brainDir, the staged copy is on the brain's own disk) modes — the F-B7b fix: a
  //    pre-3.3.0 upgrader, whose old in-process update neither seeds nor auto-finalizes,
  //    finally gets the canary at the restart's self-heal. We key the index pairing (step 5)
  //    off the note's ON-DISK PRESENCE, not a one-shot "just copied" flag: if a prior run
  //    seeded the note but crashed before indexing it (flaky npm / ABI hiccup), the next run
  //    still finds it present-but-maybe-unindexed and re-pairs the (cheap, incremental)
  //    reindex → the canary can never become a permanent false `broken` (finding #6).
  const { present: healthNotePresent } = seedHealthNote({ sourceDir, brainDir });

  // 3. Regenerate the launchers (both halves, ADR 0015).
  const regenerated = plan.regenerate.length > 0;
  if (regenerated) await regenerateLaunchers({ brainDir, platform });

  // 4. npm install in the brain's rag/ (+ local-mirror/ when present).
  await runInstall({ ragDir: join(brainDir, "rag"), brainDir, platform });

  // 5. Reindex IFF the index schema moved (a FULL re-encode of every note) OR an
  //    upgrader's health-check note is present (a cheap INCREMENTAL pass — the
  //    index-manager skips every already-indexed note via its content-hash cache, so a
  //    re-run where the note is already in the index is a fast no-op, while a seeded-but-
  //    unindexed note finally gets encoded). The index is its OWN membership oracle, so no
  //    separate "indexed" marker can drift. ⚠️ Mandatory pairing (ADR 0026, decision B): a
  //    present-but-unindexed note → 0 index hits → a FALSE `broken` from `health_check`.
  //    `reindexReason` keeps the report honest: a schema move re-encodes everything; the
  //    health pairing does not.
  const schemaMoved = needsReindex({ local, target });
  const reindexReason = schemaMoved ? "schema" : healthNotePresent ? "health-note-seed" : null;
  const reindexed = reindexReason !== null;
  if (reindexed) await runReindex({ brainDir, platform, mode: schemaMoved ? "full" : "incremental" });

  // 6. Count the notes the brain holds, for the user-facing recap (F2). Read after
  //    any reindex so it reflects the current vault.
  const vaultNoteCount = await countVaultNotes({ brainDir });

  return { copied, regenerated, reindexed, reindexReason, vaultNoteCount, installedSkills, mcpServersAdded, hooksAdded };
}

// ── CLI entry — what the auto-finalize child process runs (ADR 0026, Layer A) ──
// Parses `--brainDir <dir> --sourceDir <dir> [--platform <p>]` and converges the brain
// from the fetched source, using the brain's OWN (just-updated) manifest as BOTH target
// and local → schema is unchanged from its own viewpoint, so the child never reindexes
// (it converges files; it does not migrate). RECONCILE ONLY: no fetch, no auto-finalize
// → no recursion. `seams` is injectable for tests; defaults are the real I/O seams.
function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export async function runReconcileCli({ argv, seams = {} }) {
  const brainDir = flagValue(argv, "--brainDir");
  const sourceDir = flagValue(argv, "--sourceDir");
  const platform = flagValue(argv, "--platform") ?? process.platform;
  if (!brainDir || !sourceDir) {
    throw new Error("reconcile-brain: --brainDir and --sourceDir are required");
  }
  const manifest = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  return reconcileBrain({
    brainDir,
    platform,
    sourceDir,
    target: manifest,
    local: manifest, // same manifest → needsReindex is false → converge without migrating
    regenerateLaunchers: seams.regenerateLaunchers ?? defaultRegenerateLaunchers,
    runInstall: seams.runInstall ?? defaultRunInstall,
    runReindex: seams.runReindex ?? defaultRunReindex,
    countVaultNotes: seams.countVaultNotes ?? defaultCountVaultNotes,
  });
}

// Guarded so importing this module never runs the CLI. FAIL LOUD on error (exit 1) —
// auto-finalize's own caller treats a child failure as best-effort (fail-soft there).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReconcileCli({ argv: process.argv.slice(2) })
    .then(() => process.exit(0))
    .catch((e) => {
      process.stderr.write(`\n❌ reconcile-brain failed.\n${e?.message ?? e}\n`);
      process.exit(1);
    });
}
