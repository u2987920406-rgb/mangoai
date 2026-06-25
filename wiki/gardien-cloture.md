---
type: entité
tags: [eleve, gate, qa, gout, intention, boucle-agentique]
statut: livré
sources: ["#161"]
maj: 2026-06-25
---

# Gardien-clôture (gate goût/QA/intention)

Filet de **clôture** dans la boucle de l'Élève : avant que GLM ait le droit de `finish`, il vérifie **intention** (la bonne tâche ?), **goût** et **QA** — et le renvoie corriger sinon, au même titre que le build. #161.

## Rôle

Le seul filet IMPOSÉ dans la boucle agentique (`runRelay`→`buildAgentic`) était le **build** (`inspectProject` : « ça compile »). Le goût ([[moteur-gout]] #149, [[oeil-coach]] #152) et la QA WCAG (#111) restaient **en orbite** (boutons), `vois_ecran`/`teste_parcours`/[[planifier-avant-agir]] étaient **opt-in**, et l'**adéquation intention↔livré n'était vérifiée nulle part**. Le Gardien transforme ces vérifs en **gate de clôture** automatique → GLM ne « finit » que si c'est la bonne tâche, au bon goût, lisible.

**Décisions (Raf)** : les **3 vérifs** · **convergent / non-bloquant** (relance bornée puis cède avec drapeau `incomplete`, jamais un mur — fidèle à l'invariant #111 `blocking:false`) · **juge souverain DISTINCT de l'exécutant** (pas d'auto-jugement).

## Détails clés

| Volet | Brique | Détail |
|---|---|---|
| **Intention** | `eleve-judge.ts` `judgeIntention` | Compare la DEMANDE au livré (résumé du finish + extraits des fichiers écrits, confinés + `sanitizeExternal`) via le cerveau **`juge`** (qwen3.5:cloud, souverain $0, ≠ exécutant GLM). `IntentVerdict{couverture, manques[]}`. KO → verdict NEUTRE (100), ne bloque jamais à tort. |
| **Goût + QA** | `eleve-gate.ts` → `critiqueScreen` #152 | UN regard : `critiqueScreen` renvoie le score de goût (multi-lentilles, ancré sur le **goût appris** via `buildJudgeContext` #149) ET les mesures **WCAG/charte** (`measureDesign` #111, déjà incluses). |
| **Orchestration** | `eleve-gate.ts` `runClosureGate` | Agrège → `raisons[]` (manques + correctifs priorisés + écarts WCAG). `buildGateNudge` (préfixe le plan #160), `evaluateGate` (décision pure). |

**⚠ Anti-récursion (capital)** : le Gardien appelle `critiqueScreen` (critique en **lecture**), JAMAIS `runDesignCoach` (qui rappellerait `runRelay`). La **correction est faite par la boucle `runRelay` existante** (nudge/relances). Le Gardien critique, le moteur corrige.

**Branchement** : `eleve.ts`, moteur agentique, avant le succès ; gaté **`ELEVE_CLOSURE_GATE=on`** (défaut OFF), compteur `gateRelances` **séparé** du budget anti-blocage, seuils par env (`ELEVE_GATE_INTENT_MIN`/`TASTE_MIN`/`WCAG_MAX_FAILS`/`RELANCE_MAX`). Aperçu KO (tâche non-UI) → volet goût/QA sauté, intention seule.

## État

**Livré et prouvé live** (#161). LIVE (`runRelay`, vrai GLM + juge qwen + critiqueScreen, $0, seuil goût forcé 99) : GLM finit → `🛡 intention 100/100, goût 76/100 ✗` → GLM **applique les correctifs du Gardien sur 2 fichiers** → re-critique 71 ✗ → laisse passer + `incomplete`. Tests : judge 12 · gate 19 · brain-dispatch 35 (11 agents).

**Limites** : L19 (juge LLM faillible — bruit du VL, cf. [[oeil-coach]] ; atténué par non-bloquant) · L20 (goût/QA exige un rendu → sauté pour le backend) · L21 (juge sur résumé+fichiers, pas un vrai `git diff`).

## Liens
[[oeil-coach]] · [[moteur-gout]] · [[planifier-avant-agir]] · [[transmission-competences]] · [[brains]] · [[mangoqa]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#161` (statut.md tableau + journal historique.md) · modules `eleve-judge.ts` / `eleve-gate.ts` / `brain-registry.*` / `eleve.ts`.
