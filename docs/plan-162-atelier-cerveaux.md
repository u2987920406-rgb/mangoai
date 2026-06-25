# Plan #162 — « L'Atelier des cerveaux » : UI pour gérer le modèle de chaque agent

> **Statut** : plan validé par Raf (AskUserQuestion). Implémentation entamée (voir « État d'avancement »). **Compact prévu avant de continuer le code.**

## Contexte / But

Donner à Raf, **depuis l'UI MangoOS**, le pouvoir de faire ce que Claude faisait à la main (connecter `qwen3-vl` au cerveau `vision`, ajouter `juge`) : voir chaque agent, **choisir son modèle**, un bouton **« + »** pour **parcourir ses modèles Ollama locaux** ou **en télécharger (pull)** un nouveau, et paramétrer l'atelier **intelligemment** (garde de capacités + examen #148). Aboutissement UI de l'archi multi-cerveaux (Brain-Dispatch #150 / Phase E #135).

## Décisions de cadrage (Raf)
- **Bouton « + »** = **parcourir les modèles Ollama LOCAUX** (liste + capabilities) **+** **télécharger (pull)** un modèle Ollama. *(Pas de branchement Ollama distant / endpoint cloud en v1 — `baseUrl`/`apiKeyEnv` restent saisissables à la main pour le cloud, mais le « + » se concentre sur Ollama local.)*
- **Intelligent** = **garde de capacités** (avertit si on assigne à l'agent `vision` un modèle SANS capability `vision` — piège GLM-4.6V évité) **+** bouton **« scanner »** (examen #148 → verdict + agents conseillés). Garde **non-bloquante** (avertit, n'impose pas — fidèle #111).

## Ce qui EXISTE (réutilisé)
- `GET/PUT /api/brain-registry` (`brain-dispatch-routes.ts`) — registre **par agent**. GET → `{registry, defaults, agents}` ; PUT → `{agentId: BrainConfig}` (validé par `saveBrainRegistry`/`coerceConfig`). **Cœur de l'atelier.**
- `POST /api/brains/scan` (`brain-routes.ts` → `model-scan.ts` #148) — l'examen d'entrée, réutilisé pour « scanner ».
- `ollama.ts` `OLLAMA_URL` ; UI : `Reglages.jsx` (écran+sous-nav+sections), `Brains.jsx` (pattern fetch/scan), composants `Dropdown`/`ConfirmModal`/`Toast`, tokens Tailwind (accent violet, panel/raised/edge, ok/err). Proxy Vite `/api → :3000`. JSX + vitest.

## Pièce 1 — Backend : `server/src/ollama-routes.ts` (✅ FAIT)
`registerOllamaRoutes(app)`, `fetch` injectable, gracieux (Ollama down → `{ok:false}`), **valide le nom** (`/^[a-zA-Z0-9._/:-]+$/`). Nom passé en **query/body** (pas en param, à cause des `/` et `:`).
- `GET /api/ollama/models` → `/api/tags` → `[{name,size,family,parameterSize}]`.
- `GET /api/ollama/caps?name=…` → `/api/show` → `{capabilities[], family, parameterSize}` (la garde : `vision`/`tools`/`thinking`).
- `POST /api/ollama/pull {name}` → relaie `/api/pull` (NDJSON) en **SSE de progression** (`{status,completed,total}` → `{done:true}`/`{error}`).
- `DELETE /api/ollama/model?name=…` → `/api/delete`.
- Helpers exportés (testables) : `validModelName`, `fetchOllamaModels`, `fetchOllamaCaps`.
- **RESTE** : brancher `registerOllamaRoutes(app)` dans `index.ts`.

## Pièce 2 — Backend : garde de capacités (à faire)
- `brain-registry.ts` : `export const EXPECTED_CAPS: Partial<Record<AgentId, string[]>> = { vision: ["vision"] };` (PUR ; vision exige `vision`, autres = informatif).
- `brain-dispatch-routes.ts` GET : ajouter `expectedCaps: EXPECTED_CAPS` à la réponse (backward-compatible). La comparaison caps↔attendues se fait **côté UI** (non-bloquant).

## Pièce 3 — Frontend : `ui/src/components/AtelierCerveaux.jsx` (à faire)
Onglet « Atelier des cerveaux » dans `Reglages.jsx` (lazy-import + entrée `buildGroups` section « Intelligence » + `case` du `renderSection`, icône `Cpu`/`Wrench`). Réutilise `Dropdown`/`ConfirmModal`/`Toast` + tokens.
- Charge `GET /api/brain-registry` (+`expectedCaps`) et `GET /api/ollama/models`.
- **Carte par agent** : `Dropdown` provider ; si **ollama** → modèle = `Dropdown` alimenté par la liste locale (badges caps via `/caps` à la sélection) ; sinon (cloud) → champ texte + `baseUrl` + `apiKeyEnv`. `timeoutMs`, `localOnly`. **⚠ Garde** : `expectedCaps[agent]` ⊄ caps modèle → bandeau d'avertissement (non-bloquant).
- **« + Ajouter un modèle »** → modale 2 onglets : **Local** (liste + badges + supprimer via `DELETE`+`ConfirmModal`) · **Télécharger** (nom → `POST /api/ollama/pull` → barre de progression SSE → refresh).
- **« Scanner »** → `POST /api/brains/scan {model, provider}` → verdict #148 + agents conseillés (agentic → codeur/orchestrateur/architecte/juge/optimiseur).
- **Footer collant** quand `dirty` : « Réinitialiser » (defaults) · « Sauvegarder » → `PUT /api/brain-registry` → `Toast`.

## Tests
- `server/src/test-ollama-routes.ts` : `validModelName` (ok `qwen3-vl:8b`, `scorpion7slayer/GLM…` ; rejette espaces/`;`/`..`) ; `fetchOllamaModels`/`fetchOllamaCaps` (fetch injecté ; Ollama down → `{ok:false}` sans throw).
- `ui/src/components/AtelierCerveaux.test.jsx` (vitest, `fetch` mocké) : rend les agents ; garde vision (modèle sans `vision` → bandeau) ; « Sauvegarder » → `PUT` avec le registre édité ; « + » ouvre la modale.
- Non-régression : `test-brain-dispatch*` (GET enrichi compatible), `brains`, `model-scan` ; `tsc` 0 ; **`npm run build` (ui) vert** ; `vitest` ui.

## Preuve LIVE (snaps — obligatoire UI)
Anti-orphelin 3000 → backend frais + vite 5173. **Playwright** : Réglages → Atelier, **snap avant/après + lire les images** (style Apple/tokens), tester : (1) agents affichés, `vision` montre `qwen3-vl:8b` badge `vision` ; (2) modèle sans vision sur `vision` → **bandeau ⚠** ; (3) liste locale + capabilities + « scanner » → verdict ; (4) option pull petit modèle → progression ; (5) « Sauvegarder » → toast + re-GET montre le changement. **Restaurer le registre** après. Lire les snaps avant de déclarer fini (mémoires `feedback_snap_process_mangoos`, `feedback_verif_visuelle_avant_done`, `feedback_style_apple_mangoos`).

## Clôture doc (après vert + live)
`statut.md` (#162 ✅ + tableau), `historique.md`, `wiki/` (page `[[atelier-cerveaux]]` + index + log, relier `[[brains]]`/`[[brain-dispatch]]`), `limites.md` (L24/L25/L26), mémoires. **Zéro git sans feu vert de Raf.**

## Limites anticipées (→ `limites.md`)
- **L24** — `pull`/`delete` = opérations puissantes (local, machine de Raf, via sa propre UI) ; atténué : validation du nom, pas de sandbox. 🟢
- **L25** — Ollama distant / endpoint cloud non couvert en v1 (le « + » = local) ; saisie manuelle `baseUrl`/`apiKeyEnv` pour le cloud. 🟢 (onglet « Adresse » plus tard).
- **L26** — Scan #148 routé via le transport Élève (modèle local → Ollama, latence/coût). 🟢

## Garde-fous
- Snaps Playwright avant/après + lecture image + test interaction = obligatoire UI. Style Apple translucide, tons mangue + violet.
- Anti-orphelin 3000 ; nettoyer aperçus Vite + scripts temp ; jamais committer de temp/PNG. `tsc` 0 + ui build vert + tests verts avant tout. Garde non-bloquante. Restaurer `brain-registry.json` après la démo.

---

## État d'avancement (avant compact)
- ✅ **Étape 0** : 3 prochaines pistes inscrites en mémoire (`project_prochaines_pistes.md`) — run de validation / fiabiliser Gardien (L19/L21) / étendre artefacts (L3).
- ✅ **Pièce 1 (partiel)** : `server/src/ollama-routes.ts` **créé** (helpers + 4 routes). **RESTE** : `registerOllamaRoutes(app)` dans `index.ts`.
- ⬜ **Pièce 2** : `EXPECTED_CAPS` (brain-registry.ts) + GET enrichi (brain-dispatch-routes.ts).
- ⬜ **Pièce 3** : `AtelierCerveaux.jsx` + branchement `Reglages.jsx`.
- ⬜ Tests (ollama-routes + AtelierCerveaux) · `tsc`/build · preuve live snaps · clôture doc.
- Numéro `#162` confirmé libre. Repère : registre par agent = `data/brain-registry.json` ; œil actuel `vision=qwen3-vl:8b`, `juge=qwen3.5:cloud`.
