# ADR 0003 — No (yet) upgradability of generated brains' capabilities

- **STATUS:** ACCEPTED (2026-06-05).
- **Related:** [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (the launcher→brain link
  is severed "by construction" — that's the cause of this consequence), [`0002-installateur-maison-vs-plugin.md`](0002-installateur-maison-vs-plugin.md).

## Context

By ADR 0001, the bootstrap **copies** the launcher's tracked files into the brain then runs
`git init` inside → **no link back to the launcher, by construction**. Direct consequence: once
generated, a brain is **frozen at the version of the install day**. If the RAG engine or one of
the generator's skills is improved later, brains already created don't benefit automatically.

The question: should we build, now, a mechanism to **upgrade** capabilities (versioned
distribution channel, engine in an external package, an `update` that re-injects skills/engine)?

## Decision

**No — not for now.** We add no mechanism to upgrade the capabilities of generated brains. That
wasn't the point of the product, and three reasons justify it:

1. **It's not the problem we're solving.** The goal is to *give everyone a second brain that's
   theirs*, not to maintain a fleet of brains synced to a central version.
2. **Disproportionate cost/complexity** vs. what had to be shipped: making the engine updatable
   (versioned external package, forward compatibility of the index, distribution channel,
   migrations) is a project in its own right, eating into the time of the product's core and
   **weakening the self-sufficiency** gained in ADR 0001.
3. **Local iteration is enough and simple for everyone.** Since the brain **is** an owned git
   repo, with its skills and constitution **locally**, each user can **add / modify their own
   homemade skills** directly, without waiting for an upstream release. Evolution happens *by* the
   user, *in* their brain — consistent with the "generator, not single product" spirit (cf. README).

## Consequences

- **Guarantees self-sufficiency and no upstream dependency:** nothing to update, nothing that
  breaks because a remote version moved; the brain stays functional offline, forever, just as it
  was generated.
- **Guarantees freedom of local iteration:** the user diverges freely (homemade skills, adapted
  constitution) without conflict with an upstream — it's a *feature*, not a gap.
- **Costs fix propagation:** a bug fixed in the generator's engine **does not flow back** into
  brains already created. As long as the user base is small/close, it's bearable (regenerate, or
  copy the fix by hand). It will become painful at scale — hence the planned re-evaluation.
- **Invariant not to violate:** if an upgrade mechanism is ever introduced, it **must not reclaim
  the brain's sovereignty** — no silent auto-update, no mandatory upstream link, no overwriting of
  the user's personalized skills/constitution. The upgrade will have to stay **opt-in** and
  **non-destructive** of local divergences.

## Rejected alternatives

- **RAG engine as an external npm package** (`npx @…/vault-rag`) — unlocks updates "for free" on
  the next run, but reintroduces a version dependency (offline, rug-pull, index compat) that
  contradicts ADR 0001's self-sufficiency. A good candidate **later**, not now.
- **An `update` command that re-pulls skills + engine from a reference launcher** — recreates a
  launcher→brain coupling we precisely removed in 0001, and poses the risk of overwriting local
  customizations. Rejected until the need is proven by feedback.

## To reconsider when

International publication (cf. plan `translate-to-english.md`) will widen the user base: that's
**when** "no fix propagation" could become a real pain point. Decision to reopen **on real
feedback**, probably aiming for the hybrid mentioned in ADR 0002 (updatable engine + brain/vault
always owned and never overwritten).
