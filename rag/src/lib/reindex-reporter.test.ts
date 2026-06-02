import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import {
  ReindexReporter,
  FileProgressStorage,
  type ProgressStorage,
} from "./reindex-reporter.js";
import type { RunProgress } from "./progress-report.js";

/** Storage mémoire pour les tests. */
function memoryStorage(): ProgressStorage & { state: RunProgress | null } {
  return {
    state: null as RunProgress | null,
    load() {
      return this.state;
    },
    save(s: RunProgress) {
      this.state = s;
    },
  };
}

const fixedNow = () => new Date("2026-05-31T12:00:00Z");

test("C.6 — start : persiste un état running (compteurs initiaux + startedAt)", () => {
  const storage = memoryStorage();
  const reporter = new ReindexReporter({ storage, now: fixedNow });

  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });

  const state = storage.load()!;
  assert.equal(state.status, "running");
  assert.equal(state.startedAt, "2026-05-31T12:00:00.000Z");
  assert.equal(state.totalChunks, 660);
  assert.equal(state.scanned, 211);
  assert.equal(state.skipped, 103);
  assert.equal(state.removed, 0);
  assert.equal(state.doneChunks, 0);
  assert.equal(state.indexed, 0);
  assert.deepEqual(state.errors, []);
  assert.equal(state.hitCap, false);
});

test("C.7 — tick : incrémente doneChunks au fil de l'eau", () => {
  const storage = memoryStorage();
  const reporter = new ReindexReporter({ storage, now: fixedNow });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });

  reporter.tick(7);
  reporter.tick(5);

  const state = storage.load()!;
  assert.equal(state.doneChunks, 12);
  assert.equal(state.status, "running");
});

test("C.8 — finish sans hitCap → done, finishedAt, compteurs", () => {
  const storage = memoryStorage();
  let clock = new Date("2026-05-31T12:00:00Z");
  const reporter = new ReindexReporter({ storage, now: () => clock });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });

  clock = new Date("2026-05-31T12:08:00Z");
  reporter.finish({ indexed: 108, errors: [], hitCap: false });

  const state = storage.load()!;
  assert.equal(state.status, "done");
  assert.equal(state.finishedAt, "2026-05-31T12:08:00.000Z");
  assert.equal(state.indexed, 108);
  assert.equal(state.hitCap, false);
});

test("C.8 — finish avec hitCap → incomplete", () => {
  const storage = memoryStorage();
  const reporter = new ReindexReporter({ storage, now: fixedNow });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });

  reporter.finish({ indexed: 80, errors: [], hitCap: true });

  assert.equal(storage.load()!.status, "incomplete");
});

test("C.9 — recordError : accumule les erreurs, statut reste running", () => {
  const storage = memoryStorage();
  const reporter = new ReindexReporter({ storage, now: fixedNow });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });

  reporter.recordError("doc-A: quota 429");
  reporter.recordError("doc-B: parse error");

  const state = storage.load()!;
  assert.deepEqual(state.errors, ["doc-A: quota 429", "doc-B: parse error"]);
  assert.equal(state.status, "running");
});

test("C.9 — fail : échec dur → statut error, erreur ajoutée, finishedAt", () => {
  const storage = memoryStorage();
  let clock = new Date("2026-05-31T12:00:00Z");
  const reporter = new ReindexReporter({ storage, now: () => clock });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });
  reporter.recordError("doc-A: quota 429");

  clock = new Date("2026-05-31T12:03:00Z");
  reporter.fail("DB lock: disk I/O error");

  const state = storage.load()!;
  assert.equal(state.status, "error");
  assert.equal(state.finishedAt, "2026-05-31T12:03:00.000Z");
  assert.deepEqual(state.errors, ["doc-A: quota 429", "DB lock: disk I/O error"]);
});

test("C.9 — finish préserve les erreurs accumulées (merge, pas écrasement)", () => {
  const storage = memoryStorage();
  const reporter = new ReindexReporter({ storage, now: fixedNow });
  reporter.start({ totalChunks: 660, scanned: 211, skipped: 103, removed: 0 });
  reporter.recordError("doc-A: quota 429");

  reporter.finish({ indexed: 80, errors: ["doc-Z: late error"], hitCap: false });

  assert.deepEqual(storage.load()!.errors, ["doc-A: quota 429", "doc-Z: late error"]);
});

const sampleState: RunProgress = {
  status: "running",
  startedAt: "2026-05-31T12:00:00Z",
  totalChunks: 660,
  doneChunks: 120,
  scanned: 211,
  indexed: 0,
  skipped: 103,
  removed: 0,
  errors: [],
  hitCap: false,
};

test("C.10 — FileProgressStorage : round-trip load/save sur fichier temp", () => {
  const path = resolve(tmpdir(), `reindex-progress-test-${process.pid}.json`);
  rmSync(path, { force: true });
  const storage = new FileProgressStorage(path);
  try {
    assert.equal(storage.load(), null); // vide au départ
    storage.save(sampleState);
    assert.deepEqual(storage.load(), sampleState);
  } finally {
    rmSync(path, { force: true });
  }
});

test("C.10 — FileProgressStorage : fichier corrompu → état absent (null)", () => {
  const path = resolve(tmpdir(), `reindex-progress-corrupt-${process.pid}.json`);
  writeFileSync(path, "{ pas du json", "utf-8");
  const storage = new FileProgressStorage(path);
  try {
    assert.equal(storage.load(), null);
  } finally {
    rmSync(path, { force: true });
  }
});
