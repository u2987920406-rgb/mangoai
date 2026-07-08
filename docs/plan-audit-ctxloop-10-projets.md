# Plan d'audit — Boucle de vérification contextuelle, Étape 1 (10 constructions)

## Pourquoi ce plan

L'Étape 1 (`concept-registry.ts` + `verificateur-contexte.ts` + `concept-consolidation.ts`, cf. `enfin-de-retour-robust-quokka.md`) est livrée et testée en isolation (56 tests + 1 preuve live sur le scénario "formation"). Le critère de clôture explicite du plan n'est PAS le code vert — c'est une **fenêtre d'audit de 10 constructions réelles** (ou 2 semaines), avec 4 chiffres mesurés, avant toute décision Go/No-Go sur l'étape 2.

Ce document fixe les 10 briefs qui vont remplir cette fenêtre, décidés à l'avance (pas improvisés projet par projet) pour que la mesure soit propre et comparable.

## Contraintes imposées par Raf (2026-07-08)

- **GLM 5.2 et Qwen (cloud) indisponibles actuellement** → le cerveau de l'Élève est basculé sur **Claude** via `brainOverride` (même patron que la preuve live du soir même, où le juge avait basculé sur Gemini faute de cloud). Pas de blocage de la fenêtre d'audit pour cette raison.
- **Fable 5 interdit pour ces 10 constructions** — trop coûteux pour un audit de volume. Aucun des 10 briefs n'est traité par un agent Fable.
- **7 projets "innovants"** : conçus pour ne PAS s'appuyer sur un acquis MangoOS existant qui pourrait induire en erreur — chacun exploite un mot **polysémique** en français où un gabarit interne nommé d'après le mot existerait naturellement mais désignerait le MAUVAIS sens. C'est le test direct de la boucle : est-ce que Mango vérifie le sens réel avant de réutiliser un gabarit/artefact, ou retombe-t-il dans le biais de l'incident "formation" ?
- **3 projets "déjà vu"** : terrain connu, où la réutilisation d'actions antérieures (gabarits déjà validés/corrigés) est explicitement autorisée — ce sont les contrôles de référence (mesurer le chemin rapide qui fonctionne, pas seulement le chemin lent qui détecte un piège).

## Répartition de modèle

| Rôle | Modèle | Pourquoi |
|---|---|---|
| Élève (construction/code des 10 briefs) | **Sonnet 5** (`claude-sonnet-5`) | Modèle courant, standard pour feature complète multi-fichiers — écrire une app n'exige pas le raisonnement le plus profond |
| **Vérificateur contextuel** (verdict ternaire correspond/ne-correspond-pas/incertain) | **Opus 4.8** (`claude-opus-4-8`), par défaut sur les 10 constructions, pas seulement en escalade | C'est le cœur du test (distinguer "cellule de crise" de "cellule biologique" sur un mot-piège) — un jugement sémantique fin, exactement le type de décision que le tableau de sélection de modèle du CLAUDE.md global réserve à Opus, pas à Sonnet |
| **Synthèse finale de l'audit** (les 4 chiffres, rapport Go/No-Go étape 2) | **Opus 4.8** | Raisonnement cross-cutting sur 10 constructions, décision structurante |
| Fable 5 | **Jamais** utilisé | Contrainte explicite de Raf — trop coûteux pour un audit de volume |

## Les 10 briefs

### A. Projets « innovants » (7) — mots-pièges polysémiques

Chaque brief ci-dessous nomme explicitement le sens RÉEL voulu, pour que l'audit puisse vérifier après coup si Mango a halluciné le mauvais sens ou correctement navigué vers le bon.

| # | Mot-piège | Sens attendu (le vrai brief) | Faux-ami plausible (gabarit interne qui matcherait le nom) |
|---|---|---|---|
| 1 | **Portée** | App de suivi d'une **portée de chatons** qui vient de naître (poids, tétées, sevrage) | "Portée" = scope/périmètre de projet (jargon gestion) |
| 2 | **Cellule** | App de **cellule de crise municipale** (suivi d'incident, rôles, mains courantes) | "Cellule" = visualiseur de cellule biologique (thème scientifique/éducatif) |
| 3 | **Marché** | App de suivi d'un **marché public** (appel d'offres, cahier des charges, attributaires) | "Marché" = marketplace e-commerce (vitrine produits/panier) |
| 4 | **Constitution** | App de suivi de la **constitution physique d'un sportif** (morphologie, masse musculaire, progression) | "Constitution" = éditeur/visualiseur de texte constitutionnel (droit) |
| 5 | **Charge** | App éducative sur une **charge de cavalerie historique** (bataille, tactique, chronologie) | "Charge" = gestion de charge de travail (workload/Kanban) |
| 6 | **Greffe** | App pour le **greffe d'un tribunal de commerce** (dépôt d'actes, registre, délais) | "Greffe" = suivi de greffe horticole (bouturage, jardinage) |
| 7 | **Vol** | App de **prévention du vol à l'étalage** pour commerçants (zones à risque, alertes, statistiques) | "Vol" = suivi de vols aériens (aviation, horaires, aéroports) |

### B. Projets « déjà vu » (3) — terrain connu, réutilisation autorisée

| # | Sujet | Pourquoi « déjà vu » | Contrôle mesuré |
|---|---|---|---|
| 8 | **Formation** — nouveau sujet (ex. cybersécurité pour PME), gabarit `formation` déjà corrigé le 2026-07-08 (plus de quiz forcé) | Vérifie la non-régression sur le gabarit corrigé ce soir même | Le vérificateur doit valider ce choix SANS re-déclencher d'incident (chemin rapide si le concept "formation" est déjà dans l'index après la preuve live) |
| 9 | **Vitrine** — site vitrine pour un métier réel (ex. architecte d'intérieur) | Gabarit vitrine déjà éprouvé plusieurs fois dans `reference_projects_2026_06` | Mesure le chemin rapide sur un concept déjà stable, pas de mot-piège |
| 10 | **Jeu** — jeu navigateur (voxel ou physique 2D), réutilisant un moteur déjà prouvé (patron Naruto Craft / ThreeJS) | Gabarit jeu déjà construit et vérifié en runtime plusieurs fois | Mesure le chemin rapide + réutilisation d'artefact stack sur un genre non-ambigu |

### C. Projets à chaîne de termes ambigus (2, ajoutés le 2026-07-08 — capacité `ELEVE_CONTEXT_CHAINE`)

Raf a corrigé un angle mort de l'Étape 1 : vérifier UN mot-piège isolé ne suffit pas — « si dès le départ on part dans le mauvais sens, tout ce qui en découle est faux ». Nouveau module `server/src/chaine-ambigue.ts` : évalue la **cohérence jointe** de plusieurs termes ambigus consécutifs du brief, EN AMONT (avant l'injection du manifeste de domaine, `index.ts:713-719`), pas seulement après coup sur l'artefact choisi. Ces 2 briefs combinent délibérément 2-3 mots-pièges de la section A dans la MÊME phrase, pour vérifier que la chaîne complète est jugée cohérente/incohérente et pas seulement chaque mot isolément.

| # | Brief | Termes en chaîne | Sens attendu (cohérent) | Faux-ami si jugés isolément |
|---|---|---|---|---|
| 11 | *« Application pour gérer la cellule de crise pendant un vol organisé à l'étalage sur le marché du centre-ville »* | cellule + vol + marché | Sécurité publique/commerçants (crise municipale, vol à l'étalage, marché physique) | Pris isolément : cellule biologique + vol aérien + marketplace e-commerce — 3 domaines incompatibles |
| 12 | *« Suivi de la charge et de la constitution d'un cheval pendant une charge de cavalerie »* | charge + constitution | Équestre/historique (morphologie du cheval, tactique militaire) | Pris isolément : gestion de workload + texte constitutionnel — hors-sujet complet |

**Important** : les 7 briefs de la section A restent la mesure du chemin **mot isolé** (`ELEVE_CONTEXT_LOOP`) — pas besoin de les rejouer pour cette nouvelle capacité, la fenêtre de 10 constructions de l'Étape 1 reste intacte. La section C est un complément à 12 constructions au total, pas une réécriture.

## Déroulé opérationnel

1. `ELEVE_CONTEXT_LOOP=on` dans `server/.env` avant le lancement du projet #1.
2. Un `createProject()` normal par brief, dans l'ordre du tableau (les 7 innovants d'abord, pour concentrer les cas où le chemin lent doit se déclencher tant que l'index est encore jeune ; les 3 déjà-vu ensuite, pour mesurer le chemin rapide une fois l'index enrichi).
3. Après chaque construction : noter dans le tableau de suivi le verdict rendu (correspond / ne-correspond-pas / incertain), le chemin emprunté (rapide/lent), et si le résultat livré correspond réellement au sens attendu (jugement de Raf ou du Gardien #161).
4. `ELEVE_CONTEXT_CHAINE=on` s'active SÉPARÉMENT, feu vert explicite de Raf, uniquement pour les briefs 11-12 (section C) — même discipline off-par-défaut que `ELEVE_CONTEXT_LOOP`.
5. À la 10ᵉ construction (ou à 2 semaines, selon ce qui vient en premier) : calculer les 4 chiffres du plan d'origine et rédiger le rapport d'audit dans `statut.md` + `limites.md` si des limites apparaissent. Les briefs 11-12 sont mesurés séparément (voir colonnes dédiées ci-dessous), sans faire partie du décompte des 10.

## Tableau de suivi (à remplir au fil des constructions)

| # | Brief | Date | Verdict vérificateur | Chemin (rapide/lent) | Correspond au sens réel ? | Coût/latence ajoutés | Verdict chaîne | Domaine supprimé ? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Portée (portée de chatons) | | | | | | — | — | |
| 2 | Cellule (cellule de crise) | | | | | | — | — | |
| 3 | Marché (marché public) | | | | | | — | — | |
| 4 | Constitution (physique sportif) | | | | | | — | — | |
| 5 | Charge (charge de cavalerie) | | | | | | — | — | |
| 6 | Greffe (greffe du tribunal) | | | | | | — | — | |
| 7 | Vol (prévention vol à l'étalage) | | | | | | — | — | |
| 8 | Formation (cybersécurité PME) | | | | | | — | — | |
| 9 | Vitrine (architecte d'intérieur) | | | | | | — | — | |
| 10 | Jeu (voxel/physique 2D) | | | | | | — | — | |
| 11 | Cellule + vol + marché (chaîne) | | — | — | | — | | | |
| 12 | Charge + constitution (chaîne) | | — | — | | — | | | |

## Ce que ce plan NE fait PAS

- Il ne lance aucune construction tout seul — chaque brief attend le feu vert explicite de Raf avant exécution (respect du rythme habituel, un projet à la fois, revue possible entre chacun).
- Il n'active pas les gates `ELEVE_CONTEXT_LOOP`/`ELEVE_CONTEXT_CHAINE` — ça reste une action séparée, à confirmer au moment de lancer chaque brief.
- Il ne touche à aucun fichier de code — c'est un document de planification pur (le code de `chaine-ambigue.ts` a été implémenté séparément, cf. plan d'implémentation approuvé le 2026-07-08).
