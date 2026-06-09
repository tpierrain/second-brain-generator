import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStatusReport,
  incompleteIndexWarning,
  formatWatcherLiveness,
} from "./status-report.js";
import type { RunProgress } from "./progress-report.js";
import type { SchedulerState } from "./reindex-scheduler.js";

const idle: SchedulerState = { scheduled: false, running: false, pending: false };

test("F.live — watcher inactif → « inactif »", () => {
  const line = formatWatcherLiveness({ active: false });
  assert.match(line, /watcher.*inactif/i);
});

test("F.live — watcher actif au repos → « actif … au repos »", () => {
  const line = formatWatcherLiveness({ active: true, state: idle });
  assert.match(line, /actif/i);
  assert.match(line, /repos/i);
});

test("F.live — actif + reindex programmé (debounce) → « programmé »", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { ...idle, scheduled: true },
  });
  assert.match(line, /actif/i);
  assert.match(line, /programmé/i);
});

test("F.live — actif + reindex en cours → « en cours »", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { ...idle, running: true },
  });
  assert.match(line, /en cours/i);
});

test("F.live — actif + run en cours avec rafale en attente → « en cours » + « en attente »", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { scheduled: false, running: true, pending: true },
  });
  assert.match(line, /en cours/i);
  assert.match(line, /attente/i);
});

test("3.1a — index complet → « index à jour » + tableau de bord Y/X", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.match(report, /index à jour/i);
  assert.match(report, /42\s*\/\s*42/); // Y/X fichiers indexés
  assert.match(report, /fichiers indexés/i);
});

test("3.1b — index incomplet → Y/X indexés + Z en attente + reprise auto", () => {
  const report = buildStatusReport({
    docCount: 30,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /index à jour/i);
  assert.match(report, /30\s*\/\s*42/); // Y/X indexés
  assert.match(report, /12 en attente/i); // 42 - 30
  assert.match(report, /reprise/i);
});

test("3.1c — ligne quota : utilisés / max / restants + réserve recherche", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.match(report, /200\s*\/\s*950/); // utilisés / max
  assert.match(report, /750 restant/i); // 950 - 200
  assert.match(report, /réserve 50.*recherche/i);
});

test("3.1d — lock présent → « reindex en cours (PID …) »", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: { pid: 12345, acquiredAt: "2026-05-31T11:59:00Z" },
  });

  assert.match(report, /reindex en cours/i);
  assert.match(report, /12345/);
});

test("3.1d — pas de lock → pas de mention de reindex en cours", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /reindex en cours/i);
});

test("4.2 — incompleteIndexWarning : index incomplet → message de reprise", () => {
  const warning = incompleteIndexWarning({ docCount: 30, scannedCount: 42 });
  assert.notEqual(warning, null);
  assert.match(warning!, /incomplet/i);
  assert.match(warning!, /reprise/i);
});

test("4.2 — incompleteIndexWarning : index complet → null (rien à surfacer)", () => {
  assert.equal(incompleteIndexWarning({ docCount: 42, scannedCount: 42 }), null);
});

test("C.13 — progress running fourni → section Rattrapage ajoutée au rapport", () => {
  const progress: RunProgress = {
    status: "running",
    startedAt: "2026-05-31T18:00:00Z",
    totalChunks: 660,
    doneChunks: 120,
    scanned: 211,
    indexed: 18,
    skipped: 50,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = buildStatusReport({
    docCount: 120,
    scannedCount: 211,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
    progress,
    now: "2026-05-31T18:01:00Z",
  });

  assert.match(report, /Rattrapage en cours/i);
  assert.match(report, /120\/660/); // chunks faits / total
});

test("C.13 — pas de progress → pas de section Rattrapage", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /rattrapage/i);
});

test("3.1e — embedder in-process : ligne locale honnête, AUCUN quota Gemini", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "transformers-js",
  });

  // Le quota journalier est propre à Gemini : il NE doit pas apparaître en local.
  assert.doesNotMatch(report, /quota\s*:/i);
  assert.doesNotMatch(report, /7600/);
  assert.doesNotMatch(report, /aujourd'hui/i);
  // À la place, une ligne locale honnête qui nomme l'embedder et dit l'illimité.
  assert.match(report, /in-process/i);
  assert.match(report, /illimité/i);
});

test("3.1f — embedder compatible-OpenAI : pas de quota Gemini, sans promettre hors-ligne", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "openai-compatible",
  });

  assert.doesNotMatch(report, /7600/);
  assert.doesNotMatch(report, /aujourd'hui/i);
  // Endpoint nommé, mais on ne promet PAS « hors-ligne » (peut être distant).
  assert.match(report, /compatible-OpenAI/i);
  assert.doesNotMatch(report, /hors-ligne/i);
});
