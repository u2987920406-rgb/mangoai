# Plan #172 — « Hooks » : généraliser les gardes de Mango en couche déclarative

> Aujourd'hui, Mango a déjà des hooks — ils s'appellent juste autrement, et chacun est une fonction TypeScript câblée à la main dans `eleve.ts` : le Gardien (`eleve-gate.ts`), la garde de portée (`eleve-judge.ts`), l'anti-spirale (`eleve-antispiral.ts`), les correctifs d'edit (`edit-match.ts`, `tool-call-coerce.ts`). Ce plan ne les remplace pas : il leur donne un **contrat commun** (événement + matcher + handler, déclaratif) pour qu'une 6ᵉ garde ne demande plus un nouveau fichier `.ts` + un câblage manuel dans le noyau — juste une entrée de config.

> ⚠️ Numérotation : ce document part de l'hypothèse que #171 est la dernière idée fermée (vérifié dans `statut.md`/`wiki/log.md` au moment du clone). Si ta session nocturne a avancé depuis, recale le numéro avant de committer.

---

## 1. Le verdict honnête

**Oui, ça vaut le coup — c'est le plus structurant des 4, parce que c'est le seul qui ne demande AUCUNE nouvelle capacité : il unifie du code qui marche déjà.**

### Pourquoi c'est le bon levier
1. **Zéro risque conceptuel.** On ne parie sur rien de nouveau — le Gardien, l'anti-spirale, le scope-guard tournent en prod et sont testés. La migration prouve juste que l'abstraction est suffisante en la faisant porter du code réel.
2. **Ça rend Mango extensible sans recompiler.** Aujourd'hui, ajouter une garde = toucher `eleve.ts` (1639 lignes). Demain : une entrée JSON.
3. **Ça prépare le terrain pour l'auto-évolution.** #168 forge des AGENTS depuis une lacune détectée. Rien n'empêche, plus tard, que le Stratège forge un **hook** plutôt qu'un agent pour une classe de blocage récurrente et déterministe (`OnGapRecorded` → propose un hook, pas juste un spécialiste).

### Les risques réels
1. **Sur-ingénierie** : essayer de couvrir les ~30 événements de Claude Code d'un coup. Mango n'a pas 30 points d'ancrage réels — il en a une poignée. On ne modélise QUE ce qui existe.
2. **Perf de la boucle chaude** : `PreToolUse`/`PostToolUse` s'exécutent à CHAQUE appel d'outil, dans la boucle la plus fréquentée du système (`askEleveAgentic`). Un hook lent ou mal écrit ralentit tout.
3. **Régression silencieuse pendant la migration** : si on réécrit le Gardien "à la hooks" et qu'on introduit un bug, ça se voit tard (le Gardien ne bloque que rarement).

### Conditions non négociables
- **(A) Ancrage sur des points RÉELS, pas walkés depuis la doc CC.** Voir section 3 — chaque événement correspond à une ligne précise déjà identifiée dans `eleve.ts`.
- **(B) Fail-open partout.** Un hook qui plante, time-out ou renvoie n'importe quoi ne doit JAMAIS faire planter un tour — même discipline que tout le reste du code Mango (« ne lève jamais »).
- **(C) Migration = refactor d'abord, extension ensuite.** Les phases 2-3 (migrer le Gardien et l'anti-spirale) doivent laisser leurs suites de tests existantes vertes SANS modification. Si un test doit changer pour que ça passe, la migration a un bug.

---

## 2. La vision en une phrase

> Un événement (un point précis de la boucle) + un matcher (quand ça s'applique) + un handler (commande, fonction, ou prompt) — stockés en JSON, exécutés par un seul dispatcher générique, plutôt que N fonctions bespoke câblées à la main.

---

## 3. Architecture — les points d'ancrage réels

Contrairement aux 3 autres plans, celui-ci ne propose pas d'inventer de nouveaux points d'exécution : il nomme des lignes qui existent déjà.

| Événement | Ligne réelle dans `eleve.ts` | Équivalent CC | Aujourd'hui |
|---|---|---|---|
| `PreToolUse` | `askEleveAgentic`, juste avant `registry.invoke(name, args)` (~ligne 780) | `PreToolUse` | rien — l'appel se fait direct |
| `PostToolUse` | `askEleveAgentic`, juste après `registry.invoke` (~ligne 782) | `PostToolUse` | `opts.onTool?.(name, rawArgs)` existe déjà mais est fire-and-forget (aucun retour ne peut bloquer/modifier) |
| `OnBlock` | `strategeDiagnoseRefined()` / `diagnose()` (lignes 1203, 1225, 1306, 1510) | *(pas d'équivalent direct)* | codé en dur — le Stratège route directement vers un remède |
| `PreFinish` | `runClosureGate(...)` (ligne 1466) | `Stop` | c'est LE Gardien — devient le premier hook `PreFinish` par défaut |
| `OnEscalate` | `escalateToClaude(...)` (lignes 873/926) | *(pas d'équivalent)* | codé en dur |
| `OnGapRecorded` *(natif Mango)* | `recordUncoveredGap(...)` (ligne 1315) | *(aucun — Mango-spécifique)* | codé en dur, alimente `self-evolution.ts` |

`PreToolUse`/`PostToolUse` sont les seuls qui touchent la boucle chaude. Tout le reste s'accroche à des call-sites déjà isolés — le risque de perf/régression est concentré à un seul endroit.

### Handlers — 3 types au départ (pas 5 comme CC)
- **`function`** — TS in-process. Sert à migrer les gardes existantes sans changer leur mode d'exécution (elles restent des fonctions TS, juste appelées via le dispatcher).
- **`command`** — script shell/node, exécuté via l'infra sandbox déjà prouvée dans `mango-self.ts` (`node --permission`, FS confiné, réseau/`child_process` refusés). Pas besoin d'inventer un nouveau bac à sable.
- **`prompt`** — évaluation LLM légère (réutilise `askLLM`), pour un hook de type "juge" simple sans écrire de code.

*(`http` et `mcp_tool`, que CC propose, sont hors scope V1 — Mango n'a pas de cas d'usage local pour ça aujourd'hui.)*

### Contrat entrée/sortie
Repris quasi tel quel de CC parce que le contrat est déjà bon :
```ts
interface MangoHookInput {
  event: "PreToolUse" | "PostToolUse" | "OnBlock" | "PreFinish" | "OnEscalate" | "OnGapRecorded";
  toolName?: string;
  toolInput?: Record<string, unknown>;
  projectDir: string;
  // + champs spécifiques à l'événement (blocker/detail pour OnBlock, etc.)
}

interface MangoHookOutput {
  decision?: "allow" | "deny" | "ask";
  reason?: string;
  updatedInput?: Record<string, unknown>; // PreToolUse seulement
}
```

### Stockage
`workspace/.hooks/hooks.json` (projet-scopé), même esprit que `.claude/settings.json` :
```json
{
  "PreToolUse": [
    { "matcher": "run_command", "handler": { "type": "command", "command": "./hooks/no-rm-rf.sh" } }
  ],
  "PreFinish": [
    { "matcher": "*", "handler": { "type": "function", "ref": "runClosureGate" } }
  ]
}
```

---

## 4. Phases

| # | Phase | Livrable clé | Prouve quoi | Modèle optimal | Effort |
|---|---|---|---|---|---|
| **0** | **Cœur pur** | `mango-hooks.ts` : types `MangoHookEvent`/`HookHandler`, `runHooks(event, ctx, handlers)` — ne lève jamais, timeout dur, dédup. **Aucun branchement.** Tests unitaires seuls. | le dispatcher fonctionne en isolation, sur des handlers bidons | 🧠 Opus 4.8 | S |
| **1** | **Branchement PreToolUse/PostToolUse** | Câblage dans `askEleveAgentic` autour de `registry.invoke`, gaté `ELEVE_HOOKS=off`. Preuve sur un hook-jouet (bloque `run_command` contenant `rm -rf`, cas déjà couvert ailleurs mais bon test de fumée). | le point le plus risqué (boucle chaude) tient sans régression, perf mesurée | 🧠 Opus 4.8 | M |
| **2** | **Migration du Gardien** | `runClosureGate` devient LE hook `PreFinish` par défaut — même code, appelé via le dispatcher au lieu d'un appel direct ligne 1466. | zéro régression : la suite `test-eleve-gate.ts` reste verte SANS modification | ⚖️ Sonnet 4.6 | M |
| **3** | **Migration anti-spirale + scope-guard** | Même traitement pour `eleve-antispiral.ts` et `eleve-judge.ts` (scope-guard) — deviennent des hooks `PreToolUse`/`PreFinish` par défaut. | le patron de migration est répétable, pas un one-off | ⚖️ Sonnet 4.6 | M |
| **4** | **UI minimale** | Onglet "Hooks" dans Réglages › Automatisation (à côté de Cron) — liste les hooks actifs, active/désactive. Pas d'éditeur JSON graphique en V1 (édition du fichier à la main, ou demandée à Mango en chat). | tu peux VOIR ce qui est branché sans lire `hooks.json` | ⚖️ Sonnet 4.6 | S |
| **5** | **`OnBlock`/`OnGapRecorded`/`OnEscalate` en hooks** | Les 3 événements restants basculent du câblage en dur vers le dispatcher. | le Stratège et l'auto-évolution deviennent eux-mêmes pilotables par hook, sans toucher `eleve.ts` | 🧠 Opus 4.8 | L |

Phases 0-2 = le cœur indispensable, livrable et prouvable seul (tu as déjà un système de hooks fonctionnel avec le Gardien migré). 3-5 = extension, à faire seulement après que 0-2 tournent sans accroc.

---

## 5. Garde-fous
- Fail-open partout : un hook qui plante = comme s'il n'existait pas, jamais un tour cassé.
- Gaté `ELEVE_HOOKS` (défaut off), migration silencieuse (comportement identique, testé par les suites existantes).
- Timeout dur par hook (proposition : 5s pour `function`/`command`, 15s pour `prompt` — à ajuster).
- Jamais de hook qui modifie du code hors du `projectDir` courant (même confinement `resolveInside` que le reste).

## 6. Définition de « réussi »
1. Le Gardien tourne EXACTEMENT pareil après migration (tests inchangés, verts).
2. Tu peux ajouter un hook sans toucher `eleve.ts` et le voir s'exécuter au bon moment.
3. Un hook cassé ne fait jamais planter un tour — vérifié par un test qui fait exprès de faire planter un handler.
4. La latence ajoutée par le dispatcher sur `PreToolUse`/`PostToolUse` est mesurée et négligeable (proposition : < 5ms hors exécution du handler lui-même).

## 7. Risques résiduels & honnêteté
- Le point `PreToolUse`/`PostToolUse` touche la boucle la plus chaude du système — c'est le seul endroit où une régression de perf est possible. Phase 1 doit inclure une mesure avant/après.
- `OnBlock` a 4 call-sites (1203, 1225, 1306, 1510) — pas 1. La phase 5 doit vérifier que les 4 sont bien couverts, pas juste le premier trouvé.
- Ce plan ne couvre pas de hook `SessionStart`/`SessionEnd` (création/fermeture de projet) — volontairement hors scope V1, à ajouter si un besoin réel apparaît (pas de cas d'usage identifié aujourd'hui).

## 8. Modèle / Effort global
🧠 **Opus 4.8** pour les phases 0-1 (cœur + branchement dans la boucle chaude = cross-cutting, risqué) et la phase 5 (ouvrir `OnBlock` touche le Stratège). ⚖️ **Sonnet 4.6** suffit pour les migrations 2-3 et l'UI (mécanique, patron déjà prouvé par la phase 1). **Effort global : L.**
