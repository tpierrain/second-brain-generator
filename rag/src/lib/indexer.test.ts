import { test } from "node:test";
import assert from "node:assert/strict";
import { indexPreparedDocs, type PreparedDoc, type IndexPorts } from "./indexer.js";

// Fabrique un doc préparé minimal avec n chunks.
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

// Port d'embedding factice : renvoie un vecteur trivial par chunk.
const fakeEmbed = async (texts: string[]) => texts.map(() => [0.1, 0.2]);

// Port de persistance factice : enregistre l'ordre des docs persistés.
function recordingPersist() {
  const persisted: string[] = [];
  const persist: IndexPorts["persist"] = (d) => {
    persisted.push(d.relativePath);
  };
  return { persisted, persist };
}

test("indexe tous les docs quand l'embedding réussit", async () => {
  const { persisted, persist } = recordingPersist();
  const result = await indexPreparedDocs(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: fakeEmbed, persist }
  );

  assert.equal(result.indexed, 2);
  assert.deepEqual(persisted, ["a.md", "b.md"]);
  assert.equal(result.errors.length, 0);
});

test("s'arrête au doc en échec et préserve les docs déjà persistés", async () => {
  const { persisted, persist } = recordingPersist();
  // L'embedding échoue (mur quota) au 3ᵉ doc.
  let calls = 0;
  const embedFailingOnThird: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 3) throw new Error("DailyCapExceededError simulé");
    return texts.map(() => [0.1, 0.2]);
  };

  const result = await indexPreparedDocs(
    [doc("a.md", 1), doc("b.md", 1), doc("c.md", 1), doc("d.md", 1)],
    { embed: embedFailingOnThird, persist }
  );

  assert.equal(result.indexed, 2); // a + b
  assert.deepEqual(persisted, ["a.md", "b.md"]); // c jamais persisté, d jamais tenté
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /c\.md/);
});

test("saute un doc dont la persistance échoue et continue les suivants", async () => {
  // Un doc empoisonné (ex. contrainte SQLite FK) ne doit pas geler tout le
  // rattrapage : on le saute et on continue, contrairement au mur quota.
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
  assert.deepEqual(persisted, ["a.md", "c.md"]); // b sauté, c quand même tenté
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /b\.md/);
});

test("appelle onProgress après chaque doc persisté, avec son nombre de chunks", async () => {
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

test("ignore les docs sans chunks (ni persistés ni comptés)", async () => {
  const { persisted, persist } = recordingPersist();
  const result = await indexPreparedDocs(
    [doc("vide.md", 0), doc("plein.md", 2)],
    { embed: fakeEmbed, persist }
  );

  assert.equal(result.indexed, 1);
  assert.deepEqual(persisted, ["plein.md"]);
});
