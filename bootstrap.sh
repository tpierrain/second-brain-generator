#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# bootstrap.sh — installateur interactif du Second Brain Starter
# Vérifie les prérequis, personnalise le harnais, installe le moteur RAG.
# Idempotent : peut être relancé sans casse.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Couleurs ────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; X=$'\033[0m'
else
  B=""; G=""; Y=""; R=""; C=""; X=""
fi
ok()   { printf '%s✓%s %s\n' "$G" "$X" "$1"; }
warn() { printf '%s!%s %s\n' "$Y" "$X" "$1"; }
err()  { printf '%s✗%s %s\n' "$R" "$X" "$1" >&2; }
step() { printf '\n%s━━ %s%s\n' "$B" "$1" "$X"; }

printf '%s\n' "${B}${C}"
cat <<'BANNER'
  ╔══════════════════════════════════════════════╗
  ║        Second Brain Starter — bootstrap      ║
  ╚══════════════════════════════════════════════╝
BANNER
printf '%s' "$X"

# ── 1. Prérequis ────────────────────────────────────────────────────────────
step "1/6 · Vérification des prérequis"
MISSING=0
check() {
  if command -v "$1" >/dev/null 2>&1; then ok "$1 trouvé ($($2 2>/dev/null | head -1))"
  else err "$1 manquant — $3"; MISSING=1; fi
}
check git  "git --version"  "installe-le : https://git-scm.com"
check node "node --version" "installe Node ≥ 18 : https://nodejs.org (ou 'brew install node')"
check npm  "npm --version"  "fourni avec Node.js"

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
    err "Node ${NODE_MAJOR} trop ancien — il faut Node ≥ 18."; MISSING=1
  fi
fi
# Optionnels (améliorent la ligne de statut au démarrage)
command -v jq      >/dev/null 2>&1 && ok "jq trouvé (optionnel)"      || warn "jq absent (optionnel — 'brew install jq' pour un statut plus riche)"
command -v sqlite3 >/dev/null 2>&1 && ok "sqlite3 trouvé (optionnel)" || warn "sqlite3 absent (optionnel — statut RAG au démarrage dégradé)"

if [ "$MISSING" -ne 0 ]; then
  err "Prérequis manquants — corrige les points ci-dessus puis relance ./bootstrap.sh"
  exit 1
fi

# ── 2. Personnalisation ─────────────────────────────────────────────────────
step "2/6 · Personnalisation du harnais"
DEFAULT_PROJECT="$(basename "$ROOT")"
ask() { # ask VARNAME "prompt" "default"
  local __var="$1" __prompt="$2" __def="${3:-}" __ans=""
  if [ -n "$__def" ]; then printf '%s %s[%s]%s : ' "$__prompt" "$C" "$__def" "$X"
  else printf '%s : ' "$__prompt"; fi
  read -r __ans || __ans=""
  [ -z "$__ans" ] && __ans="$__def"
  printf -v "$__var" '%s' "$__ans"
}

if [ -t 0 ]; then
  ask PROJECT_NAME  "Nom du projet"                       "$DEFAULT_PROJECT"
  ask OWNER_NAME    "Ton nom"                             "$(git config user.name 2>/dev/null || echo '')"
  ask OWNER_CONTEXT "Ton contexte (ex: CTO d'une scale-up)" "usage professionnel"
  ask LANGUAGE      "Langue par défaut des notes"          "français"
else
  warn "Entrée non interactive — valeurs par défaut utilisées."
  PROJECT_NAME="$DEFAULT_PROJECT"; OWNER_NAME=""; OWNER_CONTEXT="usage professionnel"; LANGUAGE="français"
fi

# ── 3. Clé Gemini ───────────────────────────────────────────────────────────
step "3/6 · Clé API Google Gemini (pour le RAG)"
GEMINI_KEY=""
if [ -f .env ] && grep -q '^GOOGLE_GEMINI_API_KEY=.\+' .env 2>/dev/null; then
  ok ".env existe déjà avec une clé — conservée."
else
  printf 'Clé gratuite : %shttps://aistudio.google.com/apikey%s\n' "$C" "$X"
  if [ -t 0 ]; then
    printf 'Colle ta clé Gemini (ou Entrée pour configurer plus tard) : '
    read -r GEMINI_KEY || GEMINI_KEY=""
  fi
fi

# ── 4. Génération des fichiers ──────────────────────────────────────────────
step "4/6 · Génération des fichiers personnalisés"
gen() { # gen template output  (puis remplace les placeholders restants)
  local tpl="$1" out="$2"
  if [ -f "$out" ]; then warn "$out existe déjà — laissé tel quel (supprime-le pour régénérer)."; return; fi
  sed -e "s|{{PROJECT_ROOT}}|$ROOT|g" \
      -e "s|{{PROJECT_NAME}}|$PROJECT_NAME|g" \
      -e "s|{{OWNER_NAME}}|$OWNER_NAME|g" \
      -e "s|{{OWNER_CONTEXT}}|$OWNER_CONTEXT|g" \
      -e "s|{{LANGUAGE}}|$LANGUAGE|g" \
      -e "s|{{SOURCE_1}}|(ta source)|g" \
      "$tpl" > "$out"
  ok "généré : $out"
}
gen CLAUDE.md.template            CLAUDE.md
gen .mcp.json.template            .mcp.json
gen .claude/settings.json.template .claude/settings.json

# .env
if [ ! -f .env ]; then
  cp .env.example .env
  ok "généré : .env (depuis .env.example)"
fi
if [ -n "$GEMINI_KEY" ]; then
  # remplace la ligne de clé
  if grep -q '^GOOGLE_GEMINI_API_KEY=' .env; then
    sed -i.bak "s|^GOOGLE_GEMINI_API_KEY=.*|GOOGLE_GEMINI_API_KEY=$GEMINI_KEY|" .env && rm -f .env.bak
  else
    printf 'GOOGLE_GEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> .env
  fi
  ok "clé Gemini enregistrée dans .env"
fi
chmod +x scripts/session-status.sh 2>/dev/null || true

# ── 5. Installation du moteur RAG ───────────────────────────────────────────
step "5/6 · Installation du moteur RAG (npm install)"
( cd rag && npm install --silent ) && ok "dépendances RAG installées" \
  || { err "npm install a échoué dans rag/ — relance 'cd rag && npm install'"; exit 1; }

# ── 6. Indexation initiale (si clé présente) ────────────────────────────────
step "6/6 · Indexation initiale du vault d'exemple"
if grep -q '^GOOGLE_GEMINI_API_KEY=.\+' .env 2>/dev/null; then
  if ( cd rag && npm run --silent index ); then
    ok "vault d'exemple indexé"
  else
    warn "Indexation interrompue (quota/clé ?) — elle reprendra au prochain démarrage de Claude Code."
  fi
else
  warn "Pas de clé Gemini → indexation reportée. Ajoute la clé dans .env puis : cd rag && npm run index"
fi

# ── Fin ─────────────────────────────────────────────────────────────────────
printf '\n%s%s✓ Bootstrap terminé.%s\n\n' "$B" "$G" "$X"
cat <<EOF
Prochaines étapes :
  1. ${C}claude${X}                 ← ouvre Claude Code dans ce dossier
  2. Pose une question, ex. :
     ${C}"Quelle base de données a-t-on choisie pour la facturation et pourquoi ?"${X}
     → Claude répond depuis le vault, sources citées.
  3. Remplace les notes d'exemple par les tiennes, édite ${C}CLAUDE.md${X} à ton image.

Doc complète : ${C}SETUP.md${X}
EOF
