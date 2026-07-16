---
type: page-entité
tags: [souveraineté, cerveaux, multi-cerveaux, phase-e, claude, ollama]
statut: vivant
sources: [historique, statut, eleve.ts, llm-engine.ts, kernel.ts]
maj: 2026-06-23
---

# Audit de souveraineté

> Recensement de **chaque endroit où Claude reste le cerveau par défaut** dans MangoOS, et de son **repli local** (Ollama) — la boussole pour couper le cordon sans régression. Produit par la [[phase-e-multicerveaux|Phase E]] (#135, livraison E4).

## Rôle

La vision [[fondation|fondatrice]] est *« LLM-agnostique → change de cerveau sans changer le système »*. La Phase E a rendu le **chemin de construction** souverain (le cerveau Élève pilote toute la coquille, cloud **ou** local). Restent des fonctions périphériques (juges, patrouilleurs, escalade…) encore branchées sur Claude par défaut. Cette page les classe en **3 niveaux de souveraineté** et donne, pour chacune, l'interrupteur de repli local.

## Détails clés

### 🟢 Niveau 1 — Déjà souverain (zéro Claude)

| Fonction | Mécanisme | Cloud / Local |
|---|---|---|
| **Construction** (Construire) | [[eleve\|runRelay]] → boucle agentique Élève (function-calling maison) | GLM cloud **ou** Ollama local (E4) |
| **Discussion / Plan** (Discuter, Planifier) | `chatEleve` routé par intention | idem, selon le cerveau routé |
| **Feedback 👍👎 en mode Élève** | distillation d'axiome par le cerveau Élève (cf. `feedback.ts`) | souverain quand `FEEDBACK_PROVIDER` ≠ claude |
| **Routage des cerveaux** | [[brains\|registre .brains]] + sélecteur Réglages › Cerveaux | local (fichier) |

Depuis E2/E4, une intention peut router vers un cerveau **local Ollama tool-capable** : la *même* boucle agentique (lire→écrire→build→corriger→déléguer) tourne sans cloud. Le transport local est `postEleveOllamaTools` (`/api/chat` natif `tools`).

### 🟡 Niveau 2 — Claude par défaut, repli local en UNE ligne `.env`

Toutes ces fonctions passent par `getBrain().complete(..., { provider: resolveProvider(process.env.<FEATURE>_PROVIDER, 'claude') })` : **mettre `<FEATURE>_PROVIDER=ollama` (ou un provider openai-compat) dans `server/.env`** les bascule en local, sans toucher au code. C'est le levier #135 déjà en place.

| Fonction | Fichier | Variable de repli |
|---|---|---|
| Patrouilleur (delta de fichiers) | `patrol.ts` | `PATROL_PROVIDER` |
| Radar IA | `radar.ts` | `RADAR_PROVIDER` |
| Review nocturne (+ juge) | `nocturnal.ts` | `NOCTURNAL_PROVIDER`, `NOCTURNAL_JUDGE_PROVIDER` |
| Œil Design / Design-review | `design-review.ts` | `DESIGNREVIEW_PROVIDER` |
| Juge de feedback 👍👎 | `feedback.ts` | `FEEDBACK_PROVIDER` |
| Build-review | `build-review.ts` | `FEEDBACK_PROVIDER` |
| Idéation | `ideation.ts` | `IDEATION_PROVIDER` |
| Générateur de doc | `docgenerator.ts` | `DOC_PROVIDER` |
| Tâches planifiées (cron) | `cron-scheduler.ts` | `CRON_PROVIDER` |
| RAG des notes | `notes-rag.ts` | `NOTES_PROVIDER`, `RAG_PROVIDER` |
| Évolution de prompt | `prompt-evolution.ts` | `PROMPT_EVOLUTION_PROVIDER` |
| Super-agent builder | `super-agent-builder.ts` | `SUPERAGENT_PROVIDER` |
| Agents (coordinateur/factory/routes) | `agent-*.ts` | `AGENT_LLM_PROVIDER`, `AGENT_FACTORY_PROVIDER` |
| Lexique | `lexique.ts` | `BRAIN_PROVIDER` (global) |

> Bascule globale d'un coup : `BRAIN_PROVIDER=ollama` dans `.env` fait tomber **tout le Niveau 2** en local (chaque feature garde la priorité de sa variable dédiée si elle est posée).

### 🔴 Niveau 3 — Claude verrouillé (`query()` du SDK) — la frontière restante

Ces fonctions utilisent directement `query()` (abonnement Claude Code, $0) et n'ont **pas** de repli `getBrain()` aujourd'hui. C'est la dernière frontière de souveraineté.

| Fonction | Fichier | Repli local |
|---|---|---|
| **Boucle Claude principale** (modèle « claude » choisi) | `agent.ts:208` | par CONCEPTION — c'est le cerveau Claude explicite ; le chemin Élève souverain le remplace côté construction |
| **Escalade / le Maître** | `eleve.ts` (`escalateToClaude`) | par CONCEPTION — c'est le **filet** qualité ; le rendre local = renoncer au filet (à n'envisager qu'une fois l'Élève local prouvé) |
| Compaction de session | `compaction.ts` | portable vers `getBrain()` (non fait) |
| Review de fond | `review.ts` | portable vers `getBrain()` (non fait) |
| Lab de prompts | `promptlab.ts` | portable vers `getBrain()` (non fait) |
| Recherche web | `llm-engine.ts` (`claudeWebResearch`) | **pas d'équivalent local** : `WebSearch` est un outil Claude ; souveraineté = brancher un outil de recherche local |
| Utilitaires (`check-key`, `compare-eleves`) | — | hors périmètre produit |

## Suite 2026-07-12 (SOUV-B) — audit de PARITÉ D'OUTILS (distinct de l'audit de PROVIDER ci-dessus)

L'audit ci-dessus recense « quelle fonction utilise quel cerveau ». Un second audit, complémentaire, a recensé « quel OUTIL Claude possède mais que l'Élève n'a pas » — le chemin de construction peut déjà tourner 100 % local (Niveau 1), mais tournait avec **moins d'outils de vérification** que Claude. 10 écarts trouvés et fermés en une nuit :
- Sharingan (extraction de site 6 couches) exposé directement à l'Élève ([[sharingan-vision-eleve]]) ;
- `vois_ecran`/`lire_image` passés à défaut ON (parité avec le Snapshot permanent de Claude) ;
- personas `builder`/`controleur` pour `delegate` (équivalent du sous-agent `Agent` de Claude) ;
- nouvel outil `verifie_design` (auto-critique WCAG/palette/motion en cours de tâche) ;
- `list_files` gagne un filtre glob ;
- `brain-registry.json` devient source vivante (fin des 5 sites `process.env.ELEVE_MODEL` figés) ;
- [[mangoqa]] nourri en vraies données de production via 3 nouveaux events Bus (`render.integrity`/`parcours.result`/`gate.verdict`), quel que soit le cerveau qui a construit l'app.

**Règle retenue** (mémoire `feedback_souverainete_sans_regression`) : le critère de succès n'est pas « le cerveau local tourne techniquement » mais **« aucune régression de qualité/fiabilité perçue »** face à Claude — chaque capacité de vérification côté Claude doit avoir un équivalent côté Élève, sans attendre que Raf le remarque en l'utilisant. Détail complet → `historique.md`, journal 2026-07-11/12.

## Suite 2026-07-14/15 (SOUV-C) — cerveau FRONTIÈRE cloud validé en réel, crédit restauré

Le point 3 des « Prochaines pierres » (validation live 100 % locale) restait bloqué côté cerveau frontière : `glm-5.2:cloud`/`qwen3.5:cloud` étaient câblés depuis SOUV-A (2026-07-10) mais **inutilisables**, la limite hebdomadaire Ollama Cloud étant atteinte. Une fois le crédit rechargé, 2 apps produites cette nuit de bout en bout par le pipeline avec Élève **glm-5.2:cloud**, Stratège et Gardien dans la boucle : `caravan` (Gardien rejette 1 fois sur artisanat/typo, corrigé, clôture OK) et `strata` (Gardien rejette 1 fois sur intention 0/100 malgré build+design OK, réécrit avec brief cristallisé, clôture OK). Un 3ᵉ run trouvé dans le même dossier (`orbital-control`) est un échec antérieur non repris — exclu du bilan. **Confirme que la plomberie souveraine (Niveau 1) tient aussi avec un cerveau FRONTIÈRE fort**, pas seulement avec un petit modèle local — la souveraineté n'implique pas de sacrifier la qualité si le cerveau routé est assez fort. Détail → `historique.md` journal 2026-07-14/15.

## Prochaines pierres (pour fermer la frontière 🔴)

1. **Compaction / review / Lab** → router via `getBrain()` + `<FEATURE>_PROVIDER` (même patron que le Niveau 2) — gain net, faible risque.
2. **Recherche web locale** → outil de recherche souverain (SearXNG/Brave API) injecté dans la boucle.
3. **Validation live 100 % locale** : tirer un modèle tool-capable dans Ollama (Qwen-Coder / GLM quantisé), le scanner (#148), le router sur Construire, et prouver un build de bout en bout **sans cloud**. Le transport est prêt (E4) ; reste à le passer sur un vrai modèle local.

## Liens

[[phase-e-multicerveaux]] · [[brains]] · [[eleve]] · [[kernel]] · [[fondation]] · [[examen-cerveau]] · [[statut]]

## Sources

- `server/src/eleve.ts` (transport multi-provider E2 + Ollama tools E4 + escalade), `llm-engine.ts` (`resolveProvider`, `claudeWebResearch`), `kernel.ts` (`BRAIN_PROVIDER` défaut claude), `brains.ts` / `brain-runtime.ts` (routage).
- [[historique]] — idée #135 (multi-cerveaux) et #146 Phase E.
