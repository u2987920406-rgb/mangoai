---
type: entite
tags: [gout, preference-learning, design, vision, souverain]
statut: v2-COMPLÈTE-juge-pixels+maille-héros+nocturne-téléphone-livrés-prouvés-live
sources: [statut #149, historique 2026-06-23, commits 77c160a/c2cce12/524a901]
maj: 2026-06-24
---

# Le Moteur de Goût

> Capter le **goût UI/UX de Raf** par préférence multi-variantes : GLM-5.2 génère K skins d'une même app, Raf tape la préférée en 1 geste → le choix est distillé en axiome de goût. Idée **#149**, v1.5 livrée et vérifiée live le 2026-06-23.

## Rôle

Combler le **seul fossé stratégique** de MangoOS face à Google AI Studio (rendu bluffant mais générique) : **le goût propre de Raf**. Le problème déclencheur — les revues jugent le *code* ([[mangoqa]] / juge #59 lisent la source), jamais le *rendu* → les apps sont techniquement bonnes mais jamais aussi belles que voulu, et l'apprentissage ne capte pas le goût. Le Moteur de Goût rend ce signal **mesurable et quasi sans friction** : un clic sur N variantes porte bien plus de signal qu'un 👍/👎 ([[memoire-expertise]] axiomes, RLHF #41).

## Détails clés

- **Maille = la SKIN seule** : même squelette/contenu, on varie palette / typo / spacing / radius / ombres / micro-interactions → signal de goût **isolé**. La maille « héros » (composition) = même machine, plus tard.
- **Signal = 1 tap + 1 mot optionnel** → **axiome VISION `[validé-utilisateur]`** (store `axioms.ts` segmenté par `PROJECT_TYPE_CATS`, scoring +10) + tokens gagnants dans `.design-system.md`, **segmenté par type de projet**. Restitution gratuite (`selectAxioms` injecte déjà).
- **Clé d'archi : la diversité par CURATION**, pas en espérant que GLM varie — `taste-directions.ts` = catalogue de ~12 directions nommées espacées + sampler **farthest-point** biaisé par le goût appris.
- **Capture Sharingan 2 bouches** (`taste-engine.ts`) : `sharinganAnalyze` URL→tokens, `analyzeImageFile` image→palette+ambiance ; `buildSkinBrief` grounded.
- **Génération** (`taste-generate.ts`) : `skinTokens` (GLM réécrit `tokens.css` en gardant les noms de variables) + `remapLiterals` (couleurs en dur → find-replace déterministe) + **`redesignHero`** (GLM re-designe le `<section>` héros, garde-fou balises équilibrées). Image réelle par direction via `taste-images.ts` (**Pexels** `PEXELS_API_KEY`, repli loremflickr sans clé).
- **Orchestration** (`taste-render.ts`) : génère K skins → swap → aperçu → screenshot → **RESTAURE** ; deps injectables ; **repli token-only si GLM casse** le redesign.
- **Surface cockpit** : `taste-routes.ts` (`POST /api/taste/:project/generate` SSE, `GET /skin/:file`, `POST /choose` → axiome souverain via `chatEleve`/GLM) + `TasteGallery.jsx` (fenêtre Launcher `Wand2`). **Piège corrigé** : `.skins` est un dotfile → `res.sendFile(p, {dotfiles:"allow"})` sinon 404 silencieux (même piège latent dans la route diff #80).
- **Vérif** : 112 tests (directions 23 · engine 26 · generate 33 · render 18 · images 12), `tsc` 0, build UI vert ; **prouvé live sur `mango-cafe-ts`** (v1 re-skin grounded Linear/Stripe → axiome `AXIOME-UX-01` ; v1.5 = 4 redesigns radicalement différents + vraies photos café). Commits `77c160a` / `c2cce12` / `524a901` (push origin).
- **✅ v2 JUGE-PIXELS #66 (2026-06-24)** — débloqué par [[sharingan-vision-eleve]] #151 : un cerveau VISION (`dispatch('vision')` → `qwen3.5:cloud`, $0) **note 0-100 et trie les K skins AVANT le choix**, selon le **goût appris** de Raf (`selectAxioms` VISION `[validé-utilisateur]` + `.design-system.md`), pas en absolu. `taste-judge.ts` : `buildJudgeContext` · `judgeSystem` (note = goût + qualité universelle + exécution direction, sortie `SCORE: n | CASSÉ: oui/non | raison`) · `parseJudgeScore` (pur) · `judgeSkins` (parallèle, deps injectables, **ne throw jamais**, trie desc, cassés en bas, marque le top `recommended`). Branché au niveau route (`taste-routes.ts`, gaté `TASTE_JUDGE`, gracieux) ; `TasteGallery.jsx` trie + badge **⭐ Recommandé · score** / **⚠ à éviter** (atténué) + **pré-sélectionne** le top (Raf confirme en 1 tap). `test-taste-judge` 19/19. **Prouvé live** : VL note 3 vraies UI 90/88/82 ; route sur `mango-cafe-ts` → Pastel doux 92 ⭐ / Minimal froid 85 (goût contextuel café + WCAG) ; Sharingan galerie OK.
- **✅ v2 MAILLE « HÉROS » (2026-06-24)** — l'autre axe du goût : là où la maille **skin** varie l'habillage (palette/typo), la maille **héros** fixe le STYLE (une direction) et fait varier la **COMPOSITION du hero** (plein écran, split, éditorial, brutalist…) → on isole le signal de goût pour la mise en page, l'œil triant des **structures** et plus seulement des couleurs. `taste-compositions.ts` (module pur, pendant de `taste-directions.ts`) : **8 compositions nommées** (chacune une consigne structurelle `layout`) + `sampleCompositions` (pas régulier déterministe, amorçable `favorIds`). `redesignHero` accepte une **composition imposée** (`HERO_SYSTEM_COMPOSED`) au lieu de laisser GLM choisir. `generateTasteSkins` `maille:"hero"` : capture Sharingan + skin des tokens **mis en cache par direction** (calculés **1×** pour les K compositions, seuls les hero redesigns bouclent) ; `id`=composition. Bascule **Style | Héros** dans `TasteGallery.jsx`. `test-taste-compositions` 17/17 · `test-taste-render` étendu 26/26 (cache prouvé). **Prouvé live** : k=3 hero sur `mango-cafe-ts` → Minimal froid skinné 1×, 3 compositions contrastées (indices 0/3/6) notées **92 ⭐ / 90 / 88** par l'œil (goût violet/menthe + WCAG), captures = vraies structures différentes (split vs plein écran). Le `favorIds` du sampler prépare la **boucle fermée** (biaiser vers les compositions les mieux notées).
- **✅ v2 CURATION NOCTURNE + VALIDATION TÉLÉPHONE (2026-06-24)** — la capture du goût devient **asynchrone** (le problème déclencheur = Raf a peu de temps écran). La nuit génère/juge des variantes pour quelques projets éligibles et les met en **file persistante** ; Raf valide **plus tard, en 1 tap, depuis son téléphone** (même Wi-Fi), prévenu le matin par un **push ntfy**. **Décision d'archi (Raf) : LAN + ntfy, ZÉRO exposition Internet** (tunnel public écarté). Modules : `taste-queue.ts` (file `data/taste-queue.json`, `enqueue/listPending/decideRun` idempotent/`pruneOld`, images run-scopées `.skins/<runId>/`), `notify.ts` (push ntfy.sh gaté, ne lève jamais), `taste-nocturnal.ts` (sélection projets + génère/juge/enfile + **scheduler opt-in** `enabled:false`), `taste-review-page.ts` (page mobile autonome servie par Express, palette Mango), `net.ts` (IP LAN). Routes `pending`/`run/:id`/`run/:id/skin/:file`/`decide`/`nocturnal`/`/taste/review` ; `index.ts` écoute `HOST=0.0.0.0` + log IP. `test-taste-queue` 16 · `test-notify` 13 · `test-taste-nocturnal` 16. **Prouvé live** : LAN loggé `192.168.1.2:3000`, push ntfy `sent:true`, route `nocturnal/run` sur `mango-cafe-ts` → 2 compositions 85⭐/85, image servie (200)/traversal (400), Sharingan mobile OK, `decide`→ axiome souverain `AXIOME-UX-07 [validé-utilisateur]` + idempotence 409. **→ v2 du Moteur de Goût COMPLÈTE.**

## Liens

- [[eleve-local]] — GLM-5.2 ($0) qui génère les skins ; `feedback.ts` souverain pour distiller le choix.
- [[vision]] — `capturePreview` (screenshots des skins) + `analyzeImageFile` (image→palette).
- [[boucle-curation]] — même esprit « mesurer → réinjecter » appliqué au goût, pas à la réutilisation d'artefacts.
- [[memoire-expertise]] — où vit l'axiome de goût (`.axioms.md` VISION) + `.design-system.md`.
- Absorbe/avance les leviers vision #66 / #67 et le « jumeau créatif » #69.

## Sources

- [[statut]] — idée **#149** (🔨 v1.5 LIVRÉE — v2 à venir).
- [[historique]] — journal du 2026-06-23 (consigné le 2026-06-24).
- Commits `77c160a` (moteur) · `c2cce12` (cockpit) · `524a901` (redesign + Pexels).
