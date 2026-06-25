---
type: entité
tags: [ui, brains, ollama, capabilities, reglages, multi-cerveaux]
statut: livré
sources: ["#162"]
maj: 2026-06-25
---

# Atelier des cerveaux (UI : un modèle par agent)

L'écran de Réglages qui donne à Raf, **depuis MangoOS**, le pouvoir que Claude avait à la main : voir chaque agent, **choisir son modèle**, **parcourir / télécharger** ses modèles Ollama locaux, avec une **garde de capacités** (l'œil `vision` exige la capability `vision`). Aboutissement UI du multi-cerveaux. #162.

## Rôle

Le registre par agent ([[brain-dispatch]] #150, `data/brain-registry.json`) était éditable **par Claude** (j'y branchais `qwen3-vl` sur l'œil `vision`, j'ajoutais le `juge` #161). Raf voulait le faire **lui-même, intelligemment**. L'Atelier expose ce registre dans une UI riche et y ajoute deux intelligences : (1) **parcourir/installer** les modèles Ollama locaux sans quitter MangoOS ; (2) une **garde de capacités** qui attrape le piège GLM-4.6V (un modèle sans capability `vision` assigné à l'œil → HTTP 500, cf. [[limites]] L23).

**Décisions (Raf, AskUserQuestion)** : le bouton **« + »** = parcourir local **+** pull Ollama (pas d'Ollama distant/cloud en v1, cf. L25) ; **intelligent** = garde de capacités **+** bouton « scanner » ([[examen-cerveau]] #148). Garde **non-bloquante** (avertit, n'impose pas — fidèle à l'invariant #111 `blocking:false`).

## Détails clés

| Couche | Brique | Détail |
|---|---|---|
| **Routes Ollama** | `ollama-routes.ts` `registerOllamaRoutes` | `GET /api/ollama/models` (via `/api/tags`), `GET /api/ollama/caps?name=` (via `/api/show` → capabilities = **la garde**), `POST /api/ollama/pull` (relaie `/api/pull` NDJSON en **SSE de progression**), `DELETE /api/ollama/model?name=`. `fetch` injectable, **valide le nom** (`/^[a-zA-Z0-9._/:-]+$/`, anti-injection), nom en **query/body** (contient `/` et `:`), gracieux (Ollama down → `{ok:false}`, jamais 500). |
| **Garde (backend)** | `brain-registry.ts` `EXPECTED_CAPS` | `{ vision: ["vision"] }` (PUR). `GET /api/brain-registry` enrichi de `expectedCaps` (backward-compatible). La comparaison caps↔attendues se fait **côté UI** (non-bloquante). |
| **UI** | `AtelierCerveaux.jsx` | Onglet Réglages › Intelligence. Carte par agent (provider + modèle = dropdown alimenté par les modèles locaux si ollama, badges caps via `/caps`, champs cloud sinon, timeout, localOnly). **Bandeau ⚠** si `expectedCaps[agent]` ⊄ caps réelles. Bouton **« + Ajouter un modèle »** → modale 2 onglets : **Local** (liste + badges + scanner #148 + supprimer via `ConfirmModal`) / **Télécharger** (nom → pull → barre de progression SSE). Footer collant Réinitialiser/Sauvegarder → `PUT`. |

Réutilise tel quel : `GET/PUT /api/brain-registry` ([[brain-dispatch]]), `POST /api/brains/scan` ([[examen-cerveau]]), composants `Dropdown`/`ConfirmModal`/`Toast`, tokens (accent violet, panel/raised/edge). Style Apple translucide.

## État

**Livré et prouvé live** (#162). `tsc` 0 · build UI vert (chunk `AtelierCerveaux` 18.8 ko) · test-ollama-routes 19/19 · AtelierCerveaux.test.jsx 4/4 · non-régression vitest 57/57 + brain-dispatch 35/35. **LIVE** (backend frais anti-orphelin :3000, Ollama up 8 modèles, vite :5173, snaps Playwright lus) : routes API réelles OK (`expectedCaps.vision=vision`, qwen3-vl:8b → `vision`) ; snap défaut fidèle (vision = qwen3-vl:8b badge `vision` ; `gemma4:12b` a réellement `vision` — Gemma 3 multimodal, la garde se tait à raison) ; **snap garde** = `nomic-embed-text` (`embedding` seul) sur l'agent vision → bandeau rouge « ce modèle n'a pas la capacité vision — l'œil ne verra pas (piège GLM-4.6V) », Sauvegarder reste actif (non-bloquant) ; snap modale = 8 modèles + caps + Scanner + corbeille. Registre disque **intact** (jamais sauvegardé pendant la démo).

**Limites** : L24 (`pull`/`delete` = ops puissantes locales, atténué validation + confirm) · L25 (Ollama distant/cloud non couvert en v1 → champs cloud manuels) · L26 (scan #148 via le transport Élève).

## Liens
[[brain-dispatch]] · [[brains]] · [[examen-cerveau]] · [[phase-e-multicerveaux]] · [[sharingan-vision-eleve]] · [[gardien-cloture]] · [[statut]] · [[historique]] · [[limites]]

## Sources
`#162` (statut.md « Dernière mise à jour » + journal historique.md) · modules `ollama-routes.ts` / `brain-registry.ts` / `brain-dispatch-routes.ts` / `AtelierCerveaux.jsx` / `Reglages.jsx` · plan `docs/plan-162-atelier-cerveaux.md`.
