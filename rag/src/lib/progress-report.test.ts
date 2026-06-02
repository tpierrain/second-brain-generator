import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunksPerMinute,
  etaMinutes,
  formatProgressReport,
  formatLastRunMarkdown,
  type RunProgress,
} from "./progress-report.js";

test("C.1 — débit : 120 chunks en 2 min → 60 chunks/min", () => {
  const rate = chunksPerMinute({
    doneChunks: 120,
    startedAt: "2026-05-31T12:00:00Z",
    now: "2026-05-31T12:02:00Z",
  });

  assert.equal(rate, 60);
});

test("C.1 — débit : 0 temps écoulé → 0 (pas de division par zéro)", () => {
  const rate = chunksPerMinute({
    doneChunks: 5,
    startedAt: "2026-05-31T12:00:00Z",
    now: "2026-05-31T12:00:00Z",
  });

  assert.equal(rate, 0);
});

test("C.2 — ETA : 540 chunks restants à 60/min → 9 min", () => {
  const eta = etaMinutes({ totalChunks: 660, doneChunks: 120, ratePerMin: 60 });

  assert.equal(eta, 9);
});

test("C.2 — ETA : débit nul → null (pas d'estimation, pas d'Infinity)", () => {
  const eta = etaMinutes({ totalChunks: 660, doneChunks: 120, ratePerMin: 0 });

  assert.equal(eta, null);
});

test("C.3 — running : rattrapage en cours avec %, débit, ETA, erreurs, durée", () => {
  const state: RunProgress = {
    status: "running",
    startedAt: "2026-05-31T12:00:00Z",
    totalChunks: 660,
    doneChunks: 120,
    scanned: 211,
    indexed: 0,
    skipped: 0,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = formatProgressReport(state, "2026-05-31T12:02:00Z");

  assert.match(report, /en cours/i);
  assert.match(report, /120\s*\/\s*660/); // chunks faits / total
  assert.match(report, /18\s*%/); // 120/660
  assert.match(report, /60\s*\/\s*min/); // 120 en 2 min
  assert.match(report, /ETA\s*~?\s*9\s*min/i); // 540 restants à 60/min
  assert.match(report, /0\s*erreur/i);
});

test("C.4 — done : dernier rattrapage terminé, durée, docs indexés, erreurs", () => {
  const state: RunProgress = {
    status: "done",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:08:00Z",
    totalChunks: 660,
    doneChunks: 660,
    scanned: 211,
    indexed: 108,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /termin/i);
  assert.match(report, /8\s*min/); // 12:08 - 12:00
  assert.match(report, /108\s*doc/i);
  assert.match(report, /0\s*erreur/i);
  assert.doesNotMatch(report, /en cours/i);
});

test("C.5 — incomplete / hitCap : mur quota, chunks restants, reprise auto", () => {
  const state: RunProgress = {
    status: "incomplete",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:05:00Z",
    totalChunks: 660,
    doneChunks: 480,
    scanned: 211,
    indexed: 80,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: true,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /incomplet/i);
  assert.match(report, /quota/i); // mur quota
  assert.match(report, /180\s*chunks?\s*restants?/i); // 660 - 480
  assert.match(report, /reprise/i);
});

test("C.5 — erreurs listées mais tronquées (3 max + compte du reste)", () => {
  const state: RunProgress = {
    status: "incomplete",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:05:00Z",
    totalChunks: 660,
    doneChunks: 480,
    scanned: 211,
    indexed: 80,
    skipped: 103,
    removed: 0,
    errors: ["err-A", "err-B", "err-C", "err-D", "err-E"],
    hitCap: true,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /err-A/);
  assert.match(report, /err-B/);
  assert.match(report, /err-C/);
  assert.doesNotMatch(report, /err-D/); // tronqué au-delà de 3
  assert.match(report, /2\s*autre/i); // 5 - 3 restantes
});

test("C.14 — last-run.md : titre markdown + ligne de rapport", () => {
  const state: RunProgress = {
    status: "done",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:08:00Z",
    totalChunks: 660,
    doneChunks: 660,
    scanned: 211,
    indexed: 108,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const md = formatLastRunMarkdown(state, "2026-05-31T12:10:00Z");

  assert.match(md, /^#\s/m); // un titre markdown
  assert.match(md, /108\s*doc/i); // le résumé du run
  assert.match(md, /termin/i);
});
