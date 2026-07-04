#!/usr/bin/env bash
# install.sh — MangoOS, Phase 1 (jalon C) du plan de distribution (docs/plan-distribution.md §3.4).
# Équivalent Linux/Mac de install.ps1 : installe les dépendances, Playwright, crée
# server/.env depuis server/.env.example (sans écraser un .env existant), build l'UI,
# puis lance `mango doctor`.
#
# Usage : bash install.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { echo ""; echo "==> $1"; }

step "Vérification de Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js introuvable. Installe Node 20+ (voir .nvmrc) avant de continuer."
  exit 1
fi
echo "Node détecté : $(node --version)"

step "Installation des dépendances — server/"
cd "$ROOT/server"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

step "Installation des dépendances — ui/"
cd "$ROOT/ui"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

step "Installation des navigateurs Playwright (server/)"
cd "$ROOT/server"
npx playwright install || echo "Échec de npx playwright install — relance-le manuellement dans server/ si besoin."

step "Configuration server/.env"
ENV_EXAMPLE="$ROOT/server/.env.example"
ENV_FILE="$ROOT/server/.env"
if [ -f "$ENV_FILE" ]; then
  echo "server/.env existe déjà — non modifié."
elif [ -f "$ENV_EXAMPLE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "server/.env créé à partir de server/.env.example (valeurs vides)."
  read -r -p "Clé ELEVE_API_KEY (obligatoire pour faire tourner l'Élève — Entrée pour laisser vide) : " ELEVE_KEY || true
  if [ -n "${ELEVE_KEY:-}" ]; then
    sed -i.bak "s|^ELEVE_API_KEY=.*|ELEVE_API_KEY=${ELEVE_KEY}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  fi
  read -r -p "Clé PEXELS_API_KEY (optionnelle, images réelles — Entrée pour ignorer) : " PEXELS_KEY || true
  if [ -n "${PEXELS_KEY:-}" ]; then
    sed -i.bak "s|^PEXELS_API_KEY=.*|PEXELS_API_KEY=${PEXELS_KEY}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  fi
else
  echo "server/.env.example introuvable — impossible de créer server/.env automatiquement."
fi

step "Build de l'UI"
cd "$ROOT/ui"
npm run build

step "Diagnostic final — mango doctor"
set +e
node "$ROOT/scripts/doctor.mjs"
DOCTOR_EXIT=$?
set -e

echo ""
if [ "$DOCTOR_EXIT" -eq 0 ]; then
  echo "Installation terminée — tout est vert. Lance 'node scripts/start.mjs' pour démarrer MangoOS."
else
  echo "Installation terminée avec des points à corriger (voir le rapport mango doctor ci-dessus)."
fi
exit $DOCTOR_EXIT
