# Plan #178 — Récit à l'échelle Tolkien : la Bible narrative (~10 000 pages cohérentes)

> Conception Fable 5, 2026-07-03. Document autonome : exécutable par Sonnet/Opus après le 7 juillet, sans retour vers l'architecte. Mission enregistrée dans `docs/corpus-fable/README.md`. L'annexe (section 5) alimente le corpus d'étude du raisonnement.
>
> **Existant lu avant de concevoir** : `fondation.md` · `server/src/kernel-blackboard-sqlite.ts` · `kernel-blackboard-store.ts` · `eleve-memoire.ts` · `eleve-runtime.ts` · `eleve-gate.ts` · `eleve.ts` (runRelay) · `eleve-content.ts` · `axioms.ts` · `docs/revue-fable-fondations-2026-07-03.md` · `limites.md` · `D:\IA\MangoQA\README.md`.

---

## 1. Contexte & contraintes

### 1.1 Le problème, reformulé

La demande dit : « écrire 10 000 pages cohérentes ». La vraie nature du problème apparaît quand on pose les ordres de grandeur :

```
10 000 pages  ≈  5 000 000 de mots  ≈  600–800 chapitres de 6–8 k mots
Un contexte de génération confortable  ≈  1–2 chapitres
Ratio :  le modèle voit  ~0,2 %  du récit au moment où il écrit
```

Le modèle qui écrit le chapitre 412 ne verra **jamais** les chapitres 1 à 411. Aucune fenêtre de contexte, aucune compaction, aucun résumé en chaîne ne changera ce ratio de trois ordres de grandeur. Donc :

> **Ce n'est pas un problème de génération de prose. C'est un problème de gestion d'état.**
> Le récit est une **machine à états** dont les chapitres sont la couche d'affichage. La question n'est pas « comment écrire mieux » mais : **où vit l'état du monde, comment on l'interroge (« qu'est-ce qui est vrai au chapitre N ? »), comment on le fait respecter, et comment il se met à jour quand un chapitre nouveau crée des faits nouveaux.**

Trois sous-problèmes, dans l'ordre de difficulté croissante :

1. **Représenter** l'état : entités, faits temporels, événements, intrigues, règles du monde — la *bible*. (Problème de base de données — résolu depuis 40 ans, il faut juste le bon schéma.)
2. **Faire respecter** l'état : un personnage mort ne parle plus ; une distance ne change pas ; un secret révélé au ch. 200 ne fuit pas au ch. 50. (Problème de vérification — MangoOS a déjà le pattern : le Gardien.)
3. **Mettre à jour** l'état depuis la prose générée : extraire les faits nouveaux d'un chapitre de façon fiable. (Problème **ouvert** — c'est le maillon faible, il faut l'assumer et l'encadrer, pas le nier. Voir D5 et section 4.)

### 1.2 Une asymétrie qui structure tout le design

Il y a une différence fondamentale entre les deux sens de circulation :

- **Bible → prose** (compilation d'un contexte de génération) : on contrôle tout, c'est du code déterministe sur des données structurées. **Fiable à 100 %.**
- **Prose → bible** (extraction de faits depuis du texte libre) : c'est de la compréhension de langage naturel. **Jamais fiable à 100 %.**

Conséquence de design : **tout ce qui peut être imposé en amont (dans la fiche de scène) plutôt que vérifié en aval (dans le texte généré) doit l'être.** Il est plus sûr d'écrire « INTERDIT : Boromir est mort au ch. 84, il ne peut ni parler ni agir » dans le contexte de génération que d'espérer détecter sa résurrection après coup. La vérification aval reste nécessaire (deuxième filet), mais elle est le filet, pas la stratégie.

### 1.3 Contraintes héritées de MangoOS (non négociables)

- **Local-first, zéro dépendance native** : `node:sqlite` uniquement (le pattern `kernel-blackboard-sqlite.ts` est qualifié « exemplaire » par la revue du 2026-07-03 — on le copie, on ne l'améliore pas).
- **Gates opt-in, off = byte-identique** (discipline prouvée par `test-fondations-gates-combines.ts`) : tout ce chantier vit derrière des flags `RECIT_*`, défaut OFF, fail-open partout.
- **Gardien TOUJOURS actif sur les chemins livrables** (règle ⭐⭐⭐ de Raf) : le Gardien Récit s'ajoute au Gardien existant, il ne le remplace ni le contourne.
- **Générateur = l'Élève** (GLM cloud via `runRelay`) : les chapitres sont générés comme les apps, par la même boucle, avec les mêmes filets (escalade Maître, budget, snapshots).
- **Standards à la périphérie, custom au cœur** : SQLite (standard) porte le stockage ; le schéma de bible, le compilateur de fiche et le Gardien Récit (les différenciateurs) sont custom.
- **Qualité en situation réelle** : « ça compile » ne veut rien dire pour un récit. Le critère de preuve est un récit COURT lu de bout en bout avec des pièges de continuité détectés (étape É5).

### 1.4 Ce que ce chantier ne promet PAS

- Il ne promet pas qu'un récit de 10 000 pages sera *intéressant* — il promet qu'il sera *cohérent*. Le Gardien Récit vérifie la continuité, pas le souffle (voir section 4, risque R4, et l'axiome UX 34 : l'angle non-évident se décide au niveau des arcs, en amont).
- Il ne promet pas une extraction de faits parfaite — il promet qu'une extraction imparfaite ne corrompt pas le canon (statuts, réconciliation, étages de validation).

---

## 2. Décisions d'architecture

Chaque décision liste les alternatives **considérées et rejetées**, avec le pourquoi. C'est la partie à relire avant toute remise en cause d'un choix.

### D1 — Le modèle de données : SQLite relationnel dédié, graphe = une table de relations

**Décision.** Une base SQLite **dédiée par récit** : `<projectDir>/.bible/bible.db`, module `server/src/bible-store.ts` construit en **copiant le pattern** de `kernel-blackboard-sqlite.ts` (PRAGMA `user_version`, catalogue `MIGRATIONS[]`, backup `.bak-v<n>` avant migration, fail-open au boot, WAL, `prune` outillé jamais automatique).

Schéma v1 (6 tables — volontairement peu, chaque table a un rôle irremplaçable) :

```sql
-- Qui existe. type: personnage|lieu|objet|faction|regle_du_monde|fil
CREATE TABLE entites (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,
  nom        TEXT NOT NULL,            -- nom canonique
  alias      TEXT NOT NULL DEFAULT '[]', -- JSON: ["Grands-Pas","l'Héritier d'Isildur"]
  fiche      TEXT NOT NULL DEFAULT '',   -- 3-6 lignes: essence, voix, apparence (pour la fiche de scène)
  embedding  TEXT,                       -- nomic via Ollama, TEXT JSON (pattern blackboard)
  created_ch INTEGER NOT NULL            -- chapitre de première apparition
);

-- Ce qui est vrai, QUAND, et qui le sait. LE cœur du système.
CREATE TABLE faits (
  id            INTEGER PRIMARY KEY,
  sujet_id      INTEGER NOT NULL REFERENCES entites(id),
  predicat      TEXT NOT NULL,          -- vocabulaire contrôlé: vivant|localisation|possede|relation|trait|sait|regle
  objet_id      INTEGER,                -- si la valeur est une entité (relation, localisation)
  valeur        TEXT,                   -- sinon valeur libre ("mort","fiancée à X","3 jours de marche")
  valid_from_ch INTEGER NOT NULL,       -- vrai À PARTIR de ce chapitre (inclus)
  valid_to_ch   INTEGER,                -- vrai JUSQU'À ce chapitre (exclu). NULL = toujours vrai
  connu_de      TEXT NOT NULL DEFAULT '"tous"', -- JSON: "tous" | [ids d'entités] — qui SAIT ce fait
  revele_lecteur_ch INTEGER,            -- le LECTEUR l'apprend ici. NULL = pas encore révélé (= SECRET)
  statut        TEXT NOT NULL DEFAULT 'candidat', -- candidat|canon|retconne|rejete
  source_ch     INTEGER NOT NULL,       -- provenance: le chapitre qui a créé ce fait (0 = bible initiale)
  confidence    REAL NOT NULL DEFAULT 1.0
);

-- Ce qui s'est PASSÉ (journal narratif, jamais modifié — les faits se corrigent, pas l'histoire)
CREATE TABLE evenements (
  id           INTEGER PRIMARY KEY,
  chapitre     INTEGER NOT NULL,
  ordre        INTEGER NOT NULL,        -- ordre dans le chapitre
  date_monde   TEXT,                    -- chronologie interne optionnelle ("3019-03-25 T.A.")
  resume       TEXT NOT NULL,           -- 1-2 phrases
  participants TEXT NOT NULL DEFAULT '[]', -- JSON ids
  lieu_id      INTEGER,
  embedding    TEXT                     -- pour le rappel sémantique (échos, foreshadowing)
);

-- Les intrigues et sous-intrigues (fils), avec leur état
CREATE TABLE fils (
  id         INTEGER PRIMARY KEY,
  titre      TEXT NOT NULL,
  resume     TEXT NOT NULL,
  statut     TEXT NOT NULL DEFAULT 'ouvert', -- ouvert|resolu|abandonne
  ouvert_ch  INTEGER NOT NULL,
  resolu_ch  INTEGER,
  embedding  TEXT
);

-- Un résumé par chapitre + par arc (la mémoire courte de la génération)
CREATE TABLE chapitres (
  num        INTEGER PRIMARY KEY,
  titre      TEXT NOT NULL DEFAULT '',
  resume     TEXT NOT NULL,             -- 8-15 lignes, écrit par l'extraction
  arc        TEXT NOT NULL DEFAULT '',  -- identifiant d'arc (le plan hiérarchique vit dans fils/arcs)
  mots       INTEGER NOT NULL DEFAULT 0,
  embedding  TEXT
);

-- Append-only: TOUTE mutation du canon passe ici (audit, undo, rapport d'impact retcon)
CREATE TABLE bible_journal (
  id      INTEGER PRIMARY KEY,
  ts      INTEGER NOT NULL,
  op      TEXT NOT NULL,               -- promote|reject|retcon|edit|init
  detail  TEXT NOT NULL                -- JSON: avant/après, fait_id, auteur (extraction|raf|reconciliateur)
);
```

La requête cardinale — **« qu'est-ce qui est vrai au chapitre N ? »** — est un WHERE trivial :

```sql
SELECT * FROM faits
WHERE sujet_id = ? AND statut = 'canon'
  AND valid_from_ch <= ?N AND (valid_to_ch IS NULL OR valid_to_ch > ?N)
```

**Alternatives rejetées.**

- **Moteur de graphe (Neo4j, Kùzu, graphe en mémoire type graphology)** — rejeté. (a) Dépendance externe ou native : contraire au principe local-first « ça marche toujours » qui a fait choisir `node:sqlite` pour le Blackboard. (b) À cette volumétrie (quelques centaines d'entités, 50–200 k faits), les traversées de graphe utiles (relations d'un personnage, qui est où) sont des jointures à 1–2 sauts — SQLite les fait en microsecondes. (c) Le besoin dominant n'est pas la traversée mais la **requête temporelle** (« vrai au ch. N »), qui est le point FAIBLE des graph DB et le point FORT du relationnel avec intervalles. Le graphe existe — c'est `faits(sujet_id, predicat, objet_id)` — il n'a juste pas besoin d'un moteur.
- **Bible en fichiers Markdown** (le pattern « story bible » des romanciers, ou façon `wiki/`) **comme source de vérité** — rejeté comme *source*, conservé comme *vue*. Du Markdown ne s'interroge pas (« vrai au ch. N ? » impossible), ne se vérifie pas déterministiquement, et dérive (deux formulations du même fait). MAIS : une commande d'**export Markdown lisible** (fiches personnages, chronologie) est prévue en É6 — Raf doit pouvoir LIRE sa bible, et le vault Obsidian est le bon écran. Source = SQLite, affichage = Markdown généré.
- **Réutiliser la table `artifacts` du Blackboard** (scope/key/value JSON) — rejeté comme stockage primaire. Un fait temporel a besoin de colonnes réelles pour être indexé et joint (`valid_from_ch`, `statut`…) ; le clé/valeur força tout dans du JSON opaque = retour au problème du Markdown avec plus d'étapes. On réutilise le **pattern** (migrations, backup, WAL, embeddings en TEXT JSON) et les **briques** (`cosine`/`rankByCosine` de `kernel-blackboard-store.ts`, `safeEmbed` de `notes-rag.ts`), pas la table. Le Blackboard reste ce qu'il est : mémoire cross-projet ; la bible est l'état d'UN récit.
- **Un schéma « entité-attribut-valeur » totalement libre (pas de vocabulaire de prédicats)** — rejeté. Si l'extraction peut inventer n'importe quel prédicat (`est_mort`, `mort`, `decede`, `vivant=false`…), la réconciliation et les checks déterministes deviennent impossibles. Le vocabulaire de prédicats est **contrôlé et court** (une dizaine, extensible par migration) ; l'extraction mappe vers ce vocabulaire ou range en `trait` libre (non vérifié déterministiquement — assumé).

### D2 — La temporalité : intervalles de validité en coordonnées-chapitre, visibilité séparée de la vérité

**Décision.** Un fait est vrai **entre deux chapitres** : `[valid_from_ch, valid_to_ch)`. La coordonnée temporelle primaire est le **numéro de chapitre** (l'ordre du récit), pas la date-monde — parce que c'est la coordonnée dans laquelle on génère et on vérifie. La date-monde (`evenements.date_monde`) est une donnée optionnelle de deuxième rang, utilisée par un check de chronologie interne quand elle existe.

Deuxième axe, orthogonal à la vérité : la **visibilité**.
- `connu_de` : quels personnages savent ce fait (pour que la fiche de scène d'un personnage n'inclue jamais un fait qu'il ignore — un personnage ne peut pas agir sur ce qu'il ne sait pas).
- `revele_lecteur_ch` : quand le LECTEUR l'apprend. `NULL` = secret actif. C'est ce champ qui rend le check « un secret révélé au ch. 200 était bien secret au ch. 50 » **déterministe** : au ch. 50, tout fait avec `revele_lecteur_ch > 50` (ou NULL destiné à plus tard) est une **interdiction de mention** injectée dans la fiche ET vérifiée en aval.

Vérité, connaissance des personnages, connaissance du lecteur : trois choses différentes. Les confondre est LA source classique d'incohérence (un personnage qui « sait » ce que seul le lecteur sait). Le schéma les sépare physiquement.

**Alternatives rejetées.**

- **Event-sourcing pur** (ne stocker QUE les événements, dériver l'état par replay) — rejeté, et c'est l'alternative que j'ai failli choisir (voir annexe). Élégant sur le papier : l'état au ch. N = replay des événements 1→N, retcon = corriger un événement et rejouer. Mais : (a) le replay exige que chaque événement soit une **transition d'état formelle** — or les événements viennent de l'extraction LLM, le maillon faible ; faire reposer TOUT l'état sur le maillon faible aggrave le risque au lieu de le contenir. (b) La requête « vrai au ch. N » devient un calcul (replay + cache) au lieu d'un WHERE. On garde le **journal d'événements** (table `evenements`, précieuse pour le rappel sémantique et l'audit) ET on **matérialise les faits** avec leurs intervalles — le beurre et l'argent du beurre, au prix d'une redondance contrôlée par le réconciliateur.
- **Snapshots de l'état du monde par chapitre** — rejeté. O(chapitres × entités) en volume, et un retcon au ch. 84 invalide 700 snapshots. Les intervalles encodent la même information en O(changements).
- **Temporalité bi-temporelle complète** (temps-récit + temps-transaction, façon SQL:2011) — rejeté pour la v1 : le `bible_journal` append-only donne déjà l'axe transactionnel (qui a changé quoi, quand) sans la complexité des tables bi-temporelles. Si un besoin d'« état de la bible telle qu'elle était le 12 mars » émerge, le journal permet de le reconstruire.

### D3 — Le pipeline de génération d'un chapitre : fiche de scène COMPILÉE (primaire) + rappel sémantique (secondaire), les deux cappés

**Décision.** Le contexte injecté pour générer le chapitre N est construit en deux couches de natures différentes :

**Couche 1 — la fiche de scène compilée** (`server/src/bible-fiche.ts`, déterministe, **la seule couche qui fait autorité**) :

```
FICHE DE SCÈNE — chapitre N (compilée depuis la bible, FAIT AUTORITÉ sur tout le reste)
1. OBJECTIF du chapitre        ← le plan d'arcs (fils + consigne de l'étape courante)
2. PERSONNAGES présents        ← pour chacun: fiche (voix/essence) + faits canon vraiAu(N)
                                 (état, localisation, relations) + ce qu'il SAIT (connu_de)
3. LIEU                        ← fiche + faits canon (distances, propriétés)
4. FILS ouverts pertinents     ← fils.statut='ouvert' triés par pertinence
5. RÉSUMÉS                     ← chapitres N-1 et N-2 (complets) + résumé d'arc courant
6. INTERDICTIONS (bloc dur)    ← morts (ne parlent ni n'agissent) · secrets non révélés
                                 (revele_lecteur_ch > N: NE PAS mentionner) · faits que les
                                 personnages présents IGNORENT (ne pas agir dessus)
```

Caps durs par section (pattern `MEMOIRE_SECTION_MAX_CHARS` / `AXIOMS_MAX_CHARS` : un cap est un contrat, jamais un vœu) — cible totale ~8 000 caractères, priorité aux INTERDICTIONS puis aux personnages si arbitrage.

**Couche 2 — le rappel sémantique** (réutilise `rappelerSouvenirs`/`formatSouvenirs` de `eleve-memoire.ts` avec des deps `search` pointées sur les embeddings de `evenements`/`chapitres`) : « échos » du passé lointain pertinents pour la scène — une promesse faite au ch. 12, une image récurrente. Cap 800 caractères, min-score, fail-open. Libellé explicite : *indicatif — la fiche fait autorité en cas de conflit*.

**Génération** : par l'Élève via `runRelay` (`server/src/eleve.ts`) avec un projectType **`recit`** (à ajouter dans `detectProjectType`) : le « projet » est un dossier de fichiers Markdown (`chapitres/ch-012.md`), **pas de build npm** — l'inspection d'un projet `recit` vérifie l'existence et la taille du fichier chapitre, pas `tsc`. La fiche entre par le canal existant `opts.systemFull`/`buildEleveUser`. Chaque chapitre = **un run borné** (budget via `AgenticRunCtx.loopBudget`, câblé par la revue 🟠1), reprenable (snapshots `loop-state.ts`).

**Orchestration** : un runner dédié (`run-recit.ts`) enchaîne les chapitres — compile fiche → génère → vérifie → extrait → chapitre suivant. **Jamais un run géant unique** : la boucle Élève est conçue pour des tâches bornées (24 itérations, compaction), pas pour 800 chapitres d'affilée ; le runner porte la boucle longue, chaque chapitre reste une tâche de taille prouvée. Le runner est reprennable (l'état inter-chapitres EST la bible + le dernier `num` de `chapitres` — rien d'autre à persister).

**Alternatives rejetées.**

- **RAG pur** (indexer toute la prose passée, faire du retrieval par similarité au moment d'écrire) — rejeté comme mécanisme primaire, et c'est le rejet le plus important du document. Deux défauts structurels : (a) **le retrieval rate les négations et les changements d'état** — la requête « Boromir dialogue » remonte les 40 scènes où Boromir parle, pas la phrase du ch. 84 où il meurt ; la similarité sémantique est myope aux transitions. (b) **Le RAG suggère, il n'impose pas** — aucune garantie qu'une contrainte critique soit dans le top-k. Un état canonique se REQUÊTE (exhaustif, déterministe), il ne se « retrouve » pas (probabiliste). Le sémantique est conservé exactement là où il excelle : la texture, les échos, le foreshadowing — jamais l'état.
- **Chaîne de résumés seule** (résumé roulant N-1 + résumé d'arc + résumé du tout, façon « mémoire hiérarchique ») — rejetée comme mécanisme unique : la dérive est cumulative (chaque résumé perd des détails, dont certains ressurgissent 300 chapitres plus tard), et un résumé ne porte ni la structure (qui sait quoi) ni les interdictions. Les résumés SONT dans la fiche (section 5) — mais comme mémoire courte, adossés à l'état structuré.
- **Tout le récit dans le contexte** (attendre les contextes 10 M+ tokens) — rejeté : même disponible, un contexte de 5 M mots ne résout pas la *saillance* (le détail du ch. 12 noyé dans la masse — le problème « lost in the middle » s'aggrave avec la taille), coûte à chaque chapitre le prix du récit entier, et lie le chantier à un fournisseur — contraire à la liquidité de cerveau (fondation §VIII.c).
- **Fiche seule, sans rappel sémantique** — considéré (plus simple, plus sûr) et failli être retenu. Rejeté parce que la fiche compilée ne porte QUE ce que le schéma sait représenter : les échos poétiques, les motifs, les promesses diffuses n'ont pas de prédicat. Sans la couche sémantique, le récit serait cohérent mais amnésique dans sa chair. Le risque (bruit) est contenu par le cap 800c et le libellé « la fiche fait autorité ».

### D4 — La vérification de continuité : Gardien Récit, déterministe d'abord, juge LLM en observe ensuite

**Décision.** Un module `server/src/bible-gate.ts` calqué structurellement sur `eleve-gate.ts` (même philosophie prouvée : *mesuré là où c'est possible, convergence là où c'est subjectif ; non-bloquant ; anti-thrash*). Deux étages :

**Étage 1 — checks DÉTERMINISTES** (zéro LLM, même esprit que `scanFilesForBalance`/`scanFilesForPlaceholders`) sur le texte du chapitre généré, en s'appuyant sur la table d'alias :

| Check | Mécanique | Fiabilité |
|---|---|---|
| **Mort qui parle/agit** | entités avec fait `vivant=false` vraiAu(N) → détection de leurs nom/alias en position d'attribution de dialogue (« dit X », « s'écria X ») ou de sujet d'action | Haute (faux positifs possibles : rêve, flashback → balise d'exemption `<!-- flashback: ch12 -->` que le générateur peut poser, comptée et journalisée) |
| **Fuite de secret** | faits avec `revele_lecteur_ch > N` (ou NULL) → détection lexicale de leur `valeur` + termes-clés associés (stockés avec le fait à sa création) | Moyenne-haute (le secret paraphrasé échappe au lexical → doublé par le juge, étage 2) |
| **Ubiquité** | personnage présent au ch. N alors que sa `localisation` vraiAu(N) est incompatible avec le lieu de la scène et qu'aucun événement de déplacement n'existe | Haute |
| **Entité inconnue** | nom propre récurrent dans le chapitre absent de la table `entites` ET de la fiche → soit création légitime (l'extraction la déclarera), soit hallucination — signalé, jamais bloquant | Moyenne |
| **Personnage qui sait trop** | un personnage présent agit sur un fait dont il n'est pas dans `connu_de` — détection lexicale de la valeur du fait dans les scènes où il est acteur | Moyenne (filet ; la vraie défense est l'interdiction dans la fiche, D3) |
| **Chronologie interne** | si `date_monde` renseignée : événements du ch. N antérieurs au max des dates précédentes → signalé | Haute quand la donnée existe |

**Étage 2 — juge LLM** (même cerveau souverain que `judgeIntention` dans `eleve-judge.ts` : un cerveau DISTINCT du générateur) : reçoit le chapitre + la fiche de scène qui a servi à le générer, répond en JSON borné : contradictions perçues avec la fiche, cohérence de voix des personnages (vs l'échantillon de voix de leur fiche), respect de l'objectif du chapitre. **Mode OBSERVE par défaut** (pattern `ELEVE_GATE_TASTE_OBSERVE` : scoré, affiché, non bloquant, plancher d'échec grossier) — on calibre le juge sur des récits réels avant de le durcir, exactement comme le goût (#152/L34).

**Boucle de correction** : verdict RED → nudge correctif précis (pattern `buildGateNudge`), relance bornée (`RECIT_GATE_RELANCE_MAX`, défaut 2), puis **laisse-passer avec drapeau `incomplet`** journalisé. Réutilise `evaluateGate` (anti-thrash : si seul le signal bruité bloque et qu'il ne progresse pas, on cède) — la fonction est déjà pure et paramétrable, zéro fork.

**Alternatives rejetées.**

- **Ontologie formelle + solveur** (OWL/Prolog/Datalog : encoder les règles du monde en logique, prouver la cohérence) — rejeté. Le solveur serait fiable… sur des faits dont l'extraction reste LLM : on déplace le maillon faible sans le renforcer, en ajoutant une couche de formalisme que ni Raf ni les modèles exécutants ne maintiendront. Les invariants qui comptent (mort, secret, lieu) sont exprimables en SQL directement. Complexité non payée.
- **Juge LLM seul** (donner le chapitre + la bible au juge, lui demander « incohérences ? ») — rejeté comme étage unique : bruité (L1, L19 au registre des limites), non-exhaustif (il ne relira pas 200 faits), et surtout **indébogable** (un faux négatif du juge est invisible ; un check SQL qui rate un cas se corrige). La hiérarchie de `fondation.md` §V s'applique telle quelle : *rigide sur l'objectif, souple sur le subjectif*.
- **Vérification bloquante** (mur : pas de chapitre tant que RED) — rejeté : contraire à la décision de Raf sur #161 (convergent, jamais un mur), et dangereux sur une boucle nocturne de 800 chapitres — un faux positif déterministe (flashback non balisé) bloquerait le récit entier à 3 h du matin. Non-bloquant + drapeau + rapport, Raf tranche au matin.
- **Vérifier tout le récit à chaque chapitre** (re-scanner les N-1 chapitres passés) — rejeté : O(N²) sur 800 chapitres. On vérifie le chapitre NOUVEAU contre l'état CANONIQUE (qui, lui, résume tout le passé) — c'est exactement pour ça que l'état matérialisé existe.

### D5 — L'extraction : LLM structuré + réconciliateur déterministe + validation à ÉTAGES par impact

**Décision.** Après acceptation d'un chapitre, une passe d'extraction (`server/src/bible-extraction.ts`) transforme la prose en candidats structurés. **C'est le maillon faible assumé du système** (cf. 1.2) ; tout le design de cette décision vise à ce qu'une extraction imparfaite ne puisse pas corrompre le canon.

1. **Extraction LLM structurée** — réutilise le pattern éprouvé de `eleve-content.ts` (`buildContentPrompt` avec schéma + clés requises, `extractJsonArray` tolérant, `validateItems`, une passe + un retry, ne lève jamais). Le prompt fournit le vocabulaire de prédicats contrôlé (D1) et les entités existantes proches (pour lier plutôt que dupliquer). Sortie : résumé du chapitre, événements, faits candidats (`nouveau` / `changement d'état` / `révélation au lecteur`), nouvelles entités, fils ouverts/résolus.
2. **Tout entre en `statut='candidat'`** — jamais directement canon. Un candidat n'est ni injecté dans les fiches ni utilisé par les checks.
3. **Réconciliateur déterministe** (fonction pure, testable sans LLM) : pour chaque candidat, requête le canon — même sujet + même prédicat + intervalles chevauchants + valeur différente → **conflit** (file dédiée) ; identique → doublon (jeté) ; inédit → promotion possible.
4. **Promotion à étages par impact** :
   - **Faible impact** (nouvel événement, localisation, nouveau fil, résumé) → auto-promotion `canon`, journalisée.
   - **Fort impact** (liste courte de prédicats : `vivant`, `revele_lecteur_ch`, filiation/identité, règles du monde) → exige une **double extraction concordante** (deuxième passe, prompt reformulé ; concordance = promotion, discordance = file de conflits). Pattern « moyenner N passes » déjà retenu pour L1/L19.
   - **Conflits** → jamais auto-résolus. File présentée à Raf (mode supervisé) ou tranchée par un juge dédié avec journalisation `bible_journal` (mode nocturne autonome), toujours réversible.

**Alternatives rejetées.**

- **Faire confiance à l'extraction single-pass** — rejeté évidemment, mais nommé parce que c'est le défaut par défaut de tous les systèmes naïfs : une hallucination d'extraction écrite en canon empoisonne toutes les fiches suivantes — la corruption se *propage*. D'où le sas `candidat` obligatoire.
- **Validation humaine de tout** — rejeté : à ~15 faits/chapitre × 800 chapitres = 12 000 validations, Raf devient le goulot et le projet meurt. L'étage par impact concentre l'humain là où une erreur est irréversible narrativement.
- **Extraction pendant la génération** (demander à l'Élève de déclarer ses faits via un outil `bible_declare` pendant qu'il écrit) — **partiellement retenu, pas comme canal principal**. En canal principal, ce serait déclaratif-sur-l'honneur : le modèle déclare ce qu'il *croit* avoir écrit, pas ce qu'il a écrit (divergence prose/déclaration garantie à l'échelle). En revanche un outil de **consultation** `bible_cherche` (lecture seule) est offert au générateur — interroger la bible en cours d'écriture est sans risque. L'écriture dans la bible reste post-hoc, depuis la prose réelle, seule source de vérité.
- **NER/IE classique** (spaCy et al.) — rejeté : dépendance Python/modèles externes contraire à la stack, et l'IE classique est faible précisément sur ce qui compte ici (états, modalités, qui-sait-quoi). Le matching d'alias déterministe (D4) couvre le besoin « détection d'entités » sans dépendance.

### D6 — La révision (retcon volontaire) : mutations journalisées + rapport d'impact par provenance

**Décision.** Un retcon est une **commande contre la bible**, jamais une édition sauvage :

1. Raf exprime le changement (« finalement X n'est pas mort au ch. 84 ») → traduit en mutations : clore/rouvrir des intervalles de `faits`, statut `retconne` sur l'ancien, nouveaux faits `canon` — le tout écrit dans `bible_journal` (op `retcon`, avant/après).
2. **Rapport d'impact** par provenance, entièrement déterministe : chapitres dont la fiche compilée changerait = chapitres où les faits touchés étaient dans le contexte (via `source_ch`, les intervalles et les participations aux `evenements`). Sortie : « le retcon touche 23 chapitres : 3 fortement (X y parle), 20 faiblement (mention) ».
3. **Régénération sélective** : Raf choisit (tout, les 3 forts, ou une passe de retouche ciblée par chapitre — un run Élève « corrige ce chapitre pour refléter : … » avec la fiche recompilée). Jamais de régénération totale implicite.

**Alternatives rejetées.**

- **Update mutable sans journal** — rejeté : pas d'audit, pas d'undo, pas de rapport d'impact possible. Le journal coûte une table append-only ; il rapporte les trois.
- **Régénération complète en cascade après retcon** — rejeté : coût prohibitif (potentiellement des centaines de chapitres) et destructeur (la prose bonne des chapitres non concernés serait relotie). Le récit n'est pas un build : on ne « recompile » pas tout, on retouche l'impacté.
- **Versionner la prose dans SQLite** — rejeté : les chapitres sont des fichiers Markdown dans un projet — **git versionne la prose** (le repo cobaye est déjà git, cf. L21), la bible versionne l'état. Chaque outil son travail.

### D7 — Le passage à l'échelle : SQLite est très à l'aise, le coût est dominé par la prose

**Volumétrie** (calculée, pas devinée) :

| Grandeur | Estimation 10 000 pages | Verdict |
|---|---|---|
| Prose | ~30 Mo de Markdown (git) | trivial |
| `faits` | 10–20/chapitre × 800 ≈ **8–16 k lignes** (+ candidats/retconnés ≈ ×2) | trivial pour SQLite (des millions seraient OK) |
| `evenements` | ~5–10/chapitre ≈ 4–8 k lignes | trivial |
| Embeddings | ~10–15 k vecteurs (768 floats, TEXT JSON, pattern blackboard) ≈ 100–150 Mo | acceptable ; cosinus brute-force JS sur 15 k vecteurs ≈ 10–20 ms/requête — le commentaire de `kernel-blackboard-sqlite.ts` (« l'extension ANN pourra se brancher sur la MÊME table plus tard ») s'applique tel quel, rien à décider aujourd'hui |
| Fiche de scène | ~8 k chars/chapitre, compilée en < 50 ms (WHERE indexés) | trivial |

**Coût de génération** (l'Élève GLM cloud, ordre de grandeur à recaler à l'É5 sur les tarifs du jour) : sortie ~7 M tokens de prose + entrée ~15–25 k tokens/chapitre (fiche + boucle) × 800. C'est **le poste dominant, linéaire, incompressible** — la bible n'y ajoute que ~10–15 % (extraction + juge : les vérifications déterministes coûtent 0 $). Garde-fous existants réutilisés : `loopBudget` par chapitre, plafond nocturne d'escalade Maître, circuit-breaker MangoQA. Un compteur cumulé par récit (somme des `costUsd` de `RelayResult`) avec plafond `RECIT_BUDGET_USD` arrête proprement le runner.

**Alternative rejetée** : brancher sqlite-vec/ANN dès maintenant — rejeté, optimisation prématurée contraire à la trajectoire déjà actée pour le Blackboard (interface `search` stable, accélération plus tard si mesurée nécessaire).

---

## 3. Plan d'implémentation par étapes

Règles transverses : chaque étape laisse `tsc --noEmit` vert · tout nouveau comportement derrière un flag `RECIT_*` défaut OFF, off = byte-identique (pattern prouvé par `test-fondations-gates-combines.ts`) · chaque étape a son test de preuve exécutable sans réseau (deps injectées, pattern maison) · clôture : `statut.md` + `historique.md` + wiki + `limites.md` si limite honnête.

### É1 — `bible-store.ts` : le schéma et la requête cardinale

- **Fichiers** : `server/src/bible-store.ts` (neuf) · `server/src/test-bible-store.ts` (neuf).
- **Contenu** : les 6 tables (D1), migrations versionnées, `vraiAu(sujetId, chN)`, `promote/reject/retcon` (journalisés), résolution d'alias (`resolveEntite(nom)` → id, tolérant casse/alias), CRUD entités/fils/chapitres.
- **Réutilisation** : copie du pattern `kernel-blackboard-sqlite.ts` (PRAGMA user_version, `MIGRATIONS[]`, backup avant up(), fail-open, WAL, `tableHasColumn`) ; `cosine`/`rankByCosine` importés de `kernel-blackboard-store.ts` ; embeddings via `safeEmbed` (`notes-rag.ts`).
- **Test de preuve** : en `:memory:` — poser une mini-bible (5 entités, 20 faits dont 1 mort au ch. 84 et 1 secret révélé au ch. 200) ; `vraiAu(ch 50)` vs `vraiAu(ch 100)` renvoient des états différents et corrects ; un retcon rouvre un intervalle et le journal porte l'avant/après ; migration v1→v2 factice avec backup.
- **Modèle optimal** : ⚖️ Sonnet (pattern à copier, zéro invention) · **Effort** : M

### É2 — `bible-fiche.ts` : le compilateur de fiche de scène

- **Fichiers** : `server/src/bible-fiche.ts` (neuf) · `server/src/test-bible-fiche.ts` (neuf).
- **Contenu** : `compileFiche(db, chN, consigne)` → les 6 sections (D3) avec caps durs par section et priorité INTERDICTIONS > personnages > reste ; + `rappelEchos(db, sujet)` en réutilisant `rappelerSouvenirs`/`formatSouvenirs` (`eleve-memoire.ts`, deps injectées) sur les embeddings `evenements`/`chapitres`, cap 800c.
- **Test de preuve** : sur la mini-bible d'É1 — la fiche du ch. 100 contient l'interdiction « X est mort » et PAS le secret (dans les faits exposés) tout en portant son interdiction de mention ; un personnage absent de `connu_de` ne voit pas le fait ; fiche à 12 personnages → les caps tiennent et les interdictions survivent à l'arbitrage.
- **Modèle optimal** : ⚖️ Sonnet · **Effort** : S

### É3 — `bible-extraction.ts` : extraction + réconciliateur + file de conflits

- **Fichiers** : `server/src/bible-extraction.ts` (neuf) · `server/src/test-bible-extraction.ts` (neuf).
- **Contenu** : prompt d'extraction (vocabulaire de prédicats + entités existantes proches) ; parsing/validation en réutilisant `extractJsonArray`/`validateItems` (`eleve-content.ts`) ; réconciliateur **pur** (candidats × canon → promotions/doublons/conflits) ; double-extraction concordante pour les prédicats à fort impact ; écritures via É1 (journalisées). Deps `ask` injectées.
- **Test de preuve** : sans réseau (ask scripté) — un chapitre-fixture où « Y meurt » : le fait arrive `candidat`, la double extraction concordante le promeut, l'intervalle de `vivant` est clos ; une extraction contradictoire (Y à deux endroits) atterrit en file de conflits SANS toucher le canon ; une extraction malformée (JSON cassé) ne lève pas et ne corrompt rien.
- **Modèle optimal** : 🧠 Opus (le prompt d'extraction et la logique de réconciliation sont LE point critique du système — effets de bord sur tout l'aval) · **Effort** : M

### É4 — `bible-gate.ts` : le Gardien Récit + branchement dans la clôture

- **Fichiers** : `server/src/bible-gate.ts` (neuf) · `server/src/test-bible-gate.ts` (neuf) · retouches bornées : `eleve.ts` (projectType `recit` dans `detectProjectType` + appel du Gardien Récit dans la clôture quand type=`recit`, gaté `RECIT_GATE=on`) et `inspection.ts` (inspection d'un projet `recit` = fichier chapitre présent/non vide, pas de npm).
- **Contenu** : les 6 checks déterministes (D4, fonctions pures sur texte + table d'alias, balise d'exemption flashback) ; juge LLM en mode observe (cerveau de `eleve-judge.ts`) ; verdict + nudge (pattern `buildGateNudge`) ; réutilisation d'`evaluateGate` telle quelle pour l'anti-thrash.
- **Test de preuve** : fixtures sans LLM — un chapitre où le mort parle → check RED avec la ligne fautive citée ; le même passage balisé flashback → GREEN + exemption journalisée ; secret mentionné avant `revele_lecteur_ch` → RED ; `RECIT_GATE` off → clôture byte-identique à aujourd'hui.
- **Modèle optimal** : ⚖️ Sonnet (patterns existants à décliner ; la retouche `eleve.ts` est bornée et gatée) · **Effort** : M

### É5 — LA PREUVE : un récit de 50 pages de bout en bout, avec pièges

- **Fichiers** : `server/src/run-recit.ts` (runner : fiche → runRelay → gate → extraction → chapitre suivant ; reprenable ; plafond `RECIT_BUDGET_USD`) · outil Élève `bible_cherche` (lecture seule, dans un `eleve-bible-tools.ts` neuf, gaté `RECIT_TOOLS=on`) · script de seed d'une bible initiale depuis un synopsis.
- **Le test de preuve — le seul qui compte** : une novella ~50 pages (10–12 chapitres, ~30 k mots) générée de bout en bout par l'Élève, **avec 2 pièges injectés volontairement dans le plan d'arcs** :
  1. **Le piège du mort** : un personnage secondaire meurt au ch. 3 ; le plan du ch. 9 mentionne (à dessein, ambigument) une scène de groupe où il serait naturel qu'il parle. Succès = il ne parle pas, OU le Gardien l'attrape et la correction converge.
  2. **Le piège du secret** : un fait posé secret (`revele_lecteur_ch = 10`) dont un élément est tentant à mentionner dès le ch. 4. Succès = aucune fuite avant le ch. 10, OU fuite attrapée par le Gardien.
  - Critères chiffrés en sortie de run : 0 incohérence des 2 pièges dans le texte final · rapport de continuité complet (verdicts par chapitre, conflits d'extraction, exemptions) · coût réel mesuré et extrapolé à 10 000 pages · lecture humaine par Raf (le juge souverain — « qualité en situation réelle »).
- **Réutilisation** : `runRelay` intégral (escalade Maître, snapshots, budget), Gardien #161 inchangé, MangoQA observe comme d'habitude.
- **Modèle optimal** : 🧠 Opus (intégration cross-cutting : runner + outillage + première confrontation au réel — c'est ici que les décisions se cognent aux faits) · **Effort** : L
- **⚠ Gate de décision** : si l'É5 révèle que l'extraction diverge trop (> ~20 % de conflits) ou que GLM ne tient pas la prose longue, ON S'ARRÊTE et on inscrit la limite dans `limites.md` avant d'engager É6/É7. Le plan est conçu pour que l'échec éventuel coûte 5 étapes-preuves, pas un chantier XL.

### É6 — Révision/retcon + vues auteur

- **Fichiers** : `server/src/bible-retcon.ts` (neuf : mutations journalisées + rapport d'impact D6) · export Markdown de la bible (fiches personnages, chronologie, fils) vers `wiki/` ou le dossier projet · `server/src/test-bible-retcon.ts`.
- **Test de preuve** : sur la novella d'É5 — retconner la mort du ch. 3 ; le rapport d'impact liste exactement les chapitres concernés (vérifiable à la main sur 12 chapitres) ; la retouche ciblée d'UN chapitre par l'Élève passe le Gardien Récit ; l'undo depuis le journal restaure l'état antérieur.
- **Modèle optimal** : ⚖️ Sonnet · **Effort** : M

### É7 — Montée en échelle : 500 pages, puis l'horizon 10 000

- **Contenu** : brancher le runner sur la boucle nocturne (#173 Loop / cron gaté, circuit-breaker MangoQA en place) ; mesures à 500 pages (~70 chapitres) : dérive de voix (échantillons début/milieu/fin comparés par le juge), taux de conflits d'extraction dans la durée, latence de `compileFiche` et du cosinus à volumétrie réelle, coût cumulé vs extrapolation É5 ; ancre anti-dérive stylistique (échantillon de voix par personnage dans la fiche, re-calibré périodiquement) ; purge des candidats rejetés (réutilise le pattern `prune`).
- **Test de preuve** : un récit de 500 pages généré en nocturne sur plusieurs nuits, avec rapport de tendance (les métriques ci-dessus tracées chapitre par chapitre) présenté à Raf. La décision d'aller à 10 000 se prend sur CES chiffres, pas sur l'enthousiasme.
- **Modèle optimal** : ⚖️ Sonnet · **Effort** : L

| # | Étape | Dépend de | Modèle optimal | Effort |
|---|-------|-----------|----------------|--------|
| É1 | bible-store (schéma + vraiAu + journal) | — | ⚖️ Sonnet 4.6 | M |
| É2 | bible-fiche (compilateur + échos) | É1 | ⚖️ Sonnet 4.6 | S |
| É3 | bible-extraction (+ réconciliateur) | É1 | 🧠 Opus 4.8 | M |
| É4 | bible-gate (+ branchement clôture) | É1, É2 | ⚖️ Sonnet 4.6 | M |
| É5 | **Preuve 50 pages, 2 pièges** | É1–É4 | 🧠 Opus 4.8 | L |
| É6 | Retcon + vues auteur | É5 | ⚖️ Sonnet 4.6 | M |
| É7 | Échelle 500 → 10 000 (nocturne + mesures) | É5 | ⚖️ Sonnet 4.6 | L |

---

## 4. Risques & limites honnêtes

Sans complaisance — chaque mur est nommé avec sa parade réelle et ce qui reste au-delà de la parade.

**R1 — L'extraction de faits n'est pas fiable, et ne le deviendra pas complètement.** C'est le mur central. Les parades (sas `candidat`, réconciliateur, double-extraction, étages par impact — D5) garantissent qu'une erreur ne *corrompt* pas le canon, pas qu'elle ne *manque* pas : un fait subtil non extrait est invisible du système (le Gardien ne vérifie que ce que la bible sait). Le taux de rappel réel se mesurera à l'É5 — s'il est mauvais, la position de repli honnête est un mode **semi-supervisé** : Raf survole la file d'extraction par lot de chapitres. → À inscrire dans `limites.md` dès l'É3 (piste : codage interne — prompts d'extraction calibrés + double passe ; 🟢 codable en interne ; le rappel parfait, lui, restera hors d'atteinte).

**R2 — La dérive stylistique et de voix sur 800 chapitres.** La bible maintient les *faits*, pas le *style*. Sur des mois de génération (et d'éventuels changements de cerveau — liquidité §VIII.c), la voix du narrateur et des personnages dérivera. Parades : échantillons de voix dans les fiches (ancre), juge de voix en observe (É4), mesure de tendance (É7). Honnêtement : ces parades *ralentissent* la dérive, aucune ne la supprime — c'est une limite de fond des générations longues, à tracer dans `limites.md` à l'É7 avec les chiffres.

**R3 — Le juge LLM est bruité** (hérité, documenté : L1, L19). Contenu par la hiérarchie déterministe-d'abord (D4), le mode observe, et l'anti-thrash `evaluateGate`. Résidu : les incohérences *sémantiques profondes* (motivation absurde, personnalité trahie sans contradiction factuelle) ne sont détectables QUE par ce juge bruité — elles passeront parfois.

**R4 — Cohérent ≠ intéressant.** Ce système peut produire 10 000 pages parfaitement cohérentes et parfaitement plates. La qualité *dramatique* (tension, rythme, angle — axiome UX 34 : l'angle non-évident se décide AVANT l'exécution) vit dans le plan d'arcs, qui est un INPUT de ce chantier, pas son objet. Il faut le dire à Raf tel quel : #178 livre la *mémoire* du romancier, pas son *talent*. Un chantier ultérieur (« le Dramaturge » — planification d'arcs avec tension mesurée) est le complément naturel ; hors périmètre ici.

**R5 — La capacité de GLM en prose longue de qualité n'est pas prouvée.** L'Élève excelle sur les apps ; la fiction littéraire au long cours est un autre métier. Le mur L51 (les modèles locaux ne tiennent pas la boucle) a son équivalent possible ici : « GLM ne tient pas la voix ». Parade : la liquidité du cerveau (une ligne pour rebrancher — la bible et le pipeline sont agnostiques au cerveau, c'est précisément leur valeur) ; l'É5 tranche sur pièces.

**R6 — Les scènes chorales font déborder la fiche.** 12 personnages × faits × interdictions > 8 k chars. Parade : priorité aux interdictions puis présence effective (les figurants n'ont droit qu'à une ligne), testée à l'É2. Résidu : les très grandes batailles à la Tolkien demanderont un mode « fiche de groupe » (une faction = une entité agrégée) — extension de schéma prévue par migration, pas dans la v1.

**R7 — Coût.** ~800 chapitres × (prose + extraction + juge) sur GLM cloud : le poste prose est incompressible et se chiffrera à l'É5. Garde-fous : `RECIT_BUDGET_USD` (runner), `loopBudget` (par chapitre), plafond d'escalade Maître (existant). Le risque n'est pas la surprise (tout est borné) mais le verdict : si l'extrapolation É5 est trop chère, l'horizon 10 000 pages attend la bascule locale (fondation §IX) — la bible, elle, reste valable telle quelle.

**R8 — Fenêtres temporelles narratives non linéaires** (flashbacks, prophéties, récits enchâssés). La coordonnée-chapitre (D2) suppose que l'ordre de narration ≈ l'ordre du monde. La balise d'exemption flashback (D4) couvre le cas simple ; un récit à timelines entrelacées à la Silmarillion demanderait une coordonnée duale (chapitre + date-monde obligatoire) — extension par migration, assumée hors v1. → `limites.md` à l'É4.

---

## 5. ANNEXE OBLIGATOIRE — Trace de raisonnement (corpus Fable)

*Conformément à `docs/corpus-fable/README.md` : démarche, alternatives failli-choisies, heuristiques, ce qui a failli me tromper, ce que je recommande d'étudier. Honnête, pas performatif.*

### 5.1 Ma démarche, pas à pas

1. **J'ai lu l'existant AVANT de penser au problème.** Ordre réel de lecture : `fondation.md` → les deux fichiers blackboard → `eleve-memoire.ts` → `eleve-runtime.ts` → `eleve-gate.ts` + `axioms.ts` → la revue du 2026-07-03 → `runRelay` dans `eleve.ts` → `eleve-content.ts`. Ce n'est pas de la conscience professionnelle, c'est *stratégique* : dans un système avec des patterns forts et éprouvés, la bonne architecture est presque toujours « le pattern existant, décliné » — et chaque déclinaison évite une décision neuve (donc un risque neuf). À la fin de la lecture, quatre décisions sur sept étaient déjà prises de fait : D1 (le pattern blackboard-sqlite EST le stockage), D3-couche-2 (eleve-memoire EST le rappel), D4 (eleve-gate EST le gardien), D5-parsing (eleve-content EST l'extraction structurée). Je n'ai « conçu » à neuf que le schéma temporel (D2), la fiche compilée (D3-couche-1) et le retcon (D6).
2. **J'ai reformulé le problème avant de le résoudre.** Le brief disait « mémoire narrative ». J'ai passé le problème au crible des ordres de grandeur (le ratio 0,2 % de visibilité) et il a changé de nature : de « mémoire » (connotation : se souvenir, donc RAG) à « état » (connotation : base de données, transactions, invariants). Ce glissement sémantique est LE point de bascule de toute la conception — tout le reste en découle mécaniquement. Une heure sur la reformulation a économisé toutes les autres.
3. **J'ai cherché l'asymétrie structurante** (§1.2 : compilation fiable vs extraction non fiable). Face à un système en boucle, je cherche toujours quel arc de la boucle est solide et lequel est fragile, puis je charge le solide au maximum (les interdictions dans la fiche, en amont) pour décharger le fragile (la détection aval). C'est la même logique que le Gardien existant : déterministe d'abord, LLM ensuite.
4. **J'ai dimensionné avant de choisir** (D7 avant de finaliser D1) : le calcul « 16 k faits, 15 k embeddings, cosinus 20 ms » a tué à lui seul l'option graph DB et l'option ANN-tout-de-suite. Beaucoup de choix d'architecture s'évaporent quand on pose les chiffres — les débats de principe (graphe vs relationnel !) sont souvent des débats de volumétrie déguisés.
5. **J'ai placé la preuve courte au milieu du plan, avec un gate de décision** (É5 : 50 pages, 2 pièges, et « on s'arrête si > 20 % de conflits »). Un plan de 7 étapes sans point d'arrêt est une promesse ; avec un gate chiffré au milieu, c'est une expérience.

### 5.2 Les alternatives que j'ai FAILLI choisir, et ce qui m'a fait basculer

- **L'event-sourcing pur** (D2). C'est l'alternative qui m'a retenu le plus longtemps — elle est *belle* : un seul concept (l'événement), l'état toujours dérivable, le retcon élégant (corrige l'événement, rejoue). J'ai basculé en me demandant : *« quel est le maillon le moins fiable, et cette architecture le charge-t-elle plus ou moins ? »* Réponse : l'extraction ; et l'event-sourcing exige d'elle des transitions d'état FORMELLES, c'est-à-dire qu'il fait porter 100 % de l'état au maillon à ~80 % de fiabilité. La beauté conceptuelle masquait une concentration de risque. Leçon : **l'élégance d'une architecture se juge à l'endroit où elle place sa confiance, pas à son économie de concepts.**
- **Le RAG-first** (D3). Réflexe de l'époque : « longue portée = retrieval ». J'ai basculé sur un contre-exemple concret que je me suis fabriqué exprès : *quelle requête de similarité fait remonter « Boromir est mort » quand on écrit une scène où Boromir serait naturel ?* Aucune — la mort est une négation d'existence, et la similarité cherche des présences. Fabriquer le contre-exemple minimal qui casse l'option par défaut est plus rapide que d'argumenter contre elle en général.
- **La fiche seule, sans rappel sémantique** (D3, sens inverse). Après avoir tué le RAG-first, la tentation symétrique : tout-déterministe. J'ai failli le faire au nom de la simplicité. Ce qui m'a retenu : les échos, promesses et motifs n'ont **pas de prédicat** — un schéma ne représente que ce qu'on a su nommer. Le sémantique couvre exactement le résidu innommable. Leçon : après avoir rejeté un mécanisme comme *primaire*, vérifier s'il n'est pas le bon *secondaire* — le rejet total est souvent une sur-correction.
- **L'outil `bible_declare` en écriture pendant la génération** (D5). Séduisant (l'Élève déclare ses faits, zéro extraction post-hoc). Basculé sur : le modèle déclarerait son *intention*, pas sa *prose* — et à l'échelle, les deux divergent forcément. La prose est la seule source de vérité ; tout canal parallèle finit par la contredire. J'ai gardé la version lecture seule (`bible_cherche`), qui n'a pas ce défaut.

### 5.3 Mes heuristiques (celles qui ont réellement servi ici)

1. **Chercher l'existant avant de concevoir** — et le lire au niveau du *pattern*, pas de la fonction (ce que blackboard-sqlite m'a donné, ce n'est pas du code à appeler, c'est une doctrine : migrations + backup + fail-open + WAL).
2. **Reformuler jusqu'à ce que le problème change de catégorie.** « Mémoire narrative » → « gestion d'état » a tout décidé. Si la reformulation ne change pas la catégorie, elle n'est pas finie.
3. **Charger l'arc fiable de la boucle** (amont déterministe > aval probabiliste).
4. **Poser les ordres de grandeur avant les débats d'architecture.**
5. **Séparer vérité / connaissance / visibilité** — plus généralement : quand deux concepts se confondent dans le langage courant (« savoir »), les séparer dans le schéma AVANT qu'un bug ne les sépare pour vous.
6. **Un cap est un contrat** (hérité du code lu : MEMOIRE_SECTION_MAX_CHARS, AXIOMS_MAX_CHARS) : toute injection de contexte sans cap dur finira par saturer ce qu'elle devait aider.
7. **Le contre-exemple minimal fabriqué exprès** tue une option par défaut plus vite qu'une argumentation générale.
8. **Placer un gate de décision chiffré au milieu du plan** — le courage d'arrêter se décide à la conception, pas au moment de l'échec.

### 5.4 Ce qui a failli me tromper

- **La séduction du graphe.** « Personnages, relations, lieux » — le mot « relations » appelle le graphe comme un aimant. J'ai dû consciemment me demander quelle *requête* dominait (temporelle, pas traversale) pour m'en défaire. Méfiance envers les architectures choisies par résonance lexicale avec le domaine.
- **Croire la fondation sur parole.** `fondation.md` v2 marque elle-même ses écarts VISION/RÉEL (LiteLLM aspirationnel, etc.) — mais j'aurais pu concevoir contre la cible plutôt que contre l'acquis. Le réflexe salvateur : ne citer dans le plan QUE des chemins de fichiers que j'ai ouverts.
- **La sous-estimation du R4 (cohérent ≠ intéressant).** Ma première esquisse mentale traitait la qualité dramatique comme « hors scope » sans le DIRE. Or un chantier qui livre exactement sa promesse mais dont la promesse était mal comprise est un chantier raté aux yeux de l'utilisateur (c'est la leçon de la journée perdue du 2026-07-02 : build-vert ≠ réussi). D'où la section 1.4 et le R4 explicites : dire ce qu'on ne livre PAS fait partie de l'architecture.
- **L'envie de sur-spécifier le schéma.** Première version mentale : 11 tables (scènes, dialogues, objets-portés, météo…). Je l'ai réduite à 6 en appliquant « chaque table doit être exigée par une requête du pipeline » — une table sans requête cliente est de la modélisation récréative. Le schéma s'étendra par migrations (le mécanisme est prévu), pas par anticipation.

### 5.5 Ce que je recommande d'étudier dans ma façon de raisonner

1. **Le geste de re-catégorisation** (5.1.2) : c'est le plus haut levier et le moins visible dans le livrable final — le document paraît « découler » du problème, mais il découle de la *reformulation* du problème. Étudier : sur d'autres missions du corpus, où est le moment où la catégorie change ? Y a-t-il un signal récurrent (souvent : un calcul d'ordre de grandeur qui rend l'énoncé initial absurde) ?
2. **L'allocation de confiance** (5.2, event-sourcing) : la question « où cette architecture place-t-elle sa confiance, et ce point est-il le maillon fort ou faible ? » est probablement distillable en axiome de méthode injectable tel quel.
3. **Le rythme rejet-total → repêchage-en-secondaire** (RAG rejeté comme primaire, repêché comme couche d'échos ; `bible_declare` rejeté en écriture, repêché en lecture). Je le fais systématiquement et je pense que c'est un correcteur de biais : le premier rejet est souvent trop large. Vérifier sur le corpus si ce motif se répète.
4. **Ma limite observable** : je conçois volontiers un étage de plus que nécessaire (le premier schéma à 11 tables, la tentation bi-temporelle SQL:2011). Le correctif que je m'applique — « chaque élément doit avoir un client nommé » — devrait être appliqué par le relecteur à TOUT plan que je produis : chercher l'élément sans client, il y en a probablement encore un. (Candidat honnête ici : la colonne `confidence` de `faits` — aucun consommateur nommé dans ce plan. Je la garde parce qu'elle coûte zéro et que l'É3 la remplira naturellement, mais c'est exactement le genre de résidu que ma méthode laisse passer.)

---

*Fin du plan #178. Prochaine action (post-validation Raf) : É1 par Sonnet — copier le pattern `kernel-blackboard-sqlite.ts` vers `bible-store.ts`. Aucune étape ne requiert Fable.*
