---
type: entite
tags: [vision, eleve, agentique, multimodal, souverainete]
statut: fait-prouvé-live
sources: [statut #151, SOUV-B, historique 2026-06-24, 2026-07-11/12, axiome VISION-01]
maj: 2026-07-12
---

# Sharingan / Vision à l'Élève GLM

> Donner à la boucle agentique de l'Élève GLM un **œil** : l'outil `vois_ecran(objectif)` rend l'aperçu live de l'app → image → la fait LIRE par un cerveau multimodal → renvoie une **critique texte** que GLM (non-multimodal) exploite pour s'auto-corriger. Idée **#151**, livrée et prouvée live le 2026-06-24.

## Rôle — pourquoi

**Constat-racine prouvé en réel** (nuit TOEIC, formation `formation-toic`) : GLM **code à l'aveugle**. Il a restylé la devanture mais laissé tout le flux interactif (Quiz/SessionResult) en thème sombre incohérent, **sans jamais le savoir** — un `vite build` vert ne dit rien de l'apparence. C'est Claude qui a dû être ses yeux (captures Playwright lues à chaque étape). Axiome **VISION-01** (`workspace/.axioms.md`) : *juger une UI exige de VOIR le rendu*. Ce chantier traite la cause-racine : que GLM voie ses propres écrans et corrige seul, sans humain.

## Architecture

```
GLM (boucle agentique) ──▶ vois_ecran(objectif)
        │   startPreview(projectDir) → url   (preview.ts, pool LRU)
        │   capturePreview(url) → JPEG       (vision.ts)
        │   dispatch('vision', VISION_SYSTEM, objectif, {imageBase64, freeform})
        │        ↳ askOllama → qwen3.5:cloud LIT l'image
        ◀── critique texte (écarts visuels) ──┘
        └─▶ edit_file → check_build → re-vois_ecran → finish
```

## Détails clés

- **`vois_ecran(objectif)`** (`eleve-vision-tools.ts`) — `buildEleveVisionTools(projectDir, deps=realDeps)`, deps `startPreview`/`capturePreview`/`dispatch` **injectables** (tests sans réseau). Budget par tâche (`ELEVE_VISION_BUDGET`=5). **Ne throw JAMAIS** : aperçu/capture/cerveau KO → `isError` pédagogique (« continue sans la vision »). `VISION_SYSTEM` encode VISION-01 + **UIUX-11** (vérifier la charte sur TOUT l'écran, pas la devanture).
- **Réutilise tout le tuyau de [[brain-dispatch]] #150** : `dispatch(agentId, …, {imageBase64})` route vers l'agent `vision` ; `askOllama` envoyait déjà les images (`images:[base64]`). 90 % du travail était déjà là.
- **Mode `freeform`** (petite extension de `dispatch`) : un VL répond en PROSE, pas en contrat Mango `<<<MANGO>>>` → `freeform:true` n'injecte pas le contrat, ne parse pas de JSON, renvoie le texte brut dans `summary` (status ok). Réutilisable par tout appel « je veux de la prose ».
- **Cerveau `vision` = `ollama`/`qwen3-vl:8b`** (LOCAL, souverain, $0) — **bascule 2026-06-25** depuis `qwen3.5:cloud` (Ollama Cloud) vers un VRAI VL local (capability `vision`, 8.8B ; `qwen3-vl:latest`=même digest). Prouvé live (décrit une capture exacte). **DEFAULT_REGISTRY** reste `qwen3.5:cloud` (repli si le JSON est perdu). Éditable en live via le registre `data/brain-registry.json` / le panneau « Cerveaux par agent » de #150. **Limites** : L22 (cold-load local ~69 s VRAM libre — **contournée** par `prewarmVision()` au boot, `vision-prewarm.ts` ; le « 3-4 min » initial était un conflit de VRAM) · L23 (`GLM-4.6V-Flash` écarté : pas de capability `vision`/mmproj dans Ollama). Comme c'est le **cerveau `vision`**, le changement profite à TOUT : `vois_ecran` #151, [[oeil-coach]] #152, juge-pixels #149, [[gardien-cloture]] #161.
- **`ELEVE_VISION` passé à DÉFAUT ON (2026-07-12, SOUV-B)** — l'opt-in initial (défaut OFF) créait un écart de parité avec Claude, qui a un Snapshot permanent : l'Élève codait aveugle par défaut. Le gate est passé de `=== "on"` à `!== "off"` (`eleve-action-tools.ts`, `relay-agentic.ts`) : `vois_ecran`/`lire_image` sont désormais dans le registre `construire_default` (plus seulement `construire_vision`). Coupure toujours possible via `ELEVE_VISION=off`. `vois_ecran` reste neutre (comme `check_build`) → hors gardes anti-relecture / anti-exploration.
- **Sharingan lui-même câblé à l'Élève (2026-07-12, SOUV-B)** — jusque-là, Sharingan (`vision.ts`, extraction de site en 6 couches : palette/cssVars/typographie/structure/fonts/pseudo-éléments, cf. [[sharingan-extraction]]) n'existait QUE côté outils MCP de Claude (`mcp__vision__sharingan_*`), jamais porté dans le registre KernelTool de l'Élève — deux systèmes d'outils structurellement séparés (`eleve-tools/*` vs `agent.ts`). Nouveau `eleve-tools/eleve-sharingan-tools.ts` : `sharingan_url`/`sharingan_image`, toujours actifs, déterministes (pas d'appel LLM), publient un event Bus `design.reference` (source `"sharingan"`) à chaque succès — ce qui réveille le `briefDrift` dormant côté [[mangoqa]] (voir aussi [[audit-souverainete]]).
- **Nouvel outil `verifie_design`** (`eleve-tools/eleve-design-tools.ts`) — auto-critique WCAG/palette/motion déterministe, appelable EN COURS de tâche (pas seulement à la clôture par le [[gardien-cloture]]).

## État (2026-07-12) — ✅ FAIT, PROUVÉ LIVE (mis à jour depuis 2026-06-24)

- **Vérif 2026-06-24** : `tsc` 0 · build UI vert · `test-eleve-vision-tools` **20/20** · non-régression action-tools 33 / runtime 37 / brain-dispatch **35** (+freeform).
- **LIVE (3 niveaux, 2026-06-24)** : (1) `dispatch('vision', {imageBase64, freeform})` sur une vraie capture → critique UI précise (repère contrastes faibles, désalignements). (2) **End-to-end** sur un projet à incohérence délibérée (carte Quiz sombre dans une app claire) : `ELEVE_VISION=on` → **GLM (glm-5.2:cloud) read→edit→check_build→`vois_ecran`→finish, corrige l'écran, 5 it., $0, zéro Claude**. (3) Capstone : l'œil reconfirme « visuellement cohérent, aucune zone sombre ».
- **Vérif 2026-07-12 (SOUV-B)** : ~500 assertions vertes sur l'ensemble du sweep (golden snapshots régénérés, `test-eleve-sharingan-tools` 18/18, `test-eleve-design-tools` 8/8), `tsc --noEmit` propre, 2 commits (`a04a78e`, `304a1bc`). `qwen3-vl:8b` validé comme cerveau `vision` local $0 (6/6 tests de reconnaissance réels).

## Suites possibles

- Zoom `selector`/`box` dans `vois_ecran` (v1 = capture pleine vue) ; navigation interactive vers un écran précis (routes/clics).
- Boucle « capture avant/après » automatique post-édition UI (sans que GLM ait à le demander).
- Lien avec [[moteur-gout]] #149 : voir le rendu pour capter le goût.

## Liens

- [[eleve-local]] — la boucle agentique de l'Élève (#146) à laquelle s'ajoute l'œil.
- [[brain-dispatch]] — #150, dont l'agent `vision` + `dispatch({imageBase64})` portent ce chantier.
- [[vision]] / [[sharingan-extraction]] — les primitives `capturePreview`/Sharingan réutilisées, désormais aussi exposées à l'Élève.
- [[phase-e-multicerveaux]] — la souveraineté multi-cerveaux (le VL est un cerveau de plus).
- [[audit-souverainete]] — le chantier SOUV-B qui a fermé cet écart de parité et 9 autres.
- [[mangoqa]] — destinataire du nouvel event Bus `design.reference` (source `"sharingan"`).

## Sources

- [[statut]] — idée **#151** (✅ FAIT — prouvé live) + **SOUV-B** (2026-07-12, ✅ LIVRÉ).
- [[historique]] — journal du 2026-06-24 (Sharingan/vision à GLM) + journal du 2026-07-11/12 (SOUV-B).
