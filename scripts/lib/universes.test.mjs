import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUniverseName,
  addToRegistry,
  listAllUniverses,
  readRegistry,
  writeRegistry,
  readActiveUniverse,
  writeActiveUniverse,
  switchToUniverse,
  createAndSwitch,
  parseSwitchArgs,
  vaultRagDir,
  runSwitchCli,
  DEFAULT_UNIVERSE,
} from "./universes.mjs";

// In-memory fs fake: a Map<path, contents> behind the fs surface the module uses.
function fakeFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    existsSync: (p) => files.has(p),
    readFileSync: (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p);
    },
    writeFileSync: (p, data) => files.set(p, data),
    mkdirSync: () => {},
  };
}

// A universe name becomes a folder (vault/<name>/), a frontmatter value and a SQL
// value, so it must normalize to a safe kebab slug BY CONSTRUCTION (ADR 0034).

test("normalizeUniverseName lowercases and kebab-cases a plain name", () => {
  assert.equal(normalizeUniverseName("Acme Corp"), "acme-corp");
});

test("normalizeUniverseName strips accents and collapses punctuation runs", () => {
  assert.equal(normalizeUniverseName("  Éditeur / Team_A!!  "), "editeur-team-a");
});

test("normalizeUniverseName returns an empty slug when nothing usable remains", () => {
  assert.equal(normalizeUniverseName("///"), "");
  assert.equal(normalizeUniverseName(null), "");
});

// --- registry (created universes; the default is implicit) -------------------

test("addToRegistry appends a new name and keeps the list sorted", () => {
  // Two elements, deliberately out of order + a decoy already present, so a sort
  // mutant and a dedupe mutant both diverge.
  assert.deepEqual(addToRegistry(["blue"], "acme"), ["acme", "blue"]);
});

test("addToRegistry is idempotent (an existing name is not duplicated)", () => {
  assert.deepEqual(addToRegistry(["acme", "blue"], "acme"), ["acme", "blue"]);
});

test("addToRegistry never stores the implicit default universe", () => {
  assert.deepEqual(addToRegistry([], DEFAULT_UNIVERSE), []);
});

test("listAllUniverses puts the default first, then the sorted registry", () => {
  assert.deepEqual(listAllUniverses(["blue", "acme"]), [
    DEFAULT_UNIVERSE,
    "acme",
    "blue",
  ]);
});

// --- registry & active-pointer I/O (under .vault-rag/) ------------------------

test("readRegistry returns an empty list when no registry file exists", () => {
  assert.deepEqual(readRegistry(fakeFs(), "/brain/.vault-rag"), []);
});

test("writeRegistry then readRegistry round-trips the created universes", () => {
  const io = fakeFs();
  writeRegistry(io, "/brain/.vault-rag", ["acme", "blue"]);

  assert.deepEqual(readRegistry(io, "/brain/.vault-rag"), ["acme", "blue"]);
});

test("readActiveUniverse falls back to the default when no pointer exists", () => {
  assert.equal(readActiveUniverse(fakeFs(), "/brain/.vault-rag"), DEFAULT_UNIVERSE);
});

test("writeActiveUniverse then readActiveUniverse round-trips (trimmed)", () => {
  const io = fakeFs();
  writeActiveUniverse(io, "/brain/.vault-rag", "acme");

  assert.equal(readActiveUniverse(io, "/brain/.vault-rag"), "acme");
});

// --- switch (guarded) --------------------------------------------------------

test("switchToUniverse switches to a registered universe and persists the pointer", () => {
  const io = fakeFs();
  writeRegistry(io, "/brain/.vault-rag", ["acme"]);

  const res = switchToUniverse(io, "/brain/.vault-rag", "Acme");

  assert.deepEqual(res, { ok: true, name: "acme" });
  assert.equal(readActiveUniverse(io, "/brain/.vault-rag"), "acme");
});

test("switchToUniverse always allows the default universe (no registry entry needed)", () => {
  const io = fakeFs();

  const res = switchToUniverse(io, "/brain/.vault-rag", DEFAULT_UNIVERSE);

  assert.deepEqual(res, { ok: true, name: DEFAULT_UNIVERSE });
});

test("switchToUniverse refuses an unknown universe and does not touch the pointer", () => {
  const io = fakeFs();
  writeRegistry(io, "/brain/.vault-rag", ["acme"]);

  const res = switchToUniverse(io, "/brain/.vault-rag", "ghost");

  assert.equal(res.ok, false);
  assert.equal(res.reason, "unknown");
  assert.deepEqual(res.available, [DEFAULT_UNIVERSE, "acme"]);
  // Pointer untouched → still the default.
  assert.equal(readActiveUniverse(io, "/brain/.vault-rag"), DEFAULT_UNIVERSE);
});

// --- create-and-switch (git switch -c style) ---------------------------------

test("createAndSwitch registers a new universe and switches to it", () => {
  const io = fakeFs();

  const res = createAndSwitch(io, "/brain/.vault-rag", "Blue Team");

  assert.deepEqual(res, { ok: true, name: "blue-team", created: true });
  assert.deepEqual(readRegistry(io, "/brain/.vault-rag"), ["blue-team"]);
  assert.equal(readActiveUniverse(io, "/brain/.vault-rag"), "blue-team");
});

test("createAndSwitch on an existing universe just switches (created: false)", () => {
  const io = fakeFs();
  writeRegistry(io, "/brain/.vault-rag", ["acme"]);

  const res = createAndSwitch(io, "/brain/.vault-rag", "acme");

  assert.deepEqual(res, { ok: true, name: "acme", created: false });
  assert.deepEqual(readRegistry(io, "/brain/.vault-rag"), ["acme"]);
});

test("createAndSwitch refuses the reserved default name", () => {
  const io = fakeFs();

  const res = createAndSwitch(io, "/brain/.vault-rag", "Default");

  assert.equal(res.ok, false);
  assert.equal(res.reason, "reserved");
  assert.deepEqual(readRegistry(io, "/brain/.vault-rag"), []);
});

test("createAndSwitch refuses a name that normalizes to empty", () => {
  const io = fakeFs();

  const res = createAndSwitch(io, "/brain/.vault-rag", "///");

  assert.equal(res.ok, false);
  assert.equal(res.reason, "empty");
});

// --- CLI arg parsing ---------------------------------------------------------

test("parseSwitchArgs: a bare name is the switch fast path", () => {
  assert.deepEqual(parseSwitchArgs(["acme"]), { action: "switch", name: "acme" });
});

test("parseSwitchArgs: no args opens the menu", () => {
  assert.deepEqual(parseSwitchArgs([]), { action: "menu" });
});

test("parseSwitchArgs: explicit create / switch / list / current verbs", () => {
  assert.deepEqual(parseSwitchArgs(["create", "Blue", "Team"]), {
    action: "create",
    name: "Blue Team",
  });
  assert.deepEqual(parseSwitchArgs(["switch", "acme"]), {
    action: "switch",
    name: "acme",
  });
  assert.deepEqual(parseSwitchArgs(["list"]), { action: "list" });
  assert.deepEqual(parseSwitchArgs(["current"]), { action: "current" });
});

test("vaultRagDir joins the .vault-rag state dir onto the brain root", () => {
  assert.equal(vaultRagDir("/brain"), "/brain/.vault-rag");
});

// --- CLI dispatch (exit code + message) --------------------------------------

const DIR = "/brain/.vault-rag";

test("runSwitchCli create: registers, switches, exits 0", () => {
  const io = fakeFs();

  const res = runSwitchCli(io, DIR, ["create", "Acme"]);

  assert.equal(res.code, 0);
  assert.match(res.message, /created and switched to 'acme'/);
  assert.equal(readActiveUniverse(io, DIR), "acme");
});

test("runSwitchCli switch to an unknown universe exits 1 and lists the available ones", () => {
  const io = fakeFs();
  writeRegistry(io, DIR, ["acme"]);

  const res = runSwitchCli(io, DIR, ["ghost"]);

  assert.equal(res.code, 1);
  assert.match(res.message, /unknown universe 'ghost'/);
  assert.match(res.message, /default, acme/);
  assert.equal(readActiveUniverse(io, DIR), DEFAULT_UNIVERSE);
});

test("runSwitchCli current prints the active universe (exit 0)", () => {
  const io = fakeFs();
  writeActiveUniverse(io, DIR, "acme");

  assert.deepEqual(runSwitchCli(io, DIR, ["current"]), { code: 0, message: "acme" });
});

test("runSwitchCli list marks the active universe among all", () => {
  const io = fakeFs();
  writeRegistry(io, DIR, ["acme"]);
  writeActiveUniverse(io, DIR, "acme");

  const res = runSwitchCli(io, DIR, ["list"]);

  assert.equal(res.code, 0);
  assert.match(res.message, /\* acme/);
  assert.match(res.message, / {2}default/);
});
