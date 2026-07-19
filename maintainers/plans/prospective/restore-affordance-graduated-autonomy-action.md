# Restore the second brain's affordance — graduated autonomy + plain language

> **Origin (2026-07-19, owner).** Since `/lint` and `/consolidate` landed (axis-1 wiki-health), the
> generated brain's original strength — "things happen on their own" — degraded: it now **interrogates**
> the user (a wall of decision-prompts) in **tool-jargon** a non-technical person can't parse. In one
> session the owner had to relay ~5 subset-picker prompts and said "I don't understand the subject or
> the options". We traded the magic for a dashboard. This plan restores the affordance without losing
> the self-maintenance mechanics.
>
> North-star, always-loaded pointer: memory `brain-graduated-autonomy-affordance`. Siblings: ADR 0009
> (deterministic-first = the 🟢 tier), the axis-1 wiki-health plan (`wiki-health-axis1-mechanisms-action.md`).

## Tracking

- [ ] **1. Agree the model (ADR).** The current "read-only auto / writes confirmed" posture is too
      binary; ratify the 3-tier graduated-autonomy model as an ADR so it governs all skill design.
- [ ] **2. Audit today's interaction points** against the 3 tiers (which prompts should become 🟢/🟡).
- [ ] **3. Reclassify + implement**, skill by skill, TDD, generic-only (no brain-specific taxonomy).
- [ ] **4. Kill the jargon** in every user-facing string the brain emits.

---

## The model — graduated autonomy (gate: reversibility + confidence)

Everything the brain writes is **auto-committed → always git-revertible**; that safety net is what makes
autonomous action acceptable.

- **🟢 Silent auto** — safe, deterministic, reversible gestures. Just do them, don't ask.
  Examples: fix an unambiguous dead-link typo where the target clearly exists (the `dora-sprints →
  dora-latest` rename was deterministic), stamp a missing date read from the note's own content, exclude
  structural noise from a health report.
- **🟡 Announce-then-do (batched, plain-language)** — one summary "here are the N things I'll do, say
  stop if one bothers you", then act unless vetoed. Replaces N separate multi-select prompts.
- **🔴 Genuinely ask** — only a real judgment call: merge two maybe-different people, create a page that
  shapes the taxonomy, resolve a contradiction between a page and a fresh capture, RH-sensitive content.
  Always **plain language + "why it matters"** for a non-technical person.

> Note: a **good** 🔴 was field-observed 2026-07-19 — a `/consolidate` run that autonomously ran 4
> read-only agents, **caught a duplicate page** and **flagged genuine contradictions**, then asked only
> about those. That IS the target behaviour for 🔴; the residual issue is presentation length + jargon,
> not the decision to ask.

## Detail

### 1. ADR — ratify the 3-tier model
- [ ] Write the ADR (crux up top, prior-art named per `CONVENTIONS.md`): supersede/refine the binary
      "read-only auto / writes confirmed" stance with the tier gate (reversibility + confidence).
- [ ] Add `Scope: Second brain (runtime)` (the skills + hooks that ship to the brain).

### 2. Audit current interaction points
- [ ] Inventory every place a shipped skill/hook **asks** the user: `/lint` report + follow-up prompts,
      `/consolidate` scope + per-candidate prompts, `sync-sources`, the SessionStart wiki-health hook.
- [ ] For each, tag the target tier and note what blocks it from 🟢/🟡 today (usually: no safe-class
      detection, or no batched-summary surface).

### 3. Reclassify + implement (TDD, generic-only)
- [ ] **🟢 candidates first** (highest affordance win): deterministic dead-link repairs where the target
      is unambiguous; auto-exclude structural noise (dovetails with the 2 logged `/lint` follow-ups in
      `post-v3.1.0-ux-backlog.md` — a first 🟢 step).
- [ ] **🟡 batched summary** surface: replace multi-select cascades with one "will do X, Y, Z — veto?"
      message.
- [ ] Keep every default **generic**; brain-specific choices stay configurable, never hard-coded
      ([[validate-shipped-not-test-instance]]).

### 4. Plain-language pass
- [ ] Scrub user-facing strings of tool-jargon (`orphan-exclude`, `fan-out`, `frontmatter`…) → human
      wording; when the brain must ask, it explains the "why it matters" for a non-dev.

> **Not now, logged so it isn't lost.** No code yet; this is the design driver. The 2 `/lint` follow-ups
> already logged (work-zone orphans + raw-dump frontmatter) are the first concrete 🟢 steps and can land
> before the ADR.
