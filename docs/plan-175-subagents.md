# Plan #175 — « Subagents » : de conseillers à exécutants

> `runSpecialist(id, task)` — vérifié dans `specialist-agents.ts` — c'est UN appel `askLLM(systemPrompt, task)`. Texte en entrée, texte en sortie. Zéro outil, zéro boucle, zéro accès disque. Un agent forgé donne un avis, il n'agit jamais. Ce plan lui donne la boucle `askEleveAgentic` complète, avec un jeu d'outils restreint à son rôle — sans toucher à la partie que Mango fait déjà mieux que Claude Code : **fabriquer ses propres agents à la volée** (`agent-forge.ts`, `self-evolution.ts`).

---

## 1. Le verdict honnête

**Oui — c'est le plus gros et le plus stratégique des 4 — mais il est déjà en mouvement. Ce plan ne lance pas un nouveau chantier, il nomme et cadre une trajectoire qui existe déjà dans `eleve.ts`.**

### Pourquoi c'est déjà en marche
Le run de ce matin (#168, "reprise auto") fait EXACTEMENT le geste que ce plan formalise : `consultSpecialist` récupère un agent fraîchement forgé et sa réponse est réinjectée dans la MÊME boucle Élève via `buildDelegateNudge`. C'est un spécialiste qui influence l'exécution sans l'exécuter lui-même — la moitié du chemin est faite. Il manque l'autre moitié : que le spécialiste EXÉCUTE, pas seulement conseille.

### Pourquoi Mango a un avantage que CC n'a pas
Un subagent Claude Code se définit dans un fichier `.claude/agents/*.md` que TOI tu écris. Un agent forgé Mango est conçu par le forgeron (Opus) depuis une lacune RÉELLEMENT rencontrée, avec son cerveau auto-assigné (`assignBrain`) selon la compétence dominante détectée. Ce plan garde ça intact — il ne fait qu'ajouter une case à cocher à la forge : le spécialiste a-t-il besoin d'AGIR, ou seulement de conseiller ?

### Le risque réel
Donner un accès complet aux outils à un agent conçu par un LLM (pas audité par toi ligne à ligne, contrairement à un subagent CC que tu écris toi-même) élargit la surface d'erreur. Un conseil texte foireux, tu le lis et tu l'ignores. Un `write_file` foireux touche vraiment ton projet.

### Condition non négociable
**(A) La policy d'outils est décidée à la FORGE, jamais négociable par le spécialiste à l'exécution.** Le forgeron (Opus, le raisonneur le plus fiable du registre) assigne le mode (`conseil`/`action`) et le `toolPolicy` au moment de la conception de l'agent — pas l'agent lui-même, pas au moment de l'invocation. C'est la même logique de sûreté que `assignBrain` applique déjà au choix du cerveau.

---

## 2. La vision en une phrase

> Un agent forgé en mode `action` reçoit sa propre boucle `askEleveAgentic`, un registre d'outils scellé à la forge selon son rôle, et un budget d'itérations plus petit que l'Élève principal — il traite un sous-problème borné, il ne remplace jamais l'Élève sur le projet entier.

---

## 3. Architecture

### `ToolPolicy` s'étend (aujourd'hui un seul booléen)
```ts
// eleve-action-tools.ts — aujourd'hui :
export interface ToolPolicy {
  allowRun?: boolean;
}

// Cible :
export interface ToolPolicy {
  allowRun?: boolean;
  allowedTools?: string[]; // allowlist explicite — si présent, SEULS ces outils existent
  deniedTools?: string[];  // denylist — retirés même si `allowedTools` les inclurait
}
```

### `SpecialistAgent` gagne un mode et une policy
```ts
// specialist-agents.ts
interface SpecialistAgent {
  // ... champs existants (name, role, systemPrompt, provider, model, timeoutMs)
  mode?: "conseil" | "action";       // défaut "conseil" — rétrocompatible, zéro régression
  toolPolicy?: ToolPolicy;           // rempli par le forgeron si mode === "action"
}
```

### Nouvelle fonction, à côté de `runSpecialist` (pas à sa place)
```ts
export async function runSpecialistAgentic(
  id: string,
  task: string,
  projectDir: string,
  deps: { agentic?: typeof askEleveAgentic } = {},
): Promise<{ ok: boolean; text: string; toolTrace: ToolTrace[]; agent?: SpecialistAgent }> {
  const agent = getSpecialist(id)
  if (!agent) return { ok: false, text: `Spécialiste introuvable : ${id}`, toolTrace: [] }
  const registry = buildEleveActionTools(projectDir, agent.toolPolicy ?? {})
  const run = deps.agentic ?? askEleveAgentic
  const result = await run(agent.systemPrompt, sanitizeExternal(task), registry, {
    maxIterations: SPECIALIST_MAX_ITER, // volontairement < MAX_TOOL_ITERATIONS de l'Élève principal
  })
  return { ok: true, text: result.text, toolTrace: result.toolTrace, agent }
}
```

### Le forgeron assigne le mode (même patron que `assignBrain`)
`agent-forge.ts` a déjà `assignBrain(spec)` qui choisit le cerveau selon la compétence dominante détectée dans le rôle. On ajoute `assignMode(spec)` sur le même principe : des mots-clés d'action (« corrige », « écrit », « génère », « répare ») → `action` + une `toolPolicy` dérivée du domaine (ex. un agent PDF reçoit `lire_document`/`lire_archive`, jamais `run_command` ; un agent de refactor reçoit `read_file`/`edit_file`/`check_types`, jamais l'accès réseau). Des mots-clés d'analyse (« évalue », « diagnostique », « conseille ») → `conseil`, comme aujourd'hui.

### Point de branchement
`consultSpecialist` (`specialist-delegate.ts`) choisit entre les deux :
```ts
const runner = agent.mode === "action" ? runSpecialistAgentic : runSpecialist
```

---

## 4. Phases

| # | Phase | Livrable clé | Prouve quoi | Modèle optimal | Effort |
|---|---|---|---|---|---|
| **0** | **Extension des types** | `ToolPolicy` élargi, champs `mode`/`toolPolicy` sur `SpecialistAgent`, stockage dans `data/specialist-agents.json`. Purement additif — aucun agent existant n'a `mode` défini, donc tous restent `conseil` par défaut. | zéro régression sur les 10+ agents déjà forgés | ⚖️ Sonnet 4.6 | S |
| **1** | **`runSpecialistAgentic`** | La fonction elle-même, testée EN ISOLATION (deps injectées, comme tout le reste de ce code) — PAS ENCORE branchée dans `eleve.ts`. | un agent avec une policy restreinte peut vraiment lire/écrire dans un projet de test, sans dépasser son allowlist | 🧠 Opus 4.8 | M |
| **2** | **`assignMode` dans le forgeron** | `agent-forge.ts` assigne `mode`+`toolPolicy` à chaque NOUVEL agent forgé, même patron que `assignBrain`. Les agents existants restent inchangés (migration manuelle optionnelle si tu veux en repasser certains en mode action). | la forge produit des agents actionnables sans intervention manuelle de ta part | 🧠 Opus 4.8 | M |
| **3** | **Branchement dans `consultSpecialist`** | Bascule vers `runSpecialistAgentic` quand `agent.mode === "action"`, gaté `ELEVE_DELEGATE_AGENTIC=off` par défaut. | le chemin complet (Stratège bloque → délègue → spécialiste AGIT → reprend) fonctionne gate ON | 🧠 Opus 4.8 | L |
| **4** | **Preuve live** | Reforger UN agent existant (ex. le Déchiffreur de PDF, déjà identifié dans tes runs précédents) en mode `action`, lui donner une vraie tâche bornée, vérifier qu'il écrit effectivement un fichier. | la boucle complète marche sur un cas réel, pas juste en test unitaire | 🧠 Opus 4.8 | M |

Phases 0-2 sont indépendantes et sans risque (rien n'est branché dans la boucle live). La phase 3 est celle qui compte vraiment — à ne faire qu'une fois 0-2 stables.

---

## 5. Garde-fous
- Budget d'itérations d'un spécialiste TOUJOURS strictement inférieur à celui de l'Élève principal (`SPECIALIST_MAX_ITER < MAX_TOOL_ITERATIONS`) — un sous-agent traite un sous-problème, jamais tout le projet.
- La `toolPolicy` est scellée à la forge — aucun mécanisme ne permet à un spécialiste de s'auto-élargir les droits à l'exécution.
- `mode: "action"` reste gaté OFF (`ELEVE_DELEGATE_AGENTIC`) jusqu'à preuve live (phase 4) — les agents existants restent des conseillers tant que le gate n'est pas activé.
- Un spécialiste en mode action reste soumis au même confinement de chemins (`resolveInside`) que l'Élève principal — pas de régime d'exception.

## 6. Définition de « réussi »
1. Un agent forgé en mode `action` peut lire ET écrire dans un projet, avec un jeu d'outils strictement limité à ce que sa `toolPolicy` autorise (vérifié en testant qu'il NE PEUT PAS appeler un outil hors liste).
2. Le forgeron assigne `mode`/`toolPolicy` sans intervention manuelle, sur au moins 3 rôles différents testés (ex. PDF, refactor, contenu).
3. La reprise auto (#168) peut un jour basculer d'un simple nudge texte vers une vraie délégation d'exécution — ce plan rend ce prochain pas possible, sans l'imposer ici.

## 7. Risques résiduels & honnêteté
- Le forgeron (un LLM) décide de la `toolPolicy` — une mauvaise assignation (trop permissive) reste possible. Atténué par : mode `action` gaté off jusqu'à preuve live, budget d'itérations réduit, confinement de chemin hérité.
- Ce plan ne redéfinit PAS `runSpecialist` (conseil) — il coexiste avec `runSpecialistAgentic` (action). Les deux modes cohabitent délibérément ; ne pas chercher à les fusionner en une seule fonction, la distinction est le garde-fou.
- La phase 4 (preuve live) dépend d'avoir un cas réel disponible — si aucun blocage naturel ne s'y prête au moment de l'implémentation, prévoir un scénario de test construit plutôt que d'attendre indéfiniment (même logique que la L56 sur la reprise auto, où la preuve live "sauvage" a dû être reportée faute d'occurrence naturelle).

## 8. Modèle / Effort global
🧠 **Opus 4.8** pour l'essentiel — c'est le chantier le plus cross-cutting des 4 (touche `agent-forge.ts`, `specialist-delegate.ts`, et potentiellement `eleve.ts`). ⚖️ **Sonnet 4.6** suffit pour la phase 0 (extension de types, mécanique). **Effort global : L**, mais phases 0-2 livrables indépendamment et sans risque avant d'attaquer la 3.
