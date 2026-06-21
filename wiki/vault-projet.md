---
type: concept
tags: [vault, obsidian, cartographie, doc-vivante, rag-projet, gros-projet, auto-doc]
statut: concept-validé-2026-06-21 · non-construit
sources: [historique#session-2026-06-21, statut#141]
maj: 2026-06-21
---

# vault-projet

**Donner à chaque gros projet généré son propre vault Obsidian auto-cartographié** — une carte vivante et liée de son architecture, navigable par l'humain ET par l'agent. Idée de Raf (2026-06-21), née en regardant un cours Obsidian : *MangoOS se documente déjà lui-même ainsi (le [[index|wiki]]) → appliquer le même pattern à chaque projet à grosse architecture.*

## L'idée

Quand un projet franchit un seuil de complexité (même déclencheur que [[flux]] #137 / #139), MangoOS lui scaffolde un **vault `docs/`** style Obsidian :
- `index.md` — le **MOC** (Map of Content : la carte du projet),
- une **page-entité par module / système / entité** (comme les pages du wiki MangoOS),
- `data-model.md`, `routes.md`, `decisions.md` (journal des choix d'archi, style ADR),
- le tout lié en `[[ ]]`, + diagrammes **Mermaid** (flux, données) inline.

## Ce que ça résout (la faiblesse n°1 du soir)

- **Pour l'agent** : il lit l'`index.md` du vault au lieu de `grep`-er 200+ fichiers à l'aveugle → la « table des matières » qui débloque la navigation à l'échelle. Attaque directement le point n°1 de [[dette-technique]] (`App.jsx`/nav fragile) et le mur « pas de RAG-projet » de [[pre-requis-gros-projet]].
- **Pour Raf** : ouvrir le vault dans Obsidian = comprendre le projet d'un coup d'œil.

## Le piège, et la conception anti-dérive

Un vault tenu à la main **ment** dès qu'il dérive du code. La version robuste = **ne pas le curer à la main** :
1. **tree-sitter** extrait le squelette (modules, symboles, dépendances) — automatique (cf. [[pre-requis-gros-projet]]).
2. Un **agent « Cartographe »** ([[memoire-expertise]]/Agent Factory) le tisse en pages liées + journal de décisions.
3. Une **passe nocturne** ([[boucle-nocturne]]) le rafraîchit → il reste vrai sans effort.

## Complémentarité (pas concurrence)

| | Donne quoi | Pour qui |
|---|---|---|
| **repo-map (tree-sitter)** | index exhaustif des symboles/dépendances | la **machine** (l'agent) |
| **vault-projet (ce concept)** | carte **conceptuelle** liée + décisions | l'**humain** *et* l'agent |

Le vault est le *pendant humain* du repo-map machine. Les deux ensemble = navigation fiable d'un gros codebase.

## À piquer au passage (cours Obsidian)

- **Mermaid/PlantUML** : diagrammes d'archi textuels dans les notes (MangoOS n'en met pas encore).
- **Dataview** : interroger le vault comme une base (« liste les modules `statut: à-refactorer` ») — power-tool d'un vault vivant.

## Liens

- [[pre-requis-gros-projet]] — tree-sitter (le squelette du vault) ; même chantier de fond
- [[dette-technique]] — le vault attaque le point n°1 (navigation fragile)
- [[composer-os]] — #139 (gros projet) : le vault est son organe de navigation
- [[boucle-nocturne]] — rafraîchissement automatique (anti-dérive)
- [[memoire-expertise]] — l'agent Cartographe ; parenté avec l'auto-documentation de MangoOS

## Sources

- `historique.md` session 2026-06-21 (échange Obsidian → vault par projet)
- `statut.md` #141
