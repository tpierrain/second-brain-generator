import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { FSWatcher, ChokidarOptions } from "chokidar";
import { VAULT_DIR } from "./config.js";
import {
  isIgnoredPath,
  startVaultWatcher,
  type WatchFactory,
} from "./vault-watcher.js";

test("ignores paths nested under a .git / .cache / node_modules segment", () => {
  assert.equal(isIgnoredPath("/vault/.git/config"), true);
  assert.equal(isIgnoredPath("/vault/notes/node_modules/x.md"), true);
  assert.equal(isIgnoredPath("/vault/a/.cache/b.md"), true);
});

test("ignores a path that ends on an ignored segment", () => {
  assert.equal(isIgnoredPath("/vault/.git"), true);
  assert.equal(isIgnoredPath("/vault/sub/node_modules"), true);
});

test("watches a regular vault note", () => {
  assert.equal(isIgnoredPath("/vault/topics/note.md"), false);
});

test("does not ignore a segment merely containing an ignored name", () => {
  // `.gitignore` contains ".git" but is a real note path, not the .git dir.
  assert.equal(isIgnoredPath("/vault/.gitignore"), false);
  assert.equal(isIgnoredPath("/vault/my-node_modules-notes.md"), false);
});

type Handler = (p: string) => void;

// Records every `.on(event, handler)` registration and can replay events,
// standing in for chokidar's FSWatcher without touching the filesystem.
class FakeWatcher {
  readonly handlers: Record<string, Handler> = {};
  on(event: string, handler: Handler): this {
    this.handlers[event] = handler;
    return this;
  }
  emit(event: string, path: string): void {
    this.handlers[event]?.(path);
  }
}

function recordingFactory() {
  const watcher = new FakeWatcher();
  const calls: { dir: string; options: ChokidarOptions }[] = [];
  const factory: WatchFactory = (dir, options) => {
    calls.push({ dir, options });
    return watcher as unknown as FSWatcher;
  };
  return { factory, watcher, calls };
}

test("forwards add, change and unlink events to onChange", () => {
  const seen: string[] = [];
  const { factory, watcher } = recordingFactory();
  startVaultWatcher({ onChange: (p) => seen.push(p) }, factory);

  watcher.emit("add", "/vault/added.md");
  watcher.emit("change", "/vault/edited.md");
  watcher.emit("unlink", "/vault/removed.md");

  assert.deepEqual(seen, [
    "/vault/added.md",
    "/vault/edited.md",
    "/vault/removed.md",
  ]);
});

test("watches the explicitly provided vault directory", () => {
  const { factory, calls } = recordingFactory();
  startVaultWatcher({ onChange: () => {}, vaultDir: "/custom/vault" }, factory);
  assert.equal(calls[0].dir, "/custom/vault");
});

test("falls back to VAULT_DIR when no directory is provided", () => {
  const { factory, calls } = recordingFactory();
  startVaultWatcher({ onChange: () => {} }, factory);
  assert.equal(calls[0].dir, VAULT_DIR);
});

test("skips the initial scan and stays persistent", () => {
  const { factory, calls } = recordingFactory();
  startVaultWatcher({ onChange: () => {} }, factory);
  assert.equal(calls[0].options.ignoreInitial, true);
  assert.equal(calls[0].options.persistent, true);
});

test("wires the ignore predicate into chokidar", () => {
  const { factory, calls } = recordingFactory();
  startVaultWatcher({ onChange: () => {} }, factory);
  const ignored = calls[0].options.ignored as (p: string) => boolean;
  assert.equal(ignored("/vault/.git/config"), true);
  assert.equal(ignored("/vault/note.md"), false);
});

test("returns the created watcher", () => {
  const { factory, watcher } = recordingFactory();
  const result = startVaultWatcher({ onChange: () => {} }, factory);
  assert.equal(result, watcher as unknown as FSWatcher);
});

// Exercises the REAL default factory (chokidar) — without it the I/O adapter
// `(dir, options) => watch(dir, options)` is never run. Deterministic: it asserts
// a live, closeable watcher is built (no fs-event timing), then closes it.
test("the default factory builds a real, closeable chokidar watcher", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbg-watch-"));
  try {
    const watcher = startVaultWatcher({ onChange: () => {}, vaultDir: root });
    assert.equal(typeof watcher.close, "function");
    await watcher.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
