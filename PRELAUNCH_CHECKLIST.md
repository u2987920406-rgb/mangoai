# Checklist de pré-lancement — pipelines "zéro intervention"

Née le 2026-07-14 : un run "3 apps complexes" a été relancé avec l'assurance
que "tout est bien câblé", mais MangoQA (dépendance d'EXÉCUTION, pas de
config) était mort sans que je le vérifie — j'avais couvert le câblage
modèle (3 registres) mais pas la vivacité des services externes. Cette
checklist existe pour que ce genre de trou ne dépende plus de ma mémoire
d'instant T (fragile, sujette à la compaction de contexte) mais d'un
fichier relu à chaque fois.

**À lire et dérouler AVANT tout lancement d'un pipeline long/autonome**
(`run-*-apps.ts`, `run-mango-nuit.ts`, tout script `_prove-*` en conditions
réelles, tout test de bout en bout sans supervision humaine continue).

## 1. Services externes VIVANTS (pas juste configurés)

- [ ] **Ollama** répond : `curl -s http://localhost:11434/api/tags` → 200.
- [ ] **MangoQA** actif si l'audit qualité doit compter dans le run :
      lire `workspace/.mangoqa-active`, vérifier que `heartbeat` a moins de
      5 min. Si absent/périmé → **process mort**, pas juste "lent" :
      `cd D:\IA\MangoQA && npm start` (arrière-plan) et RE-vérifier la
      sentinelle avant de considérer le point coché.
- [ ] Port 3000 (backend Express) pas squatté par un orphelin — voir
      règle dédiée dans `CLAUDE.md` (« Vérification anti-serveur-orphelin »).

## 2. Cohérence du câblage modèle (si un changement de modèle/tag a eu lieu)

Un modèle Élève est référencé à **3 endroits distincts, jamais unifiés
automatiquement** (voir `limites.md`) :
- [ ] `server/.env` → `ELEVE_MODEL` (+ `ELEVE_PROVIDER`)
- [ ] `server/data/brain-registry.json` → tous les rôles concernés
      (pas seulement `codeur` — `orchestrateur`, `forgeron`, `juge`, etc.)
- [ ] `server/src/brain/brain-registry.ts` → `DEFAULT_REGISTRY` (repli de
      dernier recours si le fichier JSON est absent/corrompu)

Vérifier que les 3 pointent vers le **même tag**, et que `resolveProfile()`
(`server/src/models/profile.ts`) route bien vers le profil attendu (tester
via `npx tsx src/tests/test-models.ts` si un profil a changé).

- [ ] **Le modèle EXISTE encore chez le fournisseur** (leçon 2026-09-29, cf.
      `limites.md` L147). Un tag cloud peut être **retiré** sans prévenir :
      `deepseek-v4-flash:0731` a été retiré par Ollama le 2026-09-25 et **8 des
      15 rôles** le portaient encore — tout build qui les sollicitait mourait en
      HTTP 400, **invisible pour tous les tests** (`resolveProfile` ne valide que
      le NOM du profil, jamais la disponibilité du modèle). Contrôle en une
      commande, à faire pour CHAQUE id présent dans le registre :

      ```bash
      cd server && K=$(grep -h '^OLLAMA_API_KEY=' .env | cut -d= -f2-)
      python3 -c "import json;d=json.load(open('data/brain-registry.json'));print('\n'.join(sorted({v['model'] for v in d.values() if isinstance(v,dict) and v.get('model')})))" \
        | while read m; do
            code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' https://ollama.com/v1/chat/completions \
              -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
              -d "{\"model\":\"$m\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}]}")
            [ "$code" = "200" ] && echo "  OK   $m" || echo "  MORT $m (HTTP $code)"
          done
      ```

      Un `MORT` n'est pas un avertissement : c'est un rôle du pipeline qui ne
      répond plus. Réaligner AVANT de lancer.

## 3. Cohérence prompt ↔ chemin réellement emprunté

Un changement de modèle/profil peut faire basculer silencieusement un
script d'un chemin CONTRAT (`<write>/<edit>/<run>`, pas d'outils) vers le
chemin AGENTIQUE (function-calling réel : `chercher_image`, `planifier`,
`teste_parcours`, `check_build`…), ou inversement — `resolveRelayConfig`
choisit sur la base de `callProfile.agentic`, sans prévenir. **Avant de
relancer un script de test qui embarque son propre prompt "COMMON"**,
relire ce prompt et vérifier qu'il ne promet/interdit pas des outils qui
ne correspondent plus au chemin réel (sinon on contredit activement le
modèle sur ce qu'il peut faire).

## 4. Capacité matérielle

- [ ] VRAM : `nvidia-smi --query-gpu=memory.used,memory.free --format=csv`
      — marge suffisante pour le modèle chargé à son `OLLAMA_NUM_CTX`
      actuel (voir commentaire `.env` pour les paliers mesurés sur la
      GTX 1080 Ti : 32768=sûr large, 49152=sûr correct, 65536=fragile,
      131072+=offload CPU, à éviter).

## 5. Hygiène du run lui-même

- [ ] `tsc --noEmit` propre avant de lancer.
- [ ] État précédent (`.run-*.state.json`) nettoyé si on veut un run
      honnête depuis zéro (sinon les projets déjà marqués "done" seront
      silencieusement sautés).
- [ ] Filet de reprise posé (`TaskCreate` + heartbeat `CronCreate`
      ~23 min) pour tout run non trivial (> ~15 min estimées) — règle
      déjà en place dans `CLAUDE.md`.

## 6. À la fin

- [ ] Lire le bilan produit, rapporter honnêtement (succès ET échecs),
      consigner toute limite réelle dans `limites.md`.
- [ ] Nettoyer les scripts `_prove-*` jetables une fois le résultat
      exploité.
