# Image-gen prompts for Kenjaku's `MARKETING.md` boards (Nano Banana 2 / Pro)

> **How to use.** Generate each board in Nano Banana 2 / Pro. Drop the render in [`docs/img/`](img/)
> under the **exact filename** given (`board-*.png`). `MARKETING.md` references those slots, so the
> page picks them up with no further edit. For the KENJAKU MASCOT, **attach `docs/img/kenjaku.png` as a
> reference image** so the chibi stays faithful (silver hair, beard, glasses, forehead stitch).
>
> **The look is now locked** (validated on `board-flow`, `board-deepdive` and `board-why-what`): warm
> hand-drawn boards, solid-orange section pills + ribbons (white text), the parme **"KENJAKU"** comic
> wordmark top-right, and the chibi mascot. Keep it identical across the whole set so the series reads
> as one family.
>
> **Prefer copy-paste?** [`marketing-image-prompts-standalone.md`](marketing-image-prompts-standalone.md)
> holds the same boards with the house-style preamble **inlined into each prompt** — one self-contained
> block per board, nothing to prepend. Keep the two files in sync when you edit a board.

---

## Shared house style — paste (or reference) into EVERY prompt

> **Hand-drawn / sketch explainer board in the spirit of ByteByteGo & Alex Xu diagrams. Warm off-white
> paper background (#F4F1EA). Marker-outline shapes with subtle pencil shadows; soft pastel icon tiles
> (lavender, mint, peach, pink). Bold condensed black titles, warm-grey secondary text. A single strong
> accent orange (#E8590C) used as SOLID-FILLED pills and bars with WHITE text (the top-left section
> kicker and the full-width bottom ribbon) and as an underlined highlight on one or two key words.
> 16:9, horizontal, presentation-grade, crisp perfectly-spelled labels, no photorealism, no clutter,
> no watermark.**
>
> **Recurring furniture on EVERY board:**
> 1. **Top-left:** a small square bracket mark, then a **SOLID ORANGE pill** naming the section, its
>    text in **BOLD WHITE uppercase** (white on orange — **never black text on orange**), followed by a
>    **dashed line** running right.
> 2. **Kenjaku identity — IN THE HEADER of every board.** The brand wordmark is **"KENJAKU"** set in a
>    chunky, rounded **comic-book / pop-art display font** — bold, slightly rounded letterforms with a
>    **thick black outline** and a solid fill, à la a **"BOOM!"** comic sound-effect lettering —
>    **ALL-CAPS**, filled in **solid parme / soft mauve-violet (~#B884D8)**. Next to it a small
>    hand-drawn **brain glyph**, and just beneath it **"your second brain"** in normal warm-grey/black
>    text. Place it **prominent and unmissable** in the header — by **default TOP-RIGHT**, balancing the
>    top-left section pill (on title-led boards whose left column *is* the headline, like `board-flow`,
>    it may instead sit top-left under the pill). Never a tiny hidden corner mark. **Wherever "Kenjaku"
>    appears as a title / wordmark on any board, use this exact treatment** (parme comic caps + black outline).
> 3. Where noted, a **full-width SOLID ORANGE bottom ribbon** whose one-line takeaway is in **BOLD WHITE
>    text** (white on orange — **NOT black**; this is the single thing renders get wrong most often, so
>    force it every time).
> 4. The **Kenjaku mascot**, when used: a **cute CHIBI** — small body, big head, simplified friendly
>    cartoon proportions, **NOT a realistic or detailed portrait** — of a calm silver/grey-haired man
>    with a short grey beard, rectangular glasses, gentle closed "happy" eyes and a **single horizontal
>    stitch across his forehead** — adorable, never scary. Attach `kenjaku.png` as reference for the
>    character, but keep the **chibi cartoon** look.

Each board below says **"House style as above"** — don't re-describe it, just add the board-specific
content. Section-pill text is given per board.

---

## `board-why-what.png` — "Why & What" (act-1 opener) &nbsp;·&nbsp; section pill **"START HERE · WHY & WHAT"**

**Prompt:** House style as above. **Place the Kenjaku identity header TOP-RIGHT** (balancing the top-left
section pill): brain glyph + the **"KENJAKU"** parme comic-caps wordmark with black outline +
**"your second brain"** beneath. **Left half — THE WHY (the problem):** a header sub-pill (grey)
**"WHY YOU NEED IT"**; four small hand-drawn speech bubbles — **"Wait — you hadn't heard?"**, **"That
was decided last week."**, **"Didn't you see Sarah's email?"**, **"It's in the #product Slack…"**; beside
them a slightly overwhelmed person at a desk under a little cloud of notification icons (Slack, mail,
Drive, calendar, chat). Warm-grey caption: **"The faster things move, the more you plug in — Slack,
mail, Drive, meeting transcripts — and the more you fall behind. Staying on top is a second full-time
job."** **Center divider:** a **clear vertical divider line** running top-to-bottom between the two
halves (it keeps both sides readable), with a small orange **"so…"** arrow sitting on it, pointing
right. **Right half — THE WHAT (the answer):** a grey sub-pill **"WHAT IT IS"**; a simple diagram where several source icons
(Slack, Drive, mail, calendar, a notes folder) flow with thin arrows into a warm glowing **brain**
glyph, and one arrow goes out to a small person receiving a tidy answer card with a little source-tag.
Warm-grey caption: **"One memory across all your tools. Ask in plain words; it answers from your own
sources — always with the date — and keeps itself up to date."** A relaxed **Kenjaku mascot** giving a
reassuring wave — drawn as a **cute chibi** (small body, big head), not a realistic portrait. **Bottom
orange ribbon (text in BOLD WHITE, not black):** **"Survive the flood: filter what matters to you, find
it again, integrate everything said and done — then just ask."**

---

## `board-flow.png` — "Just ask. It's all automated." ✅ *(validated render)* &nbsp;·&nbsp; section pill **"HOW IT WORKS, FOR YOU"**

*(SVG fallback still on disk: `board-flow.svg` — violet flat-vector, superseded by this hand-drawn PNG.)*

**Prompt:** House style as above. **Left third (top to bottom):** the Kenjaku identity badge (brain glyph
+ **"Kenjaku"** / **"your second brain"**); a warm-grey one-liner **"Ask in plain words — it answers
from your own work, always with the source."**; a huge bold condensed black title on two lines **"Just
ask. Sit down and relax."**; right below it a punchy, slightly larger **orange underlined exclamation
"It's all automated!"**; then the **Kenjaku mascot leaning back relaxed in a comfy chair**, one hand
behind his head, with the caption **"You do ONE thing: ask — in plain words."** and a single arrow
labelled **"ask"** pointing right into the automated box. **Center / right (hero element):** a large
rounded container with a bold double border and a header banner **"⚙ FULLY AUTOMATED FOR YOU —
hands-off"**; inside, four stacked steps (icon + bold title + one-line caption), joined by small
downward arrows:
- magnifying-glass — **"Answer now"** — *"searches your vault, replies in seconds — always with the source"*
- refresh — **"Sync in the background"** — *"pulls Slack · Drive · mail — read-only, while you read"*
- pencil — **"Amend"** — *"updates the answer only if something new turned up"*
- floppy-disk — **"Save · version · back up"** — *"auto-commit to git (+ push if you enabled it) — nothing to save by hand"*

**Bottom orange ribbon:** **"You never click save, never refresh, never lose a thing — freshness, backup
& recovery all run themselves."**

---

## `board-vs-llm.png` — "vs a bare LLM" &nbsp;·&nbsp; section pill **"VS A BARE LLM"**

**Prompt:** House style as above, with the Kenjaku identity badge top-left. A side-by-side comparison,
two columns split by a center divider carrying a small **"VS"** badge. **Left column, greyed/faded,
"Bare ChatGPT / Claude":** a chat bubble with a fading/erasing memory icon; bullets **"Only knows what
you re-paste"**, **"Forgets after the chat"**, **"Answers from training — may make things up"**, **"One
walled conversation"**. **Right column, vibrant, "Kenjaku, your second brain":** a warm brain glyph
wired to a folder of notes and tool icons (Slack, Drive, mail, calendar); bullets **"Persistent memory,
grows with every question"**, **"Cross-cutting across all your tools"**, **"Grounded — cites its sources,
with dates"**, **"Yours, in Markdown, in your git repo"**. Make the right side clearly the richer,
trustworthy option. **Bottom orange ribbon:** **"Same question — a real, sourced memory instead of a
confident guess."**

---

## `board-generator.png` — "A living, personal product" &nbsp;·&nbsp; section pill **"A LIVING, PERSONAL PRODUCT"**

**Prompt:** House style as above, Kenjaku identity badge top-left. On the left, a single sturdy machine /
press labelled **"The launcher — read-only, reusable"**. From it, an arrow produces several distinct,
independent brain folders on the right, each a rounded card with a small brain glyph and a tiny git
icon, labelled **"Your brain"**, **"Her brain"**, **"His brain"**, each with its own little padlock and
the note **"your notes · your CLAUDE.md constitution · your git repo"**. A dotted line between launcher
and brains labelled **"git init — 0 remotes, no link back"**. Warm-grey caption: **"It begins with a
generator that tailors YOUR brain to your work — then keeps living: the engine self-upgrades, your notes
& skills grow alongside."** **Bottom orange ribbon:** **"Everyone generates their own. You share the
generator, never the brain."**

---

## `board-privacy.png` — "Privacy, à la carte" &nbsp;·&nbsp; section pill **"PRIVACY, À LA CARTE"**

**Prompt:** House style as above, Kenjaku identity badge top-left. Center: a laptop with a brain glyph
on screen and a folder of notes inside it. Three labelled lanes fan out, most private (left, green) to
least (right, amber):
- **Lane 1 (green, ⭐ recommended):** **"On your machine"** — chip **"EmbeddingGemma · on-device"**, a
  closed padlock, caption **"Nothing leaves your computer · free · offline"**; a bold green boundary
  around the laptop is NOT crossed.
- **Lane 2 (amber):** **"With an API key"** — chips **"Gemini · OpenAI · Mistral · your company
  endpoint"**, an arrow crossing the boundary to a cloud, caption **"Your notes' text goes to the
  provider you pick"**.
- **Lane 3 (green):** **"Local via Ollama"** — chip **"runs on your machine (separate app)"**, padlock,
  caption **"Nothing leaves either · advanced setup"**.

A callout bubble: **"The embedder is a tiny search model — NOT the AI that answers. Claude still
reasons."** **Bottom orange ribbon:** **"You decide who touches your data — swap the engine, your notes
& skills never move."**

---

## `board-deepdive.png` — "What sets it apart" ✅ *(validated render)* &nbsp;·&nbsp; section pill **"DEEP DIVE"**

**Prompt:** House style as above. Breadcrumb under the pill: **"AI MEMORY  >  SECOND BRAIN  >
KENJAKU"** (last word orange). Small orange kicker **"AUGMENT YOURSELF WITH"**, then a huge bold
condensed title **"Kenjaku"**, then a medium sub-title **"your grounded second brain"**; below, the
handwritten tagline **"Just ask. Sit down and relax."** (**ask**/**relax** underlined orange). A small
orange call-out bubble: **"🐤 canary proof — a made-up fact only your vault knows; if the answer knows
it, the retrieval is real."** Bottom-left **"LEGEND / COMPONENTS"** block: four icons — **"Canary-proven
grounding"**, **"On-device search (à la carte)"**, **"Read-only connectors"**, **"Determinism-first (LLM
only where it helps)"**. **Center panel titled "WHAT SETS IT APART"**, four numbered items (pastel badge
+ icon + bold title + one-line caption):
- **01** shield — **"Grounded — proven, not promised"** — *"from your vault, with source + date; a synthetic canary proves it didn't invent"*
- **02** padlock — **"Private by default"** — *"search runs on your machine (EmbeddingGemma); privacy à la carte — 3 engines, you choose"*
- **03** folder — **"Yours, forever"** — *"plain Markdown in YOUR git repo · open format · Apache-2.0 · zero lock-in"*
- **04** sparkle — **"Effortless — because it's engineered"** — *"non-tech to use; deterministic, self-healing, battle-tested underneath"*

A chibi **Kenjaku mascot** stands to the right of the panel. **Right column, top:** callout **"OUTER
LOOP"**, **"self-heals + self-upgrades"**, sub **"reconcile to desired state · engine updates, your
notes never touched"**, wrapped by a curved orange loop arrow. **Right column, middle:** callout **"INNER
LOOP"**, **"answer now → verify in the background → amend ONLY if new"**, small label
**"(stale-while-revalidate)"**, wrapped by its own orange loop arrow. **Bottom-right:** a window **"PROJECT
FILES"** with a monospace tree — `my-brain/` at root; nested one level `CLAUDE.md`, `vault/`, `.mcp.json`,
`.claude/`, `scripts/`; inside `.claude/`: `settings.json`, `hooks/`, `skills/`; inside `scripts/`:
`verify-rag.mjs`. No parentheses anywhere.

---

## `board-reliability.png` — "The reliability stack" &nbsp;·&nbsp; section pill **"UNDER THE HOOD · RELIABILITY"**

**Prompt:** House style as above, Kenjaku identity badge top-left. A layered stack of labelled bands,
each with a small icon, foundation to top:
- **"Grounded in truth"** — *"semantic search answers FROM your vault · a synthetic canary proves it (Mollecuisse / Flemmr) · fail-loud verify-rag"*
- **"Determinism over guesswork"** — *"pure functions · binary exit-code tools · real event triggers, not timers · locks & debounced reindex"*
- **"Self-healing, desired-state"** — *"idempotent reconciler (à la Kubernetes / GitOps / Terraform) · never overwrites your notes · self-upgradable engine"*
- **"Hexagonal architecture"** — *"stable local MCP port · swappable adapters · open format, open license, zero lock-in"*
- **"Proven engineering"** — *"TDD baby-steps · green-only commits · eval-set 90% · 34 ADRs · mutation score 90–97%"*

A side note reads **"Fail loudly rather than pretend."** **Bottom orange ribbon:** **"Effortless to use —
because every load-bearing step is deterministic, tested and fail-loud."**

---

## `board-hexagon.png` — "One stable port, swappable adapters" &nbsp;·&nbsp; section pill **"UNDER THE HOOD · ARCHITECTURE"**

*(SVG fallback still on disk: `board-hexagon.svg` — violet flat-vector, superseded by this hand-drawn PNG.)*

**Prompt:** House style as above, Kenjaku identity badge top-left. Center: a **hexagon** labelled **"API
PORT — stable, versioned (local MCP)"** with a monospace list inside: **"search_vault · get_document ·
list_documents · vault_stats · reindex"**. Above it, a box **"Your harness — skills · CLAUDE.md"** with a
downward arrow **"depends only on the stable contract"**. Around the hexagon, three dashed **"swappable"**
adapter cards:
- **"Embedder — pick yours at install"** with chips **"🟢 local EmbeddingGemma · 🟡 API key (Gemini / your endpoint) · 🟢 Ollama"** and note **"swap it → notes & skills untouched"**.
- **"Vector store — SQLite (local)"**.
- **"Chunking strategy"** with note **"provider details stay behind the port — no vendor leak"**.

**Bottom orange ribbon:** **"One stable port your harness trusts · adapters you change freely (ADR 0006 / 0007)."**

---

## `board-hero.png` — the launch / social lead card &nbsp;·&nbsp; section pill **"MEET KENJAKU"**

> **Purpose.** The single **lead image** for the wide-communication push (top of a LinkedIn / X / Medium
> post), standing alone. Keep it **uncluttered** — one glance must land the promise.

**Prompt:** House style as above, but **more spacious and uncluttered** than the other boards. Kenjaku
identity badge top-left (brain glyph + **"Kenjaku"** / **"your second brain"**). Centerpiece: a calm
**Kenjaku mascot leaning back relaxed** in a chair, beside a warm glowing **brain** connected by tidy
lines to a small cluster of familiar tool icons (Slack, Drive, mail, calendar, a notes folder); a soft
**green padlock** on the brain with a subtle boundary line **"stays on your machine"**. Big bold headline
**"All your work, remembered."**, sub-line **"Always up-to-date, always sourced."**. **Bottom orange
ribbon:** the catchphrase **"Just ask. Sit down and relax. It's all automated."** Convey calm,
effortless, private recall — the opposite of information overload. **No callout label on the character —
do NOT write the word "mascot" (or any leader-line label pointing at him) anywhere on the board.**

---

## `board-mesh.png` — "A team is a mesh of second brains" (B2B vision) &nbsp;·&nbsp; section pill **"THE VISION · CONNECTED TEAMS"**

> **Purpose.** Fills the reserved **ACT 2** slot (deferred B2B vision). Thesis: **each person keeps their
> own private, owned brain — the mesh of them makes the collective sharp**, without pooling everyone's
> data into one vendor silo. **Roles only, never real company / client / exec names.**

**Prompt:** House style as above, Kenjaku identity badge top-left. **Four** rounded person-cards in a
loose ring, each with a brain glyph, a tiny git icon and its **own green padlock**, labelled by **role
only**: **"Sales"**, **"Customer Success"**, **"Product"**, **"Engineering"**; under each, a small caption
**"their own notes · their own brain · private"**. Between the cards, **thin orange connection lines**
forming a mesh, each labelled with a lightweight verb — **"asks"**, **"shares context"**, **"stays in
sync"** — but **no central database in the middle** (peer-to-peer, not a pooled silo). Top caption:
**"Everyone keeps their own private brain."** **Bottom orange ribbon:** **"The mesh makes the whole team
effective — without pooling your data."** A small side note: **"each brain stays owned & local — no
shared vendor vault."**
