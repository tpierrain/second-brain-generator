import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { overlayLocale, WHOLESALE_DIRS } from "./locale-overlay.mjs";

function scaffold() {
  const root = mkdtempSync(join(tmpdir(), "overlay-"));
  const templatesRoot = join(root, "templates");
  const target = join(root, "brain");

  // Target = the default (en) brain after the bulk copy.
  mkdirSync(join(target, "vault", "backlog"), { recursive: true });
  mkdirSync(join(target, ".claude", "skills"), { recursive: true });
  writeFileSync(join(target, "vault", "backlog", "harness.md"), "en harness");      // en-slug
  writeFileSync(join(target, "vault", "topics.md"), "en topic");                    // en-slug, renamed
  writeFileSync(join(target, ".claude", "skills", "coach.md"), "en coach");
  writeFileSync(join(target, ".claude", "skills", "improve.md"), "en improve");

  // Locale fr = a COMPLETE vault with DIFFERENT slugs + an in-place skill overwrite.
  const fr = join(templatesRoot, "fr");
  mkdirSync(join(fr, "vault", "backlog"), { recursive: true });
  mkdirSync(join(fr, ".claude", "skills"), { recursive: true });
  writeFileSync(join(fr, "vault", "backlog", "harnais.md"), "fr harnais");          // fr-slug
  writeFileSync(join(fr, "vault", "sujets.md"), "fr sujet");                        // fr-slug
  writeFileSync(join(fr, ".claude", "skills", "coach.md"), "fr coach");             // same path → overwrite

  return { root, templatesRoot, target };
}

test("WHOLESALE_DIRS includes vault (renamed slugs per locale → full replacement)", () => {
  assert.ok(WHOLESALE_DIRS.includes("vault"));
});

test("overlay replaces the vault wholesale — no default-locale slug orphans", () => {
  const { root, templatesRoot, target } = scaffold();
  try {
    overlayLocale({ templatesRoot, locale: "fr", target });
    // fr slugs present
    assert.ok(existsSync(join(target, "vault", "backlog", "harnais.md")));
    assert.ok(existsSync(join(target, "vault", "sujets.md")));
    // en slugs gone (no orphans)
    assert.ok(!existsSync(join(target, "vault", "backlog", "harness.md")));
    assert.ok(!existsSync(join(target, "vault", "topics.md")));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("overlay merges non-wholesale dirs in place — skills overwrite, siblings kept", () => {
  const { root, templatesRoot, target } = scaffold();
  try {
    overlayLocale({ templatesRoot, locale: "fr", target });
    assert.equal(readFileSync(join(target, ".claude", "skills", "coach.md"), "utf8"), "fr coach");
    assert.equal(readFileSync(join(target, ".claude", "skills", "improve.md"), "utf8"), "en improve");
  } finally {
    rmSync(root, { recursive: true });
  }
});
