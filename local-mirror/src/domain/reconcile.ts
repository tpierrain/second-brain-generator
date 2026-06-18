import type { PersistedItem } from './ports.js';

/** A tracked page slated for deletion — its `PersistedItem` plus the stable page `id`, so the
 * caller can both remove its `.md` and (on a failed delete) re-track it for the next sync. */
export type StalePage = PersistedItem & { id: string };

/**
 * Pure deletion reconciliation (PRD §7). Given the freshly-enumerated perimeter and the
 * previous per-source state map, return the tracked items whose source page has disappeared
 * (deleted or moved out of scope) — i.e. the set difference `previous \ perimeter`. Each carries
 * its page `id` so the caller can re-track it if its deletion fails.
 *
 * This function is deliberately side-effect-free and unconditional: the non-negotiable §7/§12
 * guardrail (delete ONLY when the enumeration fully succeeded) is enforced by the caller, which
 * simply does not invoke reconciliation on a failed/incomplete enumeration.
 */
export function pagesToDelete(
  perimeter: ReadonlyArray<{ id: string }>,
  previousItems: Readonly<Record<string, PersistedItem>>,
): StalePage[] {
  const live = new Set(perimeter.map((p) => p.id));
  return Object.entries(previousItems)
    .filter(([id]) => !live.has(id))
    .map(([id, item]) => ({ id, ...item }));
}
