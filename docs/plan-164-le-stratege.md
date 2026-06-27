# Plan #164 — « Le Stratège » : le raisonnement de déblocage de Mango

> Donner à **Mango le manager** la capacité de **raisonner face à un blocage** : diagnostiquer *pourquoi* son exécutant bloque, puis **choisir activement** le moyen de le débloquer (chercher sur le web, ressortir une procédure passée, changer de cerveau, reformuler/décomposer la tâche, réparer une ressource) — et **apprendre** de chaque déblocage réussi. Pas d'amélioration du cerveau : on rend **Mango** plus intelligent comme manager.

---

## 1. Le verdict honnête — est-ce vraiment bénéfique ?

**Oui — c'est potentiellement le plus gros levier restant — MAIS sous 3 conditions non négociables, sinon ça se retourne contre nous.**

### Pourquoi c'est un vrai game-changer (arguments solides)
1. **Ça attaque le mode d'échec n°1.** Toute la nuit, l'histoire c'était des blocages (sur-exploration L17, image cassée L30). À chaque fois, le remède a été un **réflexe que j'ai codé à la main**. Ça **ne passe pas à l'échelle** : chaque nouveau type de blocage exige que Claude vienne coder un nouveau réflexe. Un Stratège qui **diagnostique-et-route** peut traiter des blocages **inédits sans moi** → c'est exactement le pas vers la **souveraineté** (un Mango qui se débloque seul ≠ un Mango qui a besoin de Claude pour chaque imprévu).
2. **Il fait enfin coopérer des briques déjà construites mais sous-exploitées.** `chercher_web` #154 (se documenter), **procédures #75** (ressortir une résolution passée), `add_dependency` #146, **brain-dispatch** #150 (changer de cerveau), `delegate` #146 (décomposer), les axiomes. Tout ça existe **isolément** ; rien ne les **orchestre** sur un blocage. ROI élevé sur l'existant.
3. **C'est la marche logique suivante.** Mango sait déjà : planifier (#160), réutiliser (#156/L3), s'auto-corriger (build/test), contrôler (Gardien, L30). La marche manquante = **raisonner sur un blocage**.
4. **Effet cumulatif (le vrai trésor).** Si un déblocage qui marche est **distillé en procédure #75**, Mango devient **littéralement meilleur** projet après projet : la bibliothèque se remplit de **playbooks éprouvés au combat**. C'est le « compounding » visé.

### Les risques réels (et pourquoi ils peuvent tuer l'idée)
1. **Gouffre à tokens / temps / coût** si « raisonner » = appeler un cerveau + le web à chaque blocage.
2. **Le méta-raisonnement par LLM est bruité** (cf. L19, juge VL faillible). Un Stratège-LLM qui hallucine un diagnostic peut **empirer** la situation (mauvais remède, boucle).
3. **Sur-ingénierie / abstraction prématurée** : bâtir un grand « moteur de raisonnement » avant d'avoir assez de blocages réels → une usine à gaz qui gère des cas imaginaires.
4. **Boucles infinies** : un truc qui enchaîne les remèdes sans borne.
5. **Faux « apprentissage »** : si ce n'est qu'un routeur, c'est « des réflexes avec un aiguillage » — pas du raisonnement acquis.

### Les 3 conditions non négociables (la ligne rouge)
- **(A) Diagnostic DÉTERMINISTE d'abord.** On classe le blocage par **signaux observables** (type d'erreur, trace d'outils, sortie de build, plan posé). Le **cerveau** n'est consulté **que** pour les cas réellement ambigus, et en **sortie contrainte** (choisir dans un catalogue, jamais du texte libre). → tue le risque n°2.
- **(B) BORNÉ, frugal d'abord — MAIS la résolution prime.** « Borné » = **pas de boucle infinie** (budget de déblocage par tâche, on mémorise les remèdes déjà tentés) — et **surtout PAS** « coincé sur le modèle le moins cher ». **Réalité du coût (corrigée 2026-06-26)** : l'Élève (`glm-5.2:cloud`) et le juge (`qwen3.5:cloud`) tournent sur **Ollama Cloud ≈ 20 €/mois** — ce n'est PAS gratuit ; VRAIMENT locaux ($0 réel) = `qwen3-vl:8b`, **`gemma4:12b`**, `gemma4:latest`, `nomic-embed`. On essaie donc **le moins cher d'abord** (déterministe $0 → `gemma4:12b` local $0), et **si ça ne RÉSOUT pas, on monte automatiquement en gamme** vers un modèle supérieur, **quitte à payer le marginal** (Ollama Cloud). Mieux vaut 2 centimes de cloud qu'un blocage non résolu. → tue 1 et 4 **sans** sacrifier la résolution.

  **L'ÉCHELLE D'ESCALADE DES CERVEAUX (refinement Raf 2026-06-26)** — frugal→fort, automatique, bornée :
  | Barreau | Cerveau | Coût | Quand |
  |---|---|---|---|
  | 0 | **Déterministe** (code pur) | **$0 réel** | toujours en premier |
  | 1 | **`gemma4:12b` LOCAL** | **$0 réel** | cas ambigu, 1ʳᵉ tentative de raisonnement |
  | 2 | **Cloud supérieur** (`glm-5.2:cloud` / `qwen3.5:cloud` / `gemma4:31b-cloud`) | marginal (€) | barreau 1 n'a PAS résolu |
  | 3 | **Claude** (escalade existante) | $ | dernier recours **opt-in** (`ELEVE_ESCALATE_ON_BLOCK`) |

  - **Principe** : on ne **descend jamais** d'un cran tant que le problème n'est pas résolu ; on **monte** dès qu'un barreau échoue. Les barreaux cloud-Ollama (2) s'insèrent **AVANT** Claude (3) → **moins de dépendance à Claude** (un modèle Ollama, même payant, reste sous le contrôle de Raf). Le tier « supérieur » (barreau 2) est **configurable** (registre / Atelier #162), pas codé en dur.
  - **Bornage** : un compteur d'escalade par blocage (on ne refait pas deux fois le même barreau sur le même blocage) ; au sommet de l'échelle sans résolution → on rend la main à Raf (honnêteté), jamais de boucle.
  - **Horizon explicite (Raf)** : avec la **quantization**, le même setup tournera bientôt **directement sur le hardware de Raf, sans Ollama Cloud** → les barreaux 1-2 deviendront tous deux locaux. Le Stratège est conçu pour ça (échelle configurable) et sert de **banc d'essai du raisonnement local** que le reste de Mango suivra (à terme l'Élève lui-même migre vers un local quantizé).
- **(C) Ça FERME LA BOUCLE.** Un remède qui marche → **distillé en procédure #75 / axiome**, **réutilisé** au prochain blocage similaire. Sans ça, ce n'est pas du raisonnement acquis, juste plus de réflexes. → c'est ce qui rend (3) faux et le projet vraiment transformateur.

**Et une exigence de méthode** : on construit **à partir du catalogue de blocages RÉELS** (le registre des limites + les échecs observés cette nuit), **pas** d'un moteur spéculatif. On démarre **étroit**, on prouve sur un vrai blocage, puis on laisse grandir.

> **Conclusion** : feu vert, mais le projet n'est « game-changer » **que** s'il respecte (A)(B)(C). Un Stratège qui ne ferme pas la boucle (C) ne vaut pas la peine — autant continuer à coder des réflexes. C'est (C) qui fait que **Mango acquiert du raisonnement**, et non « un LLM raisonne à la place de Mango ».

---

## 2. La vision en une phrase

> Quand l'exécutant bloque, **Le Stratège** observe les symptômes, **diagnostique la cause** (déterministe d'abord), **interroge sa mémoire** (« ai-je déjà débloqué ça ? »), **choisit un remède** dans son catalogue, **agit** (web / dépendance / reformulation / autre cerveau / réparation), et **mémorise** ce qui a marché — bornes et souveraineté garanties.

---

## 3. Architecture (le squelette)

Point d'intégration unique : **dans `eleve.ts`, là où aujourd'hui le remède est une séquence FIXE** (`nudge = buildRelanceNudge` → auto-relance → escalade Claude opt-in). Le Stratège **remplace cette séquence figée par un remède CHOISI**.

```
        ┌─────────────────────── boucle de l'Élève (eleve.ts) ───────────────────────┐
        │  runAgenticTask → inspection build → [BLOCAGE détecté]                      │
        │                                   │                                          │
        │                                   ▼                                          │
        │   ╔════════════════════════ LE STRATÈGE ════════════════════════╗           │
        │   ║ 1. SYMPTÔMES   collecte signaux observables (déjà ~captés) : ║           │
        │   ║    type de blocage · trace d'outils · sortie build · plan    ║           │
        │   ║ 2. MÉMOIRE     procédures #75 : « déjà vu ce blocage ? »      ║           │
        │   ║ 3. DIAGNOSTIC  classifieur DÉTERMINISTE → classe + cause      ║           │
        │   ║    (cerveau local SEULEMENT si ambigu, sortie contrainte)    ║           │
        │   ║ 4. STRATÉGIE   route classe → remède(s) ordonné(s)           ║           │
        │   ║ 5. ACTION      web / add_dependency / reformule / delegate /  ║           │
        │   ║    swap cerveau / répare ressource  → produit un NUDGE/acte  ║           │
        │   ║ 6. APPREND     remède qui marche → distille une PROCÉDURE #75 ║           │
        │   ╚══════════════════════════════════════════════════════════════╝           │
        │                                   │                                          │
        │                       relance bornée de l'Élève (coût 0)                     │
        └──────────────────────────────────────────────────────────────────────────────┘
```

### Le catalogue de blocages (dérivé du réel)
| Classe de blocage | Signal observable (déterministe) | Cause probable | Remède (stratégie) |
|---|---|---|---|
| **knowledge-gap** | tâche cite une lib/API + erreur d'usage, et `chercher_web` jamais appelé | l'ouvrier invente l'usage | `chercher_web` / `lire_document` / **procédure #75** |
| **missing-dependency** | build : `Cannot find module X` / `Failed to resolve import` | dépendance non installée | `add_dependency(X)` (#146) |
| **wandering / over-exploration** | `stuck` + lectures répétées + `hasWritten` | a perdu le fil | re-ancrer le plan (L17) **ou décomposer** via `delegate` |
| **flaky-resource** | image/URL 404, ressource externe morte | ressource défaillante | réparer (patron L30) / substituer |
| **plateau-iterations** | plafond atteint sans `finish` | tâche trop large d'un bloc | **décomposer** (`delegate` par morceaux) |
| **wrong-tool / env** | `errorStreak` sur `run_command` (Windows) | mauvais outil | réorienter vers les bons outils |
| **brain-inadequate** | échecs répétés d'une **même classe** malgré remèdes | cerveau mal placé | **swap de cerveau** (brain-dispatch #150) + retry |
| **gate-failed** | Gardien #161 : intention/goût/QA sous seuil | écart au besoin | nudge ciblé du Gardien (existant) |
| **ambigu** | aucun signal franc | inconnu | **cerveau Stratège local** (sortie contrainte = une classe du catalogue) |

Chaque classe est **née d'un blocage réel** (les nôtres) → pas de cas imaginaire.

---

## 4. Phases (incrémental, chaque phase prouvée live et bornée)

| # | Phase | Livrable clé | Prouve quoi | Modèle optimal | Effort |
|---|-------|--------------|-------------|----------------|--------|
| **0** | **Catalogue & signaux** | `stratege-signals.ts` : struct `BlockerSymptoms` (collecte ce qui est DÉJÀ capté : `stuck`/blockReason/`insp.signal`+detail/`toolTrace`/plan) + taxonomie du catalogue ; **mode OBSERVE-ONLY** (log le diagnostic, n'agit pas) | le classifieur déterministe nomme correctement les blocages **passés** (rejoue L17/L30 et les 5 gros projets) | ⚖️ Sonnet 4.6 | S |
| **1 ✅ LIVRÉE 2026-06-26** | **Routeur déterministe (top-3)** | `stratege.ts` : `route(diagnosis, state)` (PUR) → remède concret ; borné par `StrategeState` (budget + remèdes déjà tentés → pas de boucle) ; câblé aux 2 points de blocage d'`eleve.ts`, gaté `ELEVE_STRATEGE` (`off`/`observe`/`on`). Remèdes : **missing-dependency → `installDependency` + relance**, knowledge-gap → nudge web, **wandering → ré-ancre le plan**, plateau-iterations → décompose (delegate). **PROUVÉ LIVE** (vrai npm) : `import gsap` casse le build → diagnose → install gsap → **build vert**. Tests : test-stratege 19 · non-régr. signals 23 / action-tools 45 | sur un blocage RÉEL, Mango **choisit** le bon remède (manque de dépendance → install auto au lieu d'un nudge générique) | 🧠 Opus 4.8 | M |
| **2 ✅ LIVRÉE 2026-06-27** | **Boucle d'apprentissage (procédures #75)** | `stratege-learn.ts` : `distillProcedure` (un remède RÉUSSI → procédure #75, slug stable par classe = idempotent, tag `stratege`+classe, embed) ; `recallProcedure` (« déjà vu ? » au blocage, filtré classe+tag) + `learnedHint`. Câblé dans `eleve.ts` : `pendingLearn` distillé au succès, hint préfixé au nudge si rappel ; gaté `ELEVE_STRATEGE_LEARN` (défaut off). **PROUVÉ LIVE** (embed nomic réel, $0) : déblocage `gsap` distillé → rappelé sémantiquement pour un AUTRE module manquant (`three`) ✅, ignoré pour une autre classe ✅. Tests : test-stratege-learn 11 · non-régr. stratege 19 / procedures | un **2ᵉ** blocage du même type est rappelé → débloqué plus vite — **la condition (C), le compounding** | 🧠 Opus 4.8 | M |
| **3 ✅ LIVRÉE 2026-06-27** | **Cerveau Stratège (cas ambigus) + échelle d'escalade** | `stratege-brain.ts` : agent registre **`stratege` = `gemma4:12b` LOCAL ($0)** consulté **uniquement** si `diagnose` = `ambiguous` ; **sortie CONTRAINTE** (`reclassifyAmbiguous` → choisit une classe d'un **catalogue FERMÉ**, hors-catalogue/« inconnu » → reste ambigu, jamais de code) ; **échelle d'escalade BORNÉE** : barreau 1 local d'abord, **si non tranché ET `STRATEGE_BRAIN_ESCALATE=on` → barreau 2 cloud supérieur** configurable (`STRATEGE_ESCALATE_AGENT`), **2 appels max** ; parseur pur, dispatch injectable, ne lève jamais ; câblé `eleve.ts` (`strategeDiagnoseRefined`), gaté **`ELEVE_STRATEGE_BRAIN`** (off/observe/on). **Leçon TRINITY** (veille Sakana) : un petit cerveau local suffit à *classer*. **PROUVÉ LIVE** (`gemma4:12b`, $0) : ambigu « ReferenceError, prop inexistante » → reclassé `knowledge-gap` → remède `chercher_web`. **test-stratege-brain 31** · brain-dispatch 37 (12 agents). Limite L38 (cold-load ~45 s, atténué timeout 90 s). | un blocage ambigu est **résolu** — local si possible, cloud si nécessaire — jamais coincé sur le modèle le moins cher | ⚖️ Sonnet 4.6 (livré 🧠 Opus 4.8) | M |
| **4** | **Échelle d'escalade de l'EXÉCUTANT + métrique de souveraineté** | remède `brain-inadequate` = applique l'**échelle d'escalade** à l'Élève lui-même (gemma local → cloud supérieur → Claude opt-in) via brain-dispatch #150 — on **monte le tier** automatiquement quand le cerveau courant ne résout pas, **sans descendre** tant que non résolu ; lien scan #148 (un modèle qui rate une classe → re-placement) ; **métrique de souveraineté** (taux d'escalade Claude par projet) | un blocage **se résout** en montant l'échelle ; l'escalade **Claude** (sommet) **baisse** au fil des projets (le but souverain, chiffré) | ⚖️ Sonnet 4.6 | M |

**Chaque phase** : deps injectables (tests déterministes sans réseau), suite de tests dédiée, **gaté** (défaut OFF puis ON quand mûr), **preuve live** via le backend ($0), entrée dans `statut.md`/`historique.md`/`wiki`/`limites.md`, page-entité wiki `[[le-stratege]]`.

---

## 5. Garde-fous (les 3 conditions, opérationnalisées)
- **(A) Déterministe d'abord** : `diagnose` est une **fonction PURE** sur des signaux observables ; le cerveau `stratege` n'est appelé **que** sur `ambigu`, en **sortie contrainte** (parse vers une classe du catalogue, repli déterministe si la réponse est hors-catalogue). Jamais de remède « inventé » hors catalogue.
- **(B) Borné & souverain** : `ELEVE_STRATEGE_BUDGET` (nb de déblocages par tâche), un **set des remèdes déjà tentés** (jamais deux fois le même sur la même tâche), cerveau **local $0**, time-box par remède, **ne lève jamais**. L'escalade Claude reste le **dernier recours opt-in** (inchangé).
- **(C) Ferme la boucle** : remède réussi → **procédure #75** (réutilisée par la Phase 2) + axiome si la leçon est universelle. C'est **non négociable** — sans la Phase 2, on s'arrête (sinon ce ne sont que des réflexes).
- **Observabilité** : Mango **pense à voix haute** dans le log (`🧠 Blocage = manque de doc sur recharts → je cherche`), tracé dans `/api/traces` → on **voit** son raisonnement et on l'audite.
- **Réversibilité** : tout gaté ; OFF = comportement actuel **exact** (zéro régression).

## 6. Définition de « réussi » (le game-changer, mesuré)
1. Un **type de blocage non codé en dur** est traité par le routeur/cerveau (pas un `if` que j'ai écrit pour CE cas).
2. Un blocage **répété** est débloqué **plus vite la 2ᵉ fois** (procédure rappelée) — **preuve de l'apprentissage**.
3. **Borné** : coût/temps maîtrisés, $0 souverain, zéro boucle.
4. Mango **narre** son raisonnement (observabilité).
5. **Le taux d'escalade Claude BAISSE** projet après projet (la métrique de souveraineté — l'objectif de fond de Raf).

## 7. Risques résiduels & honnêteté
- Le cerveau Stratège (Phase 3) reste un LLM → bruité ; **atténué** par : déterministe d'abord, sortie contrainte, repli, bornes. On l'assumera en limite.
- La distillation de procédures peut produire des playbooks médiocres → garde-fou : ne distiller qu'un remède **prouvé efficace** (le blocage a réellement été levé ensuite), pas une tentative.
- Démarrage **étroit** volontaire (3 classes) : on n'élargit le catalogue **que** sur des blocages réellement rencontrés.

## 8. Modèle / Effort global
🧠 **Opus 4.8** (architecture cross-cutting, raisonnement, intégration au cœur de la boucle Élève + mémoire) · **Effort L→XL** (4 phases ; cœur = Phases 1-2, le reste est extension). Chaque phase livrable et prouvable **indépendamment** — on peut s'arrêter après la Phase 2 et avoir déjà le saut décisif (diagnostic + apprentissage).

---

*Plan rédigé 2026-06-26. Zéro git tant que Raf n'a pas validé le périmètre.*
