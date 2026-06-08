<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUT : 🔬 ÉTUDE / VEILLE (créé 2026-06-08) — RIEN D'ACTÉ, exploration.    -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Étude — Sortir le RAG de Gemini : critères + veille (embedders locaux, GraphRAG, eval)

> **STATUT : 🔬 ÉTUDE / VEILLE** (créé le 2026-06-08). **Rien n'est acté ici** — c'est la note
> d'exploration qui alimentera des décisions (ADR) et le plan d'implémentation
> [`embedder-spi.md`](embedder-spi.md). Le choix d'un 2ᵉ embedder/stratégie se fait **après
> mesure** (cf. §6), pas sur intuition.
>
> **Origine :** demande de **Dimitry Ernot** (« pouvoir utiliser autre chose que Google Gemini » —
> Betclic a ChatGPT packagé + Claude Code ; sa femme un outil Mistral) + pistes de **Gaël Bernier**
> (REX VIF à la Nuit des communautés de Nantes, 28/05 : LightRAG/GraphRAG, LangFuse, LLM-as-judge,
> human-in-the-loop).

---

## 1. Les critères de l'étude (validés avec Thomas, 2026-06-08)

Par ordre d'importance. Un candidat doit **idéalement** tous les satisfaire (Thomas reconnaît que
les cocher tous à la fois « va être compliqué » — d'où la mesure, et l'offre à plusieurs niveaux).

1. **Gratuit** — pas de paiement (sortir du tier payant Gemini).
2. **Privacy** — local / **on-device** : le vault est encodé et fouillé **sur la machine de
   l'utilisateur**, pas envoyé à une API cloud tierce.
3. **Cross-plateforme — tourne sur Mac ET PC (Windows)** (et idéalement Linux). Pas de solution
   Mac-only ou qui suppose un GPU NVIDIA.
4. **Tourne sur un poste bureautique** — machine **modeste, sans GPU dédié** (le « Mac nu
   d'Achille » est l'étalon). C'est le **profil par défaut** : il faut que ça marche pour un
   non-dev sur un laptop standard.
5. **Offre RAG à plusieurs niveaux (tiered).** On peut proposer un **profil RAG plus costaud**
   (modèles plus gros, GraphRAG, reranking lourd) à ceux qui ont une **grosse machine** (GPU / RAM).
   → Le profil par défaut reste bureautique ; le profil costaud est **opt-in**.

> **Ce qui rend ça possible architecturalement :** le **port SPI `Embedder`** (plan
> [`embedder-spi.md`](embedder-spi.md)) + l'estampille d'identité de l'index. C'est lui qui permet
> d'offrir **plusieurs profils** (bureautique / grosse machine / cloud-avec-clé) sans toucher au
> harnais ni au contrat MCP (ADR
> [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)).

### Cadrage honnête — où s'arrête vraiment la privacy

Le cerveau **tourne dans Claude** (ADR
[`../decisions/0004-claude-only-pour-l-instant.md`](../decisions/0004-claude-only-pour-l-instant.md)).
Donc la couche qui **répond** envoie déjà questions + passages récupérés à Anthropic (cloud). **Le
seul morceau qu'on peut rendre 100 % local, c'est le RAG** (embeddings + index + recherche).

⇒ L'objectif **atteignable et honnête** : *« le RAG ne dépend plus d'une API cloud payante
(Google) ; le vault est encodé et fouillé entièrement sur la machine »*. C'est réel, shippable, et
répond pile à Dimitry (sortir de Google) **et** aux critères 1–4. Ne pas survendre « tout est
privé » : le LLM qui répond reste Claude.

---

## 2. Le constat technique qui conditionne tout

L'index stocke les vecteurs en **BLOB `Float32` brut**, **sans trace du modèle** (ni provider, ni
**dimension**) — cf. `rag/src/lib/vector-store.ts`. Or chaque embedder a sa dimension propre
(Gemini ≈ 768–3072 selon config, bge-m3 = 1024, nomic = 768, Qwen3-8B = 4096). Swapper **sans
réindexer** ⇒ recherche **silencieusement fausse**. D'où, dans le plan SPI : **estampille
d'identité + confirm-gate** (on explique, on attend le « oui », jamais de réindex dans le dos).

---

## 3. Veille embedders — filtrée par les critères (état 2026)

| Option | Gratuit | Local/privé | Cross-OS | Bureautique | Qualité FR | Verdict |
|---|---|---|---|---|---|---|
| **Gemini** (actuel) | ❌ payant | ❌ cloud | n/a | n/a | 66.2 (MTEB FR) | **À remplacer** — échoue 1 & 2 |
| **bge-m3** (568M, 1024-dim) | ✅ | ✅ | ✅ | ✅ (~1–2 Go) | bon, multilingue *battle-tested* 100+ langues | **Candidat #1 profil bureautique** |
| **nomic-embed v2** (137M, 768-dim) | ✅ | ✅ | ✅ | ✅✅ ultra-léger | probablement faible (anglo-centré) | « rapide partout », **qualité FR à vérifier** |
| **Qwen3-Embedding-0.6B** | ✅ | ✅ | ✅ | ✅ | **inconnue** (le 8B=69.8 mais pas le petit) | À **benchmarker** |
| **Qwen3-Embedding-8B** (4096-dim) | ✅ | ✅ | ❌ exige A100 40 Go | ❌ | **69.8** (meilleur) | **Profil grosse machine** uniquement |

**À noter :** Gemini n'est même pas le meilleur en FR (66.2 < Qwen3 69.8). On ne sacrifie pas
forcément la qualité en partant — **à mesurer, pas à supposer.**

**Mapping sur l'offre tiered (critère 5) :**
- **Profil bureautique (défaut)** : `bge-m3` (ou `nomic` si priorité vitesse) via **Ollama** —
  gratuit, privé, Mac/PC, machine modeste.
- **Profil grosse machine (opt-in)** : `Qwen3-Embedding` gros + reranking + éventuellement GraphRAG.
- **Profil cloud (opt-in, hors privacy)** : Gemini (ou autre API) pour qui accepte clé + cloud et
  veut zéro install locale. C'est l'option « zéro friction » pour non-dev sans Ollama.

---

## 4. LightRAG / GraphRAG (repo pointé par Thomas : <https://github.com/HKUDS/LightRAG>)

- **Licence MIT** ✅. **Full-local POSSIBLE** : LLM via Ollama + embeddings locaux + **stockage
  fichier par défaut** (aucun service externe obligatoire ; Neo4j/Postgres/Milvus optionnels) ✅.
- **Mais le point dur** : l'extraction entités/relations exige un **LLM capable** — README **testé
  sur des modèles ~30B**, prévient que les petits (7B/13B) ne garantissent pas la qualité.
  Indexation **lourde** : **un appel LLM par chunk**.
- **Verdict vs critères** : *gratuit + privé* = faire tourner un **LLM ~30B en local** → **hors
  profil bureautique** (impensable sur le Mac nu d'Achille ; lent même sur une bonne machine).
  Le rendre fluide = LLM cloud = **payant + fuite**. ⇒ **En tension frontale avec les critères
  1–4.** À réserver au **profil grosse machine** / track R&D power-user. **Pas le défaut.**

**Pertinence sur le fond :** un second cerveau perso est **très riche en entités/relations**
(personnes, décisions, réunions, 1-1, initiatives), donc GraphRAG **mappe bien** sur le cas — ce
n'est pas du hype. Mais à n'attaquer **que si l'eval prouve** que le retrieval plat plafonne.

---

## 5. Pistes intermédiaires de la veille

- **Contextual Retrieval (Anthropic)** : enrichir chaque chunk d'un mini-contexte avant embedding →
  **−35 % à −49 %** d'échecs de retrieval, **−67 %** avec reranking, **sans graphe**. Version
  canonique = Claude à l'indexation (**payant + cloud** → échoue les critères tel quel). **Version
  gratuit+privé** = même technique avec un **LLM local** pour générer le contexte → **bien plus
  léger que LightRAG**. À garder en réserve.
- **Reranking local** (cross-encoder : `bge-reranker`, `Qwen3-reranker`) : d'après la veille,
  **l'upgrade qualité au meilleur ratio** — gratuit, privé, s'ajoute après la recherche dense.
  Candidat fort une fois l'embedder local en place.
- **Hybrid search (BM25 + dense + reciprocal rank fusion)** : gain consistant, 100 % local, pas de
  modèle supplémentaire. À considérer.

---

## 6. Eval-first — la pièce maîtresse (et c'est dans l'ADN du projet)

Le REX VIF insiste : l'**évaluation** est « indispensable, souvent mise de côté » (LangFuse,
**LLM-as-judge**, **human-in-the-loop**). Et Thomas en a **déjà la graine** : le **canari
« Mollecuisse »** de `scripts/verify-rag.mjs` *est* un mini-eval (il prouve que la réponse vient du
vault).

⇒ **Avant** de choisir un embedder/stratégie, se faire un **eval-set local** (15–20 questions →
réponse attendue, sur le vrai vault), **juge = Claude** (déjà dans la boucle, usage occasionnel =
acceptable). Ça transforme « compliqué / risqué » en **« mesuré »** — exactement la façon de bosser
de Thomas (valider empiriquement, pas de sur-ingénierie contre un risque non prouvé).

- **Outils repérés** (au cas où on industrialise plus tard) : **RAGAS** (léger, spécifique RAG,
  sans ground-truth), **DeepEval**, **TruLens** ; **LangFuse** = observabilité self-hostable mais
  **= infra** → ne pas y aller avant d'avoir la question. Démarrer par un **script local façon
  `verify-rag`** donne 90 % de la valeur sans infra.

---

## 7. Séquence recommandée (recalée sur les critères)

1. **Finir le port `Embedder`** (plan [`embedder-spi.md`](embedder-spi.md)) — l'**instrument**.
2. **Eval-set local** (juge = Claude). Peu de code, levier énorme.
3. **Brancher `bge-m3` (+ `nomic`) via Ollama** derrière le port et **MESURER** vs Gemini sur du FR
   → réponse **chiffrée** à Dimitry, et choix du **profil bureautique** par défaut.
4. **Reranker local** si l'eval montre un gain.
5. **Profil grosse machine** (Qwen3 gros / GraphRAG-LightRAG / Contextual Retrieval) **seulement si**
   l'eval prouve un plafond — en assumant le coût LLM local.

---

## 8. Sources de la veille

- [Ailog — Embedding Models 2026 (benchmark)](https://app.ailog.fr/en/blog/news/embedding-models-2026)
- [BentoML — Open-Source Embedding Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [AI Learning Guides — RAG in Production 2026 (GraphRAG, hybrid, evals)](https://ailearningguides.com/rag-production-patterns-2026/)
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [LightRAG — HKUDS (repo)](https://github.com/HKUDS/LightRAG)
- [Atlan — RAGAS / TruLens / DeepEval comparison 2026](https://atlan.com/know/llm-evaluation-frameworks-compared/)
