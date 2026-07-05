# Manifeste de transmission orchestrale Fable 5 → MangoOS

## Contexte

Raf voit MangoOS comme le « petit frère » de Fable 5, et demande : que manque-t-il au petit frère en **savoir orchestral et raisonnement**, que le grand frère peut lui transmettre ? La fenêtre Fable se ferme le 2026-07-07.

Constat de départ (établi en discussion, ancré dans `docs/corpus-fable/methode-fable.md`) : Fable a déjà légué 14 axiomes de méthode + le diagnostic de l'« aveuglement à l'agrégat » de GLM. **Mais ces axiomes vivent dans des DOCS, pas dans le code qui tourne.** Trois gestes de Fable ne sont PAS dans le moteur vivant de MangoOS :
1. **La vérification d'AGRÉGAT** — le Gardien (`eleve-gate.ts`) valide chaque *item* (schéma, une réponse, un claim) mais reste aveugle aux propriétés de l'*ensemble* (distribution, unicité éprouvée, dédup, pluralité de sources). C'est le défaut-mère de GLM, jamais câblé côté vérif.
2. **La détection de défauts d'INTERACTION** — Fable a trouvé le 🔴1 (reprise inter-session morte) en croisant deux mécanismes prouvés isolément, invisible des ~800 tests unitaires. MangoOS teste ses gates séparément (`test-fondations-gates-combines.ts` existe mais est écrit à la main, pas systématique).
3. **La RE-CATÉGORISATION à la conception** — le geste « reformuler jusqu'à ce que le problème change de catégorie » (axiome 3). Geste de raisonnement pur, non provoqué par l'outil `planifier`/`eleve-plan.ts`.

## Décisions de Raf (validées)

- **Livrable = un MANIFESTE du « quoi » transmettre**, pas l'implémentation. Séparation penseur/exécutant : le manifeste dit QUOI transmettre et sous quelle forme câblable ; l'implémentation sera un chantier SÉPARÉ et ultérieur.
- **Procédé = Opus produit le premier jet, Fable le CORRIGE** (critique adverse chirurgicale). Raf débloque les crédits Fable mais veut un usage minimal : Fable annote/corrige, il ne produit pas de zéro. C'est la boucle de transmission (déjà validée sur GLM↔Fable) appliquée à Opus↔Fable — et `methode-fable.md §2/§3` confirme que l'apport premier de Fable est la **critique adverse**, pas la production.

## Livrable

`docs/corpus-fable/transmission-orchestrale.md` — pour chaque geste orchestral/de raisonnement que Fable fait et que le moteur VIVANT de MangoOS ne fait pas encore :
- **(a)** le geste nommé ;
- **(b)** où précisément il manque dans le code vivant (chemin de fichier réel + gate concerné — pas un doc, un fichier ouvert) ;
- **(c)** la forme câblable envisagée (volet de Gardien / gate `flags.ts` / outil Élève / générateur de test) — **décrite, PAS implémentée** ;
- **(d)** le critère de vérification (« on saura que c'est transmis quand… ») ;
- **(e)** priorité + effort estimé (colonnes Modèle optimal / Effort, règle du projet).

## Plan d'exécution

**Phase 1 — Premier jet (Opus).** Produire le manifeste en ancrant CHAQUE geste dans un chemin de fichier réel du moteur vivant. Lecture d'ancrage obligatoire : `docs/corpus-fable/methode-fable.md` (les 14 axiomes + les 6 catégories d'aveuglement GLM), puis le code réel — `server/src/eleve-gate.ts` + `eleve-gate-pedago.ts` (modèle de volet le plus récent, #181 É4), `test-fondations-gates-combines.ts`, `eleve-plan.ts`, `brain-dispatch.ts`, `eleve-runtime.ts`. Partir des 3 manques ci-dessus MAIS les challenger (en ajouter, en retirer, en fusionner) : le manifeste doit refléter le moteur RÉEL, pas la liste a priori.

**Phase 2 — Correction adverse (Fable, crédits limités).** Fable relit le jet d'Opus et répond EN TANT QUE FABLE : ce qu'Opus a mal nommé / sur- ou sous-estimé de sa vraie méthode, le geste qu'Opus n'a pas vu, la forme câblable mal cadrée. **Format = annotations/corrections ciblées, pas réécriture complète** (économie de budget). Lancé via un agent `model: fable` (le rôle « architecte » du registre pointe déjà sur `claude-fable-5`).

**Phase 3 — Consolidation (Opus).** Intégrer les corrections de Fable → manifeste final. Marquer visiblement ce que Fable a corrigé (traçabilité de la transmission, comme les annexes de raisonnement du corpus).

## Fichiers

- **Créé** : `docs/corpus-fable/transmission-orchestrale.md`
- **Lus (ancrage, lecture seule)** : `docs/corpus-fable/methode-fable.md`, `server/src/eleve-gate.ts`, `server/src/eleve-gate-pedago.ts`, `server/src/test-fondations-gates-combines.ts`, `server/src/eleve-plan.ts`, `server/src/brain-dispatch.ts`, `server/src/eleve-runtime.ts`, `server/data/brain-registry.json` (rôle architecte)
- **Registre des missions** : ajouter une ligne dans `docs/corpus-fable/README.md` (patron des autres missions du corpus).

## Vérification

Ce chantier **ne modifie aucun code du moteur** — c'est un document. Il est « réussi » si : chaque geste du manifeste est ancré dans un chemin de fichier RÉEL du moteur vivant (pas un doc), a une forme câblable précise et un critère de vérification, et si Fable valide que l'auto-portrait est fidèle à sa vraie méthode (sa correction est intégrée et tracée). La preuve d'exécution viendra au chantier d'implémentation ultérieur, distinct, que Raf lancera quand il voudra — le manifeste en est le cahier des charges.
