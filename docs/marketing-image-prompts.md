# Image-gen prompts for `MARKETING.md` boards (Nano Banana 2 / Pro)

> **How to use.** Generate each board in Artlist (Nano Banana 2 / Pro). Drop the render in
> [`docs/img/`](img/) under the **exact filename** given (`board-*.png`). `MARKETING.md` already
> references those slots, so the page picks them up with no further edit. Two boards
> (`board-flow`, `board-hexagon`) also ship as **SVG fallbacks** that render today — generate the
> illustrated versions only if you want the consistent hand-drawn look across all six.
>
> **Shared house style (paste into every prompt).** *Clean modern infographic / explainer-board
> illustration in the spirit of ByteByteGo & Alex Xu diagrams. Flat vector look, soft rounded
> rectangles, subtle drop shadows, plenty of whitespace. Light background (#f6f8fa / white).
> Accent palette: violet #7C4DFF and indigo #4F46E5 for the "smart/private" elements, blue #2979FF for
> data flow, warm grey #57606A for secondary text, green for "stays on your machine", amber for
> "leaves the machine". Crisp sans-serif labels, perfectly legible, correctly spelled. 16:9, horizontal,
> presentation-grade, no photorealism, no clutter, no watermark.*
>
> Aspect ratio: **16:9** unless noted. Keep the exact wording below in the image — Nano Banana renders
> text reliably.

---

## `board-flow.png` — "Ask once, answered in seconds" (the 4-phase flow)

*(SVG fallback shipped: `docs/img/board-flow.svg`.)*

**Prompt:** A horizontal explainer board titled **"Ask once — answered in seconds"**. Left: a small
friendly person icon labelled **"You ask — in plain words"** with an arrow pointing right into a flow of
four rounded cards, connected by arrows:
1. A glowing violet card, badge **"PHASE 1 · NOW"**, lightning-bolt icon ⚡, title **"Instant answer
   from your vault"**, subtitle **"semantic search, with sources"**.
2. A blue dashed-border card, badge **"PHASE 2 · BACKGROUND"**, refresh icon 🔄, title **"Sync your
   sources"**, subtitle **"Slack · Drive · mail — delta only, while you read"**.
3. A neutral grey card, badge **"PHASE 3"**, pencil icon ✏️, title **"Amend the answer"**, subtitle
   **"only if something new was found"**.
4. A neutral grey card, badge **"PHASE 4"**, floppy-disk icon 💾, title **"Persist + auto-commit (git)"**.

A ribbon along the bottom reads **"⟳ stale-while-revalidate — speed first, freshness follows"** in violet.
Convey "answer is immediate, freshness catches up in the background". ByteByteGo explainer style.

---

## `board-privacy.png` — "Privacy à la carte"

**Prompt:** A board titled **"Privacy, à la carte — you decide who touches your data"**. Center: a
laptop with a brain glyph on screen and a folder of notes inside it. Three labelled lanes fan out,
arranged from most private (left, green) to least (right, amber):
- **Lane 1 (green, ⭐ recommended):** **"On your machine"** — small chip **"EmbeddingGemma · on-device"**,
  a closed padlock, and the caption **"Nothing leaves your computer · free · offline"**. A bold green
  boundary line around the laptop is NOT crossed.
- **Lane 2 (amber):** **"With an API key"** — chips **"Gemini · OpenAI · Mistral · your company
  endpoint"**, an arrow crossing the boundary to a cloud, caption **"Your notes' text goes to the
  provider you pick"**.
- **Lane 3 (green):** **"Local via Ollama"** — chip **"runs on your machine (separate app)"**, padlock,
  caption **"Nothing leaves either · advanced setup"**.
Top-right callout bubble: **"The embedder is a tiny search model — NOT the AI that answers. Claude still
reasons."** Clean infographic, ByteByteGo style, exact labels.

---

## `board-generator.png` — "A living, personal product — that begins with a generator"

**Prompt:** A board titled **"A living, personal product — it begins with a generator"**. On the left, a
single sturdy machine / press labelled **"The launcher (read-only, reusable)"**. From it, an arrow produces several distinct,
independent brain folders on the right, each a rounded card with a brain glyph and a tiny git icon,
labelled **"Your brain"**, **"Her brain"**, **"His brain"** — each with its own little padlock and the
note **"your notes · your CLAUDE.md constitution · your git repo"**. A dotted line between the launcher
and the brains is labelled **"git init — 0 remotes, no link back"**. Caption at the bottom:
**"Everyone generates their own. You share the generator, never the brain."** Emphasize independence
and ownership. ByteByteGo explainer style, exact legible text.

---

## `board-hexagon.png` — "Hexagonal RAG: one stable port, swappable adapters"

*(SVG fallback shipped: `docs/img/board-hexagon.svg`.)*

**Prompt:** A clean architecture board titled **"Hexagonal RAG — one stable port, swappable adapters"**.
Center: a violet **hexagon** labelled **"API PORT — stable, versioned (local MCP)"** with a monospace list
inside: **"search_vault · get_document · list_documents · vault_stats · reindex"**. Above it, an amber
box **"Your harness — skills · CLAUDE.md"** with a downward arrow labelled **"depends only on the stable
contract"**. Around the hexagon, three blue dashed **"swappable"** adapter cards connected by short
connectors:
- **"Embedder — pick yours at install"** with chips **"🟢 local EmbeddingGemma · 🟡 API key (Gemini /
  your endpoint) · 🟢 Ollama"** and note **"swap it → notes & skills untouched"**.
- **"Vector store — SQLite (local)"**.
- **"Chunking strategy"** with note **"provider details stay behind the port — no vendor leak"**.
Bottom caption: **"One stable port your harness trusts · adapters you change freely (ADR 0006 / 0007)"**.
Ports-and-adapters / hexagonal-architecture diagram, ByteByteGo style, crisp labels.

---

## `board-reliability.png` — "The reliability stack" (deterministic / battle-tested)

**Prompt:** A board titled **"Battle-tested by design — the reliability stack"**, drawn as a layered
stack / pyramid of labelled bands, each with a small icon, from foundation to top:
- **"Grounded in truth"** — *semantic search answers FROM your vault · synthetic canary proves it
  (Mollecuisse / Flemmr) · fail-loud `verify-rag`"*.
- **"Determinism over guesswork"** — *pure functions · binary exit-code tools · real event triggers, not
  timers · locks & debounced reindex"*.
- **"Self-healing, desired-state"** — *idempotent reconciler (à la Kubernetes / GitOps / Terraform) ·
  never overwrites your notes · self-upgradable engine"*.
- **"Hexagonal architecture"** — *stable local MCP port · swappable adapters · open format, open license, zero
  lock-in"*.
- **"Proven engineering"** — *TDD baby-steps · green-only commits · eval-set 90% · 31 ADRs · mutation
  testing (coming)"*.
A side ribbon reads **"Fail loudly rather than pretend."** Sturdy, trustworthy, engineering-grade
infographic. ByteByteGo style, exact legible labels.

---

## `board-vs-llm.png` — "vs a bare LLM"

**Prompt:** A side-by-side comparison board titled **"Your second brain vs a bare LLM"**. Two columns:
- **Left, greyed/faded, "Bare ChatGPT / Claude":** a chat bubble with a fading/erasing memory icon,
  bullets **"Only knows what you re-paste"**, **"Forgets after the chat"**, **"Answers from training —
  may make things up"**, **"Single conversation, walled off"**.
- **Right, vibrant violet, "Your second brain":** a brain wired to a folder of notes and multiple tool
  icons (Slack, Drive, mail, calendar), bullets **"Persistent memory that grows with every question"**,
  **"Cross-cutting across all your tools"**, **"Grounded — cites its sources, with dates"**, **"Yours,
  in Markdown, in your git repo"**.
A center divider with a **"VS"** badge. Make the right side clearly the richer, trustworthy option.
ByteByteGo comparison-board style, crisp exact text.
