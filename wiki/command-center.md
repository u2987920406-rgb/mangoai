---
type: entity
tags: [app, outil-perso, kanban, local-first, dogfood]
statut: ✅ livré (2026-06-21)
sources: [statut, historique]
maj: 2026-06-21
---

# Mango Command Center

Le **poste de pilotage** des idées et chantiers de MangoOS (#13 → #143) — un Kanban local-first, premier outil du dossier `apps/` (outils persos de Raf), qui sert de **prototype vivant du Kanban de [[composer-os]] (#139)** et d'un premier pas vers le [[vault-projet]] (#141).

## Rôle

- **Dogfooder MangoOS** : Raf se sert quotidiennement d'un outil construit dans l'écosystème, et **accumule la donnée qui compounde** (ses décisions, priorités, progression sur 10 ans — cf. [[vision]]).
- **Aide à la décision** : le panneau « 🚀 Prêt à démarrer » répond à *« qu'est-ce que je peux attaquer maintenant ? »* en ne montrant que les idées dont **toutes les dépendances sont faites**.
- **Prototype** : valide à petite échelle les briques dont [[composer-os]] (#139, Kanban de pages/stages) aura besoin — board, statut, dépendances, réutilisation du squelette.

## Détails clés

- **Stack** : Vite + React 19 + **TypeScript strict**, CSS écrit à la main (zéro Tailwind), **local-first** (localStorage `mango.command-center.v1` + journal `.history.v1`), export/import JSON, **aucun backend**, port dédié **5180**. On applique le conseil de [[dette-technique]]/[[pre-requis-gros-projet]] (TS par défaut).
- **Emplacement** : `apps/command-center/` — nouveau dossier `apps/` = **outils persos de Raf**, distinct de `workspace/` (expériences générées).
- **Modèle de données** : `Idea{ id, title, status('idea'|'doing'|'blocked'|'done'), model('haiku'|'sonnet'|'opus'|'none'), effort('XS'..'XL'|'none'), tags[], deps[], notes, updatedAt }`. Journal `HistoryEntry{ id, from, to, ts }`.
- **Seed** : ~38 cartes **réelles** extraites de [[statut]] (mapping ✅→done, 💡→idea, en cours→doing, attend/REPLICATE→blocked ; ⚡/⚖️/🧠/—→tiers de modèle). Couvre #13→#143 + l'infra nommée ([[kernel]] #108, [[blackboard]] #115/#117, [[boucle-curation]] #121/#123/#125/#130, [[mangoqa]] #105/#110/#111/[[flux]] #137, [[bureau-os]] #136, concepts #138-#141, vitrines #94-#98). Raf complète le reste — c'est le but.
- **Fonctionnalités** : board 4 colonnes (compteur + Σ effort) · cartes glassmorphism (badges modèle/effort, tags & deps cliquables, date relative) · déplacement boutons ←/→ **+ drag&drop HTML5 natif** (sans lib) · modal ajout/édition · survol = surlignage des dépendances et de ce qu'une carte débloque · historique de statut + « activité récente » · recherche + filtres modèle/effort/tag · en-tête stats (total/%/colonne/modèle/histogramme) · raccourcis N//`/`/Échap · états vides soignés · responsive.
- **Esthétique** : Apple translucide/diffuse + tons mangue (`#FF9500`/`#FFCC00`/`#FF3B30`) + violet signature `#7c5cff` + vert `#34C759` discret, fond sombre profond. **Exception ADN assumée** (permise par Raf) : l'outil étant personnel, l'ADN visuel MangoOS s'y applique — contrairement aux apps générées.
- **Vérification** : `tsc`+`vite build` verts ; **Sharingan** (7 captures Playwright lues) ; test fonctionnel (move/drag/persistance reload/édition/reset, zéro erreur console). Un **bug de pureté** trouvé et corrigé (effet `recordMove` sorti des updaters `setState` — double-fire StrictMode).

## Liens

- [[composer-os]] — le Kanban de #139 dont cet outil est le prototype vivant.
- [[vault-projet]] — #141, vers quoi cet outil est un premier pas (cartographie navigable d'un projet).
- [[dette-technique]] · [[pre-requis-gros-projet]] — le conseil « TypeScript par défaut » qu'on applique ici.
- [[bureau-os]] — la même philosophie « shell + fenêtres » côté cockpit MangoOS.
- [[statut]] — source du seed (tableau des idées) et du backlog.

## Sources

- [[statut]] § « Mango Command Center » (#144) + tableau d'idées.
- [[historique]] § Journal des sessions (2026-06-21) + Détail des idées (#144).
- Plan d'autopilote : `.claude/plans/stauttu-breezy-hickey.md`.
