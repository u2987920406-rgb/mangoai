# Plan #159 — « Le Sharingan complet » : `extraire_site`

> **Statut** : planifié, validé sur les 3 décisions de cadrage (Raf, 2026-06-25). Pas encore codé. Exécution phase par phase, preuve live + clôture doc à chaque phase.

## Vision (demandée par Raf)
Mango reçoit une URL et doit **extraire l'essence entière d'un site** — pas juste sa palette : son **concept**, ses **mécaniques/fonctionnalités**, son **design** (couleurs, typo, ambiance, layout), son **ton**, et **raisonner** dessus — puis **reformuler** en un **dossier structuré** rendu à la chaîne agentique (GLM ou un autre cerveau) comme **donnée fiable** à réinjecter. C'est l'aboutissement de la métaphore du Sharingan : copier l'essence d'un site pour s'en inspirer/le comprendre.

Exemple-cible (Raf) : un site de Zelda-like → « jeu d'aventure exploratoire, palette terre/émeraude, typo serif fantasy, mécaniques carte ouverte + énigmes + inventaire, ton héroïque ».

## Décisions de cadrage (validées)
1. **Images** : *les deux* — vraies photos thématiques (Pexels, `chercher_image` #153, souverain, défaut) **+** génération via API externe **activable** si clé posée (gaté, jamais imposé).
2. **Portée crawl** : *domaine + sauts pertinents* — même-domaine par défaut, **budget séparé** de sauts externes très pertinents (déf. ≤ 3), anti-SSRF + sanitize sur chacun.
3. **Surface** : *outil de l'Élève* (`extraire_site` dans `buildEleveActionTools`, gate `ELEVE_SITE`). Pas de bouton UI (possible plus tard).

## Deux modes d'amorçage (autonomie — exigence de Raf)
Mango doit savoir extraire **dans les deux cas** :
- **Mode A — URL fournie** : Raf donne l'adresse → `extraire_site({ url })` direct.
- **Mode B — objectif sans URL (autonome)** : Raf donne un BUT (« va chercher sur un site de jeux vidéo connu les références de Zelda-like ») → Mango **trouve les sites lui-même** : il raisonne qu'il faut une source, appelle `chercher_web` (#154) pour **découvrir** les sites pertinents, **choisit le(s) meilleur(s) par raisonnement**, puis `extraire_site` dessus — **sans qu'on lui donne l'URL**.

**Comment l'autonomie est obtenue** (deux leviers complémentaires) :
1. **Composition agentique (cœur)** : GLM possède déjà `chercher_web` + aura `extraire_site`. Une **clause de contrat ⚠ TROUVER LA SOURCE TOI-MÊME** encode le réflexe : *« si on te demande une info sans URL, ne réclame pas l'adresse : cherche les sites de référence (`chercher_web`), choisis les meilleurs par ton raisonnement, puis `extraire_site`. »* L'autonomie émerge de l'enchaînement, c'est la vraie pensée agentique.
2. **Commodité mono-appel (option)** : `extraire_site` accepte aussi `{ recherche }` au lieu de `{ url }` → cherche le meilleur résultat puis l'extrait, en un seul outil (pour les cas simples). Le cœur reste la composition (GLM peut comparer plusieurs sites, en extraire plusieurs).

*(La proactivité totale « sans aucune commande » relève de l'orchestrateur/boucle nocturne — extension future, hors #159.)*

## Architecture : un outil qui orchestre 4 couches
`extraire_site({ url?, recherche?, objectif? })` = **mini-pipeline** (pattern brain-dispatch #150) exposé comme **KernelTool de l'Élève**. `url` (mode A) **ou** `recherche` (mode B mono-appel) ; `objectif` oriente l'extraction. Chaque couche réutilise du déjà-construit (rien à réinventer) :

| Couche | Rôle | Réutilise |
|---|---|---|
| **1. Naviguer** | Crawl borné (même-domaine + sauts pertinents) : suivre les liens utiles, lire N pages | `getBrowser`, `scrapeExternal` (texte+liens), `isCloneableUrl` (anti-SSRF), Playwright de `teste_parcours` #155 |
| **2. Design (Sharingan)** | Palette · typo · ambiance · layout des pages clés | `taste-engine.ts` (URL→tokens, déjà fait #149) + `capturePreview` |
| **3. Voir & raisonner** | Le VL regarde les captures → concept, mécaniques, mood | `dispatch('vision')` (qwen3.5:cloud) #151, freeform |
| **4. Synthèse** | Fusionner texte+design+visuel → **dossier structuré reformulé** | GLM ou agent `extracteur`/`chercheur` #150, schéma de sortie, `sanitizeExternal` |

### Le dossier produit (la « reformulation »)
```
{ url, exploré_le, pages_visitées[],
  concept, public_cible, mécaniques[],
  design: { palette[], typographies[], ambiance, layout },
  ton_éditorial, infos_clés[], sources[] }
```
→ rendu à GLM **encadré `sanitizeExternal`** (donnée, pas instruction), **et persisté dans le Blackboard** comme nouveau type d'artefact `site.dossier` → réutilisable cross-projet (**fait avancer la limite L3** : étendre les artefacts au-delà des palettes).

## Modules
- **`site-crawler.ts`** (nouveau) — `crawlSite(url, opts, deps)` : BFS borné même-domaine + sauts pertinents ; anti-SSRF par URL ; politesse (délai, UA honnête, robots.txt) ; renvoie `pages[{url,title,text,links,screenshotB64?}]`. Deps injectables (getBrowser/scrape). Ne lève jamais.
- **`site-extract.ts`** (nouveau) — `extractSiteDossier(pages, opts, deps)` : couches design (taste-engine) + vision (dispatch) + synthèse (cerveau) → dossier structuré ; `sanitizeExternal` partout.
- **`eleve-site-tools.ts`** (nouveau) — `buildEleveSiteTools(projectDir, deps)` → KernelTool `extraire_site({ url?, recherche?, objectif? })` ; mode A (`url`) / mode B (`recherche` → `searchWeb` puis extraction) ; gate `ELEVE_SITE`, budget par tâche.
- **`kernel-artifacts.ts`** (étendu) — type/scope `site.dossier` (persistance + recherche), réutilisé par `chercher_artefact` (#156) → un dossier de site devient un artefact réutilisable.
- Branchement `buildEleveActionTools` + **deux clauses** `AGENTIC_TOOL_CONTRACT` : ⚠ EXTRAIRE UN SITE (quand utiliser l'outil) **et** ⚠ TROUVER LA SOURCE TOI-MÊME (mode B : chercher la source avant d'extraire, ne pas réclamer l'URL) + tests + preuve live.

## Découpage en phases (livrable + preuve à chaque étape)

| Phase | Contenu | Modèle | Effort |
|---|---|---|---|
| **1 — Naviguer + extraire texte** | `site-crawler.ts` + `extraire_site` minimal (synthèse texte multi-pages). Le socle « aller sur le site, lire les pages » | ⚖️ Sonnet 4.6 | M |
| **2 — Couche design (Sharingan)** | Palette/typo/ambiance via `taste-engine` sur les pages clés | ⚖️ Sonnet 4.6 | S |
| **3 — Voir & raisonner** | `dispatch('vision')` sur captures → concept/mécaniques/mood + **fusion en dossier structuré** | 🧠 Opus 4.8 | M |
| **4 — Réinjection + persistance** | Retour DATA à GLM + dossier persisté Blackboard (`site.dossier`, réutilisable) | 🧠 Opus 4.8 | M |
| **5 — Images contextuelles** | Pexels piloté par le dossier (souverain, défaut) + génération via API activable (gaté) | ⚖️ Sonnet 4.6 | S |

## Garde-fous (NON négociables)
- **Anti-prompt-injection = risque n°1** : un site est du contenu **hostile par défaut** → TOUT contenu extrait encadré `sanitizeExternal` (donnée, jamais instruction).
- **Anti-SSRF** (`isCloneableUrl`) sur **chaque** URL, y compris les sauts externes.
- **Confinement** : même-domaine par défaut + **budget de sauts** externes (déf. ≤ 3), justifiés par pertinence.
- **`robots.txt` + politesse** (délai, UA honnête) ; aucun contournement d'auth/captcha (éthique/légal).
- **Bornes** : max pages (déf. 8), profondeur (déf. 2), budget temps, budget $ des appels VL. **Ne lève jamais** (isError gracieux).

## Limites honnêtes anticipées (→ `limites.md` à la livraison)
- **L8 — Génération d'images réelle** : photos Pexels 🟢 souverain ; vraie génération 🟡 (API externe, activable par clé).
- **L9 — Sites très JS/SPA, auth, captcha** : crawler peut ne pas tout atteindre → 🟡 (vision en secours sur le rendu).
- **L10 — Mécaniques *jouables*** (Zelda-like canvas/WebGL) : le VL *voit* l'UI mais ne *joue* pas → 🟡 (déduction visuelle, pas expérience).

## Tests & preuve live
- Tests par couche, **deps injectées** (fetch/scrape/VL/design simulés → zéro réseau), comme `lire_document`.
- **Preuve live — Mode A** (URL fournie) : on donne l'URL d'un vrai site → Mango navigue → produit le dossier → **GLM l'exploite** dans un tour de construction.
- **Preuve live — Mode B** (autonome, LA preuve clé) : commande **sans URL** (« va chercher sur un site de jeux vidéo connu les références de Zelda-like ») → la trace montre **GLM enchaîne `chercher_web` → choisit un site → `extraire_site` → dossier**, *sans qu'on lui ait donné l'adresse*. C'est la preuve de la vraie pensée agentique.
- Anti-orphelin 3000, $0 hors VL cloud.

## Filiation
Aboutissement de la lignée vision/web : `chercher_web`/`lire_page` #154 (se documenter, mono-page) → `teste_parcours` #155 (Playwright actif) → `vois_ecran` #151 + Œil-Coach #152 (voir/critiquer) → **#159 extraire_site** (naviguer + voir + comprendre + reformuler). Réutilise `taste-engine` #149, `dispatch('vision')` #150/#151, le Blackboard #115. Avance L3 (artefacts non-palette).
