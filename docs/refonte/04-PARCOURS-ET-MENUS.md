# Refonte Mango — 04 · Parcours utilisateur & interrogation de chaque menu

> Méthode : pour **chaque surface existante**, quatre questions —
> **POUR QUI ? · POURQUOI ? · COMMENT ? · QU'EST-CE QUE ÇA DOIT PORTER ?**
> Une surface qui ne répond pas aux quatre n'a pas sa place dans le produit livrable.
>
> Statut : **proposition, en attente d'arbitrage.** Le parcours cible dépend de la réponse
> de Raf sur l'identité du client (voir § 4).

---

# PARTIE A — Interrogation des surfaces existantes

## A.1 — Écran ACCUEIL

| Question | Réponse aujourd'hui | Verdict |
|---|---|---|
| **Pour qui ?** | Raf, qui veut discuter avant de construire | ✅ clair |
| **Pourquoi ?** | Séparer « je réfléchis » de « je construis » | ✅ **bonne idée, à garder** |
| **Comment ?** | Chat + hamburger à 9 entrées + dropdown modèle + dropdown mode + gabarits | ❌ trop |
| **Doit porter ?** | **Une seule chose : le premier message.** | ❌ en porte 12 |

> 🟢 **GARDE l'écran. 🔴 SUPPRIME 9 des 12 éléments.**
> La « graduation » (brouillon → vrai projet) est une des meilleures idées du système :
> l'utilisateur discute librement, et Mango propose *lui-même* d'ouvrir un atelier quand ça
> devient sérieux. **C'est le cœur du parcours. Tout le reste de l'accueil doit disparaître pour
> le laisser respirer.**

## A.2 — Menu hamburger de l'Accueil (9 entrées)

| Entrée | Pour qui ? | Verdict |
|---|---|---|
| App Builder | tout le monde | 🟢 **devient l'action principale, pas une entrée de menu** |
| OS d'apps — la suite | personne d'identifié | ⚪ ARCHIVE |
| Image Creator | Raf ponctuellement | 🔵 → compétence de l'équipe Design, appelée par le chat |
| Music Creator | personne | ⚪ ARCHIVE — aucun usage constaté |
| Agent Factory | personne (registre **vide**) | 🟡 MASQUE |
| Ideation | doublon avec le Plan | 🔵 fusionne |
| Doc | rare | 🔵 → compétence appelée par le chat |
| Variantes de goût | Raf, utile | 🟢 GARDE (1 des 2 fenêtres restantes) |
| Éditeur visuel | non déterminé | ⚪ ARCHIVE |

> **Question sans réponse : pourquoi ces 9 outils sont-ils des *fenêtres* et pas des *phrases* ?**
> « Génère-moi une image de X » devrait suffire. Un produit conversationnel qui exige d'ouvrir
> une fenêtre pour chaque capacité n'a pas terminé d'être conversationnel.

## A.3 — En-tête de l'Atelier

| Élément | Pour qui ? | Pourquoi ? | Verdict |
|---|---|---|---|
| Sélecteur de projet | ✅ tous | changer de projet sans repasser par l'accueil | 🟢 **GARDE** — bien fait (recherche + tri persistant) |
| Dropdown **Mode** (8) | ❌ personne ne peut choisir juste | mélange 4 axes | 🔴 **SUPPRIME → 1 curseur, 3 crans** |
| Dropdown **Modèle** (4) | Raf uniquement | contrôle du coût | 🟡 → passe dans « Avancé » |
| Bouton Publier (3 cibles) | ✅ tous | mettre en ligne | 🟢 GARDE + y ajouter GitHub |
| Jauge de contexte | Raf | diagnostic | 🟡 → « Avancé » |
| Coût cumulé `$0.0000` | ✅ tous | **preuve de souveraineté** | 🟢 **GARDE — c'est un argument de vente, à mettre en valeur** |
| Poubelle projet | ✅ tous | — | 🟢 GARDE |

### Le remplacement du dropdown Mode

```
   AVANT (8 entrées, 4 axes mélangés)          APRÈS (1 curseur, 3 crans)

   ○ MVP                                        ┌──────────────────────────┐
   ○ Élite                                      │  ⚡ Rapide  ● Standard    │
   ○ Finition                                   │            ○ Soigné      │
   ○ Esthétique                     ══════▶     └──────────────────────────┘
   ○ Gros Projet                                 Rapide  → modèle rapide, 1 passe
   ○ App composable                              Standard→ défaut, Gardien complet
   ○ Agent UX/UI                                 Soigné  → + loop design + 3 essais
   ○ Agent Layout
                                     La FORME du projet (gros/composable) est DÉDUITE
                                     du plan. La PHASE (finition/esthétique) est DÉDUITE
                                     de l'état du projet. Les AGENTS sont des équipes.
```

## A.4 — Rail d'outils du Workspace (15 outils)

| Outil | Pour qui ? | Pourquoi ? | Ça doit porter quoi ? | Verdict |
|---|---|---|---|---|
| **Mémoire** | ✅ tous | savoir ce que Mango sait | axiomes + préférences + faits du projet | 🟢 **GARDE — à enrichir, c'est le cœur** |
| **Versions** | ✅ tous | revenir en arrière | historique + rollback 1 clic | 🟢 GARDE |
| **Backend** | ✅ si applicable | démarrer/arrêter | statut + URL | 🟢 GARDE (conditionnel) |
| **Exporter** | ✅ tous | récupérer son code | zip | 🟢 GARDE — **preuve de souveraineté** |
| Revue du build | ✅ tous | savoir si c'est bon | verdict + notes | 🔵 → **dans le chat**, automatique |
| Perfect Plan | ✅ tous | cadrer | le contrat du projet | 🔵 → dans le chat |
| Dosage de style (0-100 %) | Raf | doser son goût | curseur | 🟡 → « Avancé » |
| Multi-Projet | Raf | réutiliser du code | — | 🟡 MASQUE (auto) |
| Loop Design | Raf | itérer le design | — | 🔵 → cran « Soigné » |
| Diagrammes | ✅ tous | comprendre l'archi | mermaid avant/après | 🔵 → dans le chat, auto |
| Chantier (Kanban) | projets longs | suivre l'avancement | étapes | 🟡 MASQUE (si > 5 étapes) |
| MangoQA | ✅ tous | savoir si c'est sûr | verdict | 🔵 → **bandeau permanent** |
| Mode Miroir | ? | ? | ? | ⚪ ARCHIVE — **aucune réponse aux 4 questions** |
| Mode Client | Raf en prestation | ignorer son goût perso | — | 🔵 → profil à la création du projet |
| Afficher la réflexion | ✅ tous | comprendre | — | 🔵 → réglage global |

> **Constat brutal : sur 15 outils, 4 répondent aux quatre questions.** Les 11 autres sont soit
> des réglages déguisés en outils, soit des comportements qui devraient être automatiques, soit
> des surfaces sans utilisateur identifié.

## A.5 — Réglages (5 groupes, 9 entrées)

| Groupe / entrée | Pour qui ? | Verdict |
|---|---|---|
| **Intelligence** — Atelier des cerveaux | Raf | 🟢 GARDE → devient **« Équipes »** : 8 lignes, 1 modèle par ligne |
| **Intelligence** — Lacunes à combler | Raf | 🟡 MASQUE (les 5 lacunes actuelles sont toutes à 8-16 % — aucune ne vaut le coup) |
| **Compte** — Facturation | ⚠️ dépend du modèle économique | ⚠️ **DÉCISION RAF** |
| **Sécurité** — Coffres | ✅ tous | 🟢 GARDE |
| **Diagnostics Kernel** — Métriques | Raf | 🔵 → 1 page « Santé » |
| **Diagnostics Kernel** — Traces | Raf | 🔵 → 1 page « Santé » |
| **Diagnostics Kernel** — Dashboard d'évolution | Raf | 🔵 → 1 page « Santé » |
| **Diagnostics Kernel** — Auto-Ablation | personne (flag OFF) | ⚪ ARCHIVE |
| **Veille & outils** — Radar IA | Raf | ⚪ ARCHIVE — sans rapport avec le produit |
| **Veille & outils** — Veille IA | Raf | ⚪ ARCHIVE — sans rapport avec le produit |

> **Cible : 3 groupes, 5 entrées.** Équipes · Souveraineté (local/cloud, coffres) · Santé.

---

# PARTIE B — Le parcours utilisateur cible

## B.1 — Le parcours en 6 moments

```
 ①  ARRIVÉE
     Un écran. Un champ. Une phrase :  « Qu'est-ce qu'on fait aujourd'hui ? »
     Pas de choix de modèle. Pas de mode. Pas de gabarit.
     ▸ ce qui change : 12 éléments → 1

 ②  CONVERSATION
     L'utilisateur explique. Mango pose des questions — mais seulement
     celles qui SERVENT ce projet (le mécanisme existe déjà :
     selectRelevantQuestions, 6-8 questions ciblées sur 30).
     ▸ ce qui change : le cadrage n'est plus une fenêtre, c'est une discussion

 ③  BASCULE  ← LE MOMENT CLÉ DU PRODUIT
     Mango propose : « Je pense qu'on tient quelque chose. J'ouvre l'atelier ? »
     L'utilisateur accepte. Le brouillon devient un projet.
     ▸ ce qui change : rien. Ça existe déjà (graduation) et c'est excellent.

 ④  CONSTRUCTION
     Écran unique : chat à gauche, app réelle à droite.
     Le bandeau d'équipes montre qui travaille, en direct.
     Le compteur affiche $0.0000.
     ▸ ce qui change : 15 outils → 4, 8 modes → 1 curseur

 ⑤  VÉRITÉ
     Fin de tour. Le Gardien parle dans le chat, en français, sans jargon :
        ✓ « Ce que tu as demandé : livré (7 fichiers) »
        ✓ « Les images correspondent au texte »
        ⚠ « Le contraste du menu est à 3.1 — sous le seuil d'accessibilité »
        🥭 « MangoQA : feu vert · 1 réserve sur la sécurité »
     ▸ ce qui change : le verdict n'est plus dans un panneau qu'il faut ouvrir

 ⑥  SORTIE
     Publier (Cloudflare / Vercel / Netlify / GitHub) ou Exporter (zip).
     Le code est à lui. Il peut partir.
     ▸ ce qui change : rien — et c'est le point le plus fort du produit
```

## B.2 — Les trois écrans (contre six)

| Écran | Contient | Ne contient plus |
|---|---|---|
| **Accueil** | le champ, le fil de conversation, l'historique | 9 fenêtres, 2 dropdowns, les gabarits |
| **Atelier** | chat · aperçu · bandeau d'équipes · 4 outils · curseur qualité | 11 outils, 8 modes, le contrôleur |
| **Réglages** | Équipes (8) · Souveraineté · Santé | Radar, Veille, Auto-Ablation, Lacunes, Traces |

## B.3 — Ce qui disparaît de la vue de l'utilisateur (et continue de tourner)

Ce point est essentiel : **masquer n'est pas supprimer.**

| Continue de tourner, invisible | Se manifeste comment ? |
|---|---|
| Les 8 équipes | bandeau de statut pendant le travail |
| Le Gardien de clôture (5 volets) | message de vérité en fin de tour |
| MangoQA (6 branches + 3 visages) | un bandeau : vert / réserve / rouge |
| La mémoire (4 étages) | outil « Mémoire » + Mango qui se souvient tout seul |
| L'auto-évolution | rien — sauf une ligne dans « Santé » : *« 3 spécialistes forgés ce mois-ci »* |
| La réutilisation multi-projets | rien |
| Le vérificateur de sens | une question de clarification quand un terme est ambigu |
| Le multi-provider + fallback | rien — sauf si un provider tombe |

---

# PARTIE C — Les questions auxquelles je ne peux pas répondre à ta place

Ces quatre questions déterminent le parcours final. Je ne peux pas les trancher — elles
relèvent de la stratégie produit, pas de l'architecture.

### C.1 — **Le client, c'est qui ?**

Le parcours diffère radicalement selon la réponse :

| Hypothèse | Conséquence sur le produit |
|---|---|
| **(a) Un power-user solo** (profil Raf) | Garder « Avancé » riche. Le local est un argument technique. |
| **(b) Un non-technicien** qui veut une app | Supprimer *tout* ce qui parle de modèle, provider, token. Le local devient « vos données restent chez vous ». Installation en 1 clic obligatoire. |
| **(c) Un développeur / une agence** | La section Code et l'export GitHub deviennent centraux. MangoQA devient l'argument n°1. |
| **(d) On vend l'OS personnel**, le builder n'est qu'une app | Il faut construire 2-3 autres « apps » avant de livrer. Chantier bien plus long. |

### C.2 — **Le cœur du produit : le Builder ou l'OS ?**

`idee.md` dit *un Lovable local*. `fondation.md` dit *un OS IA personnel*.
**Les deux ne peuvent pas être la promesse principale.** Un produit a une phrase, pas deux.

### C.3 — **Refonte en place, ou socle neuf (v3) ?**

| Option | Pour | Contre |
|---|---|---|
| **Dégraisser en place** | historique préservé, pas de régression, incrémental | on garde 346 modules dont on retire des surfaces — le poids reste |
| **Socle neuf `mango-v3/`** + réimport des briques gardées | on part de la cible, ~120 modules, propre | il faut re-câbler ; risque de perdre des correctifs subtils |
| **Hybride** (recommandé) | nouveau `server/src/v3/` qui **appelle** les briques gardées ; l'ancien devient une bibliothèque | migration progressive, rien n'est perdu | deux mondes cohabitent un temps |

### C.4 — **Où travaille-t-on ?**

`C:\Users\Raf\Desktop\mangoai` (clone) ou **`D:\IA\MangoOS` (copie vivante, avec `.env`,
`.credentials`, `.brains`)** ? Idem pour MangoQA (`D:\IA\MangoQA`).
La refonte doit se faire sur **une seule** des deux, sinon on créera un troisième doublon —
exactement le problème qu'on cherche à résoudre.
