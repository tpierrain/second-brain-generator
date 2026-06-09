import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { parseAnswers, resolveTargetDir, resolveRunMode } from "./installer-args.mjs";

test("parseAnswers — forme --x=v", () => {
  const r = parseAnswers(["--name=mon-cerveau"], {}, {});
  assert.equal(r.projectName, "mon-cerveau");
});

test("parseAnswers — forme --x v (espace)", () => {
  const r = parseAnswers(["--name", "mon-cerveau"], {}, {});
  assert.equal(r.projectName, "mon-cerveau");
});

test("parseAnswers — aucune clé/secret n'est jamais reconnue (sécurité)", () => {
  for (const argv of [
    ["--gemini-key", "SECRET", "--name", "ok"],
    ["--gemini-key=SECRET", "--name=ok"],
    ["--key=SECRET"],
    ["--GOOGLE_GEMINI_API_KEY=SECRET"],
  ]) {
    const r = parseAnswers(argv, {}, {});
    assert.ok(
      !Object.values(r).includes("SECRET"),
      `secret fuite dans la sortie pour ${argv.join(" ")}`,
    );
    assert.equal("geminiKey" in r, false);
  }
  // le reste continue de parser normalement malgré le flag parasite
  assert.equal(parseAnswers(["--gemini-key", "SECRET", "--name", "ok"], {}, {}).projectName, "ok");
});

test("parseAnswers — --embedder (formes v et =v, + env SB_EMBEDDER) → embedder", () => {
  assert.equal(parseAnswers(["--embedder", "in-process"], {}, {}).embedder, "in-process");
  assert.equal(parseAnswers(["--embedder=gemini"], {}, {}).embedder, "gemini");
  assert.equal(parseAnswers([], { SB_EMBEDDER: "ollama" }, {}).embedder, "ollama");
  // absent → undefined (l'installeur appliquera la reco machine)
  assert.equal(parseAnswers([], {}, {}).embedder, undefined);
});

test("resolveRunMode — --help prime sur tout → 'help'", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: true, help: true }), "help");
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: false, help: true }), "help");
});

test("resolveRunMode — --non-interactive explicite → 'non-interactive' (avec ou sans TTY)", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: true, help: false }), "non-interactive");
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: true, help: false }), "non-interactive");
});

test("resolveRunMode — TTY sans --non-interactive → 'interactive'", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: false, help: false }), "interactive");
});

test("resolveRunMode — ni TTY ni --non-interactive → 'refuse' (anti install fantôme)", () => {
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: false, help: false }), "refuse");
});

test("resolveTargetDir — sans destParent → join(home, name)", () => {
  assert.equal(
    resolveTargetDir({ name: "perso", destParent: undefined, home: "/home/me" }),
    join("/home/me", "perso"),
  );
});

test("resolveTargetDir — avec destParent → join(destParent, name)", () => {
  assert.equal(
    resolveTargetDir({ name: "boulot", destParent: "/data/brains", home: "/home/me" }),
    join("/data/brains", "boulot"),
  );
});

test("parseAnswers — --dest (formes v et =v) → destParent", () => {
  assert.equal(parseAnswers(["--dest", "/parent"], {}, {}).destParent, "/parent");
  assert.equal(parseAnswers(["--dest=/parent"], {}, {}).destParent, "/parent");
});

test("parseAnswers — destParent : précédence flag (--dest) > env (SB_DEST) > défaut", () => {
  // env gagne sur défaut
  assert.equal(parseAnswers([], { SB_DEST: "/env" }, {}).destParent, "/env");
  // flag gagne sur env
  assert.equal(parseAnswers(["--dest=/flag"], { SB_DEST: "/env" }, {}).destParent, "/flag");
  // défaut sinon
  assert.equal(parseAnswers([], {}, { destParent: "/def" }).destParent, "/def");
});

test("parseAnswers — --help / -h → help:true (sinon false)", () => {
  assert.equal(parseAnswers(["--help"], {}, {}).help, true);
  assert.equal(parseAnswers(["-h"], {}, {}).help, true);
  assert.equal(parseAnswers(["--name=ok"], {}, {}).help, false);
});

test("parseAnswers — --non-interactive et ses alias → nonInteractive:true", () => {
  for (const flag of ["--non-interactive", "--yes", "--no-input"]) {
    assert.equal(parseAnswers([flag], {}, {}).nonInteractive, true, `${flag}`);
  }
  assert.equal(parseAnswers([], {}, {}).nonInteractive, false);
});

test("parseAnswers — précédence flag > env > default", () => {
  const defaults = {
    projectName: "def-proj",
    ownerName: "def-owner",
    language: "def-lang",
  };
  const env = {
    SB_PROJECT_NAME: "env-proj",
    SB_OWNER_NAME: "env-owner",
    SB_LANGUAGE: "env-lang",
  };
  // flag gagne sur env et default
  const flagWins = parseAnswers(["--owner=flag-owner"], env, defaults);
  assert.equal(flagWins.ownerName, "flag-owner");
  // env gagne sur default (pas de flag)
  assert.equal(flagWins.projectName, "env-proj");
  // default si ni flag ni env
  const onlyDefaults = parseAnswers([], {}, defaults);
  assert.deepEqual(onlyDefaults, {
    projectName: "def-proj",
    ownerName: "def-owner",
    language: "def-lang",
    destParent: undefined,
    embedder: undefined,
    nonInteractive: false,
    help: false,
  });
});
