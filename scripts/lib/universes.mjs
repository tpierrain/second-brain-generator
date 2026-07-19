// ─────────────────────────────────────────────────────────────────────────────
// universes.mjs — brain-side core for the "universes" soft retrieval scope
// (ADR 0034). Owns the per-machine active-universe pointer and the committed
// registry of created universes, plus the pure name/slug rules that keep a
// universe name safe as a folder, a frontmatter value and a SQL value.
//
// Deterministic (ADR 0009): the engine reads the active pointer to inject the
// search scope; this module is the WRITE side (the `/switch` skill's core) and
// the reader the SessionStart gate uses. Pure logic + injected fs (testable).
// ─────────────────────────────────────────────────────────────────────────────
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// THE default universe. Kept in lock-step with the engine's DEFAULT_UNIVERSE
// (rag/src/lib/universe.ts): a note with no explicit universe belongs here, it
// lives at the vault root, and it never renders for a single-universe user.
export const DEFAULT_UNIVERSE = "default";

/**
 * Normalizes a raw name into a safe kebab slug: lowercased, accent-stripped,
 * non-alphanumeric runs collapsed to a single hyphen, trimmed of edge hyphens.
 * Returns "" when nothing usable remains (the caller rejects an empty slug).
 */
export function normalizeUniverseName(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any non-alphanumeric run → one hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Returns the registry with `name` added: deduped and sorted. The implicit
 * default universe is never stored (its absence IS what "default" means), so
 * adding it is a no-op. Pure — the caller persists the result.
 */
export function addToRegistry(registry, name) {
  if (!name || name === DEFAULT_UNIVERSE) return [...registry];
  return [...new Set([...registry, name])].sort();
}

/**
 * The full universe list for a menu: the default first (it always exists), then
 * the created universes sorted. Pure.
 */
export function listAllUniverses(registry) {
  return [DEFAULT_UNIVERSE, ...[...registry].sort()];
}

/**
 * The progressive-disclosure gate (ADR 0034): true only once at least TWO
 * universes exist (the implicit default plus one created), i.e. the registry
 * holds at least one entry. Below the gate the whole feature stays invisible —
 * a single-universe brain behaves exactly as today. Pure.
 */
export function isMultiverse(registry) {
  return listAllUniverses(registry).length >= 2;
}

// The brain root, resolved from this module's location: scripts/lib → scripts →
// brain. Both the engine (rag/) and these scripts anchor the .vault-rag state dir
// on the brain root (not on CACHE_DIR), so it stays env-independent and stable.
export function defaultBrainRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The state directory holding the registry + active pointer, at the brain root. */
export function vaultRagDir(brainRoot = defaultBrainRoot()) {
  return join(brainRoot, ".vault-rag");
}

/**
 * Parses `/switch` CLI argv (already sliced past the script path) into an intent.
 * A bare name is the fast path (`switch`); `create <name>` / `switch <name>` are
 * explicit; `list` / `current` support the menu; no args opens the menu.
 */
export function parseSwitchArgs(argv) {
  const [first, ...rest] = argv;
  if (!first) return { action: "menu" };
  if (first === "create") return { action: "create", name: rest.join(" ") };
  if (first === "switch") return { action: "switch", name: rest.join(" ") };
  if (first === "list") return { action: "list" };
  if (first === "current") return { action: "current" };
  return { action: "switch", name: argv.join(" ") };
}

/**
 * Deterministic dispatcher for the `/switch` CLI: parses the intent, performs the
 * read/write via the injected fs, and returns an exit code + a one-line message.
 * The skill is a thin driver over this — no branching logic of its own.
 */
export function runSwitchCli(io, dir, argv) {
  const intent = parseSwitchArgs(argv);
  const current = readActiveUniverse(io, dir);

  if (intent.action === "current") return { code: 0, message: current };

  if (intent.action === "list" || intent.action === "menu") {
    const all = listAllUniverses(readRegistry(io, dir));
    if (intent.action === "menu") {
      return { code: 0, message: `active: ${current}\navailable: ${all.join(", ")}` };
    }
    const lines = all.map((u) => (u === current ? `* ${u}` : `  ${u}`));
    return { code: 0, message: lines.join("\n") };
  }

  if (intent.action === "create") {
    const res = createAndSwitch(io, dir, intent.name);
    if (!res.ok) return { code: 1, message: `cannot create universe (${res.reason})` };
    const head = res.created
      ? `created and switched to '${res.name}'`
      : `switched to '${res.name}'`;
    // Deterministic 1→2 onboarding: emitted ONLY when this create opened the gate,
    // so the skill just relays it (the LLM never has to count universes).
    const onboarding = res.openedGate
      ? `\nYou now have two universes. Searches stay in the active one plus your ` +
        `cross-cutting (default) notes; say "search all universes" to span them. ` +
        `New notes you capture here will file under vault/${res.name}/.`
      : "";
    return { code: 0, message: head + onboarding };
  }

  // switch (fast path / explicit)
  const res = switchToUniverse(io, dir, intent.name);
  if (res.ok) return { code: 0, message: `switched to '${res.name}'` };
  if (res.reason === "unknown") {
    return {
      code: 1,
      message: `unknown universe '${res.name}'. available: ${res.available.join(", ")}`,
    };
  }
  return { code: 1, message: "no universe name given" };
}

/** Path of the committed registry of created universes, inside the .vault-rag dir. */
export function registryPath(dir) {
  return join(dir, "universes.json");
}

/** Path of the per-machine active-universe pointer, inside the .vault-rag dir. */
export function activeUniversePath(dir) {
  return join(dir, "active-universe");
}

/**
 * Reads the registry of created universes (absent file → []). Injected fs so the
 * read is testable; malformed JSON reads back as an empty registry rather than
 * crashing a session (a corrupt file must never wedge the brain).
 */
export function readRegistry(io, dir) {
  const path = registryPath(dir);
  if (!io.existsSync(path)) return [];
  try {
    const parsed = JSON.parse(io.readFileSync(path));
    return Array.isArray(parsed?.universes) ? parsed.universes : [];
  } catch {
    return [];
  }
}

/** Persists the registry of created universes (pretty JSON), creating the dir. */
export function writeRegistry(io, dir, registry) {
  io.mkdirSync(dir, { recursive: true });
  io.writeFileSync(
    registryPath(dir),
    JSON.stringify({ universes: registry }, null, 2) + "\n"
  );
}

/**
 * Reads the active-universe pointer (absent/blank → the default universe, so a
 * single-universe brain behaves exactly as today). Mirrors the engine's reader.
 */
export function readActiveUniverse(io, dir) {
  const path = activeUniversePath(dir);
  if (!io.existsSync(path)) return DEFAULT_UNIVERSE;
  const raw = io.readFileSync(path).trim();
  return raw || DEFAULT_UNIVERSE;
}

/** Persists the active-universe pointer (per-machine), creating the dir. */
export function writeActiveUniverse(io, dir, name) {
  io.mkdirSync(dir, { recursive: true });
  io.writeFileSync(activeUniversePath(dir), name + "\n");
}

/**
 * Switches the active universe to an EXISTING one (fast path of `/switch <name>`).
 * The name is normalized for lookup; the default universe is always allowed. An
 * unknown universe is refused WITHOUT touching the pointer, and the available
 * list is returned so the caller can offer create-a-new-one instead.
 */
export function switchToUniverse(io, dir, rawName) {
  const name = normalizeUniverseName(rawName);
  if (!name) return { ok: false, reason: "empty" };
  const available = listAllUniverses(readRegistry(io, dir));
  if (!available.includes(name)) return { ok: false, reason: "unknown", name, available };
  writeActiveUniverse(io, dir, name);
  return { ok: true, name };
}

/**
 * Creates a universe if needed, then switches to it (git `switch -c` ergonomics).
 * Refuses the reserved default and an empty slug. Registering an existing universe
 * is a no-op on the registry (`created: false`) but still re-points the active
 * pointer, so "create X" is safe to run twice.
 */
export function createAndSwitch(io, dir, rawName) {
  const name = normalizeUniverseName(rawName);
  if (!name) return { ok: false, reason: "empty" };
  if (name === DEFAULT_UNIVERSE) return { ok: false, reason: "reserved" };
  const registry = readRegistry(io, dir);
  const created = !registry.includes(name);
  // The gate opens the moment the FIRST universe is created (brain crosses 1 → 2):
  // the deterministic signal the /switch skill keys its one-time onboarding on.
  const openedGate = created && registry.length === 0;
  if (created) writeRegistry(io, dir, addToRegistry(registry, name));
  writeActiveUniverse(io, dir, name);
  return { ok: true, name, created, openedGate };
}
