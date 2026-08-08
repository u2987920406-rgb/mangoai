# Refonte Mango — dossier de travail

> Ouvert le **2026-08-04** à la demande de Raf : refonte globale de l'écosystème
> **MangoOS + MangoQA** en un produit livrable à un client, exploitable sur le long terme.
>
> **Aucune ligne de code n'a été modifiée.** Ce dossier ne contient que de l'analyse et des
> propositions. Rien ne sera supprimé sans arbitrage explicite et sans trace dans le doc 01.

## Les documents

| # | Document | Contenu | Nature |
|---|---|---|---|
| **00** | [État des lieux](00-AUDIT-ETAT-DES-LIEUX.md) | Audit chiffré des deux repos, 4 constats structurels, ce qui est solide | **mesuré** |
| **01** | [Registre gardé / fusionné / masqué / supprimé](01-REGISTRE-GARDE-FUSION-SUPPRIME.md) | La trace demandée : chaque sous-système, son verdict, sa justification | proposition |
| **02** | [Catalogue des compétences](02-CATALOGUE-COMPETENCES.md) | Les 120 compétences (41 outils + 68 services + 11 spécialistes), par section et par équipe | **mesuré** |
| **03** | [Les Équipes & le Brain Dispatcher](03-EQUIPES-ET-BRAIN-DISPATCH.md) | 6 concepts d'agent → 1. Les 8 équipes, leur cerveau, leurs règles d'allumage | proposition |
| **04** | [Parcours & menus](04-PARCOURS-ET-MENUS.md) | Chaque surface interrogée (pour qui / pourquoi / comment / porte quoi) + le parcours cible | proposition |
| **05** | [La mémoire](05-MEMOIRE.md) | 17 modules → 1 système à 4 étages, avec budget de rappel | proposition |
| **06** | [MangoQA en produit autonome](06-MANGOQA-PRODUIT-AUTONOME.md) | Couplage réel mesuré (quasi nul), positionnement, CLI + MCP, 5 jalons | **chantier actif** |

## Le diagnostic en une phrase

> **MangoOS n'est pas trop complexe : il n'a jamais eu de frontière produit.**
> La refonte n'est pas un travail de réécriture, c'est un travail de **découpe**.

## La cible en chiffres

| | Aujourd'hui | Cible v3 |
|---|---|---|
| Modules backend | 346 | ~120 |
| Routes API | 214 | ~40 |
| Variables d'env | 252 | ~35 |
| Flags | 31 | ≤ 8 |
| Écrans | 6 | 3 |
| Modes de build | 8 | 1 curseur, 3 crans |
| Outils du rail | 15 | 4 |
| Concepts d'agent | 6 | 1 (l'Équipe) |
| Modules mémoire | 17 | 1 |

**Aucune capacité n'est perdue.** Ce qui disparaît : des surfaces, des doublons, et 23
fonctionnalités qui n'ont jamais été exécutées une seule fois.

## Décisions arbitrées par Raf — 2026-08-04

| # | Question | Décision | Conséquence |
|---|---|---|---|
| **1** | Le client, c'est qui ? | ✅ **Le solo maker / dev indé** | Semi-technique à technique, veut posséder son code, allergique aux abonnements. **Il sait lire un verdict d'audit** — c'est la contrainte qui a tranché : le différenciateur est l'auditeur, donc le client doit savoir l'évaluer. Seconde vague : agence / freelance. |
| **5** | Ordre de sortie | ✅ **MangoQA d'abord, seul** | Seul morceau déjà livrable · vrai différenciateur · terrain d'entraînement à la découpe avant les 346 modules de MangoOS. Voir [doc 06](06-MANGOQA-PRODUIT-AUTONOME.md). |
| **2** | La promesse principale | ✅ **« L'atelier qui vérifie son travail »** | Le **Builder est le produit**. La mémoire, les équipes et l'auditeur sont ce qui le rend meilleur que Lovable — pas la promesse elle-même. La vision « OS personnel » de `fondation.md` reste la cible 10 ans, **elle n'est pas la phrase d'accroche v3**. |
| **3** | Méthode d'exécution | ✅ **Hybride** — socle `v3/` qui appelle l'existant | Rien n'est réécrit d'un bloc. L'ancien code devient une bibliothèque qu'on vide progressivement. On peut s'arrêter à tout moment sans casse. |
| **4** | Emplacement de travail | ✅ **`D:\IA\MangoOS` + `D:\IA\MangoQA`** (copies vivantes) | Les clones du Bureau deviennent **lecture seule** — plus aucune modification dessus. Toute la refonte se fait sur les copies qui ont `.env`, `.credentials`, `.brains`, donc testables en réel. |

### Ce que la décision n°2 verrouille

La promesse **« L'atelier qui vérifie son travail »** tranche plusieurs arbitrages du doc 01
qui étaient en suspens :

- 🛡️ **La Vérification devient l'équipe la plus importante du produit**, pas un service annexe.
  Les 5 volets du Gardien passent ON, sans flag. `MANGOQA_STOP_AUTHORITY` devient un réglage
  client visible, pas un gate de dev.
- 🔨 **La Construction locale à `$0` est le second pilier** — le compteur `$0.0000` de l'en-tête
  passe d'un détail à un élément mis en valeur.
- ⚪ Tout ce qui relève de l'**OS personnel** (suite d'apps, Music Creator, Image Creator comme
  applications autonomes, Agent Factory exposée) est **confirmé ARCHIVE** pour la v3.
- 🧠 La **mémoire** reste centrale — mais comme *moyen* (« il connaît ton goût, donc il code
  mieux »), pas comme *promesse*.

## Où on en est (2026-08-08)

**Toutes les décisions de cadrage sont prises**, et le chantier
[MangoQA en produit autonome](06-MANGOQA-PRODUIT-AUTONOME.md) a dépassé le cadrage : il
s'exécute désormais sur `D:\IA\MangoQA`, gouverné par un ADR qui **prime sur ce dossier**
en cas de contradiction — `D:\IA\MangoQA\docs\adr\ADR-001-cap-produit.md`.

| Étape | État |
|---|---|
| **J0** — mesurer avant de vendre | ✅ corpus de **32 cas** étiquetés (24 à défaut, 8 propres, dont 9 longs appariés), détection et faux positifs mesurés par branche |
| **J1** — détacher | ✅ `auditProject()` audite n'importe quel dossier, sans MangoOS |
| **J2** — couverture déclarée | ✅ l'audit partiel ne peut plus se taire (3 étages, déclaré au modèle, au rapport, au verdict) |
| **J3** — CLI + MCP | ✅ `mangoqa <dossier>`, serveur MCP stdio, 355 Mo → 1,6 Mo |
| **ADR lot 0** — choix du cerveau | ✅ **Claude Opus 5** par défaut (le local rendait des verdicts faux, mesuré) |
| **ADR lot 1** — `--diff` | ✅ portée sur le travail non commité ou depuis une référence |
| **ADR lot 2** — fermer le trou d'honnêteté | ✅ **2026-08-08** — un cerveau qui ne juge pas ne peut plus produire de feu vert |
| **ADR lot 3** — conventions du dépôt | ✅ **2026-08-08** — juge contre les règles que le dépôt a écrites, chaque citation vérifiée |
| **ADR lot 4** — axe *Spec* | ✅ **2026-08-08** — `--spec`, 7ᵉ branche : le code fait-il ce qui était demandé ? |
| **ADR lot 5** — intégration | ✅ **2026-08-08** — `mangoqa init` : MCP + hook pre-push + action de CI, sans jamais écraser |
| **ADR lot 6** — prouver | ✅ **2026-08-08** — corpus re-mesuré sous Opus 5, page produit alignée, limites publiées |

> **Les 7 lots de l'ADR-001 sont clos.** Ce qui reste avant une publication npm n'est plus
> du code : c'est **un dépôt tiers à auditer** — la valeur des axes *Standards* et *Spec*
> n'a jamais été mesurée ailleurs que sur nos propres dépôts.

La refonte MangoOS v3 (docs 01 à 05) reprend après, enrichie de l'expérience de la découpe de MangoQA.

## Prochaine étape une fois arbitré

- Maquette cliquable des 3 écrans cibles
- Plan de migration ordonné, chantier par chantier, avec critère de réussite mesurable
- Ouverture des branches `archive/*` avant toute suppression
