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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RESTART_FLAG_REL } from "./lib/restart-nudge.mjs";

import {
  fetchSource as defaultFetchSource,
  resolveLatestTag as defaultResolveLatestTag,
  readTargetManifest,
} from "./lib/engine-fetch.mjs";
import { reconcileBrain } from "./lib/reconcile-brain.mjs";
import { reseedProvenance } from "./lib/engine-source.mjs";
import {
  defaultRunInstall,
  defaultRunReindex,
  defaultCountVaultNotes,
  defaultRegenerateLaunchers,
} from "./lib/engine-seams.mjs";
import { defaultFinalizeReconcile } from "./lib/auto-finalize.mjs";

// Re-export so the engine's own tests keep importing the count seam from here.
export { defaultCountVaultNotes };

// Human summary the brain-side `update-engine` skill shows the user (Step 6, ADR
// 0016). Pure so the wording is unit-tested; the CLI entry only wires the I/O.
export function formatReport(report) {
  const { ref, engineVersion, copied, regenerated, reindexed, reindexReason, vaultNoteCount, installedSkills = [], mcpServersAdded = [], hooksAdded = [] } = report;
  // F-B2 (ADR 0026): the engine-owned SessionStart hooks wired into an upgrader's
  // settings.json, by their bare name (scripts/session-health.mjs → session-health).
  const wiredHooks = hooksAdded.map((s) => s.replace(/^scripts\//, "").replace(/\.mjs$/, ""));
  // Honest reindex line: a schema move re-encodes EVERY note; the health-note pairing (ADR
  // 0026 decision B, upgraders) only makes sure the one engine-owned note is present and
  // indexed (incremental — your other notes are untouched) — never claim "the index format
  // changed" in that case.
  const reindexLine = !reindexed
    ? `   • index format unchanged — no reindex needed`
    : reindexReason === "health-note-seed"
      ? `   • ensured the engine health-check note is present and indexed (incremental — your other notes were not re-encoded)`
      : `   • reindexed — the index format changed (your notes were re-encoded, nothing lost)`;
  const lines = [
    `✅ Engine updated to ${ref} (rag ${engineVersion?.rag}).`,
    `   • ${copied.length} engine file(s) swapped` + (regenerated ? " + launchers regenerated" : ""),
    reindexLine,
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
  if (wiredHooks.length > 0) {
    lines.push(`   • new runtime hook(s) wired: ${wiredHooks.join(", ")}`);
  }
  // F1.6 (ADR 0026, point 4): a freshly-installed skill/MCP is on disk but Claude
  // loads skills/MCP/hooks when a conversation STARTS (Layer B config-freeze), so it
  // is NOT yet live in THIS conversation. Say so LOUDLY (silence reads as "ready to
  // use") and point at the lighter sufficient action — a full restart, then RESUMING
  // this same conversation (field-proven, F4). Do NOT muddy it with "start a new
  // conversation": that is the distinct initial-rooting rule (a never-rooted session),
  // not what is needed just to pick up new capabilities.
  const newCapabilities = installedSkills.length + mcpServersAdded.length + wiredHooks.length;
  if (newCapabilities > 0) {
    const noun = newCapabilities === 1 ? "capability" : "capabilities";
    const them = newCapabilities === 1 ? "it" : "them";
    lines.push(
      `   ⚠️ ACTION NEEDED — ${newCapabilities} new ${noun} ${newCapabilities === 1 ? "is" : "are"}` +
        ` installed on disk but NOT active in THIS conversation.`,
      `   A FULL RESTART of Claude (close it and reopen) is enough: come back to THIS same`,
      `   conversation afterwards and your brain can use ${them}. You do NOT need to start a`,
      `   brand-new chat for this. Until you restart, your brain CAN'T use ${them}.`,
      `   • If still missing after a restart, run /update-engine once more.`,
    );
  } else if (copied.length > 0 || regenerated) {
    // F-B7d (ship-blocker A1): even a steady-state swap with NO brand-new capability still
    // needs a restart — the MCP server, hooks and constitution THIS conversation loaded are
    // the OLD ones until Claude is reopened. Stay silent and a "✅ done" reads as "already
    // live", trapping the improvement behind a stale session. So warn LOUDLY — but WITHOUT the
    // new-capability counter / "run once more" fallback (those are reserved for actual new
    // capabilities). The genuine no-op (nothing swapped) skips this entirely → no crying wolf.
    lines.push(
      `   ⚠️ ACTION NEEDED — the engine code was updated on disk, but THIS conversation is`,
      `   still running the OLD version. A FULL RESTART of Claude (close it and reopen) is`,
      `   enough: come back to THIS same conversation afterwards and the update takes effect.`,
      `   Until you restart, your brain keeps using the old engine.`,
    );
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
  finalizeReconcile = defaultFinalizeReconcile,
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
  //    engineMcpServers, add-if-absent the engine-owned hook entries into settings.json,
  //    regenerate the launchers, run install, reindex IFF the schema moved, and count the
  //    vault notes — all behind the deterministic, idempotent
  //    `reconcileBrain`. Extracted so the SAME reconciler runs at auto-finalize (a fresh
  //    child process at the end of this function) and at SessionStart self-heal.
  const { copied, regenerated, reindexed, reindexReason, vaultNoteCount, installedSkills, mcpServersAdded, hooksAdded } =
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

  // 8. Auto-finalize (ADR 0026, Layer A): re-exec the FRESHLY-WRITTEN reconciler in a
  //    fresh child process, handing it the same source we fetched. A new process reads
  //    the just-written reconcile-brain.mjs from disk → escapes this process's module
  //    cache → runs the *just-installed* converge logic, collapsing the historical
  //    2-cycle into a single invocation. The child reconciles ONLY (never re-fetches,
  //    never re-finalizes) → no recursion. Done last, on top of an already-successful,
  //    already-recorded update.
  //
  //    FAIL-SOFT (#1): auto-finalize is a best-effort finisher on top of an update that
  //    is ALREADY done + recorded (step 7). A failure in the fresh child (flaky npm
  //    install, ABI hiccup) must NEVER reject this function — that would print the CLI's
  //    "the brain was NOT changed past this point" over a successful update. We belt it
  //    here even though defaultFinalizeReconcile is itself fail-soft, so EVERY injected
  //    seam is safe. SessionStart self-heal (Layer B) converges the rest on next start.
  try {
    await finalizeReconcile({ brainDir, sourceDir, platform });
  } catch {
    // swallowed on purpose — the update succeeded; self-heal will finish the job.
  }

  return { ref: updated.source.ref, engineVersion: updated.engineVersion, copied, regenerated, reindexed, reindexReason, vaultNoteCount, installedSkills, mcpServersAdded, hooksAdded };
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
      // A2 (F-B7d): if this update placed anything a restart is needed for, arm the
      // persistent restart flag so the statusLine keeps nudging until the user restarts —
      // a belt for the in-session converged case (the report banner alone scrolls away).
      // The next fresh, converged session clears it (session-self-heal). Fail-soft.
      const newCaps = (report.installedSkills?.length ?? 0) + (report.mcpServersAdded?.length ?? 0) + (report.hooksAdded?.length ?? 0);
      if (report.copied?.length > 0 || report.regenerated || newCaps > 0) {
        try {
          const flagPath = join(brainDir, RESTART_FLAG_REL);
          mkdirSync(dirname(flagPath), { recursive: true });
          writeFileSync(flagPath, "restart needed to finish the engine update\n");
        } catch {
          /* fail-soft: the nudge is a convenience, never a blocker */
        }
      }
      process.stdout.write(formatReport(report) + "\n");
      process.exit(0);
    })
    .catch((e) => {
      process.stderr.write(`\n❌ update-engine failed — the brain was NOT changed past this point.\n${e?.message ?? e}\n`);
      process.exit(1);
    });
}
