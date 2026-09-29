#!/usr/bin/env bash
# Vérification rejouable du lot 1 MangoOS — mesure (D1), cache registre (D7), doc/outils (D8).
# Usage: bash /home/raf/projets/mangoai/lot1-verif.sh
set -u
ROOT=/home/raf/projets/mangoai
cd "$ROOT/server" || exit 1

echo "### §1 — C1 : typecheck (attendu : exit 0)"
npm run typecheck 2>&1 | tail -4
echo "TYPECHECK_EXIT=${PIPESTATUS[0]}"

echo
echo "### §1b — C1 : tier smoke (attendu : 12 PASS · 0 FAIL)"
node --import tsx src/test-runner.ts --tier smoke 2>&1 | tail -5

echo
echo "### §2 — D1 : le champ usage est lu, cumulé, et compté comme NON mesuré quand absent"
node --import tsx src/test-runner.ts --tier full 2>&1 | grep -E 'test-(llm-usage|brain-registry-cache)'

echo
echo "### §3 — D7 : deux lectures = une seule lecture disque ; mtime modifié = relecture"
grep -nE "diskReads|mtime" src/tests/test-brain-registry-cache.ts | head -8

echo
echo "### §4 — D8 : plus aucune référence d'ÉTAT COURANT au mauvais chemin"
echo "-- occurrences dans les documents d'état (doivent être en négation « n'existe pas/plus ») :"
grep -rn "server/src/data" "$ROOT"/*.md | grep -vE "audit-opus|lot1-|historique.md" | head -6
echo "-- occurrences dans historique.md (journal daté : NON réécrit, décision assumée) :"
grep -c "server/src/data" "$ROOT"/historique.md

echo
echo "### §5 — C5 : aucun fichier supprimé, aucun nouveau fichier hors livrables"
git -C "$ROOT" status --short | grep -cE '^ D|^D ' | sed 's/^/fichiers supprimés: /'
git -C "$ROOT" status --short
