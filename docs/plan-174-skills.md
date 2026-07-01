# Plan #174 — « Skills » : invocation directe, `$ARGUMENTS`, skills manuelles

> Le format existe déjà et il est déjà quasi identique à celui de Claude Code : `workspace/.skills/<slug>/SKILL.md`, frontmatter YAML `name`/`description`, divulgation progressive (`skillsPromptSection()` n'injecte que les métadonnées, l'Élève lit le fichier complet à la demande). Ce plan ne touche presque pas au back — il ajoute la moitié qui manque : que TOI, tu puisses taper `/nom-de-skill` et déclencher directement une skill, avec des arguments, plutôt que de compter sur l'Élève pour deviner qu'elle est pertinente.

---

## 1. Le verdict honnête

**Oui, et c'est le plus petit chantier côté back des 4 — presque tout le travail est dans le composer du workspace.**

### Pourquoi c'est bénéfique
1. **Le format est déjà bon.** `skills.ts` parse déjà un frontmatter YAML minimal, gère la dégradation gracieuse (SKILL.md malformé → skill ignorée, pas de crash), et la couche de divulgation progressive est exactement le bon design (pas de gonflement du system prompt tant que la skill n'est pas invoquée).
2. **Deux populations de skills coexistent déjà, sans le savoir.** Le reviewer nocturne (`review.ts`) écrit des skills APPRISES automatiquement — ce sont des skills de type "référence" (comment faire une classe de tâche). Le formulaire manuel (`/api/skill`) permet à toi d'en écrire une à la main — ce sont potentiellement des skills de type "action" (fais X, dans cet ordre précis). CC distingue ces deux usages par `disable-model-invocation` ; Mango ne les distingue pas du tout aujourd'hui.

### Le risque réel
Une skill invoquée directement doit produire un résultat PRÉVISIBLE — si `/deploy` finit par déclencher un comportement différent selon que l'Élève "interprète" le contenu de la skill ou l'exécute au pied de la lettre, l'invocation directe perd son intérêt (autant laisser l'Élève décider tout seul). Il faut que le corps de la skill, une fois substitué (`$ARGUMENTS`), devienne LE tour utilisateur tel quel — pas une suggestion de plus dans le contexte.

### Condition non négociable
**(A) Une skill à invocation manuelle (`disable-model-invocation: true`) doit disparaître de `skillsPromptSection()`.** Sinon l'Élève peut la déclencher tout seul alors que tu voulais la garder sous contrôle manuel (le cas `/deploy` de la doc CC — tu ne veux pas que Mango décide de déployer parce que le code "a l'air prêt").

---

## 2. La vision en une phrase

> Taper `/nom` dans le composer expanse le SKILL.md correspondant (avec substitution `$ARGUMENTS`) en tour utilisateur — exactement le chemin `UserPromptExpansion` de Claude Code — pendant que les skills silencieuses continuent d'être lues par l'Élève comme aujourd'hui.

---

## 3. Architecture

### Back — extensions minimales de `skills.ts`
Le frontmatter gagne 2 clés optionnelles (le parsing regex existant se généralise trivialement, `get("disable-model-invocation")` etc.) :
```yaml
---
name: deploy-staging
description: Déploie le projet courant sur l'environnement de staging
disable-model-invocation: true
arguments: [environnement]
---
Déploie $environnement en suivant la procédure...
```
- `disable-model-invocation: true` → exclue de `skillsPromptSection()` (l'Élève ne la voit plus passivement), mais reste résolvable en direct.
- `arguments` → liste positionnelle pour la substitution `$nom`/`$ARGUMENTS` (mêmes conventions que CC, pas besoin d'en inventer d'autres).

### Nouvel endpoint
`listSkills()` ne renvoie aujourd'hui QUE `{name, description, file}` — jamais le corps. Il faut :
```
GET /api/skills/:slug → { name, description, body, disableModelInvocation, arguments }
```

### Composer (front, `Chat.jsx` ou équivalent du workspace)
```
message envoyé par toi
  → si /^\/(\S+)(.*)$/ matche un slug connu (fetch léger de /api/skills pour la liste des slugs valides)
      → GET /api/skills/:slug
      → substitue $ARGUMENTS / $1 $2... avec le reste du texte tapé
      → CE texte devient le tour utilisateur envoyé à /api/chat (pas le "/slug ..." brut)
  → sinon : comportement actuel, inchangé
```

C'est le SEUL endroit qui change côté UI — le reste de la boucle (chat → Élève → outils) ne voit jamais la différence entre un message normal et un message issu d'une skill expansée.

---

## 4. Phases

| # | Phase | Livrable clé | Prouve quoi | Modèle optimal | Effort |
|---|---|---|---|---|---|
| **0** | **Endpoint corps complet** | `GET /api/skills/:slug` — renvoie le body brut + les nouveaux champs de frontmatter. | le back peut servir le contenu complet, pas juste les métadonnées | ⚖️ Sonnet 4.6 | S |
| **1** | **Détection `/slug` + expansion simple** | Composer : regex de détection, fetch, remplacement du texte envoyé. Sans `$ARGUMENTS` d'abord (corps tel quel + le reste du texte tapé annexé, comme CC le fait par défaut si `$ARGUMENTS` est absent du contenu). | le chemin `/nom` → expansion → tour utilisateur fonctionne de bout en bout | ⚖️ Sonnet 4.6 | M |
| **2** | **`$ARGUMENTS` + `disable-model-invocation`** | Substitution positionnelle ; `skillsPromptSection()` filtre les skills à invocation manuelle. | une skill peut être manuelle-only ET recevoir des arguments | ⚖️ Sonnet 4.6 | S |
| **3** | **Auto-complétion** *(confort, pas bloquant)* | Liste déroulante quand le composer commence par `/` — filtre sur les slugs connus, affiche la description. | confort d'usage, pas une nouvelle capacité | ⚖️ Sonnet 4.6 | S |

---

## 5. Garde-fous
- Une skill inconnue tapée après `/` (`/n-importe-quoi`) doit être envoyée TELLE QUELLE au chat normal — jamais d'erreur bloquante, juste un texte qui commence par un slash comme n'importe quel message.
- `skillsPromptSection()` reste la source de vérité pour ce que l'Élève voit passivement — la phase 2 la fait juste FILTRER, elle n'y touche pas autrement.
- Pas de scripts exécutables embarqués dans une skill en V1 (contrairement à CC) — hors scope, à considérer plus tard seulement si un vrai besoin apparaît (les skills apprises par le reviewer nocturne sont aujourd'hui du texte pur, pas des procédures avec scripts).

## 6. Définition de « réussi »
1. Taper `/nom-de-skill argument` déclenche exactement le contenu attendu, substitué.
2. Une skill `disable-model-invocation: true` n'apparaît plus dans ce que l'Élève voit spontanément, mais reste invocable en direct.
3. Un slash suivi d'un slug inconnu ne casse rien — comportement actuel préservé.

## 7. Risques résiduels & honnêteté
- Les skills apprises automatiquement par `review.ts` sont écrites par un LLM sans relecture systématique de toi — les rendre invocables en direct (au lieu de purement passives) augmente la surface de "ce que Mango pourrait faire si tu tapes le mauvais slash". Pas un risque grave (le contenu reste du texte, pas du code exécuté), mais à garder en tête si tu envisages plus tard d'ajouter des scripts aux skills.
- Pas de mécanisme de partage/export de skills entre projets en V1 — chaque skill reste scopée à son `workspace/.skills/`.

## 8. Modèle / Effort global
⚖️ **Sonnet 4.6** suffit sur toute la ligne — c'est un chantier mécanique, sans risque cross-cutting sur le noyau `eleve.ts`. **Effort global : S.**
