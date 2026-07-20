// Universes — a soft, progressively-disclosed retrieval scope (ADR 0034).
//
// THE default universe: a mirror with no explicit universe belongs to it, lands at the
// vault root, and never renders for a single-universe user. This is the ONE place the
// TS package names it.
//
// Kept in LOCK-STEP with the engine's two other declarations (they cannot import across
// package + language boundaries): `scripts/lib/universes.mjs` (launcher scripts) and
// `rag/src/lib/universe.ts` (RAG). If this value ever changes, change all three.
export const DEFAULT_UNIVERSE = 'default';
