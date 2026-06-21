---
type: meta
tags: [wiki, index]
maj: 2026-06-21
---

# Index du wiki MangoOS

Catalogue de toutes les pages. Voir [[_schema]] pour les conventions, [[log]] pour la chronologie.

## Vue d'ensemble

**MangoOS** = agent personnel local-first style Lovable : on décrit une app web dans un chat, l'IA génère le code React/Vite (ou Svelte/Vue), aperçu live à côté. Backend Node+Express (`server/`, port 3000), front builder React+Vite (`ui/`, port 5173). Voir [[idee]].

## Pages-entités (architecture)

| Page | En une ligne | Statut |
|---|---|---|
| [[kernel]] | Infrastructure 5 piliers (Brain, Bus, Blackboard, MCP, Tracing) — #108 | ✅ écrite |
| [[blackboard]] | Mémoire d'artefacts cross-projet, SQLite-vec persistant — #115→#117 | ✅ écrite |
| [[mangoqa]] | Audit autonome « fantôme » à 3 visages (Disjoncteur / Observateur / Œil) | ✅ écrite |
| [[boucle-curation]] | Mesurer → réinjecter → prouver → orienter la réutilisation — #117→#130 | ✅ écrite |
| [[eleve-local]] | Boucle d'apprentissage : Élève Gemma 4 local ($0) + escalade Claude — Jalon D | ✅ écrite |
| [[coque-souple]] | Assemblage du prompt par blocs/scénario, modes MVP/Élite/Finition — jalon A | ✅ écrite |
| [[coque-rigide]] | Contrat d'E/S `<mangoos>`, `executor.ts`, `inspection.ts` — jalon C/D | ✅ écrite |
| [[memoire-expertise]] | 4 magasins (mémoire projet, profil, skills, axiomes), boucle Hermes | ✅ écrite |
| [[vision]] | Entrées visuelles : native, Figma REST, clone/scrape web, clic→source, édition | ✅ écrite |
| [[boucle-nocturne]] | `train-loop.ts` / `nocturnal.ts`, génération autonome de nuit — idée 32 | ✅ écrite |
| [[deploiement]] | GitHub #16, Supabase #17, Cloudflare/Vercel/Netlify #18 | ✅ écrite |
| [[bureau-os]] | Bureau iconique + fenêtres superposables — #136 (Window Manager, chat, palette iOS) | ✅ écrite |
| [[flux]] | Architecture de navigation + contrat de cohérence — audit 2026-06-21, refonte P0→P4 complète | ✅ écrite |
| [[composer-os]] | Assembler la production : suite d'apps (#138, type Office) ou gros projet unique (#139, socle+Kanban) — concept validé | ✅ écrite |
| [[pre-requis-gros-projet]] | Briques externes (TypeScript · router fichier · LSP-MCP · tree-sitter · sqlite-vec) pour les gros projets #139 | ✅ écrite |
| [[dette-technique]] | Les 4 points fragiles de l'archi (App.jsx god-component · nav stringly-typed · regex flux · tests UI) à renforcer — #140 | ✅ écrite |
| [[vault-projet]] | Vault Obsidian auto-cartographié par gros projet (carte vivante navigable agent+humain) — #141 | ✅ écrite |
| [[command-center]] | Mango Command Center — poste de pilotage perso des idées/chantiers, Kanban local-first (prototype du #139) — #144 | ✅ écrite |

## Pistes de pages futures

- Une page par **app construite via MangoOS** (ex. MangoCartes #97) si tu veux suivre tes propres projets.
- [[idee]] et [[design]] mériteraient une page de synthèse si elles grossissent.

## Sources brutes (immuables)

[[statut]] · [[historique]] · [[fondation]] · [[memory]] · [[plan]] · [[changelog]] · [[idee]]
