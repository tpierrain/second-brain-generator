/**
 * Universes — a soft, progressively-disclosed retrieval scope (ADR 0034).
 *
 * A brain always carries a `universe` on every note in the data layer, but the
 * concept stays invisible until a second universe exists. THE default universe is
 * this single sentinel: notes with no explicit `universe:` frontmatter belong to
 * it, it lives at the vault root, and it NEVER renders for a single-universe user.
 *
 * This is the ONE place the default is named. Everything else (schema default,
 * parser fallback, scope filter, the `/switch` skill) refers back to this constant.
 */
export const DEFAULT_UNIVERSE = "default";
