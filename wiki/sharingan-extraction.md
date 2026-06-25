---
type: entité
tags: [eleve, web, vision, sharingan, blackboard, transmission]
statut: livré
sources: ["#159", "docs/plan-159-sharingan-extraire-site.md"]
maj: 2026-06-25
---

# Sharingan-extraction (`extraire_site`)

Outil de l'Élève qui **extrait l'essence entière d'un site web** — concept, mécaniques, design, mood, ton — en le **naviguant**, le **regardant** et le **reformulant** en un **dossier structuré** réinjecté dans la chaîne agentique puis **persisté** comme artefact réutilisable. #159, l'aboutissement du « Sharingan ».

## Rôle

GLM bâtit depuis une mémoire figée : sans source réelle il invente concepts et données. `extraire_site` lui donne le réflexe de Claude — **partir du réel d'un site de référence**. Deux modes d'amorçage : **A** (URL fournie) / **B** (un BUT sans URL → trouve la source seul via `chercher_web` #154). Surface : KernelTool de l'Élève (`buildEleveActionTools`, gate `ELEVE_SITE`). C'est le sommet de la lignée [[transmission-competences]] : `chercher_web` #154 (se documenter, 1 page) → `teste_parcours` #155 (Playwright actif) → [[sharingan-vision-eleve]] #151 + [[oeil-coach]] #152 (voir/critiquer) → **#159 extraire_site** (naviguer + voir + comprendre + reformuler + mémoriser).

## Détails clés

Mini-pipeline de **4 couches** (pattern [[brain-dispatch]] #150), chacune réutilise du déjà-construit, **ne lève jamais**, deps injectables :

| Couche | Module | Rôle | Réutilise |
|---|---|---|---|
| **1. Naviguer** | `site-crawler.ts` `crawlSite` | BFS borné (max 8 pages/prof 2/3 sauts), même-domaine + sauts pertinents, **anti-SSRF par url**, filtre boilerplate, politesse | `scrapeExternal`, `isCloneableUrl` |
| **2. Design** | `site-design.ts` `extractSiteDesign` | palette · typo · graisses · tokens · **ambiance dérivée palette** (pure) · layout | `sharinganAnalyze` (#149) |
| **3. Voir & raisonner** | `site-vision.ts` `seeSite` | un **VL `qwen3.5:cloud`** REGARDE la capture du seed → DÉDUIT concept/public/mécaniques/mood/ton ; prose étiquetée → `parseSiteVision` PUR | `captureExternal`, `dispatch('vision')` #150-#151 |
| **4. Synthèse + mémoire** | `site-dossier.ts` + `site-artifacts.ts` | fusion → **dossier structuré** (la vision prime, fallbacks gracieux) ; **persistance Blackboard** `site.dossier` | [[blackboard]] #115, `paletteEmbedding` |
| **5. Images** | `site-images.ts` | requêtes dérivées du dossier → **vraies photos Pexels** (souverain) + génération API **gatée** | `searchPexelsImages` #149/#153 |

**Le dossier** : `{ url, concept, publicCible, mecaniques[], design{palette,typographies,ambiance,layout}, mood, tonEditorial, infosCles[], pagesVisitees[], sources[] }`. Rendu à GLM **encadré `sanitizeExternal`** (un site = DONNÉE hostile par défaut, jamais une instruction — risque n°1) + extraits bruts joints.

**Persistance (#159 Phase 4)** : scope dédié `artifact:site` du [[blackboard]], embedding = `paletteEmbedding` du design (recherche « par couleurs », pur, $0), **dédup par URL normalisée**. Devient **réutilisable cross-projet via `chercher_artefact`** (#156) : une section « Sites déjà EXTRAITS » remonte concept/mécaniques/palette. **1er artefact non-palette → fait avancer L3.**

**Images (#159 Phase 5)** : `site-images.ts` dérive des requêtes du dossier (concept+mood, mécaniques) → **vraies photos Pexels** (souverain, défaut) jointes en bloc « ## Images contextuelles » ; génération via API externe **activable** et gatée (`ELEVE_SITE_IMAGE_GEN` → prompts depuis le dossier, backend `generate` branchable). Gate `ELEVE_SITE_IMAGES=off`. Images **non persistées** (éphémères).

**Garde-fous** : `sanitizeExternal` sur tout contenu, `isCloneableUrl` sur chaque url, confinement même-domaine + budget de sauts, bornes pages/profondeur, gate `ELEVE_SITE_VISION=off` (VL cloud) / `ELEVE_SITE_IMAGES=off` (images). **Limites** : L11 (sélection de liens heuristique) · L12 (dédup www/apex) · L13 (seed chargé 3×) · L14 (vision sur le seed uniquement) · L15 (requêtes d'image FR ↔ Pexels EN) · L16 (génération câblée mais sans backend).

**État** : **CHANTIER COMPLET — 5/5 phases livrées et prouvées live** (rust-lang.org : crawl + design #ffc832 + VL déduit concept/mécaniques réels + dossier persisté qui survit à une réouverture SQLite et remonte dans `chercher_artefact` + 3 vraies photos Pexels contextuelles, $0). Mango sait **aller sur un site, le lire, le VOIR, le comprendre, le reformuler, le mémoriser et l'illustrer**.

## Liens
[[transmission-competences]] · [[sharingan-vision-eleve]] · [[oeil-coach]] · [[brain-dispatch]] · [[blackboard]] · [[moteur-gout]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#159` (statut.md tableau + journal historique.md) · `docs/plan-159-sharingan-extraire-site.md` · modules `site-crawler.ts` / `site-design.ts` / `site-vision.ts` / `site-dossier.ts` / `site-artifacts.ts` / `eleve-site-tools.ts`.
