---
type: entite
tags: [architecture, cerveau, multi-cerveaux, souverainete, routage, phase-e]
statut: actif
sources: [statut, historique]
maj: 2026-06-23
---

# Phase E — Multi-cerveaux par intention (#135 / #146)

> La **dernière pierre du moteur souverain** : router chaque **intention** (Construire / Planifier / Discuter) vers **son** cerveau — façon Haiku/Sonnet/Opus de Claude Code, mais **souverain** et **mesuré** par l'examen d'entrée [[examen-cerveau|#148]]. Le bon cerveau pour la bonne tâche, capable de tourner 100 % local.

## Rôle

`fondation.md` : *« change de cerveau sans changer le système »*. Les phases A→D de [[eleve-local|#146]] ont rendu la **construction** souveraine (un cerveau pilote toute la coquille). La Phase E ferme la boucle de #135 : **un cerveau différent par intention**, choisi par l'humain mais **éclairé par la mesure**. Principe validé avec Raf : **le scan recommande l'aptitude, l'humain décide l'emploi, MangoOS avertit** si l'affectation contredit la mesure — jamais d'affectation imposée.

## Détails clés

Décision d'architecture (2026-06-23) : **option 3** = registre mesuré persisté **+ sélecteur UI Réglages** (pas le simple `.env`, qui jette la mesure).

- **E1 — Registre** ([[brains]], `server/src/brains.ts`) : les sorties du scan #148 deviennent des **fiches cerveau** durables (`.brains/registry.json`) ; routage intention→cerveau ; logique « MangoOS avertit » `intentionFit` (`ok` / `suboptimal` / `mismatch`). Module PUR, `test-brains` 30/30.
- **E1b — UI** : `brain-routes.ts` (`GET /api/brains`, `POST /scan` lance l'examen #148, `POST /routing`, `DELETE`) + panneau **Réglages › Cerveaux** (`ui/src/components/Brains.jsx` : sélecteurs par intention, scanner intégré, pastilles de verdict, bannière d'avertissement). Prouvé live (snapshot Playwright + interaction de mismatch).
- **E2 — Routeur runtime** (`brain-runtime.ts`) : `resolveBinding(intention)` → `{model, provider, profil}` — le profil = prose de famille (`resolveProfile`) **+ caps/agentic ÉCRASÉS par la mesure** (le mesuré prime sur le présumé). `eleve.ts` généralise le transport **par provider** (cloud openai-compat ↔ ollama) ; `runRelay`/`chatEleve`/`index.ts` consultent le binding ; `Chat.jsx` joint l'`intention`. **Réversible** : registre vide → repli global exact.
- **E3 — Outils gatés + délégation par intention** : `policyForBinding` dérive `{allowRun, allowDelegate}` de la **force mesurée** (score d'appel d'outils) ; `buildEleveActionTools(dir, {allowRun})` retire `run_command` au cerveau faible (= aussi la parade au tâtonnement shell Windows) ; **`delegate(subtask, agentType)`** — le sous-agent prend SON cerveau par intention (résolveur injecté → [[eleve-local|le runtime]] reste pur).
- **E4 — Souveraineté locale + audit** : transport function-calling **Ollama** (`/api/chat` natif `tools`, mappers purs `toOllamaMessages`/`fromOllamaResponse`) → la **même** boucle agentique tourne **sans cloud** ; `supportsTools` ouvre la porte agentique au local. + [[audit-souverainete]] (recensement des défauts-Claude en 3 niveaux + interrupteurs de repli).

**Vérif** : `tsc` 0 · build UI vert · brains 30 · brain-runtime 21 · eleve-runtime 29 · action-tools 21 · ollama-tools 10 · model-scan 13 · relay + non-régression. **Reste** : valider en LIVE sur un vrai modèle local tool-capable (le transport est prêt) ; porter compaction/review/Lab/recherche-web hors `query()` (cf. [[audit-souverainete]]).

## Liens

S'appuie sur [[examen-cerveau]] (profils mesurés) · achève [[eleve-local]] (moteur agentique #146) · concrétise les cerveaux hétérogènes #135 · registre = [[brains]] · souveraineté = [[audit-souverainete]] · réutilise le Brain Adapter de [[kernel]].

## Sources

[[statut]] (#135/#146 Phase E) · [[historique]] (Journal 2026-06-23).
