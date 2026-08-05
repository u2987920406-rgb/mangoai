# Refonte Mango — 03 · Les Équipes & le Brain Dispatcher

> Réponse à la demande de Raf : *« garder le Brain Dispatcher, le répartir dans les équipes de
> manière logique et structurée. Une équipe peut faire plusieurs tâches avec plusieurs
> compétences et le même cerveau modèle. »*
>
> Statut : **proposition d'architecture, en attente d'arbitrage.**

---

## 1. Le principe

Aujourd'hui, le système a **6 concepts concurrents** pour dire « quelqu'un fait quelque chose » :
rôles de cerveau (16), spécialistes forgés (11), Agent Factory, Super-Agent Builder, délégation
Élève, Conseil de skills.

**La refonte n'en garde qu'un : l'Équipe.**

```
                    Une ÉQUIPE, c'est exactement 4 choses :

    ┌──────────────────────────────────────────────────────────┐
    │  1. UN CERVEAU     — un rôle du registre = un modèle      │
    │  2. UNE MISSION    — une phrase, un périmètre net         │
    │  3. N COMPÉTENCES  — les outils qu'elle sait manier       │
    │  4. UN DÉCLENCHEUR — la condition qui l'allume            │
    └──────────────────────────────────────────────────────────┘

    Une équipe s'ALLUME et s'ÉTEINT. Elle ne « tourne » jamais en fond.
    C'est l'Orchestrateur — et lui seul — qui décide.
    L'utilisateur ne choisit JAMAIS une équipe.
```

**Pourquoi c'est la bonne unité** : le Brain Dispatcher route déjà `dispatch(rôle, system, user)`.
Une équipe **est** un rôle, enrichi d'un périmètre de compétences et d'une règle d'allumage.
On ne construit rien de neuf — on **donne un nom produit** à ce qui existe déjà.

---

## 2. Les 8 équipes

Réduction : **16 rôles → 8 équipes.**

### 🧭 ORCHESTRATEUR — le chef

| | |
|---|---|
| **Cerveau** | rôle `orchestrateur` — le modèle choisi par l'utilisateur (Sonnet par défaut) |
| **Mission** | Comprendre la demande, décider **quelles équipes allumer**, synthétiser leurs retours, répondre. |
| **Compétences** | aucune compétence outillée en propre — il **délègue**, il n'exécute pas |
| **Allumé** | toujours (c'est lui qui reçoit le message) |
| **Coût** | `$` (abonnement) ou `$0` si cerveau local choisi |
| **Absorbe** | `accueil` · `routeur` · `orchestrateur` · `stratege` |

> C'est la seule équipe que l'utilisateur « voit ». Tout le reste est son état-major.

---

### 🧠 ANALYSE & PLAN — comprendre avant d'agir

| | |
|---|---|
| **Cerveau** | rôle `architecte` |
| **Mission** | Transformer une intention floue en plan exécutable, arbitrer les choix techniques. |
| **Compétences** | `planifier` · `etape_faite` · `etape_bloquee` + arbitrage de stack |
| **Membres** | Aiguilleur d'étapes · Aiguilleur d'outillage |
| **Allumé quand** | la demande implique > 2 étapes, ou un choix de technologie |
| **Éteint quand** | le plan est posé (il reste consultable en mémoire Projet) |
| **Coût** | `$` |
| **Absorbe** | `architecte` · `optimiseur` · Perfect Plan · Ideation · project-plan · grand-chantier |

---

### 🔎 RECHERCHE — aller chercher dehors

| | |
|---|---|
| **Cerveau** | rôle `chercheur` |
| **Mission** | Trouver, lire et rapporter de l'information externe fiable. |
| **Compétences** | `chercher_web` · `lire_page` · `requete_web` · `extraire_site` · `lis_video_youtube` · `chercher_image` · `chercher_artefact` |
| **Membres** | Sémaphore de liens · Iconographe bilingue |
| **Allumé quand** | la demande cite une URL, un sujet externe, ou un besoin d'illustration |
| **Éteint quand** | les résultats sont déposés en mémoire Savoir |
| **Coût** | `$0` local + `$$` pour la recherche web et Pexels |

---

### 📄 EXTRACTION — rendre lisible ce qui ne l'est pas

| | |
|---|---|
| **Cerveau** | rôle `extracteur` |
| **Mission** | Transformer un document opaque (PDF, tableur, archive, scan) en texte structuré exploitable. |
| **Compétences** | `lire_document` · `lire_archive` · `decoupe_assets` |
| **Membres** | Déchiffreur de PDF scannés · Anatomiste de classeurs |
| **Allumé quand** | une pièce jointe est présente |
| **Éteint quand** | le contenu extrait est en mémoire Projet |
| **Coût** | `$0` |

---

### 👁️ VISION — voir

| | |
|---|---|
| **Cerveau** | rôle `vision` (modèle VL — capability `vision` **obligatoire**) |
| **Mission** | Décrire fidèlement ce qui est à l'écran ou dans une image. |
| **Compétences** | `vois_ecran` · `lire_image` · `sharingan_url` · `sharingan_image` · `regarde_site_web` |
| **Allumé quand** | une image est fournie, ou une vérification visuelle est nécessaire |
| **Coût** | `$0` |

> Équipe **séparée** de l'Extraction malgré la parenté : elle exige un modèle d'une autre nature
> (VL). C'est la seule exception au regroupement par affinité fonctionnelle — et elle est
> justifiée par la contrainte matérielle, pas par le confort.

---

### 🔨 CONSTRUCTION — écrire le code

| | |
|---|---|
| **Cerveau** | rôle `codeur` — **l'Élève, local, souverain** |
| **Mission** | Écrire, modifier et faire compiler le code du projet. |
| **Compétences** | `read_file` · `write_file` · `edit_file` · `list_files` · `search_code` · `check_build` · `run_command` · `add_dependency` · `assemble_brique` · `finish` |
| **Membres** | Contremaître local |
| **Allumé quand** | l'intention est « construire / modifier » |
| **Coût** | `$0` — **c'est l'équipe qui travaille le plus, et elle est gratuite. C'est l'argument de vente.** |

---

### 🎨 DESIGN — rendre juste et beau

| | |
|---|---|
| **Cerveau** | rôle `designer_ux` |
| **Mission** | Donner au projet une direction visuelle cohérente, accessible, et conforme au goût de l'utilisateur. |
| **Compétences** | `verifie_design` · `genere_image` · `genere_contenu` + moteur de goût (comparaison relative) + design system + équilibre de mise en page |
| **Membres** | Esthète · Arbitre du Score Design |
| **Allumé quand** | le projet a une interface (donc presque toujours) |
| **Coût** | `$` |
| **Absorbe** | `taste/` (14 modules) · `design/` (5) · esthete · design-loop · wireframe-fork · ideation · layout-balance · modes `uxui` et `layout` |

---

### 🛡️ VÉRIFICATION — dire la vérité

| | |
|---|---|
| **Cerveau** | rôle `auditeur` (+ rôle `juge` en interne, distinct de l'exécutant pour éviter l'auto-jugement) |
| **Mission** | Vérifier que ce qui est livré correspond à ce qui a été demandé, et le dire même quand c'est non. |
| **Compétences** | `ecris_test` · `lance_tests` · `teste_parcours` · `verifie_coherence_images` + les 5 volets du Gardien + le vérificateur de contexte |
| **Membres** | Juge d'Adéquation · Diffomètre sémantique |
| **Allumé quand** | **toujours, à la clôture de chaque tour.** Non désactivable. |
| **Coût** | `$0` (juge local souverain) |
| **Voisin externe** | **MangoQA** — n'est PAS une équipe. C'est un processus indépendant qui n'obéit à personne. |

---

## 3. Le schéma d'ensemble

```
                        ┌─────────────────┐
                        │   UTILISATEUR   │
                        │  (tape 1 phrase)│
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │ 🧭 ORCHESTRATEUR │  ← seule équipe visible
                        │  décide qui      │
                        │  s'allume        │
                        └────────┬────────┘
                                 │  brain-dispatch.ts
         ┌──────────┬────────────┼────────────┬──────────┐
         ▼          ▼            ▼            ▼          ▼
    ┌────────┐ ┌────────┐  ┌─────────┐  ┌────────┐ ┌────────┐
    │🧠ANALYSE│ │🔎RECHER│  │📄EXTRACT│  │👁️VISION│ │🔨CONSTR│
    │architec│ │chercheur│  │extracteur│  │ vision │ │ codeur │
    └────────┘ └────────┘  └─────────┘  └────────┘ └───┬────┘
                                                        │
                                              ┌─────────▼────────┐
                                              │   🎨 DESIGN       │
                                              │   designer_ux     │
                                              └─────────┬────────┘
                                                        │
                                              ┌─────────▼────────┐
                                              │ 🛡️ VÉRIFICATION   │
                                              │ auditeur + juge   │
                                              │ (toujours, à la   │
                                              │  clôture)         │
                                              └─────────┬────────┘
                                                        │
    ═══════════════════════════════════════════════════▼══════════
                    🥭 MANGOQA — processus indépendant
              n'obéit à personne · n'alerte que l'utilisateur
    ══════════════════════════════════════════════════════════════

              ┌───────────────────────────────────────┐
              │   🧠 MÉMOIRE — lue par TOUTES les      │
              │   équipes, écrite par la Vérification  │
              │   Identité · Goût · Projet · Savoir    │
              └───────────────────────────────────────┘
```

---

## 4. Ce que le Brain Dispatcher devient

**Aucune réécriture.** `dispatch(agentId, system, user, opts)` reste **exactement** ce qu'il est.
Trois ajouts seulement :

| Ajout | Pourquoi | Effort |
|---|---|---|
| `dispatchTeam(teamId, task)` | Enveloppe `dispatch` : résout le cerveau de l'équipe, injecte **uniquement** les compétences de cette équipe, borne le budget. | ~120 lignes |
| Journal d'allumage | Chaque allumage/extinction d'équipe est journalisé → alimente le bandeau de statut UI. | ~40 lignes |
| Budget par équipe | Chaque équipe a un plafond (tours + $) ; dépassement = extinction propre, jamais un blocage. | ~60 lignes |

Tout le reste — rate limiting, fallback, garde `localOnly`, contrat, anti-injection, timeout —
**est déjà là et fonctionne**. C'est précisément pour ça que le dispatcher est le bon socle.

---

## 5. Règles d'allumage (déterministes d'abord, LLM en dernier recours)

L'Orchestrateur décide selon un **escalier à 3 étages**, dans cet ordre :

| Étage | Signal | Coût | Exemple |
|---|---|---|---|
| **1. Déterministe** | pièce jointe présente · URL dans le message · projet a un `package.json` | `$0`, instantané | PDF joint → 📄 Extraction |
| **2. Heuristique** | mots-clés du message croisés avec la mémoire Projet | `$0` | « rends ça plus beau » → 🎨 Design |
| **3. Routeur LLM** | uniquement si les 2 premiers sont muets **et** la tâche est manifestement multi-capacités | 1 appel court | demande ambiguë |

> Ce mécanisme **existe déjà** (`intent-capabilities.ts`, `INTENT_ROUTER_LLM`) mais il est OFF et
> personne ne l'appelle « allumage d'équipe ». On le garde, on l'allume, on le nomme.

---

## 6. Ce que l'utilisateur voit des équipes

**Rien — sauf un bandeau de statut vivant.**

```
  🧭 Mango réfléchit…
     ▸ 📄 Extraction   lecture de « cahier-des-charges.pdf »        ✓ 3,2 s
     ▸ 🧠 Analyse      plan en 6 étapes                             ✓ 8,1 s
     ▸ 🔨 Construction étape 3/6 — composant Panier                 ⟳
     ▸ 🛡️ Vérification en attente
```

C'est tout. Pas de menu, pas de bascule, pas de configuration.
**L'utilisateur ne gère pas des équipes — il regarde une entreprise travailler pour lui.**

> C'est aussi, accessoirement, la meilleure démo commerciale possible du produit : le client
> *voit* la souveraineté (`$0` sur l'équipe qui travaille le plus) et *voit* la vérification.

---

## 7. Rôles supprimés du registre (16 → 8)

| Rôle actuel | Devient |
|---|---|
| `orchestrateur` | 🧭 Orchestrateur |
| `accueil` | 🔵 fusionné dans 🧭 Orchestrateur |
| `routeur` | 🔵 fusionné dans 🧭 Orchestrateur (étage 3 de l'escalier) |
| `stratege` | 🔵 fusionné dans 🧭 Orchestrateur (classification de blocage) |
| `architecte` | 🧠 Analyse & Plan |
| `optimiseur` | 🔵 fusionné dans 🧠 Analyse & Plan |
| `chercheur` | 🔎 Recherche |
| `extracteur` | 📄 Extraction |
| `vision` | 👁️ Vision |
| `codeur` | 🔨 Construction |
| `codeur_frontiere` | ⚠️ décision Raf (dépend du sort de la section Code) |
| `designer_ux` | 🎨 Design |
| `auditeur` | 🛡️ Vérification |
| `testeur` | 🔵 fusionné dans 🛡️ Vérification |
| `juge` | 🔵 interne à 🛡️ Vérification (reste **distinct** de l'exécutant — non négociable) |
| `forgeron` | 🟡 masqué — interne à l'auto-évolution, plus un rôle exposé |

---

## 8. Comment une nouvelle capacité arrive (la règle anti-rechute)

C'est le point qui fait tenir le produit **sur le long terme** — et c'est ce qui a manqué jusqu'ici :

```
   Une lacune est détectée (score ≥ 60, ≈3 récurrences)
                    │
                    ▼
   La Forge conçoit un SPÉCIALISTE (cerveau `forgeron`)
                    │
                    ▼
   Le spécialiste est affecté à UNE équipe existante
                    │
                    ▼
   ❗ Il N'apparaît PAS dans l'UI. Il n'ajoute PAS de menu.
      Il n'ajoute PAS de flag. Il rejoint une équipe.
                    │
                    ▼
   Si aucune équipe ne peut l'accueillir → c'est une DÉCISION PRODUIT,
   pas une décision technique. Elle remonte à l'utilisateur.
```

> **La règle qui empêche la rechute : une nouvelle capacité ne crée jamais une nouvelle surface.**
> Elle rejoint une équipe, ou elle n'entre pas. C'est cette règle, et elle seule, qui garantit
> que le produit ne redeviendra pas ce qu'il est aujourd'hui.
