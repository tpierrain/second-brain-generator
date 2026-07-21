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

## Review feedback (Thomas) — pending triage

> Captured verbatim-in-substance during Thomas's read-through. **Not yet actioned** — we prioritize
> these together before editing `MARKETING.md`. One checkbox per item.

- [ ] **R0 — Master narrative arc for the page (the spine all other items serve).** Thomas's full
  sequence — R5 and R7–R13 are the bricks that fill this arc:
  1. **Hook personally first** — a pitch on what it brings them **personally, at their level, in daily
     life**, through different personas (slices of life — R8/R9/R10).
  2. **Then the vision it fits into** — that this is a genuine **open-source product**, and the next
     step / bigger picture is **survival in the mesh** of connected personal second brains that makes
     **everyone more effective** (R11/R12/R13).
  3. **Then "what's under the hood?"** — lots of **engineering**, **determinism**, etc. — and **list
     them out** (the tech catalog), in the for-techs zone.
  - *This same arc is detailed step-by-step in R5's reading order; R0 is its one-paragraph statement
    and the frame for everything below.*

- [ ] **R-STYLE — Keep it short and punchy (global constraint, applies to every section).** Thomas:
  the page should be **relatively short and impactful** — **not too much text**. **Not everyone has
  time to read.** So across all sections: lead with the punch, prefer scannable boards / tight tables /
  one-liners over prose, cut anything that isn't pulling weight. This conditions **how** R0's whole arc
  is written, not just one section.

- [x] **R1 — "a generator, not a product" is wrong as framed.** _(2026-06-25 · working tree)_ It is **both** a generator **and** a
  product — but a **personal** product. It is a *living* product that **can be upgraded after install**
  (the engine self-upgrades), while everyone's **own content** *and* their **extensions / skills /
  competences** keep living **alongside** that upgradable engine. So it genuinely **is** a product —
  just not *only* a product: it's a product that **begins with a generator**, which installs and
  **customizes** your own second brain to **your goals, concerns, stakes and line of work**. Fix the
  "not a product" phrasing everywhere it appears — at least: §"vs other second brains" title (L84) and
  the 2-min pitch (L30–31, "the project is a generator, not a product").
  - *Suggested reframing (Thomas): not a **finished** product — a **living** product.*
  - *Why (Thomas): "living product" is **more desirable** to people than pitching it as merely a generator.*

- [x] **R2 — "Under the hood": say *local* MCP, not just MCP.** _(2026-06-25 · working tree)_ The MCP server runs **locally**;
  worth making explicit ("a **local** MCP server") so readers grasp the on-machine/offline posture.
  At least: §"Under the hood" (L129–137, "the MCP surface is a stable contract"); also check the
  2-min pitch (L32–33, "an open MCP server"). **Including in the diagram** —
  `docs/img/board-hexagon.svg` (and the Nano-Banana prompt for the hexagon board) labels the center
  "MCP API port"; make it read **local** MCP there too.

- [ ] **R3 — Don't call it "The Hive" — it's plain hexagonal architecture.** *The Hive* is a **modular
  monolith** that can be **split into microservices at any time**; that's not what we have. Here there
  are already **two distinct MCP servers**: the **RAG** server (always on — search, indexing, etc.) and,
  **only if the user enables it**, the **local-mirror** server (the Notion-zone mirroring capability).
  So it's anything but Hive — it's simply **hexagonal architecture**. Fix the wording at: §"Under the
  hood" (L133, "(*The Hive* pattern)") and the qualities catalog item **E** (L182, "Architecture — The
  Hive (hexagonal)"). Mirror the same correction in the plan's own catalog map (this file, item E).

- [x] **R4 — Mutation testing is *in progress*, not "coming".** _(2026-06-25 · working tree)_ It's **already initiated** — we just
  **haven't published the results** yet and are **actively working on it**. So the framing is **pending /
  in progress**, **not** "[Coming]". Reword at: catalog item **F** (L192, "[Coming] Mutation testing …")
  and the "Reliability, measured" section (L201–202, "is on its way … once it lands"). Drop the
  not-started "Coming" tone; say it's underway with results not yet published.

- [ ] **R5 — Re-aim the page at non-tech readers first (structural).** Today the page skews **too
  technical, too early**. Invert it. **Intended reading order (this is R0's arc, detailed):**
  1. **Hero + pitch** (as now).
  2. **WHY — the problem / "why you need it"** (the R7 hook). Per Thomas this is *truly the beginning*:
     **why → then what**. The ache comes **before** the capabilities.
  3. **WHAT, personally — hook them on the *individual* payoff** — what it brings **you**, at **your**
     level, in your **daily life**, across **different personas** (the R8/R9/R10 slices of life).
  4. **THE VISION it fits into** — *then* zoom out: this is a real **open-source product**, and the
     vision is **survival in the mesh** of connected personal second brains that makes **everyone more
     effective** (R11/R12/R13). Personal hook first, collective vision second.
  5. **A hinge line**: *and it's **battle-tested** — it bakes in real **software engineering** to be
     **robust, reliable and as deterministic as possible**.*
  6. **UNDER THE HOOD** — *"what's under the hood?"* → the engineering, the determinism, etc., **listed
     out** (the tech catalog). Clearly demarcated as the **"for the technically curious"** zone.
  - Concretely this means **promoting "Who it's for" / use-cases up near the top** (today it sits at
    the bottom, L206, after all the engineering) and **pushing the engineering catalog + "Under the
    hood" down** behind the hinge sentence.
  - *Goal (Thomas): the page should speak to **non-techs first**, techs second — currently it's the
    inverse.*
  - **⚠️ Design constraint — the credibility tension (Thomas).** The risk in leading non-tech: if the
    first part is **vague / bullshitty / not concrete enough**, people **won't read on** — they'll
    write it off as *"yet another influencer-grifter / bullshit artist"*. So the opening must
    **differentiate** and stay **relevant and concrete** from the very first lines: real, specific
    capabilities and use-cases (not buzzwords, not job titles). Concreteness in the top half is the
    pass/fail criterion for R5 — accessible to non-techs **without** sliding into hand-wavy marketing.

- [ ] **R6 — Add a comparison vs the "LLM-wiki à la Karpathy".** The comparatives today cover **bare
  LLM** and **other second brains**; add a third axis: the **Karpathy-style LLM wiki** (the
  LLM-generated/LLM-powered personal wiki idea circulating on social media). README §"How is it
  different from the 'LLM wikis' …" (L127) already nods to it — surface it as an explicit comparison
  in `MARKETING.md` (board and/or table), like the bare-LLM and other-second-brains ones.
  - **Ordering of the three comparatives (Thomas):** 1️⃣ vs a **bare LLM** → 2️⃣ vs an **LLM-wiki à la
    Karpathy** → 3️⃣ vs **other second brains**. (Karpathy slots **between** the two existing ones, not
    at the end.)
  - *Note: confirm with Thomas what the Karpathy reference points to precisely before drafting copy.*

- [x] **R14 — Frame the "non-determinism trap" in the tech zone.** _(2026-06-24 · working tree)_ Add to
  the tech part: **one of the big traps with AI is non-determinism**, and the second brain **frames /
  contains it** as much as possible — with **fully deterministic** mechanisms where possible, or
  mechanisms that **lean toward** more determinism (e.g. **certain Claude hooks** firing on real
  events). Applied as a lead-in to catalog section **B · Determinism over guesswork** (ADR 0009).

- [x] **R15 — Surface the affordance: zero cognitive load, no temporal coupling ("sit down and relax").**
  _(2026-06-24 · working tree)_ An act-1 value (not part of R0's arc). Make explicit that **you don't
  need to know how it works underneath** to use it, and that there's **no temporal coupling** — you
  never have to wonder *"did it refresh the info before I asked?"*; freshness/backup/recovery are all
  **taken care of**. *Just ask. Sit down and relax.* Applied by expanding the "no need to be a geek"
  reassurance note in the **WHAT** section. (Its technical underpinning is the stale-while-revalidate
  pattern — catalog **D** / "How a question flows" — but here it's stated as a *user promise*.)
  - [x] **Catchphrase promoted (Thomas) _(2026-06-24 · working tree)_** — *"Just ask. Sit down and
    relax."* becomes **the product catchphrase**, placed right **after the H1 title** (tagline), then
    **picked up and detailed at the bottom** (the WHAT reassurance note that expands it). Top = the
    hook; later = the payoff.

- [x] **R16 — Tech zone (act 3) needs two levels too: capabilities first, architecture after.**
  _(2026-06-24 · working tree)_ Thomas: don't open the tech part with the architecture. Reordered so
  **level 1 = the reliability / determinism / robustness / backup patterns** (catalog, renamed
  *"What's in the box — reliability, determinism, robustness"*, + *"Reliability, measured"*), and
  **level 2 = the architecture** (*"And how it's built — one stable port, swappable adapters"* — the
  hexagon board, moved to the **end** of act 3).

- [ ] **R7 — The "why now" / problem statement IS the opening (why → then what).** Per Thomas this is
  *truly the beginning* of the page — the **"why you need it"** comes **first**, the **"what"** right
  after (see R5 reading order, step 2). Surface the ache the product answers, up top:
  - The world moves **fast** and we're **increasingly overwhelmed by information** — which is **normal**:
    the moment you try to **automate** and **augment yourself**, you must plug into a **flood of data
    sources**.
  - Without the capacity to **absorb that cognitive load** — i.e. **filter** what matters **to you**,
    **find it again easily whatever the medium** it happened on, and **integrate everything said and
    done** in meetings and in your email exchanges with others — **you're sunk**.
  - The second brain is the **answer to that problem**: *how to survive and stay effective in a world
    that's drowning you in information.*
  - **B2B angle (Thomas):** position it, too, as **one element of an enterprise AI-ecosystem deployment
    strategy** — not just a personal tool.
  - *This is narrative/positioning copy for the top of the page; keep it concrete per R5's
    anti-bullshit constraint (a vivid, real ache — not abstract "information overload" platitudes).*

- [ ] **R8 — Ground R7 with a concrete worked example (the anti-bullshit anchor).** Use this scenario
  to make the "why" tangible (Thomas's example):
  - **Setting:** a **product company**. You're a **Product Manager**, **Customer Success**, or a **tech**.
  - **Goal:** you want to know *what customers just **said** or **asked for***.
  - **What you do:** you connect to **as many of the company's sources of truth** as possible — e.g. the
    **CRM**, the **customer-call transcripts**.
  - **The pain:** doing that, you're **quickly overwhelmed** — volume, **noise**, things that don't
    concern you.
  - **The payoff:** the second brain does **both** — it helps you **plug into** all those varied sources
    **and**, above all, lets you **survive that massive volume of info and noise** (filter to what's
    relevant to *you*, find it again, integrate it).
  - *Slots into R5 step 2–3 (why → what); it's the kind of vivid, specific use-case R5 says the top of
    the page must lead with.*

- [ ] **R9 — Second intro example: the sales / SDR / CAM point of view (Thomas).** Pair it with R8 in
  the introduction:
  - **Setting:** a **salesperson / SDR / CAM**, **live in conversation** with a prospect or customer.
  - **The ask:** the customer asks *what's **available**, what's **in progress**, what's **coming*** for
    a feature they care about.
  - **The payoff:** **in an instant**, the rep asks the second brain — **connected to the right product
    sources**: the **roadmap**, the **commitments**, **what's in execution on the tech side** — and gets
    to give the customer an answer that's **fresh, reliable and relevant**.
  - *Same role as R8: a vivid, specific, credible use-case for the non-tech-first opening (R5).*

- [ ] **R10 — Tell these as "slices of life" — one per persona's concern.** Make R8/R9 a **recurring
  format** in the intro: short, lived-in vignettes, each with a **persona's real concern**, each showing
  **how the second brain — plugged into the right company sources of truth — helps them**. (PM /
  Customer Success / tech for R8, sales / SDR / CAM for R9; room for more.) This is the concrete,
  non-bullshit storytelling R5 + R7 call for.

- [ ] **R11 — Start selling the (Notion) mirroring capability — the "reliable MCP source" angle.**
  Position the brain's **mirroring connector** (the `local-mirror` capability) as a real B2B lever:
  - **The gap it fills:** many companies **haven't yet invested in / exposed centralized MCPs** over
    their various **golden sources** (sales, product, customer success, tech).
  - **What we offer instead:** the second brain ships a **mirroring connector** that gives the
    **equivalent of a reliable MCP source** — with **RAG / advanced semantic search on top** — simply by
    **plugging it to mirror a zone** (e.g. a **Notion** zone).
  - **So:** even without a company-wide MCP investment, you get a **dependable, searchable local source**
    over the golden data you care about.
  - **⚠️ Frame it honestly as a *degraded / stopgap* mode (Thomas).** It is **not** the ideal end-state —
    it's **for companies that haven't yet set up a central MCP (or central MCPs) internally**. But it
    **already delivers value today**: it lets you **digest all that continuously-updated information**
    (e.g. in Notion) **right now**, while/until the company invests in proper central MCPs.
  - *Ties into the B2B angle in R7 (one element of an enterprise AI-ecosystem strategy). Keep the claim
    honest re: what `local-mirror` actually does today (Notion zone → local Markdown mirror → local RAG).*

- [ ] **R12 — "Connected teams" board: the target end-state the mirroring mode bridges to.** Thomas has
  a reference diagram (*"Connected teams — information flows by itself"*) we can adapt as a board:
  - **Picture:** four team hexes/boxes — **Sales**, **Customer Success**, **Product**, **Tech** — each
    **writes its own golden source** (Deals & commitments · Client questions/signals; Onboardings ·
    open customer topics; Roadmap & priorities · available-vs-planned; Features/tickets · bugs ·
    execution status). Arrows label the flows between them (*what's available · what's coming*, *client
    insights · meeting transcripts*, *priorities · specs*, *delivery status*, *incidents · fixes
    needed*, *roadmap · releases · fixes*). Footer: **"each team writes its own golden source — everyone
    can read them all, exposed via an internal MCP server."**
  - **Why it matters here:** this is the **ideal end-state** (a real internal central MCP over the golden
    sources). It pairs with **R11**: `local-mirror` is the **degraded/stopgap mode** that delivers value
    *before* a company has built this. Board = the target; mirroring = how you get value on the way there.
  - **🔑 The missing piece the board must make explicit (Thomas):** what the original image **doesn't
    show** is that **each profile/role IS a second brain** — and **each second brain is connected to the
    golden source of *another* service**, every service **exposing its golden source as (an) MCP
    server(s)**. So it's not just teams writing/reading shared sources: it's a **mesh of per-person
    second brains**, each consuming the **other services' golden-source MCP endpoints**. The adapted
    board should surface this (a second-brain node per role, wired to the others' golden-source MCPs).
  - *Provenance / boundary: the source diagram came from Thomas (shared in chat). Keep any client /
    exec-committee provenance OUT of the repo (per `no-client-demo-context-in-repo`); only the generic
    role-based diagram (Sales/CS/Product/Tech + golden sources + internal MCP) is reusable here.*

- [ ] **R13 — The B2B thesis line (payoff of the mesh).** State it explicitly as the takeaway: this
  **mesh of personal second brains, each consuming the other services' golden sources, is a concrete
  way to augment your company with AI** — letting **everyone do their job effectively, with the right
  information and the right understanding of things**. This is the conclusion R12's board builds to;
  use it as the closing line of the B2B/connected-teams section.

---

## Prioritization & sequencing (agreed with Thomas — 2026-06-24)

Two decisions taken: **structure first, then content**; and **defer the B2B vision act** to a separate
pass. **R-STYLE applies throughout** (short, punchy, scannable — boards/tables over prose).

> 🌟 **North star (agreed 2026-06-24): `MARKETING.md`'s reworked arc becomes the new `README.md`** —
> *à quelque chose près*. Rationale: GitHub's front door should be the R0 arc, and README/MARKETING
> already duplicate the hero verbatim (divergence debt). The "à quelque chose près" = **(1)** keep a
> can't-miss **"Install yours now" CTA** high up (a generator's README must make people *run* it) +
> the practical install/engine/privacy sections (kept or pushed to `SETUP.md` + linked); **(2)**
> migrate carefully — preserve the `CLAUDE.md` bootstrap relationship and the in-repo anchors
> (`#ready-to-try-it`, badges…). `EN-QUOI-C-EST-DIFFERENT.md` stays the linked deep-dive.
> **Build the arc in `MARKETING.md` first (P0/P1) — content is identical either way — then promote it
> to README as a deliberate step (P-MERGE below), not part of P0.**

- [x] **P0 — Foundation (blocks everything): R0 + R5.** Settle the arc and **restructure the skeleton** —
  move use-cases/personas up, push the engineering catalog + "Under the hood" down, add the hinge line.
  Nothing else lands cleanly until this is done. _(2026-06-24 · working tree, not yet committed)_
  - [x] Reordered into R0's arc: pitch → **WHY** (new) → **WHAT/personas** (moved up from the bottom) →
    flow → what-it-is → comparatives → privacy → **hinge** (new) → tech zone (Under the hood →
    Qualities → Reliability) → footer.
  - [x] Added the **hinge** section ("And it's battle-tested 🔧 — for the technically curious") before
    the tech deep-dive.
  - [x] Reserved commented slots: **ACT 2 (B2B vision, P2)** and the **Karpathy comparative (P3)**.
  - [x] Left P1 wording untouched on purpose (R1 generator/product, R3 Hive, R4 mutation, R2 local MCP).
  - **Carried into P1:** the WHY + WHAT sections currently hold *placeholder* copy (clearly marked) —
    P1 (R7/R8/R9/R10) writes the real hook + slices of life.
- [ ] **P1 — Top-of-page (act 1) + credibility fixes.**
  - [x] **Pitch reworked** _(2026-06-24 · working tree, awaiting Thomas feedback)_ — **collapsed the
    "three lengths" into ONE short pitch** (Thomas: a small pitch is enough); reframed the opener as a
    **promise**, in Thomas's priority order: **(1) FIRST — never get swamped / never miss info you'd
    otherwise have missed** (stay on top of what's moving, work & life, without drowning); **(2) THEN —
    remember everything that counts** (your decisions, others' decisions, the important things);
    immediate, always-sourced, self-updating by pulling from connected sources. **Emphasized personal &
    private** (yours, Markdown, local by default — *even as work/operational sources get grafted on*).
    Supersedes the old outline's "one-liner / 30s / 2-min".
  - [x] **R7 + R8 + R9 + R10 drafted** _(2026-06-24 · working tree, awaiting feedback)_ — **WHY** section
    opens with an **icebreaker** (relatable quoted lines: *"you hadn't heard?" · "that was decided last
    week" · "didn't you see Sarah's email?" · "it's in the #product Slack…"* → the universal *being
    behind / no chance to catch up* feeling) then the ache; **WHAT** section = 3 concrete slices of life
    (back-from-leave / live-with-a-customer / what-are-customers-asking), personas folded into one line +
    the "no need to be a geek" note.
  - [x] **R3 applied** _(2026-06-24 · working tree)_ — removed both "The Hive" mentions in `MARKETING.md`:
    catalog **E** → *"Hexagonal architecture (ports & adapters)"*, and the architecture section → *"a
    hexagon (hexagonal architecture — ports & adapters)"*. (Still TODO elsewhere per R3: the hexagon
    Nano-Banana prompt in `docs/marketing-image-prompts.md` + the plan's own catalog map, if they name
    Hive.)
  - [x] R4 (mutation = *in progress*, not "coming") + R1 (living product) + R2 (local MCP) — cheap,
    independent, protect credibility; fold in along the way. _(2026-06-25 · working tree)_

- [x] **R18 — Add an end-of-page summary of all engineering & SRE principles (bullets).**
  _(2026-06-24 · working tree)_ New closing section *"Engineering & SRE principles, at a glance"* (before
  "Going further"): a scannable bullet list distilling catalog A–F — grounded-with-proof, fail-loud,
  determinism ladder, self-healing/desired-state, always-catches-up, never-overwrites, no-driftable-state,
  stale-while-revalidate, incremental/on-device, hexagonal/open/zero-lock-in, test-driven/green-only.

- [x] **R17 — Surface the "catch-up / rattrapage whatever the conditions" capability (tech zone).**
  _(2026-06-24 · working tree)_ Added a headline bullet to catalog **C** (self-healing / desired-state):
  *whatever happened — a crash, a burst of edits, days away, an interrupted session — the brain catches
  up on its own (re-indexes the delta, auto-saves, auto-commits, restores freshness); nothing to replay
  by hand.*
- [ ] **P2 — B2B vision act (DEFERRED — separate pass, on Thomas's go).** R11 (mirroring / degraded
  mode) + R12 (new "connected teams" board + per-person mesh) + R13 (B2B thesis). Heavier: needs a new
  visual asset and careful honest positioning.
- [ ] **P3 — Needs clarification first: R6.** Confirm what the Karpathy "LLM-wiki" reference points to
  precisely **before** drafting the third comparative.
- [ ] **P-MERGE — Promote `MARKETING.md` → new `README.md` (DEFERRED — after P1, deliberate step).**
  Per the north star. Includes: add the install CTA high up, keep/relocate install·engine·privacy
  sections (→ `SETUP.md` + links), fix all in-repo anchors and badges, preserve the `CLAUDE.md`
  bootstrap relationship, relink `EN-QUOI` as the deep-dive. Not part of P0.

> Sequencing chosen: **structure-first** (not quick-wins-first, not big-bang). B2B act: **deferred**.
> End-state: **MARKETING's arc becomes the README** (P-MERGE, deferred). P0 builds toward it.

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
  - [ ] 1g · Board G — **hero / social lead card** → *prompt added 2026-07-21; awaiting `board-hero.png` render*
  - [ ] 1h · Board H — **B2B mesh** (fills the ACT 2 slot) → *prompt added 2026-07-21; awaiting `board-mesh.png` render*
- [x] **Step 2 — Write `MARKETING.md`** _(2026-06-24)_ — root, English, text-complete without images
  - [x] 2a · Hero (Kenjaku) + elevator pitch (one-liner / 30s / 2-min)
  - [x] 2b · "What it is / what it is NOT" (honest scope, from EN-QUOI §7)
  - [x] 2c · "vs a bare LLM" + "vs other second brains" (board + one table each)
  - [x] 2d · **Qualities & engineering catalog** (+ a "Under the hood" hexagon section)
  - [x] 2e · Personas (Head of Eng / PM / consultant) — one line each
  - [x] 2f · Footer: links (README / EN-QUOI / SETUP / ADRs / Medium) + author + Apache-2.0
  - [x] 2g · "Reliability, measured" — eval-set 90% + **mutation score filled** (rag 90.4% / local-mirror 95.6% / harness 97.3%, pinned v3.6.2) _(2026-07-21 · `5ca344d`)_
- [ ] **Step 3 — Link & verify**
  - [x] 3a · Link to `MARKETING.md` from `README.md` hero nav _(2026-06-24)_
  - [x] 3b · Verified referenced files exist + EN-QUOI anchors (incl. §9 double-hyphen slug) _(2026-06-24)_
  - [x] 3c · English-only pre-flight — clean (only "à la carte" idiom + CSS `sans-serif`) _(2026-06-24)_
  - [ ] 3d · Visual render check in Typora/GitHub by Thomas (the two SVGs display as intended)
- [x] **Step 4 — Home the plan in the repo** _(2026-06-24 — this file)_
- [ ] **Step 5 — Market watch** *(deferred — separate pass, on Thomas's go)*
  - [ ] 5a · Competitive scan (Notion AI, Mem, Reflect, Tana, Khoj, AnythingLLM, NotebookLM, Glean…) → refresh EN-QUOI §9 with dated evidence
  - [ ] 5b · Embedder/RAG watch → fold in [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md)
- [x] **Step 6 — Mutation-testing reliability section** _(2026-07-21 · `5ca344d`)_
  - [x] 6a · Fill 2g with the measured mutation score + what it proves (90–97% across the 3 engine packages)

> **Session 2026-07-21 (`5ca344d`, branch rebased onto `main` first — was 115 commits behind):** three
> cheap prep passes toward the wide-public relaunch. (1) Facts refreshed: "31 ADRs" → **34**, mutation
> testing "underway/not published" → **real scores** (Step 6). (2) Trimmed the technical half: dropped the
> duplicated "Engineering & SRE principles, at a glance" summary, turned the hinge into a taster + link to
> EN-QUOI (the gated A-F deep-dive stays). (3) Added the two missing image prompts: `board-hero` (social
> lead card) + `board-mesh` (B2B vision, roles only). **Remaining = visual production** (render the 8
> boards to premium PNG — Thomas's manual step, prompts ready) **then P-MERGE** (promote the arc to
> `README.md` = the actual launch).

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
