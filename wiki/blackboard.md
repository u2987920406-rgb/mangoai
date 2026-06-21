---
type: entite
tags: [architecture, kernel, memoire, persistance]
statut: actif
sources: [statut, memory]
maj: 2026-06-20
---

# Blackboard

> Mémoire d'artefacts **cross-projet**, persistante, avec recherche sémantique. Le pilier #3 du [[kernel]]. C'est l'analogue, côté artefacts de code, de ce qu'un *LLM Wiki* est pour la prose : on **compile une fois, on garde, on réutilise > on réinvente**.

## Rôle

Stocke les artefacts produits par les générations (palettes, composants, skills, procédures) pour les **réinjecter** dans des projets futurs. C'est le substrat physique de [[boucle-curation]].

## Détails clés

- **Persistance SQLite-vec** (#115) via `node:sqlite` (intégré à Node 25, zéro install native, zéro risque Windows). Modules : `kernel-blackboard-store.ts` (interface + `MemoryStore` + `cosine`), `kernel-blackboard-sqlite.ts` (`SqliteStore` : table `artifacts`, WAL, valeurs+embeddings JSON). Survie au redémarrage prouvée par les tests.
- **Opt-in** via `BLACKBOARD_DB` (import dynamique, fallback mémoire). Défaut mémoire inchangé. Verrous FIFO restent en mémoire.
- **Vrais artefacts** (#117) : un observateur (`design.reference` + `design.produced` du Bus) dépose chaque **palette** (scope `artifact:design`, dédup par hash). Embedding = `paletteEmbedding` (histogramme RGB 27 dims, déterministe, zéro Ollama) → recherche « designs aux couleurs proches ».
- API : `search(scope, vec, k)` (cosinus = le « vec »). Routes `GET /api/artifacts` + `POST /api/artifacts/search`. UI : panneau `Artifacts.jsx`.
- Au run de validation 2026-06-20 : **9 palettes cross-projet** persistées, réutilisation cross-stack prouvée (palette Svelte réutilisée par Vue puis React).

## Liens

Pilier de [[kernel]] · moteur de stockage de [[boucle-curation]] · candidat à devenir le moteur de recherche d'un wiki prose (option C de la discussion LLM Wiki).

## Sources

[[statut]] #115, #117 · [[memory]] (détails Kernel) · [[historique]].
