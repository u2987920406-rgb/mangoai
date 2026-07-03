# Plan de distribution — MangoOS + MangoQA installables chez un tiers

> Demande de Raf (2026-07-03) : « pouvoir que MangoOS et MangoQA soient téléchargeables et installables chez un tiers, exactement comme un logiciel qu'on télécharge et qui s'installe sur notre PC ». Ce document décrit COMMENT y arriver, les options comparées, et une roadmap chiffrée.

## 1. Le point de départ (ce qu'on a aujourd'hui)

MangoOS n'est pas un `.exe` : c'est **deux serveurs Node** (backend Express `server/` port 3000, UI Vite `ui/` port 5173) + un dossier `workspace/` de projets générés. MangoQA est un **watcher Node séparé**. Aucun n'a de packaging.

**Ce qui doit voyager** : le code des deux repos (hors `node_modules`, régénérables), et **ce qui NE peut PAS voyager** : `server/.env` (secrets de Raf), `workspace/` (ses projets), les modèles Ollama. Un tiers doit fournir SES propres clés.

**Dépendances externes qu'un tiers doit avoir** (le vrai défi — c'est plus qu'un `.exe`) :
- **Node.js 20+** (runtime) et npm.
- **Ollama** installé + les modèles cloud configurés (GLM-5.2, qwen3.5) OU des clés cloud (le moteur = `ELEVE_API_KEY` sur `ollama.com/v1` aujourd'hui).
- **Un navigateur** pour Playwright (msedge/chrome) — la vision.
- **Clés API** : au minimum l'Élève (obligatoire), Pexels (images réelles), optionnels GitHub/Figma/Krea.

C'est pourquoi « comme un logiciel » demande un **installeur qui orchestre ces prérequis**, pas juste une copie de fichiers.

## 2. Trois options comparées

| Option | Expérience tiers | Effort | Verdict |
|--------|------------------|--------|---------|
| **A. Installeur natif Windows** (Inno Setup / NSIS + Node embarqué) | Double-clic `.exe` → assistant → icône bureau → l'app s'ouvre. LE plus proche de « comme un logiciel ». | L | **Recommandé pour la cible finale** — c'est ce que Raf décrit |
| **B. Docker Compose** | `docker compose up` → tout tourne isolé. Reproductible, cross-OS. Mais exige Docker installé + Ollama reste externe + moins « grand public ». | M | Bon pour un public technique / serveur ; étape intermédiaire idéale |
| **C. Script d'install guidé** (`install.ps1` / `install.sh`) | Lancer un script qui vérifie les prérequis, installe les deps, crée le `.env` interactivement, lance. | S | **Le premier jalon** — livrable vite, valide toute la chaîne avant d'emballer |

**Stratégie retenue : C → B → A** (chaque étape réutilise la précédente : le script d'install C devient le cœur du conteneur B puis de l'installeur A).

## 3. Roadmap chiffrée

### Phase 1 — Portabilité & première-config (jalon C) · ⚖️ Sonnet · **M**
Prérequis de TOUT le reste. Rendre le projet installable-par-script chez un tiers.
1. **`engines` + `.nvmrc`** : figer Node 20+ dans les deux package.json.
2. **`.env.example`** commité (toutes les clés avec description, valeurs vides) — aujourd'hui le `.env` est gitignoré sans modèle, un tiers ne sait pas quoi remplir.
3. **`mango doctor`** (`scripts/doctor.mjs`) : vérifie Node, Ollama joignable, navigateur Playwright présent, clés `.env` renseignées, ports 3000/5173 libres → rapport ✅/❌ actionnable. Réutilise la logique anti-orphelin déjà écrite.
4. **`install.ps1` (Windows) + `install.sh`** : `npm ci` dans server/ et ui/, `npx playwright install`, copie `.env.example`→`.env` avec saisie interactive des clés, build UI, lance `mango doctor`.
5. **`mango start`** : un seul script qui lance backend + UI (+ ouvre le navigateur), avec l'anti-orphelin port 3000 intégré (la procédure du CLAUDE.md devient du code, pas une consigne).
6. **`workspace/` et `server/.env` retirés du package de distribution** (créés vierges à l'install).

### Phase 2 — Conteneurisation (jalon B) · 🧠 Opus · **M**
7. `Dockerfile` server + `Dockerfile` ui (ou multi-stage), `docker-compose.yml` (backend + ui + volumes pour workspace/.env). Playwright dans l'image (base `mcr.microsoft.com/playwright`).
8. Ollama : documenté comme service externe (host) OU service compose optionnel — laisser le choix.
9. MangoQA en 3ᵉ service compose (watcher), branché sur le volume `.mangoqa/` partagé.
10. `docker compose up` prouvé de bout en bout sur une machine vierge.

### Phase 3 — Installeur natif (jalon A) · 🧠 Opus · **L**
11. Empaqueter Node + les deux apps buildées avec **Inno Setup** (Windows) : assistant d'install, raccourci bureau, désinstalleur.
12. L'installeur lance `mango doctor` à la fin + ouvre une page de première-config (clés API) dans le navigateur.
13. Option : signer l'exécutable (certificat) pour éviter l'alerte SmartScreen — sinon documenter le « Plus d'infos → Exécuter quand même ».
14. Auto-update : vérifier une version distante au lancement (optionnel, v2).

### Transverse — Documentation tiers · ⚡ Haiku · **S**
15. `INSTALL.md` grand public (prérequis, install, où mettre ses clés, premier projet), `TROUBLESHOOTING.md` (ports, Ollama, Playwright), et une licence claire (le repo n'en a pas encore).

## 4. Décisions à trancher par Raf (avant Phase 1)

- **Modèle par défaut chez un tiers** : garder GLM cloud (le tiers doit avoir une clé Ollama Cloud) OU basculer sur un repli 100 % local (Ollama + modèle local — plus lourd à installer mais souverain et gratuit) ? → impacte `mango doctor` et `.env.example`.
- **Public visé** : développeurs (jalon B/C suffit) ou grand public (jalon A obligatoire) ?
- **Licence** : ouvert (MIT/Apache) ou propriétaire ? → conditionne ce qu'on distribue.

## 5. Estimation globale

| Jalon | Livrable | Effort cumulé |
|-------|----------|---------------|
| C | Installable par script + doctor + first-run | ~1 session M |
| B | `docker compose up` | +1 session M |
| A | `.exe` double-clic | +1-2 sessions L |

**Le plus dur n'est pas l'emballage — ce sont les prérequis externes** (Ollama, Playwright, clés). `mango doctor` + `.env.example` (Phase 1) sont donc le vrai déblocage : ils rendent l'install reproductible et diagnosticable, tout le reste n'est qu'habillage par-dessus.
