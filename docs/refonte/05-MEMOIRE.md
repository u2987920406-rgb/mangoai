# Refonte Mango — 05 · La mémoire : 17 modules → 1 système à 4 étages

> Réponse à : *« je pense que le système de mémoire doit être mieux géré »*.
> Statut : **proposition d'architecture.**

---

## 1. Le diagnostic précis

Le système ne souffre pas d'un manque de mémoire. Il souffre de **trop de mémoires qui ne se
parlent pas**, et d'un **rappel éteint**.

### 1.1 — Trois substrats de stockage concurrents

| Substrat | Ce qui y vit | Problème |
|---|---|---|
| **Fichiers `.md`** par projet | axiomes, préférences, lexique, procédures, références | pas de recherche sémantique ; lus en entier ou pas du tout |
| **SQLite** (`blackboard.sqlite`) | artefacts, embeddings, scopes | recherche = **cosinus brute-force en JS**, pas d'index ANN |
| **JSON** dans `data/` | spécialistes, lacunes, cron, stratège, profils | 4 patrons de résolution de chemin incompatibles → **deux copies divergentes de `specialist-agents.json` ont déjà coexisté** (incident du 2026-07-23, 10 agents invisibles) |

### 1.2 — Le vrai problème : `ELEVE_MEMOIRE=off`

C'est la trouvaille centrale de l'audit.

`eleve-memoire.ts` est le module qui **injecte proactivement les souvenirs pertinents dans la
boucle** et expose l'outil `memoire_rappel`. Son flag est **OFF**, et il n'est pas dans le `.env`.

> **Conséquence : le système écrit énormément et ne relit presque rien.**
> Il a des axiomes, un lexique, des procédures, des préférences, un blackboard vectoriel de
> plusieurs milliers d'entrées — et pendant un tour de travail, **rien de tout ça ne remonte
> automatiquement**. C'est exactement la sensation « la mémoire est mal gérée » : elle est bien
> *stockée*, elle n'est pas *vivante*.

### 1.3 — Pas de budget, pas d'arbitrage

Aucune couche ne répond à : *« j'ai 8 000 tokens de contexte disponibles pour du souvenir —
lesquels valent le coup ? »*. Chaque magasin s'injecte ou non selon son propre code, sans
priorité commune. `AXIOMS_ROTATE` (rotation quand le cap est dépassé) est OFF : au-delà du cap,
**les axiomes sont coupés en silence**.

---

## 2. L'architecture cible

### 2.1 — Un substrat, quatre étages, un point de lecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        API UNIQUE                                  │
│                                                                    │
│    recall(scope, query, budgetTokens) → Souvenir[]                 │
│    remember(scope, fait, source)      → void                       │
│    forget(scope, id)                  → void                       │
│                                                                    │
│  ▸ TOUTE lecture de mémoire du système passe par ici. Sans exception│
└──────────────────────────────┬────────────────────────────────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────────┐
        ▼          ▼           ▼           ▼              ▼
 ┌────────────┐┌────────┐┌──────────┐┌──────────┐
 │ ① IDENTITÉ ││ ② GOÛT ││ ③ PROJET ││ ④ SAVOIR │
 └────────────┘└────────┘└──────────┘└──────────┘
        │           │           │           │
        └───────────┴───────────┴───────────┘
                        │
              ┌─────────▼─────────┐
              │   SQLite unique    │
              │  (+ index vectoriel)│
              └────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Export .md        │  ← lisible, versionnable, PAS la source
              └────────────────────┘
```

### 2.2 — Les quatre étages

| Étage | Contient | Taille | Injection | Absorbe |
|---|---|---|---|---|
| **① IDENTITÉ** | qui est l'utilisateur, ses règles non-négociables, ce qu'il refuse | **petit et borné** (~2 000 tokens max, rotation obligatoire) | **toujours, en entier** | `axioms` · `preferences` · `identity` · `self-knowledge` · `axioms-validation` |
| **② GOÛT** | palette, typo, refs visuelles validées, ancres de comparaison | borné (~1 500 tokens) | **sur toute tâche visuelle** | `references` · `taste-refs` · `design-system` · moodboard |
| **③ PROJET** | état du projet courant : plan, fichiers écrits, décisions, blocages | borné par projet | **sur toute tâche de ce projet** | `working-memory` · `.chat-history` · `project-plan` · `eleve-etat` |
| **④ SAVOIR** | tout le reste : documents lus, sites, vidéos, procédures, lexique, artefacts | **illimité** | **sur pertinence uniquement** (RAG, budget alloué) | `notes-rag` · `blackboard` · `procedures` · `lexique` · `savoir/` · `concept-registry` |

**La règle qui structure tout** : les étages ① ② ③ sont **bornés et toujours injectés** (leur coût
est prévisible). L'étage ④ est **illimité mais jamais injecté d'office** — il ne remonte que par
pertinence, dans un budget explicite.

C'est exactement ce qui manque aujourd'hui : un **arbitrage**.

### 2.3 — Le budget de rappel

```
   Contexte disponible pour du souvenir : 8 000 tokens
   ├─ ① Identité   : 2 000  (toujours — non négociable)
   ├─ ② Goût       : 1 500  (si tâche visuelle)
   ├─ ③ Projet     : 2 000  (toujours, tronqué au plus récent)
   └─ ④ Savoir     : 2 500  (top-k par pertinence, seuil cosinus)
                     ─────
                     8 000

   Dépassement → l'étage ④ rétrécit en premier, puis ②.
   ① et ③ ne sont JAMAIS coupés en silence : si ça ne rentre pas,
   la rotation archive explicitement le surplus et le journalise.
```

---

## 3. Les 6 décisions techniques

| # | Décision | Pourquoi |
|---|---|---|
| **1** | **SQLite est la seule source de vérité.** Les `.md` deviennent un export généré. | Tue la classe de bug « deux copies divergentes » (incident du 2026-07-23). |
| **2** | **Un seul `dataDir()` canonique**, déjà corrigé le 2026-07-23 — l'étendre à *tous* les magasins. | 4 patrons de chemin incompatibles subsistent ailleurs. |
| **3** | **Activer le rappel proactif** (`ELEVE_MEMOIRE`) et **le graver ON**, sans flag. | C'est la cause racine du ressenti. Un agent qui ne rappelle pas n'a pas de mémoire. |
| **4** | **Index vectoriel réel** (`sqlite-vec` ou équivalent) au lieu du cosinus brute-force JS. | Aujourd'hui la recherche est O(n) sur tout le magasin. Ça tient à 5 000 entrées, pas à 500 000. |
| **5** | **Rotation obligatoire et journalisée** sur ① et ②. | `AXIOMS_ROTATE=off` → coupure silencieuse. Inacceptable sur un produit. |
| **6** | **Écriture réservée à la Vérification.** Seule l'équipe 🛡️ écrit en mémoire durable, à la clôture d'un tour. | Empêche la pollution : aujourd'hui n'importe quel chemin peut écrire un axiome. |

---

## 4. La mémoire vue par l'utilisateur

L'outil « Mémoire » du rail devient **la seule fenêtre sur ce que Mango sait**, en 4 onglets qui
sont exactement les 4 étages :

```
   🧠 MÉMOIRE — projet « boutique-thé »

   [ Qui je suis ]  [ Mon goût ]  [ Ce projet ]  [ Ce que j'ai appris ]
   ─────────────────────────────────────────────────────────────────

   QUI JE SUIS                                          12 règles · 1,8 ko
   ● Je préfère les interfaces sobres, peu de couleurs        ✎  🗑
   ● Ne jamais utiliser de librairie de composants lourde     ✎  🗑
   ● Toujours du français dans l'interface                    ✎  🗑
   …

   ▸ Chaque ligne est éditable et supprimable par l'utilisateur.
   ▸ Chaque ligne indique D'OÙ elle vient (quel tour, quelle date).
```

> **Principe produit : une mémoire qu'on ne peut ni voir ni corriger n'est pas un actif, c'est un
> risque.** Aujourd'hui les axiomes s'écrivent tout seuls et l'utilisateur ne les voit qu'en
> ouvrant un `.md`. Un client n'acceptera jamais ça.

---

## 5. Ce que ça change en chiffres

| | Avant | Après |
|---|---|---|
| Modules mémoire | 17 | 1 (`memory/`, ~4 fichiers) |
| Lignes | ~5 700 | ~1 200 estimées |
| Substrats de stockage | 3 | 1 (+ export) |
| Points de lecture | ~12 chemins différents | 1 (`recall`) |
| Rappel proactif | ❌ OFF | ✅ toujours |
| Budget de contexte | ❌ aucun | ✅ explicite et journalisé |
| Visibilité utilisateur | fichiers `.md` | 1 écran, 4 onglets, éditable |

---

## 6. Ordre de migration (sans casse)

```
   1. Écrire memory/ avec l'API recall/remember/forget, adossée au Blackboard existant
   2. Brancher UN étage à la fois — ① Identité d'abord (le plus petit, le plus critique)
   3. Migrer les données réelles avec un script de vérification (compter avant/après)
   4. Rediriger les anciens appels un par un ; l'ancien module devient un adaptateur
   5. Activer le rappel proactif et MESURER (des souvenirs remontent-ils vraiment ?)
   6. Supprimer les adaptateurs une fois qu'aucun appel ne passe plus par eux
```

**Aucune étape ne supprime un magasin avant que le nouveau ne soit prouvé sur les vraies données.**
C'est le même protocole que l'allègement de `statut.md` du 2026-07-12 (audit de couverture →
migration → compression) — il a fonctionné, on le réutilise.
