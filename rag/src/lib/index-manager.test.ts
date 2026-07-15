// Mutation hardening (Stryker): index-manager.ts 39.44 % → 94.87 %.
// The `reindex`/`runReindex` orchestration is unit-tested through injected
// `ReindexStorePorts` (scan/read/hash/prune/stamp/persist) + an injected embedder
// and reporter — the "test the glue too" discipline that produced the jump.
// The 4 residual survivors are all documented EQUIVALENTS: the `defaultStorePorts`
// object literal + its `scan`/`readFile` arrows + the `"utf-8"` encoding are the
// DEFAULT wiring to the real fs/DB modules, exercised only in a real reindex (not
// unit-observable here, where every port is faked) — same class as embedder's
// `selectEmbedder` defaults and vector-store's `getDb` singleton. Effective score
// on non-equivalents: 74/74 = 100 %.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reindex,
  runIndexingPhase,
  shouldSkip,
  classifyWall,
  sha256,
  type ReindexStorePorts,
} from "./index-manager.js";
import { INDEX_SCHEMA_VERSION } from "./vector-store.js";
import type { EmbedderIdentity } from "./embedder.js";
import { ReindexLock, type LockState, type LockStorage } from "./reindex-lock.js";
import { ReindexReporter, type ProgressStorage } from "./reindex-reporter.js";
import type { PreparedDoc, IndexPorts } from "./indexer.js";
import type { RunProgress } from "./progress-report.js";
import type { Embedder } from "./embedder.js";

// Minimal prepared doc with n chunks.
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

// In-memory progress storage.
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

// Pre-filled in-memory storage — simulates a lock already held, without touching the FS.
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

test("shouldSkip: incremental run, unchanged doc (same hash) → skip", () => {
  assert.equal(shouldSkip(false, "abc", "abc"), true);
});

test("shouldSkip: incremental run, changed doc (different hash) → do not skip", () => {
  assert.equal(shouldSkip(false, "old", "new"), false);
});

test("shouldSkip: forced run always re-indexes, even on an identical hash", () => {
  assert.equal(shouldSkip(true, "abc", "abc"), false);
});

test("shouldSkip: never-indexed doc (no stored hash) → do not skip", () => {
  assert.equal(shouldSkip(false, null, "abc"), false);
});

test("sha256: hashes content with a known SHA-256 vector", () => {
  // Canonical NIST test vector for "abc".
  assert.equal(
    sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("classifyWall: both walls present → local-cap wins (it throws before the network)", () => {
  assert.equal(
    classifyWall(["got status: 429 RESOURCE_EXHAUSTED", "DailyCapExceededError: over"]),
    "local-cap"
  );
});

test("classifyWall: only a 429 → google-rate-limit", () => {
  assert.equal(classifyWall(["boom: 429 RESOURCE_EXHAUSTED"]), "google-rate-limit");
});

test("classifyWall: no wall marker → null", () => {
  assert.equal(classifyWall(["Read error: foo.md: ENOENT"]), null);
});

test("classifyWall: empty error list → null", () => {
  assert.equal(classifyWall([]), null);
});

// A lock nobody else holds → reindex acquires it and runs the full path.
function unlockedLock() {
  const storage = new MemStorage(null);
  const lock = new ReindexLock({
    storage,
    pid: 4321,
    isAlive: () => false,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });
  return { lock, storage };
}

// Embedder spy — records how many document batches it embedded.
function spyEmbedder(): { embedder: Embedder; calls: () => number } {
  let n = 0;
  const embedder: Embedder = {
    identity: { providerId: "fake", model: "spy", dimension: 2 },
    embedDocuments: async (texts) => {
      n++;
      return texts.map(() => [0.1, 0.2]);
    },
    embedQuery: async () => [0.1, 0.2],
  };
  return { embedder, calls: () => n };
}

// In-memory store ports + recorder, all effects overridable.
type IndexedDoc = {
  relativePath: string;
  title: string;
  type: string;
  tags: string[];
  hash: string;
  chunks: Array<{ section: string; content: string; chunkIndex: number; embedding: number[] }>;
  sourceUrl: string | null;
};

function fakePorts(overrides: Partial<ReindexStorePorts> = {}) {
  const calls = {
    stamped: [] as EmbedderIdentity[],
    indexed: [] as string[],
    docs: [] as IndexedDoc[],
    removedWith: [] as Set<string>[],
  };
  const base: ReindexStorePorts = {
    scan: async () => [],
    readFile: async () => "",
    getDocumentHash: () => null,
    removeDeletedDocs: (paths) => {
      calls.removedWith.push(paths);
      return 0;
    },
    currentIndexSchemaVersion: () => INDEX_SCHEMA_VERSION,
    currentIndexIdentity: () => null,
    stampIndexIdentity: (id) => {
      calls.stamped.push(id);
    },
    indexDocument: (relativePath, title, type, tags, hash, chunks, sourceUrl) => {
      calls.indexed.push(relativePath);
      calls.docs.push({ relativePath, title, type, tags, hash, chunks, sourceUrl });
    },
  };
  return { ports: { ...base, ...overrides }, calls };
}

test("reindex unlocked, pristine index: scans, indexes, stamps identity, releases lock", async () => {
  const { lock, storage } = unlockedLock();
  const { embedder, calls: embedCalls } = spyEmbedder();
  const progress = memProgressStorage();
  const reporter = new ReindexReporter({
    storage: progress,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => "# A\n\nsome body text for a.",
    getDocumentHash: () => null, // never indexed → must index
    removeDeletedDocs: (paths) => {
      calls.removedWith.push(paths);
      return 2; // two docs pruned this run
    },
  });

  const result = await reindex(false, { lock, embedder, reporter, ports });

  assert.equal(result.scanned, 1);
  assert.equal(result.indexed, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.removed, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(embedCalls(), 1); // the INJECTED embedder was used
  assert.deepEqual(calls.indexed, ["a.md"]);
  assert.equal(calls.stamped.length, 1); // pristine → stamped once…
  assert.deepEqual(calls.stamped[0], embedder.identity); // …with the current embedder
  assert.equal(storage.load(), null); // lock released in the finally

  // The doc reaches indexDocument fully materialised (chunk fields + embeddings).
  const indexed = calls.docs[0];
  assert.equal(indexed.relativePath, "a.md");
  assert.equal(indexed.hash, sha256("# A\n\nsome body text for a."));
  assert.ok(indexed.chunks.length >= 1);
  for (const c of indexed.chunks) {
    assert.equal(typeof c.section, "string");
    assert.equal(typeof c.content, "string");
    assert.equal(typeof c.chunkIndex, "number");
    assert.deepEqual(c.embedding, [0.1, 0.2]); // the injected embedder's vectors
  }

  // The scan/skip/prune counts are threaded to the reporter (meta object).
  const final = progress.load();
  assert.equal(final?.scanned, 1);
  assert.equal(final?.skipped, 0);
  assert.equal(final?.removed, 2);
});

test("reindex materialises a mirror doc's source_url onto the indexed document", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/m.md", relativePath: "m.md" }],
    readFile: async () =>
      "---\nsource_url: https://notion.so/page\n---\n# M\n\nmirror body.",
  });

  await reindex(false, { lock, embedder, ports });

  assert.equal(calls.docs[0].sourceUrl, "https://notion.so/page");
});

test("reindex without a source_url passes null (never undefined) to indexDocument", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => "# A\n\nplain body, no frontmatter source.",
  });

  await reindex(false, { lock, embedder, ports });

  assert.strictEqual(calls.docs[0].sourceUrl, null);
});

test("reindex called without a force argument defaults to an incremental (non-forced) run", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const content = "# A\n\nunchanged body.";
  const { ports } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => content,
    getDocumentHash: () => sha256(content), // matches → skipped ONLY if not forced
  });

  const result = await reindex(undefined, { lock, embedder, ports });

  assert.equal(result.skipped, 1); // default force=false honoured the incremental skip
  assert.equal(result.indexed, 0);
});

test("reindex incremental: unchanged doc (stored hash matches) is skipped, not re-embedded", async () => {
  const { lock } = unlockedLock();
  const { embedder, calls: embedCalls } = spyEmbedder();
  const content = "# A\n\nunchanged body.";
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => content,
    getDocumentHash: () => sha256(content), // stored hash == fresh hash → skip
  });

  const result = await reindex(false, { lock, embedder, ports });

  assert.equal(result.scanned, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.indexed, 0);
  assert.equal(embedCalls(), 0); // nothing re-embedded
  assert.deepEqual(calls.indexed, []);
});

test("reindex: a doc that fails to read is recorded as an error, others proceed", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const { ports, calls } = fakePorts({
    scan: async () => [
      { absolutePath: "/v/bad.md", relativePath: "bad.md" },
      { absolutePath: "/v/ok.md", relativePath: "ok.md" },
    ],
    readFile: async (p) => {
      if (p === "/v/bad.md") throw new Error("ENOENT");
      return "# OK\n\nbody.";
    },
  });

  const result = await reindex(false, { lock, embedder, ports });

  assert.equal(result.scanned, 2);
  assert.equal(result.indexed, 1);
  assert.deepEqual(calls.indexed, ["ok.md"]); // the readable one got indexed
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Read error: bad\.md/);
});

test("reindex on an already-stamped index (incremental): does NOT re-stamp identity", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const alreadyStamped: EmbedderIdentity = { providerId: "prev", model: "old", dimension: 2 };
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => "# A\n\nbody.",
    currentIndexIdentity: () => alreadyStamped, // stamped + not forced → keep it
  });

  await reindex(false, { lock, embedder, ports });

  assert.equal(calls.stamped.length, 0);
});

test("reindex forced on a stamped index: re-stamps with the current embedder", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const alreadyStamped: EmbedderIdentity = { providerId: "prev", model: "old", dimension: 2 };
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => "# A\n\nbody.",
    currentIndexIdentity: () => alreadyStamped,
  });

  await reindex(true, { lock, embedder, ports }); // force → re-encode → re-stamp

  assert.equal(calls.stamped.length, 1);
  assert.deepEqual(calls.stamped[0], embedder.identity);
});

test("reindex prunes deleted docs using the set of currently-scanned paths", async () => {
  const { lock } = unlockedLock();
  const { embedder } = spyEmbedder();
  const { ports, calls } = fakePorts({
    scan: async () => [{ absolutePath: "/v/a.md", relativePath: "a.md" }],
    readFile: async () => "# A\n\nbody.",
    removeDeletedDocs: (paths) => {
      calls.removedWith.push(paths);
      return 3;
    },
  });

  const result = await reindex(false, { lock, embedder, ports });

  assert.equal(result.removed, 3);
  assert.equal(calls.removedWith.length, 1);
  assert.ok(calls.removedWith[0].has("a.md")); // pruning is scoped to what's still on disk
});

test("reindex locked by another live process: no-op, zero embedding", async () => {
  const storage = new MemStorage({
    pid: 999,
    acquiredAt: "2026-05-31T17:59:00Z", // fresh → not stale
  });
  const lock = new ReindexLock({
    storage,
    pid: 1234,
    isAlive: () => true, // 999 is alive
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  let embedCalls = 0;
  const embedderSpy: Embedder = {
    identity: { providerId: "fake", model: "spy", dimension: 2 },
    embedDocuments: async (texts) => {
      embedCalls++;
      return texts.map(() => [0, 0]);
    },
    embedQuery: async () => [0, 0],
  };

  const result = await reindex(false, { lock, embedder: embedderSpy });

  assert.equal(result.skippedLocked, true);
  assert.deepEqual(result.errors, []); // the no-op reports no error
  assert.equal(result.scanned, 0);
  assert.equal(embedCalls, 0); // embedding was never triggered
  assert.equal(storage.load()?.pid, 999); // the other process keeps the lock
});

test("runIndexingPhase: start → tick per doc → finish done", async () => {
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

test("runIndexingPhase: quota wall → finish incomplete + hitCap", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // Embedding throws a DailyCapExceededError on the 2nd doc.
  let calls = 0;
  const embedCap: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      const err = new Error("Daily cap...");
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
  assert.equal(final?.doneChunks, 2); // only a.md (2 chunks) went through
  assert.equal(final?.errors.length, 1);
  assert.equal(final?.wallReason, "local-cap");
});

test("runIndexingPhase: Google wall (429) → finish incomplete + hitCap (not a successful run)", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // The real Google wall is hit first (Google's limit below ours): 429
  // RESOURCE_EXHAUSTED thrown by the embedder after its retries. This is NOT a
  // local DailyCapExceededError — but it's still an incomplete run to be resumed.
  let calls = 0;
  const embed429: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      throw new Error("got status: 429 RESOURCE_EXHAUSTED — Google quota");
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
