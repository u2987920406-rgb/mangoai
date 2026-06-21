---
type: meta
tags: [wiki, schema, conventions]
maj: 2026-06-20
---

# Schéma du wiki MangoOS

> Ce fichier décrit **comment ce wiki fonctionne**. À lire en début de session avant d'ingérer une nouvelle source ou de répondre à une question contre le wiki. C'est l'équivalent du `CLAUDE.md` du pattern *LLM Wiki* (idée copiée-collée depuis le document « LLM Wiki »).

## Les trois couches

1. **Sources immuables** — la doc historique du projet, à la racine de MangoOS. On les **lit, on ne les réécrit pas** :
   - [[statut]] — état courant + tableau des idées (source de vérité du backlog)
   - [[historique]] — log chronologique complet (~2000 lignes, append-only)
   - [[fondation]] — document fondateur, architecture et principes non négociables
   - [[memory]] — règles spécifiques du projet, détails techniques
   - [[plan]] — roadmap / phases
   - [[changelog]] — suivi session/session

2. **Le wiki** (ce dossier `wiki/`) — pages **synthétisées et interconnectées** générées par l'IA. Pages-entités (un concept = une page vivante), un [[index]] de catalogue, un [[log]] chronologique. C'est cette couche qui se bonifie à chaque session.

3. **Le vault Obsidian** = le dossier `D:\IA\MangoOS` ouvert en entier. Les `[[liens]]` se résolvent par nom de fichier dans tout le vault → une page du wiki peut pointer vers une source brute (`[[statut]]`) comme vers une autre page-entité (`[[kernel]]`).

## Conventions de page

- **Frontmatter YAML** en tête (pour Dataview) : `type`, `tags`, `statut`, `sources`, `maj`.
- **Une définition en une ligne** juste sous le titre.
- Sections : `## Rôle` · `## Détails clés` · `## Liens` · `## Sources`.
- Liens `[[wikilink]]` **libéralement**. Un lien vers une page inexistante (ex. `[[coque-souple]]`) n'est PAS une erreur — il marque une page à écrire (apparaît en pointillé dans le graphe Obsidian).
- Citer les sources avec le **numéro d'idée** quand il existe (ex. « Kernel #108 ») + le fichier source.

## Workflows

- **Ingest (nouvelle session)** : lire le delta dans [[statut]]/[[historique]], mettre à jour les pages-entités touchées, ajouter une entrée datée dans [[log]], rafraîchir l'[[index]] si une page est créée.
- **Query** : lire l'[[index]] → ouvrir les pages pertinentes → synthétiser avec citations. Une bonne réponse peut être **classée en nouvelle page** plutôt que perdue dans le chat.
- **Lint** : repérer contradictions, pages orphelines, concepts cités sans page, liens manquants.

## État de ce wiki

Slice initial (2026-06-20) : squelette + 5 pages-entités phares. Voir [[index]] pour ce qui reste à écrire.
