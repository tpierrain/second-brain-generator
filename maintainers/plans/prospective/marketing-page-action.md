<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS : 🚧 IN PROGRESS — branch `docs/marketing-page`                       -->
<!-- This is the ONE canonical plan for this chantier. Tick boxes as you go.      -->
<!-- After a /clear: open this file, resume at the first unchecked `- [ ]`.       -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — `MARKETING.md`: a presentable, visual one-pager for the Second Brain Generator

## Context

Goal: **communicate more** about the project — what it contains, what it does *not*, how it differs
from a **bare LLM** and from **other "second brains"**, and above all surface its **strengths,
qualities and specificities** (the engineering / SRE / reliability patterns baked in).

The repo already holds the raw material (`README.md`, `EN-QUOI-C-EST-DIFFERENT.md`, 31 ADRs, the
Kenjaku mascot, the Mollecuisse canary, the 3-embedder privacy story). What's **missing** is a single
**presentation-grade visual page** distilling it for *showing* (repo visitors, word-of-mouth, later a
talk).

**Decisions (from Thomas):**
- **Flagship artifact = `MARKETING.md`** (repo root, **English**), ByteByteGo / Alex-Xu illustrated-board
  style, usable to present from. Contains an **elevator pitch**, **boards**, and the full **qualities &
  engineering catalog**.
- **Channels**: GitHub (public repo) + pro word-of-mouth now; **talk/conf later**.
- **Visuals = hybrid, leaning illustrated.** Nano Banana 2 / Pro render exact text reliably → image-gen
  prompts written for **all 6 boards**. Two **SVG fallbacks** (`board-flow`, `board-hexagon`) ship now
  so the page is presentable immediately; Thomas drops illustrated `board-*.png` into `docs/img/` over
  the same slots later. The page is **fully readable as text** regardless.
- **Extensible**: a **mutation-testing reliability** number is wired in later (after Stryker Step 3 —
  see [`mutation-testing-stryker.md`](mutation-testing-stryker.md)).
- **Market watch**: a deferred phase of this plan.

**Reuse, don't duplicate.** `EN-QUOI-C-EST-DIFFERENT.md` argues the differentiators in prose;
`MARKETING.md` is its **visual, scannable twin** that *links* to README / EN-QUOI / ADRs for depth.

---

## Tracking

- [x] **Step 1 — Visual boards** _(2026-06-24)_
  - [x] 1-svg · `docs/img/board-flow.svg` (4-phase flow) + `docs/img/board-hexagon.svg` (ports/adapters)
  - [x] 1-prompts · `docs/marketing-image-prompts.md` — Nano-Banana prompts for all 6 boards
  - [x] 1a · Board A — flow → **SVG shipped**
  - [x] 1d · Board D — hexagon → **SVG shipped**
  - [ ] 1b · Board B — privacy → *prompt ready; awaiting Thomas's `board-privacy.png` render*
  - [ ] 1c · Board C — generator → *prompt ready; awaiting `board-generator.png`*
  - [ ] 1e · Board E — reliability stack → *prompt ready; awaiting `board-reliability.png`*
  - [ ] 1f · Board F — vs bare LLM → *prompt ready; awaiting `board-vs-llm.png`*
- [x] **Step 2 — Write `MARKETING.md`** _(2026-06-24)_ — root, English, text-complete without images
  - [x] 2a · Hero (Kenjaku) + elevator pitch (one-liner / 30s / 2-min)
  - [x] 2b · "What it is / what it is NOT" (honest scope, from EN-QUOI §7)
  - [x] 2c · "vs a bare LLM" + "vs other second brains" (board + one table each)
  - [x] 2d · **Qualities & engineering catalog** (+ a "Under the hood" hexagon section)
  - [x] 2e · Personas (Head of Eng / PM / consultant) — one line each
  - [x] 2f · Footer: links (README / EN-QUOI / SETUP / ADRs / Medium) + author + Apache-2.0
  - [x] 2g · **Placeholder** "Reliability, measured" (eval-set 90% now; mutation score *coming*)
- [ ] **Step 3 — Link & verify**
  - [x] 3a · Link to `MARKETING.md` from `README.md` hero nav _(2026-06-24)_
  - [x] 3b · Verified referenced files exist + EN-QUOI anchors (incl. §9 double-hyphen slug) _(2026-06-24)_
  - [x] 3c · English-only pre-flight — clean (only "à la carte" idiom + CSS `sans-serif`) _(2026-06-24)_
  - [ ] 3d · Visual render check in Typora/GitHub by Thomas (the two SVGs display as intended)
- [x] **Step 4 — Home the plan in the repo** _(2026-06-24 — this file)_
- [ ] **Step 5 — Market watch** *(deferred — separate pass, on Thomas's go)*
  - [ ] 5a · Competitive scan (Notion AI, Mem, Reflect, Tana, Khoj, AnythingLLM, NotebookLM, Glean…) → refresh EN-QUOI §9 with dated evidence
  - [ ] 5b · Embedder/RAG watch → fold in [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md)
- [ ] **Step 6 — Mutation-testing reliability section** *(deferred — after Stryker Step 3)*
  - [ ] 6a · Fill 2g with the measured mutation score + what it proves

---

## `MARKETING.md` — outline

1. **Hero** — `docs/img/kenjaku.png` + one-liner pitch (reuse README's).
2. **Elevator pitch** — one-liner / 30s / 2-min (2-min seeds a future talk).
3. **Board A (flow)** + 3 lines — answer now, verify in background (stale-while-revalidate).
4. **What it is / what it is NOT** — two short columns (EN-QUOI §7 honesty).
5. **vs a bare LLM** — Board F + one table.
6. **vs other second brains** — Board C + Board B + one table.
7. **Qualities & engineering catalog** — see content map.
8. **Who it's for** — Head of Eng / PM / consultant-researcher.
9. **Reliability, measured** — eval-set 90% today; mutation placeholder.
10. **Footer** — links, author (Thomas Pierrain, VP Tech @ shodo), Apache-2.0.

### Qualities & engineering catalog — content map

Each item = **pattern · one-line guarantee · prior-art (where it applies) · footnote (ADR/file)**:

- **A · Grounded in truth** — semantic RAG answers *from the vault* with sources · synthetic **canary**
  (Mollecuisse/Flemmr) + `verify-rag` exit 0/1 · non-blocking background health-check (ADR 0028) · index
  identity stamp + confirm-gate (ADR 0006).
- **B · Determinism ladder (ADR 0009)** — pure functions · binary exit-code tools · real event triggers
  (auto-commit on edit, auto-push on Stop) · bounded scheduler + injected clock · PID locking · fail
  loud over silently wrong · LLM only where judgment is the point.
- **C · Self-healing / desired-state (GitOps/SRE)** — idempotent reconciler (Kubernetes/GitOps/Terraform/
  Chef/Puppet/DSC — ADR 0026) · structural write-allowlist (never overwrite notes) · self-upgradable
  engine, notes never touched (ADR 0012/0014/0025) · no hidden driftable state (`run-node`, `auto-push`).
- **D · Experience-first performance** — stale-while-revalidate · incremental reindex · on-device
  embeddings (EmbeddingGemma, ONNX).
- **E · Architecture (The Hive / hexagonal)** — stable MCP API port + swappable SPI adapters
  (ADR 0006/0007) · open protocol + open format + Apache-2.0 → zero lock-in.
- **F · Battle-tested engineering** — TDD baby-steps, green-only commits · outside-in diamond TDD ·
  eval-set (in-process **90%**) · 31 ADRs (`Scope:` + `Crux`) · **[coming]** mutation testing (Stryker).

---

## Critical files

- **New**: `MARKETING.md` (root).
- **New**: `docs/img/board-flow.svg`, `docs/img/board-hexagon.svg` (shipped); `docs/img/board-*.png`
  (illustrated, dropped by Thomas later).
- **New**: `docs/marketing-image-prompts.md` (the 6 Nano-Banana prompts).
- **Edit**: `README.md` (one link).
- **Reuse (phrasing source, do not duplicate)**: `EN-QUOI-C-EST-DIFFERENT.md`, `README.md`,
  `maintainers/decisions/0001/0002/0005/0006/0007/0009/0012/0014/0025/0026/0028`, `maintainers/eval-set.md`.

## Verification

- Render `MARKETING.md` in Typora **and** on GitHub — SVGs embed, page reads top-to-bottom in < 2 min.
- Every relative link resolves (no 404).
- English-only pre-flight before commit.
- No claim drift: every quality maps to a real ADR/script footnote.

## Out of scope (this pass)

- The talk/conf deck (later). The market watch itself (Step 5). The mutation numbers (Step 6 — only the
  placeholder ships now). Any change to the product/engine, installer, or vault.
