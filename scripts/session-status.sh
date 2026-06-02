#!/usr/bin/env bash
# session-status.sh — calcule 2 lignes de statut de démarrage (repo + RAG) et les
# émet via le champ JSON `systemMessage` du hook SessionStart, ce qui les AFFICHE
# DIRECTEMENT sur le terminal (visible à l'écran), sans dépendre de Claude pour les
# recopier. Démarrage déterministe : tout le calcul ET l'affichage sont ici.
#
# Appelé par le hook SessionStart (cf. .claude/settings.json).
# Générique : la racine du repo est dérivée de l'emplacement du script.
# Dégrade proprement si `jq` ou `sqlite3` sont absents.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="$REPO/rag/.cache/vault.db"
cd "$REPO" || exit 0

have() { command -v "$1" >/dev/null 2>&1; }

# ─── Ligne repo : git pull --rebase + dérivation du statut ───────────────────
# (silencieux si pas de remote configuré — usage purement local)
if git remote 2>/dev/null | grep -q .; then
  PULL_OUT="$(git pull --rebase 2>&1)"
  PULL_RC=$?
else
  PULL_OUT="already up to date"
  PULL_RC=0
fi
SHORT="$(git rev-parse --short HEAD 2>/dev/null)"

if [ $PULL_RC -ne 0 ]; then
  REPO_LINE="⚠️ Pull échoué — vérifier manuellement."
elif printf '%s' "$PULL_OUT" | grep -qiE 'already up to date|déjà à jour'; then
  REPO_LINE="✅ Repo à jour (commit ${SHORT})."
else
  CHANGED="$(git diff --name-only ORIG_HEAD HEAD 2>/dev/null | grep -c . )"
  REPO_LINE="📥 Repo mis à jour — ${CHANGED} fichier(s) modifié(s) (commit ${SHORT})."
fi

# ─── Ligne RAG : docCount (db) vs fichiers .md sur disque ────────────────────
SCANNED="$(find vault -name '*.md' 2>/dev/null | grep -c .)"
if have sqlite3; then
  DOCS="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM documents;' 2>/dev/null)"
else
  DOCS=""
fi

if [ -z "$DOCS" ] || [ -z "$SCANNED" ] || [ "$SCANNED" -eq 0 ] 2>/dev/null; then
  if [ "$SCANNED" -eq 0 ] 2>/dev/null; then
    RAG_LINE="🧠 RAG : vault vide — ajoute des notes Markdown dans vault/ puis lance 'cd rag && npm run reindex'."
  else
    RAG_LINE="🧠 RAG : statut indisponible (serveur en démarrage, ou sqlite3 absent)."
  fi
else
  REMAINING=$(( SCANNED - DOCS ))
  if [ "$REMAINING" -le 0 ]; then
    RAG_LINE="🧠 RAG à jour — ${DOCS}/${SCANNED} fichiers indexés."
  else
    RAG_LINE="🧠 RAG : ${DOCS}/${SCANNED} fichiers indexés, ${REMAINING} en attente — rattrapage auto en tâche de fond."
  fi
fi

# ─── Émission via systemMessage : s'affiche directement sur le terminal ──────
MSG="$(printf '%s\n%s' "$REPO_LINE" "$RAG_LINE")"
if have jq; then
  jq -n --arg msg "$MSG" \
    '{hookSpecificOutput: {hookEventName: "SessionStart"}, systemMessage: $msg}'
else
  # Fallback sans jq : échappement minimal pour un JSON valide.
  ESC="$(printf '%s' "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS="\\n"}{print}' | sed 's/\\n$//')"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart"},"systemMessage":"%s"}\n' "$ESC"
fi
