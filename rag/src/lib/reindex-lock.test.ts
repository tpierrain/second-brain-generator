import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  ReindexLock,
  FileLockStorage,
  type LockState,
  type LockStorage,
} from "./reindex-lock.js";

// Stockage en mémoire — découple les tests du système de fichiers.
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

const at = (iso: string) => () => new Date(iso);

test("lock neuf : acquire() réussit et holder().pid = notre PID", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234);
});

test("lock tenu par un autre process vivant : acquire() renvoie false", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"), // lock récent (5 min) → non périmé
    pid: 1234,
    isAlive: () => true,
  });
  assert.equal(lock.acquire(), false);
  assert.equal(lock.holder()?.pid, 999); // l'autre garde le lock
});

test("lock tenu par un process mort : reclaim → acquire() true", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => false, // 999 n'existe plus
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234); // on a repris le lock
});

test("lock périmé (plus vieux que staleAfterMs) : reclaim même si le PID est vivant", () => {
  const lock = new ReindexLock({
    // acquis il y a 2h ; un reindex ne dure jamais aussi longtemps → présumé planté
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T16:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true, // PID réutilisé par un process sans rapport
    staleAfterMs: 10 * 60 * 1000, // 10 min
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234);
});

test("release() libère : holder() null, prochaine acquire() true", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  lock.acquire();
  lock.release();
  assert.equal(lock.holder(), null);
  assert.equal(lock.acquire(), true);
});

test("ré-entrant : le même PID peut ré-acquérir (pas d'auto-blocage)", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true, // notre propre PID est vivant
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), true); // ré-acquisition idempotente
  assert.equal(lock.holder()?.pid, 1234);
});

test("activeHolder() : lock tenu par process vivant et récent → renvoie le holder", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"), // 5 min → non périmé
    pid: 1234,
    isAlive: () => true,
  });
  assert.equal(lock.activeHolder()?.pid, 999);
});

test("activeHolder() : holder mort → null (pas de reindex réellement en cours)", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => false,
  });
  assert.equal(lock.activeHolder(), null);
});

test("activeHolder() : holder périmé → null même si le PID est vivant", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T16:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true,
    staleAfterMs: 10 * 60 * 1000,
  });
  assert.equal(lock.activeHolder(), null);
});

test("activeHolder() : aucun lock → null", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  assert.equal(lock.activeHolder(), null);
});

test("FileLockStorage : round-trip load/save/clear sur fichier temp", () => {
  const path = resolve(tmpdir(), `reindex-lock-test-${process.pid}.json`);
  rmSync(path, { force: true });
  const storage = new FileLockStorage(path);
  try {
    assert.equal(storage.load(), null); // vide au départ
    const state: LockState = { pid: 1234, acquiredAt: "2026-05-31T18:00:00Z" };
    storage.save(state);
    assert.deepEqual(storage.load(), state);
    storage.clear();
    assert.equal(storage.load(), null);
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(path, { force: true });
  }
});
