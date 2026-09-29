# Rapport — Élève = DeepSeek v4.1 flash (partition + bascule + preuves)

Date : 2026-09-29. Aucun appel à un modèle, aucune génération d'application lancée, aucun `git` exécuté, aucun fichier supprimé.

## Verdict

**Pas terminé au sens strict du brief : C1 est faux** (`npm run typecheck` sort 2). L'erreur est une seule, dans `server/src/llm/llm-transport.ts:116`, un fichier que le brief interdit de toucher (lot parallèle). Aucune erreur de type dans les fichiers de ce lot. **C6 n'est pas vérifié** : `git status --short` exige une approbation, impossible à obtenir dans cette session non interactive. C2, C3, C4 et C5 sont vrais et prouvés ci-dessous.

## Ce qui a changé

| Fichier | Lignes | Changement |
|---|---|---|
| `server/src/models/deepseek.ts` | neuf (1-63) | Partition `deepseek`. Matcher `/deepseek-v\d/i` (l.46), `axiomFiles` (l.49), `escalateAppendix` (l.50-56), `caps` (l.60), `agentic: true` (l.62), prompt de repli WRITE + EDIT (l.20-38). |
| `server/src/models/profile.ts` | 22, 56 | Import de `deepseekProfile` et ajout en **fin** de `PROFILES`. Aucun profil existant ne reconnaît `deepseek-v…`, donc cette position ne change rien pour les autres profils. |
| `server/data/brain-registry.json` | 18-20 | Rôle `codeur` seul : `model` `mimo-v2.6-pro` → `deepseek-v4.1-flash`, `baseUrl` → `https://ollama.com/v1`, `apiKeyEnv` `XIAOMI_API_KEY` → `OLLAMA_API_KEY`. `provider:"openai"` et `timeoutMs:1800000` sont inchangés. Aucun autre rôle modifié. |
| `server/.env` | 14-15 | `ELEVE_API_URL=https://ollama.com/v1`, `ELEVE_MODEL=deepseek-v4.1-flash`. `ELEVE_PROVIDER=openai` était déjà en place, et `ELEVE_API_KEY` contient déjà la même clé que `OLLAMA_API_KEY`. |
| `server/src/tests/test-models.ts` | 14, 110-129 | Bloc [14] : 9 assertions. |
| `statut.md` | 10 | Ligne « Où on en est » du 2026-09-29. |
| `historique.md` | fin | `## Journal — 2026-09-29 : Élève = DeepSeek v4.1 flash`. |
| `wiki/eleve-local.md` | 6, 20 | Partition `deepseek.ts` et Élève actif. |
| `wiki/log.md` | fin | `## [2026-09-29] ingest | …`. |

### Pourquoi ces caps (C5)

| Cap | GENERIC | deepseek |
|---|---|---|
| `axiomCap` | 5 | **10** |
| `fileBudget` | 9000 | **24000** |
| `fileMax` | 2500 | **6000** |
| `maxAttempts` | 2 | **3** |

Ce sont les valeurs de `glm.ts`, l'autre gros modèle cloud déjà prouvé dans MangoOS et appelé par le même chemin (provider `openai`, Ollama Cloud). Un gros modèle agentique lit et vérifie par lui-même, donc il faut lui donner du contexte plutôt que de le brider comme un petit modèle local. **Ces valeurs n'ont pas été mesurées sur DeepSeek.** Ce sont des valeurs de départ. Une fiche cerveau mesurée (#148) les remplacerait via `profileForBrain` (`brain-runtime.ts:70-72`).

### Pourquoi `/deepseek-v\d/i` et pas `/deepseek/i`

Les distillations locales `deepseek-r1:7b` (base Qwen ou Llama) et `deepseek-coder:6.7b` sont de petits modèles dont le function-calling n'est pas prouvé. Avec `/deepseek/i`, ils obtiendraient `agentic:true` et des caps généreuses. Ils restent donc sur GENERIC, ce que le test vérifie.

## Commandes pour rejouer (depuis `server/`), avec l'output réel

### C2 et C3 : résolution du profil

```
npx tsx src/tests/test-models.ts
```
```
  [14] resolveProfile → deepseek :
    resolveProfile("deepseek-v4.1-flash") → id=deepseek agentic=true caps={"axiomCap":10,"fileBudget":24000,"fileMax":6000,"maxAttempts":3}
  ✓ deepseek-v4.1-flash → deepseek
  ✓ deepseek-v4.1-flash → agentic === true
  ✓ deepseek-v4-flash:0731 → deepseek
  ✓ deepseek-r1:7b (distillation locale) reste generic
  ✓ deepseek-coder:6.7b (petit local) reste generic
  ✓ axiomFiles = [.axioms.md, .axioms.deepseek.md]
  ✓ escalateAppendix non vide, nomme DeepSeek et route .axioms.deepseek.md
  ✓ caps > GENERIC (axiomCap, fileBudget, fileMax, maxAttempts)
  ✓ système offre <write> ET <edit> (repli contrat)
════════════════════════════════════════════════════════════════
✅ Tous les checks sont verts (Gemma #54 + Qwythos(-tools) + Qwen3/Llama3-Groq + anciens noms Qwen → GENERIC).
```
Les blocs [1] à [13], déjà présents, restent tous verts.

**Avant la modification**, j'ai reconstitué la liste `PROFILES` d'avant, avec les mêmes modules mais sans `deepseek` :
```
npx tsx -e 'import { GENERIC } from "./src/models/generic.ts"; import { gemmaProfile } from "./src/models/gemma.ts"; import { uxuiProfile } from "./src/models/uxui.ts"; import { layoutProfile } from "./src/models/layout.ts"; import { glmProfile } from "./src/models/glm.ts"; import { qwythosToolsProfile } from "./src/models/qwythos-tools.ts"; import { qwythosProfile } from "./src/models/qwythos.ts"; import { qwen3Profile } from "./src/models/qwen3.ts"; import { llama3GroqToolUseProfile } from "./src/models/llama3-groq-tool-use.ts"; const AVANT = [gemmaProfile, uxuiProfile, layoutProfile, glmProfile, qwythosToolsProfile, qwythosProfile, qwen3Profile, llama3GroqToolUseProfile]; const p = AVANT.find((x) => x.matches("deepseek-v4.1-flash")) ?? GENERIC; console.log("AVANT (PROFILES sans deepseek) :", p.id, "agentic=" + p.agentic, JSON.stringify(p.caps));'
```
```
AVANT (PROFILES sans deepseek) : generic agentic=undefined {"axiomCap":5,"fileBudget":9000,"fileMax":2500,"maxAttempts":2}
```

### C4 : `getBrain("codeur")` réel et synchronisation de l'Élève

```
npx tsx -e 'import { getBrain } from "./src/brain/brain-registry.ts"; import { ELEVE_MODEL, PROFILE, ELEVE_PROVIDER, ELEVE_API_URL } from "./src/eleve/provider.ts"; const c = getBrain("codeur"); console.log("getBrain(codeur) =", JSON.stringify({ provider: c.provider, model: c.model, baseUrl: c.baseUrl, apiKeyEnv: c.apiKeyEnv, timeoutMs: c.timeoutMs })); console.log("provider.ts après sync :", JSON.stringify({ ELEVE_MODEL, ELEVE_PROVIDER, ELEVE_API_URL, profile: PROFILE.id, agentic: PROFILE.agentic }));'
```
```
getBrain(codeur) = {"provider":"openai","model":"deepseek-v4.1-flash","baseUrl":"https://ollama.com/v1","apiKeyEnv":"OLLAMA_API_KEY","timeoutMs":1800000}
provider.ts après sync : {"ELEVE_MODEL":"deepseek-v4.1-flash","ELEVE_PROVIDER":"openai","ELEVE_API_URL":"https://ollama.com/v1","profile":"deepseek","agentic":true}
```
La seconde ligne montre que `syncEleveFromBrainRegistry()` (`eleve/provider.ts:71-89`), exécuté au chargement du module, donne à l'Élève le profil `deepseek` avec `agentic:true`. Avec le provider `openai`, qui est `supportsTools`, la boucle à outils s'ouvre (`relay.ts:87`).

### C1 : typecheck et tier smoke

```
npm run typecheck
```
```
src/llm/llm-transport.ts(116,28): error TS2345: Argument of type 'Query' is not assignable to parameter of type '{ interrupt?: (() => Promise<void>) | undefined; }'.
  The types returned by 'interrupt()' are incompatible between these types.
    Type 'Promise<SDKControlInterruptResponse | undefined>' is not assignable to type 'Promise<void>'.
```
Code de sortie **2**. C'est la seule erreur, et elle est hors du périmètre de ce lot. Le type `interrupt()` du SDK Claude ne correspond plus, ce qui est probablement lié au `package.json`/`package-lock.json` déjà modifiés par un autre lot : c'est une hypothèse, non vérifiée.

```
npm test
```
```
TOTAL : 12 PASS · 0 FAIL · 4.0s cumulées
✅ Tous les tests du tier sont verts.
```
J'ai aussi lancé les autres tests qui appellent `resolveProfile` : `npx tsx src/tests/test-brain-runtime.ts` donne `26 pass, 0 fail`, et `npx tsx src/tests/test-specialized-agents.ts` est tout vert.

## Critères

| | État | Preuve |
|---|---|---|
| C1 | ❌ **faux** pour le typecheck (exit 2, `llm-transport.ts:116`, hors périmètre) · ✅ smoke 12/0 · ✅ aucun test existant en échec parmi ceux lancés | ci-dessus |
| C2 | ✅ `id=deepseek`, `agentic=true` (avant : `generic`) | test-models [14] et reconstitution « avant » |
| C3 | ✅ `axiomFiles` exact, appendix non vide qui nomme DeepSeek et `.axioms.deepseek.md` | test-models [14] |
| C4 | ✅ sortie réelle de `getBrain("codeur")` | ci-dessus |
| C5 | ✅ 10/24000/6000/3, strictement au-dessus de 5/9000/2500/2, justifié (non mesuré sur DeepSeek) | test-models [14] |
| C6 | ⚠️ **non vérifié par `git status`** (approbation refusée en non-interactif). Déclaration : aucun fichier supprimé ; fichiers touchés = la liste ci-dessus plus ce rapport | — |

## Ce que ça prouve et ce que ça ne prouve pas

Les tests prouvent que la configuration est correcte et déterministe : le registre vivant désigne DeepSeek, et l'Élève reçoit la partition `deepseek` en mode agentique. Ils ne prouvent **pas** que DeepSeek fonctionne bien dans la boucle MangoOS : aucun run n'a été lancé, conformément au brief. Le taux de réussite, la latence et le coût sont **non mesurés**.

## Ce qui reste

1. **Typecheck rouge** (`llm-transport.ts:116`) : à corriger par le lot propriétaire de ce fichier.
2. **Démarrage sans registre** : si `brain-registry.json` est absent ou corrompu, `getBrain("codeur")` renvoie `DEFAULT_REGISTRY.codeur` = `qwythos-tools:q6` en local (`brain-registry.ts:63`), et non `.env`. L'alignement de `.env` ne joue que si `codeur.model` est vide. Pour qu'un démarrage sans registre donne aussi DeepSeek, il faut modifier `brain-registry.ts`, interdit par ce brief.
3. **Autres rôles en `deepseek-v4-flash:0731`** : vision, designer_ux, extracteur, chercheur, juge, stratege, routeur et accueil. Ils seraient eux aussi reconnus par la partition `deepseek` si un chemin les passait à `resolveProfile`. Dans le code lu, seuls le rôle `codeur` (`provider.ts`, `globalFallback`) et les fiches mesurées (`profileForBrain`) le font.
4. `.axioms.deepseek.md` n'existe pas encore dans le workspace : le Maître le créera à la première escalade, comme pour les autres familles.
5. Valider en réel (run supervisé, après `PRELAUNCH_CHECKLIST.md`) que DeepSeek pilote correctement la boucle agentique.
