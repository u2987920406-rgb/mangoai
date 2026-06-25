---
type: entite
tags: [vision, eleve, agentique, multimodal, souverainete]
statut: fait-prouvé-live
sources: [statut #151, historique 2026-06-24, axiome VISION-01]
maj: 2026-06-24
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
- **Opt-in `ELEVE_VISION=on`** (défaut OFF → zéro régression, idiome MangoOS) : enregistre l'outil dans `buildEleveActionTools` (profite aussi aux sous-agents délégués) ET appond `AGENTIC_VISION_CLAUSE` au contrat (apprend à GLM à voir). `vois_ecran` est neutre (comme `check_build`) → hors gardes anti-relecture / anti-exploration.

## État (2026-06-24) — ✅ FAIT, PROUVÉ LIVE

- **Vérif** : `tsc` 0 · build UI vert · `test-eleve-vision-tools` **20/20** · non-régression action-tools 33 / runtime 37 / brain-dispatch **35** (+freeform).
- **LIVE (3 niveaux)** : (1) `dispatch('vision', {imageBase64, freeform})` sur une vraie capture → critique UI précise (repère contrastes faibles, désalignements). (2) **End-to-end** sur un projet à incohérence délibérée (carte Quiz sombre dans une app claire) : `ELEVE_VISION=on` → **GLM (glm-5.2:cloud) read→edit→check_build→`vois_ecran`→finish, corrige l'écran, 5 it., $0, zéro Claude**. (3) Capstone : l'œil reconfirme « visuellement cohérent, aucune zone sombre ».

## Suites possibles (hors #151)

- Flip du défaut `ELEVE_VISION` → on une fois éprouvé sur plus de cas.
- Zoom `selector`/`box` dans `vois_ecran` (v1 = capture pleine vue) ; navigation interactive vers un écran précis (routes/clics).
- Modèle VL **local** pur (offline total) si zéro cloud souhaité.
- Boucle « capture avant/après » automatique post-édition UI (sans que GLM ait à le demander).
- Lien avec [[moteur-gout]] #149 : voir le rendu pour capter le goût.

## Liens

- [[eleve-local]] — la boucle agentique de l'Élève (#146) à laquelle s'ajoute l'œil.
- [[brain-dispatch]] — #150, dont l'agent `vision` + `dispatch({imageBase64})` portent ce chantier.
- [[vision]] — les primitives `capturePreview`/Sharingan réutilisées.
- [[phase-e-multicerveaux]] — la souveraineté multi-cerveaux (le VL est un cerveau de plus).

## Sources

- [[statut]] — idée **#151** (✅ FAIT — prouvé live).
- [[historique]] — journal du 2026-06-24 (Sharingan/vision à GLM).
