import { test } from "node:test";
import assert from "node:assert/strict";
import { reindex, runIndexingPhase } from "./index-manager.js";
import { ReindexLock, type LockState, type LockStorage } from "./reindex-lock.js";
import { ReindexReporter, type ProgressStorage } from "./reindex-reporter.js";
import type { PreparedDoc, IndexPorts } from "./indexer.js";
import type { RunProgress } from "./progress-report.js";

// Doc préparé minimal avec n chunks.
function doc(path: string, nChunks: number): PreparedDoc {
  return {
    relativePath: path,
    title: path,
    type: "topic",
    tags: [],
    hash: `hash-${path}`,
    chunks: Array.from({ length: nChunks }, (_, i) => ({
      section: `s${i}`,
      content: `${path}#${i}`,
      chunkIndex: i,
    })),
  };
}

const fakeEmbed: IndexPorts["embed"] = async (texts) => texts.map(() => [0.1, 0.2]);

// Storage de progress en mémoire.
function memProgressStorage() {
  let state: RunProgress | null = null;
  const storage: ProgressStorage = {
    load: () => state,
    save: (s) => {
      state = s;
    },
  };
  return storage;
}

// Storage en mémoire pré-rempli — simule un lock déjà tenu, sans toucher au FS.
class MemStorage implements LockStorage {
  state: LockState | null;
  constructor(initial: LockState | null = null) {
    this.state = initial;
  }
  load(): LockState | null {
    return this.state;
  }
  save(s: LockState): void {
    this.state = { ...s };
  }
  clear(): void {
    this.state = null;
  }
}

test("reindex verrouillé par un autre process vivant : no-op, zéro embedding", async () => {
  const storage = new MemStorage({
    pid: 999,
    acquiredAt: "2026-05-31T17:59:00Z", // frais → non périmé
  });
  const lock = new ReindexLock({
    storage,
    pid: 1234,
    isAlive: () => true, // 999 est vivant
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  let embedCalls = 0;
  const embedSpy = async (texts: string[]) => {
    embedCalls++;
    return texts.map(() => [0]);
  };

  const result = await reindex(false, { lock, embed: embedSpy });

  assert.equal(result.skippedLocked, true);
  assert.equal(embedCalls, 0); // l'embedding n'a jamais été déclenché
  assert.equal(storage.load()?.pid, 999); // l'autre process garde le lock
});

test("runIndexingPhase : start → tick par doc → finish done", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  const result = await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: fakeEmbed, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 3, removed: 0 }
  );

  assert.equal(result.indexed, 2);
  const final = storage.load();
  assert.equal(final?.status, "done");
  assert.equal(final?.totalChunks, 5);
  assert.equal(final?.doneChunks, 5);
  assert.equal(final?.indexed, 2);
  assert.equal(final?.skipped, 3);
  assert.equal(final?.hitCap, false);
  assert.equal(final?.wallReason, null);
});

test("runIndexingPhase : mur quota → finish incomplete + hitCap", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // L'embedding lève une DailyCapExceededError au 2ᵉ doc.
  let calls = 0;
  const embedCap: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      const err = new Error("Plafond journalier...");
      err.name = "DailyCapExceededError";
      throw err;
    }
    return texts.map(() => [0.1, 0.2]);
  };

  await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: embedCap, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 0, removed: 0 }
  );

  const final = storage.load();
  assert.equal(final?.status, "incomplete");
  assert.equal(final?.hitCap, true);
  assert.equal(final?.doneChunks, 2); // seul a.md (2 chunks) est passé
  assert.equal(final?.errors.length, 1);
  assert.equal(final?.wallReason, "local-cap");
});

test("runIndexingPhase : mur Google (429) → finish incomplete + hitCap (pas un run réussi)", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // Le mur réel Google est tapé en premier (limite Google sous la nôtre) : 429
  // RESOURCE_EXHAUSTED levé par l'embedder après ses retries. Ce n'est PAS une
  // DailyCapExceededError locale — mais ça reste un run incomplet à reprendre.
  let calls = 0;
  const embed429: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      throw new Error("got status: 429 RESOURCE_EXHAUSTED — quota Google");
    }
    return texts.map(() => [0.1, 0.2]);
  };

  await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: embed429, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 0, removed: 0 }
  );

  const final = storage.load();
  assert.equal(final?.status, "incomplete");
  assert.equal(final?.hitCap, true);
  assert.equal(final?.wallReason, "google-rate-limit");
});
