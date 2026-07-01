---
type: entité
tags: [skills, invocation-directe, composer, disclosure-progressive, transmission]
statut: livré
sources: ["#174"]
maj: 2026-07-02
---

# Skills (invocation directe)

Le format `.skills` existait déjà (frontmatter YAML + **divulgation progressive** — l'Élève ne voit que les métadonnées, il lit le `SKILL.md` à la demande). #174 ajoute **la moitié qui manquait** : taper `/nom args` au composer **déclenche** la skill en direct, avec substitution d'arguments — exactement le chemin `UserPromptExpansion` de Claude Code.

## Rôle

Deux populations de skills coexistaient sans le savoir : celles **apprises** par le reviewer nocturne (`review.ts`, du how-to « référence ») et celles **écrites à la main** (potentiellement des « actions » : fais X, dans cet ordre). #174 les distingue via `disable-model-invocation` (comme Claude Code) et donne le pouvoir d'**invoquer une skill en direct** au lieu de compter sur l'Élève pour deviner sa pertinence. Le corps substitué devient LE tour utilisateur, tel quel → résultat **prévisible**.

## Détails clés

| Pièce | Module | Détail |
|---|---|---|
| **Corps + expansion** | `skills.ts` | `readSkill(slug)` (corps complet, anti path-traversal `isValidSlug`) ; **`expandSkillBody` PURE** — substitution façon CC : `$ARGUMENTS` (tout le texte) · positionnels `$1`/`$2` · **nommés** `$env` (frontmatter `arguments: [env]`) · **annexe** le texte si aucun placeholder. Noms triés long→court (un `$env` n'entame pas `$environnement`). |
| **Filtrage passif** | `skillsPromptSection()` | Les skills `disable-model-invocation: true` **disparaissent** du prompt passif de l'Élève (il ne les déclenche plus seul) mais restent **résolvables en direct**. Condition non négociable du plan (le cas `/deploy` : ne pas laisser Mango déployer parce que le code « a l'air prêt »). |
| **Endpoint** | `council-skills-routes.ts` | `GET /api/skills/:slug?args=` → `{name, description, slug, body, disableModelInvocation, arguments, expanded}` (404 si inconnu) ; `slug` + `disableModelInvocation` ajoutés à `GET /api/skills` (autocomplétion + badge). |
| **Composer** | `Chat.jsx` | Un envoi utilisateur `/slug [args]` dont le slug est **connu** → fetch → **le corps expansé remplace le `/slug` brut** (il n'atteint jamais `/api/chat`) ; slug **inconnu** → envoyé tel quel (garde-fou). **Autocomplétion** : dropdown tant que le slug se tape (↑↓ / Tab / Entrée / Échap), badge « manuel ». |

## État

**Livré, prouvé** (#174, 2026-07-02) : back **test-skills 30/0** (expansion, parsing frontmatter, `isValidSlug`, filtrage, intégration fichiers temp) · `tsc` propre · build UI vert · **PREUVE HTTP RÉELLE** (backend éphémère port 3999, code #174) — 92 skills toutes avec slug, `disableModelInvocation:true` sur la manuelle, `?args=production` → `$environnement`→`production`, slug inconnu **404**, `expanded==body` sans args. **Reste** : preuve navigateur du composer (taper `/slug` dans un vrai `Chat.jsx`), après OBS — [[limites|L72]].

## Limite / périmètre

Périmètre V1 assumé (plan §5/§7) : **pas de scripts exécutables** embarqués dans une skill (contrairement à CC — les skills apprises sont du texte pur), **pas de partage/export** de skills entre projets (chaque skill reste scopée à son `workspace/.skills/`). Note : rendre les skills apprises (LLM, sans relecture systématique) invocables en direct augmente la surface de « ce que Mango pourrait faire si tu tapes le mauvais slash » — inoffensif (texte, pas de code exécuté), à garder en tête si des scripts s'ajoutent un jour.

## Liens
[[transmission-competences]] · [[gardien-cloture]] · [[hooks]] · [[loop]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#174` (plan `docs/plan-174-skills.md` · `statut.md` · `historique.md`) · modules `skills.ts` / `council-skills-routes.ts` · UI `Chat.jsx`.
