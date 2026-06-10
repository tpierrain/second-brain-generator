import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveLocale, chooseLocale } from "./locale.mjs";

test("resolveLocale — a French language label resolves to the fr locale", () => {
  assert.equal(resolveLocale("français"), "fr");
});

test("resolveLocale — an English language label resolves to the en locale", () => {
  assert.equal(resolveLocale("english"), "en");
});

test("resolveLocale — an unknown or absent label falls back to en", () => {
  assert.equal(resolveLocale("klingon"), "en");
  assert.equal(resolveLocale(""), "en");
  assert.equal(resolveLocale(undefined), "en");
});

test("resolveLocale — matching is case- and accent-insensitive for fr", () => {
  assert.equal(resolveLocale("FR"), "fr");
  assert.equal(resolveLocale("  Français  "), "fr");
});

test("chooseLocale — uses the requested locale when its template dir exists", () => {
  assert.equal(chooseLocale("fr", ["en", "fr"]), "fr");
});

test("chooseLocale — falls back to en when the requested locale dir is absent", () => {
  assert.equal(chooseLocale("fr", ["en"]), "en");
});

test("chooseLocale — returns null when no locale dirs exist yet (legacy root)", () => {
  assert.equal(chooseLocale("fr", []), null);
  assert.equal(chooseLocale("en", []), null);
});
