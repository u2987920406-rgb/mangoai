# Plan d'audit — Boucle de vérification contextuelle, Étape 1 (10 constructions)

## Pourquoi ce plan

L'Étape 1 (`concept-registry.ts` + `verificateur-contexte.ts` + `concept-consolidation.ts`, cf. `enfin-de-retour-robust-quokka.md`) est livrée et testée en isolation (56 tests + 1 preuve live sur le scénario "formation"). Le critère de clôture explicite du plan n'est PAS le code vert — c'est une **fenêtre d'audit de 10 constructions réelles** (ou 2 semaines), avec 4 chiffres mesurés, avant toute décision Go/No-Go sur l'étape 2.

Ce document fixe les 10 briefs qui vont remplir cette fenêtre, décidés à l'avance (pas improvisés projet par projet) pour que la mesure soit propre et comparable.

## Contraintes imposées par Raf (2026-07-08)

- **GLM 5.2 et Qwen (cloud) indisponibles actuellement** → le cerveau de l'Élève est basculé sur **Claude** via `brainOverride` (même patron que la preuve live du soir même, où le juge avait basculé sur Gemini faute de cloud). Pas de blocage de la fenêtre d'audit pour cette raison.
- **Fable 5 interdit pour ces 10 constructions** — trop coûteux pour un audit de volume. Aucun des 10 briefs n'est traité par un agent Fable.
- **7 projets "innovants"** : conçus pour ne PAS s'appuyer sur un acquis MangoOS existant qui pourrait induire en erreur — chacun exploite un mot **polysémique** en français où un gabarit interne nommé d'après le mot existerait naturellement mais désignerait le MAUVAIS sens. C'est le test direct de la boucle : est-ce que Mango vérifie le sens réel avant de réutiliser un gabarit/artefact, ou retombe-t-il dans le biais de l'incident "formation" ?
- **3 projets "déjà vu"** : terrain connu, où la réutilisation d'actions antérieures (gabarits déjà validés/corrigés) est explicitement autorisée — ce sont les contrôles de référence (mesurer le chemin rapide qui fonctionne, pas seulement le chemin lent qui détecte un piège).

### ⚠️ Révision 2026-07-09 — section A corrigée après blocage découvert

La 1ʳᵉ version de la section A (portée, cellule, marché, constitution, charge, greffe, vol) a été écrite sans vérifier que ces mots correspondaient à un vrai déclencheur de la boucle Étape 1. Exploration du code (`server/src/projects.ts`, `server/src/eleve-context-hook.ts`, `server/src/verificateur-contexte.ts`) confirmée le 2026-07-09 :

- `verifierChoixGabaritEnArrierePlan` (Étape 1) ne se déclenche que si l'appelant fournit un `template` qui est **un des 24 noms de dossiers réels** de `server/templates/` (`agent, backend, blog, charts, cytoscape, d3tree, daisy, dashboard, ecommerce, formation, leaflet, mantine, motion, panda, phaser, pixi, r3f, radix, reactflow, router, shadcn, supabase, threejs, vitrine`) — comparaison stricte par égalité de chaîne (`projects.ts:82-84`, `Unknown template` sinon).
- Elle compare le **sens du mot `template`** (via `concept-registry.ts`) au **contenu réel de `App.jsx`** du projet scaffoldé — jamais au domaine détecté par `detectDomain`/`domainTemplateSection` (`template-library.ts`), qui est un mécanisme totalement séparé (21 manifests de domaine injectés dans le prompt système, jamais vérifiés par Étape 1 — angle mort noté à part, voir note en fin de document).
- **Aucun des 7 mots-pièges d'origine ne correspond à un des 24 noms de dossiers** → la boucle n'aurait simplement pas pu se déclencher, `createProject` aurait rejeté le nom avant même d'atteindre le vérificateur.

**Correction** : la section A ci-dessous remplace les 7 mots-pièges par des mots tirés des **24 vrais noms de gabarits**, sur le même patron que "phaser" (déjà prouvé en live le 2026-07-09, verdict `ne-correspond-pas` sur la confusion Star Trek/Phaser.js) — ce brief compte désormais officiellement comme le brief #1 de cette fenêtre d'audit, pas de re-jeu nécessaire.

## Répartition de modèle

| Rôle | Modèle | Pourquoi |
|---|---|---|
| Élève (construction/code des 10 briefs) | **Sonnet 5** (`claude-sonnet-5`) | Modèle courant, standard pour feature complète multi-fichiers — écrire une app n'exige pas le raisonnement le plus profond |
| **Vérificateur contextuel** (verdict ternaire correspond/ne-correspond-pas/incertain) | **Opus 4.8** (`claude-opus-4-8`), par défaut sur les 10 constructions, pas seulement en escalade | C'est le cœur du test (distinguer "cellule de crise" de "cellule biologique" sur un mot-piège) — un jugement sémantique fin, exactement le type de décision que le tableau de sélection de modèle du CLAUDE.md global réserve à Opus, pas à Sonnet |
| **Synthèse finale de l'audit** (les 4 chiffres, rapport Go/No-Go étape 2) | **Opus 4.8** | Raisonnement cross-cutting sur 10 constructions, décision structurante |
| Fable 5 | **Jamais** utilisé | Contrainte explicite de Raf — trop coûteux pour un audit de volume |

## Les 10 briefs

### A. Projets « innovants » (7) — mots-pièges = noms de gabarits techniques réels

Chaque brief nomme explicitement le sens RÉEL voulu ET correspond à l'un des 24 noms de dossiers réels de `server/templates/`, condition nécessaire pour que `verifierChoixGabaritEnArrierePlan` (Étape 1) se déclenche réellement. Le "faux-ami" n'est pas hypothétique : c'est littéralement le gabarit technique existant sous ce nom.

| # | Mot-piège = gabarit réel | Sens attendu (le vrai brief) | Faux-ami (ce que le gabarit technique fait réellement) |
|---|---|---|---|
| 1 | **phaser** | Base de connaissances sur les **phasers de Star Trek** (arme à énergie de science-fiction) | Gabarit `phaser` = moteur de jeu 2D Phaser.js — **déjà prouvé en live le 2026-07-09**, verdict `ne-correspond-pas` obtenu (`server/src/_prove-audit-brief-phaser.ts`) |
| 2 | **agent** | App pour un **agent de voyage** indépendant (dossiers clients, itinéraires, réservations) | Gabarit `agent` = scaffold d'agent LLM/IA (orchestration d'outils) |
| 3 | **panda** | Guide éducatif sur les **pandas roux** (habitat, alimentation, conservation de l'espèce) | Gabarit `panda` = starter stylé avec PandaCSS (framework CSS) |
| 4 | **leaflet** | Générateur de **dépliants publicitaires** papier pour une boulangerie (mise en page, impression) | Gabarit `leaflet` = starter carte interactive Leaflet.js |
| 5 | **radix** | Calculateur pédagogique de **conversion de base numérique** (binaire/octal/hex — "radix" en mathématiques) | Gabarit `radix` = starter composants Radix UI (React) |
| 6 | **dashboard** | Configurateur visuel de **tableau de bord de voiture** (cadrans, compteurs, personnalisation) | Gabarit `dashboard` = starter tableau de bord analytique admin |
| 7 | **motion** | App de **détection de mouvement** pour alarme domestique (capteur PIR, notifications) | Gabarit `motion` = starter d'animations Framer Motion |

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

1. `ELEVE_CONTEXT_LOOP=on` dans `server/.env` avant le lancement du projet #2 (le brief #1 "phaser" est déjà fait, cf. révision 2026-07-09 ci-dessus).
2. Un `createProject()` normal par brief, dans l'ordre du tableau (les 7 innovants d'abord, pour concentrer les cas où le chemin lent doit se déclencher tant que l'index est encore jeune ; les 3 déjà-vu ensuite, pour mesurer le chemin rapide une fois l'index enrichi).
3. Après chaque construction : noter dans le tableau de suivi le verdict rendu (correspond / ne-correspond-pas / incertain), le chemin emprunté (rapide/lent), et si le résultat livré correspond réellement au sens attendu (jugement de Raf ou du Gardien #161).
4. `ELEVE_CONTEXT_CHAINE=on` s'active SÉPARÉMENT, feu vert explicite de Raf, uniquement pour les briefs 11-12 (section C) — même discipline off-par-défaut que `ELEVE_CONTEXT_LOOP`.
5. À la 10ᵉ construction (ou à 2 semaines, selon ce qui vient en premier) : calculer les 4 chiffres du plan d'origine et rédiger le rapport d'audit dans `statut.md` + `limites.md` si des limites apparaissent. Les briefs 11-12 sont mesurés séparément (voir colonnes dédiées ci-dessous), sans faire partie du décompte des 10.

## Tableau de suivi (à remplir au fil des constructions)

| # | Brief | Date | Verdict vérificateur | Chemin (rapide/lent) | Correspond au sens réel ? | Coût/latence ajoutés | Verdict chaîne | Domaine supprimé ? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | phaser (arme Star Trek) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 14s (2e essai) | — | — | Fait via `_prove-audit-brief-phaser.ts` hors flux `createProject` normal du chat — voir limite ci-dessous |
| 2 | agent (agent de voyage) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 48s | — | — | Fait via `_prove-audit-brief-agent.ts`. **Limite méthodo notée** : le gabarit `agent` ne fournit PAS de `src/App.jsx` propre (seulement `agent.js`+`config.json`, overlay sur la base) → le contenu comparé est le **placeholder générique de base**, pas du code distinctif d'agent IA. Verdict correct mais preuve plus faible que "phaser" (qui avait du vrai code Phaser.js distinctif). Vérifié : parmi les 5 mots restants (panda/leaflet/radix/dashboard/motion), tous ont un vrai `src/App.jsx` distinctif — pas de biais pour la suite |
| 3 | panda (pandas roux) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 23s | — | — | Fait via `_prove-audit-brief-panda.ts` — bonne preuve, forte cette fois : le contenu réel comparé était distinctif (starter PandaCSS/Ark UI, un calculateur de TVA), le juge a explicitement noté « panda pris comme la lib CSS, pas l'animal » |
| 4 | leaflet (dépliant publicitaire) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 11s | — | — | Fait via `_prove-audit-brief-leaflet.ts` — bonne preuve, le juge cite explicitement l'homonyme exclu (Leaflet.js) |
| 5 | radix (conversion de base numérique) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 10s | — | — | Fait via `_prove-audit-brief-radix.ts` — bonne preuve |
| 6 | dashboard (tableau de bord voiture) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 10s | — | — | Fait via `_prove-audit-brief-dashboard.ts` — bonne preuve |
| 7 | motion (détection de mouvement) | 2026-07-09 | `ne-correspond-pas` | lent | ✅ oui (verdict correct) | 12s | — | — | Fait via `_prove-audit-brief-motion.ts` — bonne preuve. **Section A complète : 7/7 briefs réussis (verdict correct à chaque fois)** |
| 8 | Formation (cybersécurité PME) | 2026-07-09 | `correspond` | **lent** (pas rapide, voir note) | ✅ oui (verdict correct, aucune régression) | 10s | — | — | Fait via `_prove-audit-brief-formation.ts`. **Découverte honnête** : le chemin RAPIDE espéré ne s'est PAS déclenché — `concept-registry.ts` n'admet une entrée dans l'index qu'après **validation humaine**, jamais faite pour "formation" malgré la preuve live du 2026-07-09 sur ce même gabarit. Le contrôle "chemin rapide une fois l'index enrichi" du plan d'origine suppose donc une étape de validation manuelle non encore pratiquée — à investiguer si l'audit veut vraiment mesurer le chemin rapide |
| 9 | Vitrine (architecte d'intérieur) | 2026-07-09 | `ne-correspond-pas` | lent | ❌ **NON** — verdict inattendu | 15s | — | — | Fait via `_prove-audit-brief-vitrine.ts`. **Découverte importante du contrôle « déjà vu »** : le choix de gabarit `vitrine` était CORRECT (bonne catégorie), mais le vérificateur a rendu `ne-correspond-pas` — raison : le contenu comparé est le placeholder GÉNÉRIQUE pré-génération ("Mon Entreprise/Service premium"), qui ne mentionne littéralement ni "architecte d'intérieur" ni "avant/après" ni "home staging". **Contraste avec brief #8 (formation)** : le gabarit `formation` a réussi car c'est un MOTEUR fonctionnel générique (le juge a reconnu le PATRON leçon→exercice→progression, pas le contenu littéral) ; `vitrine` est un template de CONTENU à remplir, pas un moteur — comparer son placeholder pré-génération à un brief spécifique est structurellement défavorable, indépendamment de la justesse du choix de gabarit. **Limite candidate** : le mécanisme Étape 1 confond potentiellement "mauvais gabarit" et "gabarit correct mais pas encore rempli" pour les templates de contenu (vitrine, ecommerce, blog…) — à vérifier si ça vaut une entrée `limites.md` dans le rapport final |
| 10 | Jeu (voxel/physique 2D) | 2026-07-09 | `ne-correspond-pas` | lent | ❌ **NON** — verdict inattendu | 12s | — | — | Fait via `_prove-audit-brief-jeu.ts` (template `threejs`). **Confirme le pattern du brief #9** : choix de gabarit CORRECT (three.js est bien la bonne techno pour un jeu 3D), mais le contenu réel pré-génération est un template générique (cube violet rotatif, sol, grille) sans aucune trace du monde voxel/FPS demandé → `ne-correspond-pas`. 2 des 3 contrôles « déjà vu » (vitrine, jeu) échouent pour la MÊME raison structurelle, seul `formation` (moteur fonctionnel) a réussi |
| 11 | Cellule + vol + marché (chaîne) | 2026-07-09 | — | — | — | 28s | `coherente` | oui (narratif unifié détecté) | Fait via `_prove-audit-brief-chaine-11.ts` — **1re preuve live du chemin `coherente` sur un cas positif attendu** (les 2 tentatives précédentes du 2026-07-08/09 avaient testé `incertaine` et `incoherente`, jamais un cas cohérent construit exprès) |
| 12 | Charge + constitution (chaîne) | 2026-07-09 | — | — | — | 35s | `coherente` | oui (narratif unifié détecté) | Fait via `_prove-audit-brief-chaine-12.ts` — extracteur a même distingué les 2 occurrences de « charge » dans la phrase (effort physique vs manœuvre militaire) sans les confondre |

## Conclusion de l'audit (2026-07-09) — fenêtre des 12 briefs close

**Les 12 briefs sont tous exécutés en conditions réelles** (`createProject()` direct, recherche web réelle, juge Opus réel via `brainOverride`), en une seule session enchaînée avec feu vert global de Raf. Aucun résultat n'a été forcé ou maquillé — 3 des 12 briefs ont donné un verdict différent de celui attendu, rapportés tels quels.

### Les 4 chiffres (non formellement définis ailleurs — dérivés des colonnes du tableau de suivi ci-dessus, cohérents avec l'intention du plan d'origine)

1. **Taux de détection correcte des mots-pièges (section A, cœur de l'Étape 1)** : **7/7 = 100 %**. Les 7 gabarits réels polysémiques (phaser, agent, panda, leaflet, radix, dashboard, motion) ont tous été correctement rejetés (`ne-correspond-pas`) pour un brief dans le mauvais sens. Chemin **lent** à chaque fois (index encore jeune, aucune entrée validée).
2. **Taux de succès sur les contrôles « déjà vu » (section B)** : **1/3 = 33 %** (formation ✅, vitrine ❌, jeu ❌) — mais les 2 échecs partagent une cause structurelle identifiée (L111), pas un défaut du jugement sémantique lui-même. **Chemin rapide observé : 0/3** — jamais déclenché, faute de validation humaine dans `concept-registry.ts` (aucune entrée n'y est jamais entrée malgré plusieurs preuves live antérieures sur "formation").
3. **Taux de cohérence correcte sur la chaîne de termes (section C)** : **2/2 = 100 %**. Première preuve live du chemin `coherente` sur un cas positif construit exprès (les tentatives précédentes du 2026-07-08/09 n'avaient couvert que `incertaine` et `incoherente`).
4. **Latence médiane ajoutée par brief** : **~12s** pour le vérificateur seul (Étape 1, hors `npm install` du scaffold) ; **~31s** pour la chaîne (Étape 1bis, extraction+jugement). Aucun brief n'a dépassé 48s. Coût négligeable à l'échelle d'une construction complète.

### Découvertes marquantes

- **Le cœur sémantique de l'Étape 1 fonctionne** : sur les 9 verdicts `ne-correspond-pas`/`coherente` attendus et obtenus (7 mots-pièges + 2 chaînes), 100 % de réussite, avec des raisonnements systématiquement pertinents et jamais de faux `correspond`/`coherente` fabriqué par complaisance.
- **L111 (nouvelle limite, `limites.md`)** : le mécanisme confond « mauvais gabarit » et « bon gabarit pas encore rempli » sur les templates de CONTENU (vitrine, ecommerce, blog, scènes de démo comme `threejs`) — le hook tourne fire-and-forget juste après `createProject`, avant toute écriture réelle par l'Élève, donc ce faux-négatif se produirait aussi en production, pas seulement dans cet audit. **Marquée bloquante avant d'activer `ELEVE_CONTEXT_LOOP=on` en continu.**
- **L110 (limite déjà consignée le 2026-07-09)** : `detectDomain`/`domainTemplateSection` (21 manifests de domaine) n'est jamais vérifié par cette boucle — angle mort séparé, non bloquant pour cette fenêtre.
- Le chemin rapide (`concept-registry.ts`) n'a jamais pu être mesuré faute de validation humaine des entrées — la fenêtre d'audit ne permet donc pas de conclure sur cette moitié du mécanisme à deux vitesses.

### Recommandation Go/No-Go étape 2

**Go conditionnel** : le jugement sémantique fin (le cœur de la boucle, testé par les mots-pièges et les chaînes) est validé à 100 % sur cette fenêtre — assez solide pour justifier d'élargir l'Étape 2 (au-delà de gabarit/artefact). **Mais pas avant de lever L111** (sinon l'élargissement hérite du même faux-négatif sur tout artefact de type "contenu à remplir", ce qui casserait la confiance dans le signal) et, idéalement, de faire au moins une passe de validation humaine dans `concept-registry.ts` pour enfin mesurer le chemin rapide au moins une fois avant de construire dessus.

## Ce que ce plan NE fait PAS

- Il ne lance aucune construction tout seul — chaque brief attend le feu vert explicite de Raf avant exécution (respect du rythme habituel, un projet à la fois, revue possible entre chacun).
- Il n'active pas les gates `ELEVE_CONTEXT_LOOP`/`ELEVE_CONTEXT_CHAINE` — ça reste une action séparée, à confirmer au moment de lancer chaque brief.
- Il ne touche à aucun fichier de code — c'est un document de planification pur (le code de `chaine-ambigue.ts` a été implémenté séparément, cf. plan d'implémentation approuvé le 2026-07-08).
