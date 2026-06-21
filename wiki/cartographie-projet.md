---
type: concept
tags: [indexation, rag, cartographie, photogrammétrie, tree-sitter, embeddings, graphe, gros-projet]
statut: modèle de référence — À SORTIR au déclenchement de la Phase 2 de #139 (RAG intra-projet)
sources: [conversation-2026-06-21-photogrammétrie, pre-requis-gros-projet, vault-projet, statut#139]
maj: 2026-06-21
---

# cartographie-projet

Le **modèle mental** pour indexer/cartographier un gros projet, tiré de l'expérience **photogrammétrie** de Raf (Metashape/RealityCapture/Recap Pro). À ressortir le jour où un projet devient assez gros pour réclamer un RAG intra-projet — **pas avant** (cf. Phase 2 reportée de [[composer-os]] #139). Note posée le 2026-06-21 ; Raf : « Note ça, le jour où on en a besoin, il faudra le sortir. »

## Pourquoi ce parallèle

La photogrammétrie résout **le même problème de fond** qu'un gros projet pour une IA : *trop de données pour tout traiter d'un coup → indexer, chunker, recaler dans une carte commune.* Ce domaine est **en avance** sur l'indexation d'information (très ciblé sur un modèle unique, mais le principe de cartographie est excellent). Insight de Raf : **le nuage de points relié de partout = la vue graphe d'Obsidian** — un seul objet (nœuds + arêtes de proximité), une fois en géométrie 3D, une fois en sémantique.

## La correspondance terme à terme

| Photogrammétrie | IA / MangoOS |
|---|---|
| 400-500 photos | Fichiers du projet (ou leurs morceaux) |
| **EXIF** (focale, GPS, timestamp) | **Métadonnées de code** : chemin, langage, imports/exports, signatures, symboles |
| **Keypoints / features** | **Embeddings** d'un chunk |
| Matching par recouvrement | Similarité sémantique (cosinus) |
| **Chunks** (sous-ensembles alignés à part) | Modules bornés (le « socle + incréments » de #139) |
| **Points de contrôle / markers** | Le graphe de liens `[[...]]` qui recale les pages ([[vault-projet]] #141) |
| Nuage de points relié | **Graphe Obsidian** / la MOC du vault |
| Re-alignement à l'ajout de photos | Ré-indexation du **delta** à chaque commit (hook `phase-complete` déjà là) |

## Où le parallèle TIENT (à exploiter)

1. **Chunking pour l'échelle** — on n'aligne jamais 5000 photos d'un coup ; on chunke → aligne → merge. = le mur `maxTurns=40`. On indexe un **graphe de morceaux + une couche de recalage**, pas « le projet ».
2. **Metadata-first** — l'EXIF pré-groupe avant le matching coûteux. Pour du **code**, le RAG par embeddings seul est **médiocre** (le sens d'une fonction n'est pas dans ses mots) : **l'EXIF du code = l'AST (tree-sitter), pas le vecteur.** Structure d'abord.
3. **Incrémental** — Metashape ne refait pas tout pour 10 photos ; on ne ré-indexe que les fichiers changés.
4. **Recouvrement = robustesse** — sans overlap, pas d'alignement ; références croisées + un peu de redondance rendent la carte navigable.

## Où il CASSE (à ne pas plaquer naïvement)

- **Pas de vérité-terrain.** La photogrammétrie minimise une erreur de reprojection (mm) ; le code n'a pas de « bon chunk » objectif. On ne converge pas vers une réponse vraie — on vérifie autrement (l'agent trouve-t-il le bon fichier ? le build passe-t-il ?).
- **Cible vivante, pas figée** — le code bouge à chaque commit : plus proche du **SLAM** (re-localisation continue) que d'une reconstruction one-shot.
- **Le maillage dense est un piège** — on ne veut PAS « tout embedder » (purée vectorielle), mais un **nuage clairsemé navigable** (repo-map / MOC). Sur-indexer noie le signal.
- **Les embeddings dérivent** (dépendants du modèle) ; un keypoint est déterministe → **structure pour le squelette, embeddings pour le « trouve-moi quelque chose qui ressemble ».**

## L'architecture que ça dicte (ordre de construction, Phase 2 de #139 + [[vault-projet]])

1. **Couche EXIF — tree-sitter** : table des symboles + graphe d'imports → le **repo-map**. *Première brique, la plus rentable* (= attaque aussi le point #3 de [[dette-technique]]).
2. **Couche keypoints — embeddings** dans [[blackboard]] (sqlite-vec **déjà en place**), seulement là où la structure ne suffit pas.
3. **Couche recalage — le vault [[vault-projet]] (#141)** : la MOC qui enregistre les modules en un tout navigable agent + humain, maintenue par un **Cartographe + passe nocturne** (= le re-alignement continu, l'anti-dérive).
4. **Maintenance incrémentale** sur le delta de chaque commit.

> Corollaire qui valide l'existant : ce que Raf entend sur le **RAG d'Obsidian** confirme notre `wiki/` — **les liens `[[...]]` (points de contrôle) d'abord, les embeddings en complément**, pas l'inverse.

## Quand le sortir

**Pas maintenant.** Le mur (grep qui bruite, mauvais fichier, référence perdue) ne se sent qu'au-delà de ~12 pages / des dizaines de fichiers ; indexer avant = choisir les bornes de chunk avant d'avoir vu la structure du jeu de photos. **Déclencheur** : construire un vrai gros projet, regarder **où l'agent perd le fil**, et laisser ces échecs concrets dicter l'index. On commence alors par le tree-sitter (l'EXIF), jamais par les embeddings.

## Liens

- [[vault-projet]] — #141, la couche de recalage (la carte) que ce modèle structure
- [[pre-requis-gros-projet]] — les briques (tree-sitter · embeddings · sqlite-vec · LSP-MCP), local-first
- [[composer-os]] — #139 Phase 2 (RAG intra-projet) reportée, que ce modèle guidera
- [[dette-technique]] — point #3 (heuristiques regex → tree-sitter) qu'attaque la couche EXIF
- [[blackboard]] — sqlite-vec déjà en place = le store d'embeddings prêt

## Sources

- Conversation Raf ↔ Mango, 2026-06-21 (parallèle photogrammétrie → indexation IA ; nuage de points = graphe Obsidian).
- [[pre-requis-gros-projet]], [[vault-projet]], `statut.md` #139 (Phase 2).
