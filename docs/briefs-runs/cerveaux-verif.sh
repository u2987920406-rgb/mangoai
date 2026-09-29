#!/usr/bin/env bash
# Preuve rejouable de la configuration des cerveaux MangoOS / MangoQA — 2026-09-29.
# Élève = deepseek-v4.1-flash · Maître (escalade) = opus (Opus 5.5) · MangoQA = sonnet 5 (primaire)
# Usage: bash /home/raf/projets/mangoai/cerveaux-verif.sh
set -u
M=/home/raf/projets/mangoai
Q=/home/raf/projets/mangoqa

echo "### §1 — résolution du profil Élève (partition deepseek)"
cd "$M/server" && npx tsx src/tests/test-models.ts 2>&1 | grep -E '\[14\]|deepseek|✅|❌' | head -12

echo
echo "### §2 — getBrain(codeur) : ce que le serveur lit VRAIMENT"
cat > /tmp/probe-brain.ts <<'EOF'
import { getBrain } from "/home/raf/projets/mangoai/server/src/brain/brain-registry.js";
import { ELEVE_MODEL, PROFILE } from "/home/raf/projets/mangoai/server/src/eleve/provider.js";
const c = getBrain("codeur");
console.log(JSON.stringify({ codeur: c, eleveModel: ELEVE_MODEL, profil: PROFILE.id, agentic: PROFILE.agentic ?? false }, null, 1));
EOF
cd "$M/server" && npx tsx /tmp/probe-brain.ts 2>&1 | tail -20

echo
echo "### §3 — défauts du MAÎTRE (escalade) = opus"
grep -n 'maitreModel = opts.maitreModel' "$M/server/src/eleve/relay-config.ts"
grep -n 'CRON_MAITRE_MODEL ?? ' "$M/server/src/cron-scheduler.ts"
grep -n 'TRAIN_ESCALATE_MODEL ?? ' "$M/server/src/train-loop.ts"

echo
echo "### §4 — MangoQA : cerveau d'audit (primaire) et REPLI souverain"
grep -nE '^QA_MODEL=|^QA_OLLAMA_MODEL=' "$Q/.env"
grep -n 'deps.ask ??\|deps.askFallback ??' "$Q/src/llm.ts"
# Le repli doit être JOIGNABLE : on appelle le vrai endpoint du repli (api/chat).
set -a; . "$Q/.env"; set +a
code=$(curl -s -m 30 -o /tmp/qa-fallback.json -w '%{http_code}' "$OLLAMA_URL/api/chat" \
  -H "Authorization: Bearer $OLLAMA_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$QA_OLLAMA_MODEL\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"Réponds par un seul mot: vert\"}]}")
echo "repli Ollama -> HTTP $code"
python3 -c "import json;d=json.load(open('/tmp/qa-fallback.json'));print('  modèle servi:',d.get('model'),'| réponse:',repr((d.get('message') or {}).get('content')))" 2>/dev/null || true

echo
echo "### §5 — non-régression"
cd "$M/server" && npm run typecheck 2>&1 | tail -2 && echo "TYPECHECK=$?" && npm test 2>&1 | grep TOTAL
cd "$Q" && npm run typecheck 2>&1 | tail -2 && echo "TYPECHECK_QA=$?" && npx vitest run 2>&1 | tail -4

echo
echo "### §6 — aucun fichier supprimé"
cd "$M" && git status --short | grep -cE '^ ?D' ; echo "(0 attendu)"
