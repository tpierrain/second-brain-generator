# vault/ — Your content

This is where **your notes** live: the substrate the RAG indexes and Claude
queries. Everything is Markdown, Obsidian-compatible.

> The notes below (`daily/`, `people/`, `topics/`…) revolve around an **invented parody
> company** (Flemmr, which "industrializes procrastination") — deliberately **impossible to
> confuse** with real work notes. They just let you see how it works from the very first question.
> Delete them when you start your real vault (remove the files under `vault/`) — or keep them as
> templates.

## Folders

| Folder | For what | Editing |
|---|---|---|
| `daily/` | The day's note, one per day (`YYYY-MM-DD.md`) | **Append-only** — never edited after the fact |
| `people/` | One note per person (`first-last.md`) | Living — append dated sections |
| `topics/` | One note per subject (`subject-kebab.md`) | Living |
| `decisions/` | One decision = one file (`YYYY-MM-DD-title.md`) | Immutable (supersede, don't rewrite) |
| `meetings/` | Minutes (`YYYY-MM-DD-title.md`) | Immutable |
| `backlog/` | Lists of open/closed actions | Living (tick, don't erase) |

Add whatever folders you need — the structure is free, the RAG indexes every `.md`.

## Workflow

1. You write / Claude writes notes here.
2. The RAG indexes them (auto at startup, or `cd rag && npm run reindex`).
3. You ask questions → Claude answers from the vault, sources cited as `[[backlinks]]`.
