---
type: entité
tags: [subagents, forge, delegation, execution, toolpolicy, autonomie]
statut: livré
sources: ["#175"]
maj: 2026-07-02
---

# Subagents (spécialistes exécutants)

Un agent forgé par Mango était un **conseiller** : `runSpecialist` = un `askLLM` one-shot (texte en entrée, texte en sortie, zéro outil, zéro accès disque). #175 lui donne, en mode **"action"**, sa PROPRE boucle agentique avec un registre d'outils **scellé à la forge** — il traite un sous-problème borné, il **AGIT** (lit / écrit / édite / build) au lieu de seulement conseiller.

## Rôle

La reprise auto [[auto-evolution|#168]] faisait déjà la moitié du chemin (`consultSpecialist` réinjecte l'avis d'un agent forgé dans la boucle). #175 ajoute l'autre moitié : que le spécialiste **exécute**. Le risque (un agent conçu par un LLM, pas audité ligne à ligne, qui `write_file` sur ton projet) est borné par la **condition non négociable (A)** : la policy d'outils est **décidée à la FORGE, jamais négociable à l'exécution** — même logique de sûreté qu'`assignBrain` pour le choix du cerveau. `runSpecialist` (conseil) et `runSpecialistAgentic` (action) **coexistent délibérément** ; la distinction EST le garde-fou.

## Détails clés

| Pièce | Module | Détail |
|---|---|---|
| **Scellage d'outils** | `eleve-action-tools.ts` | `ToolPolicy` gagne `allowedTools`/`deniedTools` ; `applyToolPolicy(reg, policy)` reconstruit un registre filtré (allowlist = SEULS ces outils, `finish` toujours gardé ; denylist retirée). Sans policy → registre inchangé (l'Élève principal, rétrocompatible). |
| **Boucle bornée** | `specialist-agentic.ts` (NOUVEAU) | `runSpecialistAgentic(id, task, projectDir, deps)` : registre construit par `buildTools(projectDir, agent.toolPolicy)`, boucle `agentic` (askEleveAgentic) avec `SPECIALIST_MAX_ITER=6` (< 12 de l'Élève), tâche `sanitizeExternal`. Deps INJECTÉES (agentic+buildTools) → **zéro cycle runtime** avec eleve.ts (imports type-only). Ne lève jamais. |
| **Mode à la forge** | `agent-forge.ts` `assignMode` | Patron d'`assignBrain` : un rôle qui AGIT (corrige/écrit/génère/répare/refactor…, `hay` désaccentué) → mode "action" + `toolPolicy` restrictive (base lecture + écriture bornée + build + finish, JAMAIS run_command/add_dependency/réseau ; PDF→lire_document/archive, visuel→chercher_image). Sinon "conseil". Appliqué dans `forgeAgents` + `forgeForGap`. |
| **Choix du runner** | `specialist-delegate.ts` `consultSpecialist` | `mode === "action" && runAgentic fourni` → EXÉCUTE (prompt « agis directement ») ; sinon CONSEILLE (prompt « donne des conseils »). Le câblage `runAgentic` (askEleveAgentic + buildEleveActionTools + projectDir) est fourni gaté dans `eleve.ts` aux 2 sites (#168 reprise + plateau). |

## État

**Livré, gaté `ELEVE_DELEGATE_AGENTIC=off`, prouvé** (#175, 2026-07-02) : **P0** types + scellage · **P1** runSpecialistAgentic · **P2** assignMode · **P3** branchement. `tsc` propre (hors `_prove-*`) · **specialist-agentic 27/0** (scellage réel : un agent ne PEUT PAS appeler un outil hors allowlist ; choix runner selon mode) · **assign-mode 10/0** (conseil / refactor / PDF / contenu) · non-régr. agent-forge 25 · specialist-delegate 17 · eleve-runtime 49. **P4 PREUVE LIVE** (GLM réel, scénario construit, registre + projet temp nettoyés) : agent "action" → `write_file`+`finish` → **`src/Hello.jsx` réellement écrit**, ZÉRO outil interdit appelé (scellage tenu en réel). **Reste** : déclenchement via un blocage NATUREL dans la boucle live (comme L56), après OBS — [[limites|L73]].

## Premier consommateur permanent (2026-07-02)

L'agent **Esthète** (`esthete-agent.ts`/`esthete-routes.ts`) est le premier spécialiste mode-action qui n'est PAS forgé dynamiquement par GLM : c'est un agent SYSTÈME pré-enregistré (`ensureEstheteAgent`, seedé au boot, id fixe `sa_system_esthete`), réutilisant la structure `SpecialistAgent` + le mécanisme #175 sans passer par `agent-forge.ts` — c'est une capacité de premier plan décidée par Raf, pas une lacune détectée en cours de build. Nuance de câblage : sa route (`POST /api/esthete/:projectName`) appelle `askEleveAgentic` **directement** plutôt que `runSpecialistAgentic`, car ce dernier n'expose pas de callback `onTool` (nécessaire pour streamer les appels d'outils en SSE au fil d'une conversation utilisateur) — même budget borné (`SPECIALIST_MAX_ITER`) et même garantie de scellage, juste sans l'indirection qui masquerait le streaming. Protégé contre la suppression (`DELETE /api/specialists/:id` refuse son id, 403).

## Limite / périmètre

Le forgeron (LLM) décide de la `toolPolicy` → une mauvaise assignation reste possible (atténuée : allowlist restrictive par construction, budget réduit, confinement `resolveInside` hérité, gate off). La preuve du DÉCLENCHEMENT via `consultSpecialist` en vraie boucle (pas `runSpecialistAgentic` direct) attend un blocage naturel non forçable. `askEleveAgentic` ne boucle qu'en provider `openai` (repli texte pour un cerveau ollama pur local). Détails → [[limites|L73]].

## Liens
[[auto-evolution]] · [[le-stratege]] · [[atelier-cerveaux]] · [[transmission-competences]] · [[gardien-cloture]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#175` (plan `docs/plan-175-subagents.md` · `statut.md` · `historique.md`) · modules `specialist-agentic.ts` / `agent-forge.ts` (`assignMode`) / `specialist-delegate.ts` / `eleve-action-tools.ts` (`applyToolPolicy`) / `specialist-agents.ts`.
