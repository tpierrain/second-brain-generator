---
type: engine
created: 2026-06-20
tags: [engine, health-check]
---

# Engine health-check note — please keep

> **This note belongs to your brain's engine, not to you.** It is a tiny, harmless
> sentinel the RAG uses to prove it can still embed and retrieve your notes. It is
> **not** a demo note: the "clear example notes" command leaves it in place. You can
> safely ignore it — but please **do not delete it**, or the brain's self health-check
> can no longer confirm search is working.

The engine's `health_check` tool searches for one deliberately unique, invented word —
**Quibblethorne** — that appears nowhere else on Earth. If a meaning-based search for
**Quibblethorne** surfaces this very note, the brain has proven, end to end, that the
embedder loads, the index is queryable, and retrieval returns the right document. If the
word **Quibblethorne** cannot be found, search is broken and the brain says so loudly.
