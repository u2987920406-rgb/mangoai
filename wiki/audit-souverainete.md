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

## Prochaines pierres (pour fermer la frontière 🔴)

1. **Compaction / review / Lab** → router via `getBrain()` + `<FEATURE>_PROVIDER` (même patron que le Niveau 2) — gain net, faible risque.
2. **Recherche web locale** → outil de recherche souverain (SearXNG/Brave API) injecté dans la boucle.
3. **Validation live 100 % locale** : tirer un modèle tool-capable dans Ollama (Qwen-Coder / GLM quantisé), le scanner (#148), le router sur Construire, et prouver un build de bout en bout **sans cloud**. Le transport est prêt (E4) ; reste à le passer sur un vrai modèle local.

## Liens

[[phase-e-multicerveaux]] · [[brains]] · [[eleve]] · [[kernel]] · [[fondation]] · [[examen-cerveau]] · [[statut]]

## Sources

- `server/src/eleve.ts` (transport multi-provider E2 + Ollama tools E4 + escalade), `llm-engine.ts` (`resolveProvider`, `claudeWebResearch`), `kernel.ts` (`BRAIN_PROVIDER` défaut claude), `brains.ts` / `brain-runtime.ts` (routage).
- [[historique]] — idée #135 (multi-cerveaux) et #146 Phase E.
