import { test } from "node:test";
import assert from "node:assert/strict";
import { indexPreparedDocs, type PreparedDoc, type IndexPorts } from "./indexer.js";

// Builds a minimal prepared doc with n chunks.
function doc(path: string, nChunks: number): PreparedDoc {
  return {
    relativePath: path,
    title: path,
    type: "topic",
    tags: [],
    hash: `hash-${path}`,
    universe: "default",
    chunks: Array.from({ length: nChunks }, (_, i) => ({
      section: `s${i}`,
      content: `${path}#${i}`,
      chunkIndex: i,
    })),
  };
}

// Fake embedding port: returns a trivial vector per chunk.
const fakeEmbed = async (texts: string[]) => texts.map(() => [0.1, 0.2]);

// Fake persistence port: records the order of persisted docs.
function recordingPersist() {
  const persisted: string[] = [];
  const persist: IndexPorts["persist"] = (d) => {
    persisted.push(d.relativePath);
  };
  return { persisted, persist };
}

test("indexes all docs when embedding succeeds", async () => {
  const { persisted, persist } = recordingPersist();
  const result = await indexPreparedDocs(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: fakeEmbed, persist }
  );

  assert.equal(result.indexed, 2);
  assert.deepEqual(persisted, ["a.md", "b.md"]);
  assert.equal(result.errors.length, 0);
});

test("stops at the failing doc and preserves the docs already persisted", async () => {
  const { persisted, persist } = recordingPersist();
  // Embedding fails (quota wall) on the 3rd doc.
  let calls = 0;
  const embedFailingOnThird: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 3) throw new Error("DailyCapExceededError simulated");
    return texts.map(() => [0.1, 0.2]);
  };

  const result = await indexPreparedDocs(
    [doc("a.md", 1), doc("b.md", 1), doc("c.md", 1), doc("d.md", 1)],
    { embed: embedFailingOnThird, persist }
  );

  assert.equal(result.indexed, 2); // a + b
  assert.deepEqual(persisted, ["a.md", "b.md"]); // c never persisted, d never attempted
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /c\.md/);
});

test("skips a doc whose persistence fails and continues with the following ones", async () => {
  // A poisoned doc (e.g. SQLite FK constraint) must not freeze the entire
  // catch-up: we skip it and continue, unlike the quota wall.
  const persisted: string[] = [];
  const persist: IndexPorts["persist"] = (d) => {
    if (d.relativePath === "b.md") {
      throw new Error("SqliteError: FOREIGN KEY constraint failed");
    }
    persisted.push(d.relativePath);
  };

  const result = await indexPreparedDocs(
    [doc("a.md", 1), doc("b.md", 1), doc("c.md", 1)],
    { embed: fakeEmbed, persist }
  );

  assert.equal(result.indexed, 2); // a + c
  assert.deepEqual(persisted, ["a.md", "c.md"]); // b skipped, c still attempted
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /b\.md/);
});

test("calls onProgress after each persisted doc, with its chunk count", async () => {
  const { persist } = recordingPersist();
  const progress: number[] = [];
  const result = await indexPreparedDocs(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: fakeEmbed, persist },
    (chunks) => progress.push(chunks)
  );

  assert.equal(result.indexed, 2);
  assert.deepEqual(progress, [2, 3]);
});

test("a doc with no chunks is surfaced as an error, never silently dropped", async () => {
  // F8 root cause: a 0-chunk doc used to be `continue`-d — neither indexed nor
  // counted, breaking the scanned == indexed + skipped + errors invariant and
  // making the file vanish from the index without a trace. With title-aware
  // chunking this should not happen for real docs; if it ever does, fail loud.
  const { persisted, persist } = recordingPersist();
  const result = await indexPreparedDocs(
    [doc("empty.md", 0), doc("full.md", 2)],
    { embed: fakeEmbed, persist }
  );

  assert.equal(result.indexed, 1);
  assert.deepEqual(persisted, ["full.md"]);
  assert.equal(result.errors.length, 1, "the 0-chunk doc must be accounted for");
  assert.match(result.errors[0], /empty\.md/);
  // Invariant: every doc given is accounted for (indexed or errored).
  assert.equal(result.indexed + result.errors.length, 2);
});
