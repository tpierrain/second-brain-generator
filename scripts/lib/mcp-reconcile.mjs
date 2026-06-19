// ─────────────────────────────────────────────────────────────────────────────
// mcp-reconcile.mjs — pure, idempotent reconcile of a brain's .mcp.json against the
// engine's declared servers (ADR 0025). `update-engine` reads the fetched
// .mcp.json.template (with {{PROJECT_ROOT}} already substituted to the brain dir),
// then ADDS only the `engineMcpServers` the brain is MISSING — so an upgrader gets a
// newly-shipped engine server (e.g. local-mirror) registered in .mcp.json. An
// existing server (engine OR user-added) is NEVER overwritten; re-running is a no-op.
// Does not MUTATE its input: returns a copy.
// ─────────────────────────────────────────────────────────────────────────────

export function reconcileMcpServers({ brainMcp, templateMcp, engineServerIds }) {
  const existing = brainMcp.mcpServers ?? {};
  const fromTemplate = templateMcp.mcpServers ?? {};
  const added = {};
  for (const id of engineServerIds) {
    if (id in existing) continue; // present (engine or user) → preserve, never clobber
    if (id in fromTemplate) added[id] = fromTemplate[id];
  }
  return { ...brainMcp, mcpServers: { ...existing, ...added } };
}
