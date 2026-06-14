import type { EmbedderIdentity } from "./vector-store.js";

/**
 * Freshness verdict for the index against the current embedder. When stale,
 * it carries **both identities** (stamped vs current) for an actionable message
 * on the conversation side (cf. confirm-gate, embedder-spi plan §4).
 */
export type FreshnessVerdict =
  | { fresh: true }
  | {
      fresh: false;
      stamped: EmbedderIdentity | null;
      current: EmbedderIdentity;
    };

/**
 * Compares the identity stamped in the index to that of the current embedder.
 * Mismatch → stale. Rather than a search that lies silently, we surface an
 * explicit signal (the project's fail-loud spirit).
 */
/**
 * Should we (re)stamp the index after this run? We only set a **new**
 * identity when the index truly reflects it: either a `force` (everything is
 * re-encoded with the current embedder), or an index still free of any stamp
 * (fresh install / index from before this plan). Incrementally on an already-
 * stamped index, we don't touch it: if the embedder changed outside the gate, the
 * guard still detects it (we never dress up the index as "fresh").
 */
export function shouldStamp(
  force: boolean,
  existing: EmbedderIdentity | null
): boolean {
  return force || existing === null;
}

/**
 * Confirm-gate prose (natural language), relayed by Claude when the index is
 * stale. Names the models DYNAMICALLY via the identity — nothing is hardcoded
 * as "Gemini". By default we reindex NOTHING: we ask, we wait for the "yes"
 * (cf. embedder-spi plan §4). The MCP contract doesn't change: this is just text.
 */
export function staleIndexMessage(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): string {
  const before = stamped ? `before: ${stamped.model}, ` : "";
  return (
    `My fast, semantic search capabilities rely on an indexer/embedder; ` +
    `but its configuration has changed (${before}now: ${current.model}). ` +
    `To keep working, I need to re-index your documents — they don't change, ` +
    `it's just that they have to be re-encoded with the new model. ` +
    `This may take a little while. Do you want me to do it now?`
  );
}

/**
 * Is the index's stamped schema version compatible with the running Engine?
 * Fresh unless a real bump happened. An index stamped **before** schema
 * versioning (null) is grandfathered as compatible → no reindex prompt for
 * existing brains (the embedder identity already guards genuine incompatibility).
 */
export function checkSchemaFreshness(
  stamped: number | null,
  current: number
): boolean {
  return stamped === null || stamped === current;
}

/**
 * Should this reindex run as a FULL re-encode (force)? A schema-format bump can
 * ONLY be repaired by re-encoding every doc: an incremental run skips unchanged
 * docs (leaving the old format in place) AND never re-stamps the schema version
 * (`shouldStamp` returns false on an already-stamped index) → the staleness gate
 * would loop forever. So a stale schema forces a full reindex, exactly like an
 * explicit `force`. A grandfathered index (`stamped === null`) stays compatible
 * (cf. `checkSchemaFreshness`) → no forced reindex.
 */
export function reindexForce(
  requested: boolean,
  stampedSchema: number | null,
  currentSchema: number
): boolean {
  return requested || !checkSchemaFreshness(stampedSchema, currentSchema);
}

/**
 * Confirm-gate prose for a schema-format bump (the embedder is unchanged, so the
 * embedder-swap message would mislead). Same reindex path, different reason: the
 * index layout moved and the documents must be re-encoded into the new format.
 */
export function staleSchemaMessage(): string {
  return (
    `My fast, semantic search relies on an index whose internal format has ` +
    `changed in this version of the engine. Your documents haven't changed — ` +
    `they just need to be re-indexed into the new format. This may take a ` +
    `little while. Do you want me to do it now?`
  );
}

export function checkIndexFreshness(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): FreshnessVerdict {
  if (
    stamped !== null &&
    stamped.providerId === current.providerId &&
    stamped.model === current.model &&
    stamped.dimension === current.dimension
  ) {
    return { fresh: true };
  }
  return { fresh: false, stamped, current };
}
