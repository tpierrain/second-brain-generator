import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UsageTracker,
  DailyCapExceededError,
  dayKey,
  type UsageState,
  type UsageStorage,
} from "./usage-tracker.js";

// Stockage en mémoire — découple les tests du système de fichiers.
class MemStorage implements UsageStorage {
  state: UsageState | null;
  constructor(initial: UsageState | null = null) {
    this.state = initial;
  }
  load(): UsageState | null {
    return this.state;
  }
  save(s: UsageState): void {
    this.state = { ...s };
  }
}

const PT = "America/Los_Angeles";
const at = (iso: string) => () => new Date(iso);

test("tracker neuf : quota plein disponible", () => {
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  assert.equal(t.usedToday(), 0);
  assert.equal(t.remainingToday(), 1000);
});

test("consume décrémente le restant", () => {
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(10);
  assert.equal(t.usedToday(), 10);
  assert.equal(t.remainingToday(), 990);
});

test("consume jusqu'au plafond OK, au-delà ça throw", () => {
  const t = new UsageTracker({
    maxPerDay: 5,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(5);
  assert.equal(t.remainingToday(), 0);
  assert.throws(() => t.consume(1), DailyCapExceededError);
});

test("un consume qui dépasserait ne consomme RIEN (pas de demi-consommation)", () => {
  const storage = new MemStorage();
  const t = new UsageTracker({
    maxPerDay: 5,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage,
  });
  t.consume(3);
  assert.throws(() => t.consume(5), DailyCapExceededError); // 3 + 5 > 5
  assert.equal(t.usedToday(), 3); // inchangé
});

test("le compteur se réinitialise à la frontière de jour (PT)", () => {
  let clock = new Date("2026-05-30T18:00:00Z");
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: () => clock,
    storage: new MemStorage(),
  });
  t.consume(900);
  assert.equal(t.usedToday(), 900);
  clock = new Date("2026-05-31T18:00:00Z"); // jour suivant
  assert.equal(t.usedToday(), 0);
  assert.equal(t.remainingToday(), 1000);
});

test("l'état persiste entre deux instances via le storage", () => {
  const storage = new MemStorage();
  const now = at("2026-05-30T18:00:00Z");
  new UsageTracker({ maxPerDay: 1000, timeZone: PT, now, storage }).consume(42);
  const t2 = new UsageTracker({ maxPerDay: 1000, timeZone: PT, now, storage });
  assert.equal(t2.usedToday(), 42);
});

test("conso indexation : throw quand count + n dépasse maxPerDay − reserve", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(7); // 7 == 10 − 3, le plafond indexation est atteint
  assert.throws(() => t.consume(1), DailyCapExceededError);
});

test("conso prioritaire : peut aller jusqu'à maxPerDay, ignore la réserve", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(7); // indexation jusqu'au plafond indexation (10 − 3)
  // une requête prioritaire pioche dans la réserve : 7 + 3 == 10 OK
  assert.doesNotThrow(() => t.consumePriority(3));
  assert.equal(t.usedToday(), 10);
  // mais au-delà du plafond plein, ça throw
  assert.throws(() => t.consumePriority(1), DailyCapExceededError);
});

test("remainingForIndexing reflète la réserve, plancher à 0", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  assert.equal(t.remainingForIndexing(), 7); // 10 − 3 − 0
  t.consume(5);
  assert.equal(t.remainingForIndexing(), 2); // 10 − 3 − 5
  // une requête prioritaire pioche dans la réserve → indexation à sec
  t.consumePriority(3);
  assert.equal(t.remainingForIndexing(), 0); // plancher, pas négatif
});

test("dayKey utilise bien la frontière du fuseau Pacifique", () => {
  // 2026-05-30T05:00Z = 2026-05-29 22:00 PDT → encore le 29 en PT
  assert.equal(dayKey(new Date("2026-05-30T05:00:00Z"), PT), "2026-05-29");
  // 2026-05-30T18:00Z = 2026-05-30 11:00 PDT → le 30
  assert.equal(dayKey(new Date("2026-05-30T18:00:00Z"), PT), "2026-05-30");
});
