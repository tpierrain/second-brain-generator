# ADR 0003 — Pas (encore) d'upgradabilité des capacités des cerveaux générés

- **STATUT :** ACTÉ (2026-06-05).
- **Lié :** [`0001-launcher-vs-brain.md`](0001-launcher-vs-brain.md) (le lien launcher→cerveau est
  sévré « par construction » — c'est la cause de cette conséquence), [`0002-installateur-maison-vs-plugin.md`](0002-installateur-maison-vs-plugin.md).

## Contexte

Par l'ADR 0001, le bootstrap **copie** les fichiers suivis du launcher dans le cerveau puis
`git init` dedans → **aucun lien vers le launcher, par construction**. Conséquence directe : un
cerveau, une fois généré, est **figé à la version du jour de l'install**. Si le moteur RAG ou une
skill du générateur est amélioré plus tard, les cerveaux déjà créés n'en profitent pas
automatiquement.

La question : faut-il bâtir, maintenant, un mécanisme d'**upgrade** des capacités (canal de
distribution versionné, moteur en package externe, `update` qui réinjecte skills/moteur) ?

## Décision

**Non — pas pour l'instant.** On n'ajoute aucun mécanisme d'upgrade des capacités des cerveaux
générés. Ce n'était pas le sujet du produit, et trois raisons le justifient :

1. **Ce n'est pas le problème qu'on résout.** Le but est de *donner à chacun un second cerveau qui
   lui appartient*, pas de maintenir une flotte de cerveaux synchronisés sur une version centrale.
2. **Coût/complexité disproportionnés** vs. ce qu'il fallait livrer : rendre le moteur updatable
   (package externe versionné, compat ascendante de l'index, canal de distribution, migrations)
   est un chantier à part entière, qui mange le temps du cœur du produit et **fragiliserait
   l'auto-suffisance** acquise en ADR 0001.
3. **L'itération locale suffit et est simple pour tout le monde.** Comme le cerveau **est** un
   dépôt git possédé, avec ses skills et sa constitution **en local**, chaque utilisateur peut
   **se rajouter / modifier ses propres skills maison** directement, sans attendre une release
   amont. L'évolution se fait *par* l'utilisateur, *dans* son cerveau — ce qui est cohérent avec
   l'esprit « générateur, pas produit unique » (cf. README).

## Conséquences

- **Garantit l'auto-suffisance et l'absence de dépendance amont :** rien à mettre à jour, rien qui
  casse parce qu'une version distante a bougé ; le cerveau reste fonctionnel hors-ligne, pour
  toujours, tel qu'il a été généré.
- **Garantit la liberté d'itération locale :** l'utilisateur diverge librement (skills maison,
  constitution adaptée) sans conflit avec un upstream — c'est une *fonctionnalité*, pas un manque.
- **Coûte la propagation des correctifs :** un bug corrigé dans le moteur du générateur **ne
  remonte pas** dans les cerveaux déjà créés. Tant que la base d'utilisateurs est petite/proche,
  c'est tenable (regénérer, ou copier le fix à la main). Ça deviendra douloureux à l'échelle —
  d'où la réévaluation prévue.
- **Invariant à ne pas violer :** si un mécanisme d'upgrade est introduit un jour, il **ne doit pas
  reprendre la souveraineté du cerveau** — pas d'auto-update silencieux, pas de lien amont
  obligatoire, pas d'écrasement des skills/constitution personnalisés de l'utilisateur. L'upgrade
  devra rester **opt-in** et **non destructif** des divergences locales.

## Alternatives écartées

- **Moteur RAG en package npm externe** (`npx @…/vault-rag`) — débloque les updates « gratuitement »
  au prochain run, mais réintroduit une dépendance de version (offline, rug-pull, compat d'index)
  qui contredit l'auto-suffisance d'ADR 0001. Bon candidat **plus tard**, pas maintenant.
- **Commande `update` qui re-tire skills + moteur depuis un launcher de référence** — recrée un
  couplage launcher→cerveau qu'on a justement supprimé en 0001, et pose le risque d'écraser les
  personnalisations locales. Écarté tant que le besoin n'est pas prouvé par des feedbacks.

## À reconsidérer quand

La publication internationale (cf. plan `translate-to-english.md`) élargira la base d'utilisateurs :
c'est **à ce moment** que « pas de propagation des correctifs » pourra devenir un vrai point de
douleur. Décision à rouvrir **sur feedbacks réels**, en visant probablement l'hybride évoqué en
ADR 0002 (moteur updatable + cerveau/vault toujours possédé et non écrasé).
