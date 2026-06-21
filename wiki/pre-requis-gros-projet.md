---
type: concept
tags: [gros-projet, scalabilite, standards, lsp, tree-sitter, rag-code, router, typescript, sqlite-vec, local-first]
statut: analyse-faite · pre-requis-de-#139 · non-construit
sources: [historique#session-2026-06-21, statut#139, fondation#III]
maj: 2026-06-21
---

# pre-requis-gros-projet

Les **briques externes** (standards/libs/DB/langages) qui manquent à MangoOS pour réaliser **simplement et bien** un gros projet (site 20 pages, jeu multi-stages). Né de l'audit de faisabilité du 2026-06-21. Filtre `fondation.md` §III : **local-first** (tourne sur la machine, $0) + **standard mature** (jamais un pattern maison si mieux existe).

## Le diagnostic (d'où viennent ces pré-requis)

MangoOS est aujourd'hui un **moteur de sprint, pas de marathon** : il construit du non-trivial (preuve : `crypt-elite`, jeu 2D ~34 fichiers) en **une session intense**, mais 3 murs durs bloquent le *gros* projet :

| Mur | Fait (code) |
|---|---|
| **40 tours / session** (`agent.ts maxTurns=40`) | au-delà → nouvelle session, compaction perdue |
| **Navigation au `grep`** | pas de RAG/index du projet courant ; fiable ≤ ~200 fichiers, fragile au-delà |
| **SPA mono-page** | zéro routeur par défaut ; multi-pages = travail manuel |

> **#139 (Mode Gros Projet)** contourne ces murs par l'**orchestration** (socle-d'abord + Kanban d'incréments bornés). Les briques ci-dessous **équipent** cette orchestration. Voir [[composer-os]].

## Langages & stack — apps *générées* (le plus gros levier)

- **TypeScript par défaut** (au lieu de JS) — *la* réponse « langage ». Donne au LSP/compilateur de vrais types → diagnostics pour l'agent, erreurs de type pour [[mangoqa]], **refactors sûrs**. Tout le reste (LSP, audit, navigation) en dépend.
- **Router fichier** : **TanStack Router/Start**, **Next App Router**, ou **React Router v7** — « une page = un fichier », le squelette de #139.
- **Moteur de jeu** : **Phaser** / **Excalibur** (2D, TS-first), **PixiJS** (rendu), **three.js**/**Babylon.js** (3D) — l'agent écrit du **contenu/niveaux**, pas la plomberie (« moteur d'abord, stages = data »).
- **État/données** : **TanStack Query** + **Zustand/Jotai** — cohérence multi-pages.

## Librairies — intelligence de code de MangoOS

- **tree-sitter** (`web-tree-sitter`) → AST → base d'un **repo-map** (carte du dépôt classée par graphe de dépendances, façon *Aider*) : table des matières compacte d'un gros repo, en budget de tokens borné.
- **LSP** : **typescript-language-server** + **vscode-languageserver-protocol**, exposé à l'agent via un **serveur MCP** (réf. `multilspy`). Donne go-to-definition / find-references / **diagnostics compilateur** au lieu de deviner. MCP est déjà dans la fondation → voir [[kernel]].
- **Embeddings *code*** : **jina-embeddings-v2-base-code** ou **CodeRankEmbed** via **Ollama** ($0 local) — recherche sémantique *de code* (≠ embeddings texte actuels).

→ Combo décisif : **tree-sitter (repo-map) + LSP-via-MCP** = transforme « navigation fragile » en « fiable », et rend les 40 tours plus productifs.

## Banques de données — **tu as déjà la bonne**

- **Index RAG du projet courant → SQLite + sqlite-vec** : *déjà en place* ([[blackboard]]). N'ajoute rien.
- **Upgrade local si l'index explose → LanceDB** (vector DB embarqué Rust, on-disk).
- **Kanban / graphe de tâches persistant → SQLite** (CTE récursives). Vrai besoin graphe → **KùzuDB** embarqué (probablement overkill).
- **Colonne de données partagée pour #138 → PGlite** (Postgres WASM) ou **TinyBase** (store réactif local-first) — la brique qui fait que les apps « se parlent ».

## Anti-patterns (à NE PAS faire)

- **Ne pas changer le langage de MangoOS** (TS/Node = écosystème natif MCP/LSP).
- **Aucune DB serveur ni API cloud** (Qdrant/Chroma serveur, embeddings payants) : casse le local-first. Embarqué uniquement (Ollama + sqlite-vec font déjà tout, $0).
- **Ne pas miser sur un contexte 1M** comme solution : repo-map + LSP battent la force brute (moins cher, plus fiable).

## Priorisation

| # | Brique | Mur réglé | Effort | Type |
|---|---|---|---|---|
| 1 | **TypeScript par défaut** (apps générées) | base de tout | S | standard |
| 2 | **Router fichier** (scaffold) | multi-pages | S | standard |
| 3 | **LSP via MCP** | navigation fiable | M | standard |
| 4 | **Repo-map tree-sitter** | repérage borné en tokens | M | standard |
| 5 | **Embeddings code + index incrémental** | RAG-projet | M | standard |
| 6 | **Kanban persistant + fan-out page-par-page** | mur des 40 tours | M | **maison** (sur [[blackboard]]) |
| 7 | **Moteur de jeu** (si jeux) | plomberie game-loop | S | standard |

**Démarrer par #1+#2** (TypeScript + router fichier = socle de #139, le moins cher), puis **#3 (LSP-MCP)** = le vrai multiplicateur de fiabilité.

## Liens

- [[composer-os]] — #139 (Mode Gros Projet) & #138 (OS d'apps) ; ces briques les équipent
- [[flux]] — l'Auditeur de Flux #137 vérifie la cohérence des gros produits construits
- [[kernel]] — MCP (déjà fondation) = le canal du LSP ; Brain Adaptateur #135
- [[blackboard]] — sqlite-vec déjà là = la DB de l'index projet et du Kanban
- [[mangoqa]] — TypeScript donne au QA des erreurs de type exploitables

## Sources

- `historique.md` session 2026-06-21 (audit de faisabilité gros projet + échange sur les standards)
- `statut.md` #139 · `fondation.md` §III (standards à la périphérie)
