import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { scanVault, type DirEntry } from "./document-scanner.js";

function file(name: string): DirEntry {
  return { name, isDirectory: () => false };
}
function dir(name: string): DirEntry {
  return { name, isDirectory: () => true };
}

// Builds a fake readDir port from a map of absolute dir -> entries.
function fakeReadDir(tree: Record<string, DirEntry[]>) {
  return async (d: string): Promise<DirEntry[]> => tree[d] ?? [];
}

test("returns the .md files found at the root", async () => {
  const readDir = fakeReadDir({ "/vault": [file("note.md")] });
  const files = await scanVault("/vault", readDir);
  assert.deepEqual(
    files.map((f) => f.relativePath),
    ["note.md"]
  );
});

test("exposes both absolute and vault-relative paths", async () => {
  const readDir = fakeReadDir({ "/vault": [file("note.md")] });
  const [scanned] = await scanVault("/vault", readDir);
  // absolutePath is the native resolved path (openable by fs) — computed the same way
  // on any OS; relativePath is the POSIX-normalised vault-relative id.
  assert.deepEqual(scanned, {
    absolutePath: resolve("/vault", "note.md"),
    relativePath: "note.md",
  });
});

test("recurses into subdirectories and keeps the subdir in the relative path", async () => {
  // Production recurses via `resolve(dir, name)`, so the subdir key must be the
  // resolved path (native on Windows: `D:\vault\topics`) — a hard-coded POSIX key
  // would never match there. `resolve` makes the fake tree OS-portable.
  const readDir = fakeReadDir({
    "/vault": [dir("topics"), file("root.md")],
    [resolve("/vault", "topics")]: [file("deep.md")],
  });
  const files = await scanVault("/vault", readDir);
  assert.deepEqual(
    files.map((f) => f.relativePath).sort(),
    ["root.md", "topics/deep.md"]
  );
});

test("excludes the _template.md and .gitkeep scaffolding files", async () => {
  const readDir = fakeReadDir({
    "/vault": [file("_template.md"), file(".gitkeep"), file("keep.md")],
  });
  const files = await scanVault("/vault", readDir);
  assert.deepEqual(
    files.map((f) => f.relativePath),
    ["keep.md"]
  );
});

test("ignores files that are not Markdown", async () => {
  const readDir = fakeReadDir({
    "/vault": [file("note.md"), file("photo.png"), file("data.json")],
  });
  const files = await scanVault("/vault", readDir);
  assert.deepEqual(
    files.map((f) => f.relativePath),
    ["note.md"]
  );
});

test("never descends into the .obsidian directory", async () => {
  const readDir = fakeReadDir({
    "/vault": [dir(".obsidian"), file("note.md")],
    "/vault/.obsidian": [file("workspace.md")],
  });
  const files = await scanVault("/vault", readDir);
  assert.deepEqual(
    files.map((f) => f.relativePath),
    ["note.md"]
  );
});

// Exercises the REAL default readDir port (fs/promises) against an actual tree,
// so the I/O adapter — not just the injected fake — is covered end to end.
test("scans a real directory tree through the default fs port", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbg-scan-"));
  try {
    await mkdir(join(root, "topics"), { recursive: true });
    await writeFile(join(root, "root.md"), "# root");
    await writeFile(join(root, "topics", "deep.md"), "# deep");
    await writeFile(join(root, "ignore.txt"), "nope");

    const files = await scanVault(root);

    assert.deepEqual(
      files.map((f) => f.relativePath).sort(),
      ["root.md", "topics/deep.md"]
    );
    assert.deepEqual(
      files.map((f) => f.absolutePath).sort(),
      [join(root, "root.md"), join(root, "topics", "deep.md")]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
