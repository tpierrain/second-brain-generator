// ─────────────────────────────────────────────────────────────────────────────
// hooks-reconcile.mjs — pure, idempotent reconcile of a brain's settings.json hook
// entries against the engine's settings.json.template (ADR 0026). This is the THIRD
// additive surface, after engine skills and `.mcp.json` servers (ADR 0025): the only
// writes the reconciler ever makes to the otherwise-SACRED settings.json. ADD only
// the engine-owned hook entries the brain is MISSING, dedup by the engine SCRIPT the
// hook runs (e.g. `scripts/session-health.mjs`); never overwrite, never remove, never
// touch a user-added entry. Appended entries get the brain's OWN node interpreter
// (parsed from its existing hooks) and its dir substituted for the placeholders.
// Does not MUTATE its input: returns a copy.
// ─────────────────────────────────────────────────────────────────────────────

// The engine script a hook command runs, e.g.
//   '{{NODE}} "{{PROJECT_ROOT}}/scripts/session-health.mjs"' → 'scripts/session-health.mjs'
// This suffix is the dedup IDENTITY: a brain "already runs" a hook iff some existing
// entry under the same event invokes the same engine script (path-prefix agnostic, so
// the template's placeholder path matches the brain's substituted absolute path).
function hookScript(command) {
  const m = typeof command === "string" ? command.match(/scripts\/[^/"]+\.mjs/) : null;
  return m ? m[0] : null;
}

// The {{NODE}} prefix the brain itself uses for its hooks — i.e. everything BEFORE the
// final quoted "<…>/scripts/<name>.mjs" argument of any existing hook command. So appended
// entries run the SAME interpreter/launcher. Cross-OS (ADR 0015): the real prefix is not a
// bare `node` but the quoted run-node launcher — `/bin/sh "<…>/run-node.sh"` on posix,
// `cmd /c "<…>\run-node.cmd"` on win32 — which itself contains quotes, so we must NOT stop
// at the first quote; we anchor on the final .mjs argument (posix `/` or win32 `\`).
const NODE_PREFIX_RE = /^(.*?)\s*"[^"]*scripts[/\\][^"]*\.mjs"\s*$/;
function deriveNodePrefix(brainHooks) {
  for (const groups of Object.values(brainHooks ?? {})) {
    for (const group of groups ?? []) {
      for (const h of group.hooks ?? []) {
        const m = typeof h.command === "string" ? h.command.match(NODE_PREFIX_RE) : null;
        if (m) return m[1].trim();
      }
    }
  }
  return "{{NODE}}"; // no learnable command → leave the placeholder (caller's belt)
}

function substituteCommand(command, { node, projectRoot }) {
  return command.split("{{NODE}}").join(node).split("{{PROJECT_ROOT}}").join(projectRoot);
}

function substituteGroup(group, ctx) {
  return {
    ...group, // preserve matcher (+ any other group field)
    hooks: (group.hooks ?? []).map((h) => ({ ...h, command: substituteCommand(h.command, ctx) })), // preserve type + timeout
  };
}

export function reconcileHooks({ brainHooks, templateHooks, projectRoot, nodePrefix }) {
  const node = nodePrefix ?? deriveNodePrefix(brainHooks);
  const result = { ...(brainHooks ?? {}) };
  const hooksAdded = [];
  for (const [event, templateGroups] of Object.entries(templateHooks ?? {})) {
    const existingGroups = result[event] ?? [];
    const present = new Set(
      existingGroups.flatMap((g) => (g.hooks ?? []).map((h) => hookScript(h.command)).filter(Boolean)),
    );
    const toAppend = [];
    for (const group of templateGroups) {
      const script = (group.hooks ?? []).map((h) => hookScript(h.command)).find(Boolean);
      if (!script || present.has(script)) continue; // not an engine script, or already wired → preserve
      toAppend.push(substituteGroup(group, { node, projectRoot }));
      hooksAdded.push(script);
      present.add(script); // guard against a duplicated template entry
    }
    if (toAppend.length > 0) result[event] = [...existingGroups, ...toAppend];
  }
  return { hooks: result, hooksAdded };
}

// detectHookGap — the pure bootstrap drift gate (ADR 0026, mirrors detectSelfHealGap).
// `session-status` uses it to decide whether to spawn the one-time reconcile on a
// pre-3.2 brain. A gap exists iff reconcileHooks WOULD append something. The substituted
// output is irrelevant here, so projectRoot/node are dummies — only the count matters.
export function detectHookGap({ brainHooks, templateHooks }) {
  const { hooksAdded } = reconcileHooks({ brainHooks, templateHooks, projectRoot: "", nodePrefix: "node" });
  return { needed: hooksAdded.length > 0, missingHooks: hooksAdded };
}
