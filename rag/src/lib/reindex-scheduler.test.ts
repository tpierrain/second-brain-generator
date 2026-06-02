import { test } from "node:test";
import assert from "node:assert/strict";
import { ReindexScheduler } from "./reindex-scheduler.js";

/**
 * Timer factice : capture l'unique callback en attente (le debounce ne garde
 * qu'un timer à la fois — chaque notify annule le précédent). `fire()` le
 * déclenche manuellement, sans horloge réelle.
 */
type Handle = ReturnType<typeof setTimeout>;

function fakeTimer() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  return {
    set(fn: () => void, _ms: number): Handle {
      const id = nextId++;
      timers.set(id, fn);
      return id as unknown as Handle;
    },
    clear(handle: Handle) {
      timers.delete(handle as unknown as number);
    },
    /** Déclenche tous les timers encore actifs (révèle un clear manquant). */
    fire() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((cb) => cb());
    },
    hasPending() {
      return timers.size > 0;
    },
  };
}

/**
 * Run pilotable : chaque appel renvoie une promesse qu'on résout à la main, pour
 * simuler un reindex « en cours » et déclencher un notify pendant ce temps.
 */
function controllableRun() {
  const resolvers: Array<() => void> = [];
  let calls = 0;
  return {
    run: () => {
      calls++;
      return new Promise<void>((resolve) => resolvers.push(resolve));
    },
    /** Termine le run le plus ancien et laisse les continuations post-await tourner. */
    async completeOne() {
      resolvers.shift()?.();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    calls: () => calls,
  };
}

test("F.1 — notify ne lance pas le reindex tout de suite, il le programme (timer en attente)", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();

  assert.equal(runs, 0);
  assert.ok(timer.hasPending());
});

test("F.1 — quand le timer se déclenche, le reindex est lancé une fois", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire();

  assert.equal(runs, 1);
});

test("F.1 — une rafale de notify est regroupée en un seul reindex (debounce)", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  scheduler.notify();
  scheduler.notify();
  timer.fire();

  assert.equal(runs, 1);
});

test("F.2 — un notify pendant un run → exactement un rerun à la fin (jamais en parallèle)", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run #1 démarre et reste en cours
  assert.equal(ctrl.calls(), 1);

  scheduler.notify();
  timer.fire(); // écriture pendant le run → pas de run parallèle
  assert.equal(ctrl.calls(), 1);

  await ctrl.completeOne(); // run #1 fini → le rerun en attente part
  assert.equal(ctrl.calls(), 2);

  await ctrl.completeOne(); // run #2 fini → plus rien en attente
  assert.equal(ctrl.calls(), 2);
});

test("F.2 — N écritures pendant un run sont fusionnées en un seul rerun", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run #1 en cours
  for (let i = 0; i < 4; i++) {
    scheduler.notify();
    timer.fire(); // 4 écritures pendant le run
  }
  assert.equal(ctrl.calls(), 1);

  await ctrl.completeOne(); // → un seul rerun, pas quatre
  assert.equal(ctrl.calls(), 2);

  await ctrl.completeOne(); // plus rien en attente
  assert.equal(ctrl.calls(), 2);
});

test("F.2 — sans écriture pendant le run, aucun rerun (idle → 0)", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire();
  await ctrl.completeOne();

  assert.equal(ctrl.calls(), 1);
});

test("F.live — un scheduler neuf est au repos (rien programmé, rien en cours)", () => {
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {},
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: false,
    pending: false,
  });
});

test("F.live — après notify, un reindex est programmé (scheduled), pas encore en cours", () => {
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {},
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();

  assert.deepEqual(scheduler.state(), {
    scheduled: true,
    running: false,
    pending: false,
  });
});

test("F.live — pendant un run : running, et écriture pendant le run → pending", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run en cours
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: true,
    pending: false,
  });

  scheduler.notify();
  timer.fire(); // écriture pendant le run → rerun en attente
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: true,
    pending: true,
  });

  await ctrl.completeOne(); // run + rerun consommés → retour au repos
  await ctrl.completeOne();
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: false,
    pending: false,
  });
});
