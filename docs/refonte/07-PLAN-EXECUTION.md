# Refonte Mango — 07 · Plan d'exécution

> Établi le **2026-08-05**, après re-mesure directe de la copie vivante `D:\IA\MangoOS`.
> Les documents 00 → 06 disent **quoi** faire. Celui-ci dit **dans quel ordre**, **à quelle
> condition on considère que c'est fait**, et **ce qui est tranché** pour que la découpe
> puisse commencer.
>
> Comme dans le 00 : tout chiffre ici est **mesuré**. Les jugements sont marqués « Lecture ».

---

## 1. Ce que la re-mesure donne — l'audit n'a pas vieilli, il n'a pas commencé

L'audit du 2026-08-04 a été établi sur le commit `054c9de`. La copie vivante `D:\IA\MangoOS`
est **encore sur `054c9de`**. **Zéro commit depuis.** Contre-mesures du 2026-08-05 :

| Mesure | Audit (2026-08-04) | Re-mesure (2026-08-05) | Verdict |
|---|---|---|---|
| Modules de production `server/src` | 346 | **343** | conforme (écart de méthode de comptage) |
| Fichiers de tests | 246 | **245** | conforme |
| Variables d'env lues dans le code | 252 | **253** | conforme |
| Variables définies dans le `.env` vivant | 58 | **63** | +5, l'écart se creuse |
| `data/agents-registry.json` | `[]` | **`[]`** | inchangé |
| Modules dits jamais importés | 26 | **tous encore présents** | inchangé |
| Composants UI jamais montés | 3 | **tous encore présents** | inchangé |

**Rien n'a été retiré. Rien n'a été fusionné. Aucune ligne du registre 01 n'a été exécutée.**
Le document 01 le dit lui-même en tête : *« proposition d'expert, en attente d'arbitrage de Raf »*.

### Trois écarts que la re-mesure a fait apparaître

**a) Le plan vivait hors du dépôt qu'il gouverne.** Les documents 00 → 06 n'existaient que sur
`C:\Users\Raf\Desktop\mangoai\docs\refonte\` — un clone déclaré **en lecture seule** par la
décision de cadrage du 2026-08-04. Le travail se fait sur `D:`. Corrigé le 2026-08-05 : les
documents sont désormais dans `D:\IA\MangoOS\docs\refonte\`, qui devient la copie de référence.

**b) Le socle `v3/` n'existe pas.** La méthode arbitrée est « socle `v3/` qui appelle
l'existant ». Aucun dossier `v3/` nulle part. La méthode a été choisie, jamais amorcée.

**c) Deux documents de discipline ont dérivé de leur propre règle.**

| Fichier | Poids réel | Ce que dit la règle | Écart |
|---|---|---|---|
| `statut.md` | **158,9 Ko** | seuil d'alerte à 150-200 Ko (`CLAUDE.md`) | **seuil franchi** |
| `historique.md` | **1 349 Ko** | `CLAUDE.md` annonce « ~220 Ko » | **×6** |

> **Lecture.** Le (c) est bénin en soi — la règle dit de ne pas lire `historique.md`, donc son
> poids ne coûte rien à une session. Mais une instruction permanente qui se trompe d'un facteur 6
> sur un chiffre est une instruction qu'on a cessé de vérifier. C'est le même mécanisme que le
> Constat 1 de l'audit, appliqué à la documentation : **rien n'oblige jamais à refermer.**

---

## 2. Le vrai blocage n'est pas technique

Sept documents, ~103 Ko, de l'audit jusqu'aux parcours d'écran. La conception est **faite**.
Ce qui manque tient en une phrase :

> Le registre 01 propose 200 verdicts et en laissait **quatre** en `⚠️ DÉCISION RAF`
> — **cinq en réalité**, le § G renvoyant lui aussi 11 flags à « décision Raf » dans une ligne
> fourre-tout. Tant qu'ils étaient ouverts, **aucune ligne du registre n'était exécutable** :
> chacun conditionne des dizaines d'autres lignes.

C'était le point de blocage réel. Il ne se résolvait pas en codant.
**Le § 3 le referme ; le lot 0 l'a exécuté le 2026-08-05.**

---

## 3. Les quatre arbitrages — tranchés, avec ce qui les invaliderait

Chaque décision porte son motif **mesuré** et sa porte de sortie. Si Raf tranche autrement,
c'est cette section qu'on réécrit, datée — pas le code qu'on adapte en silence.

### A1 — `savoir/` (2 122 lignes, 4 modules) → ⚪ **ARCHIVE**

**Mesuré :** les flags `SAVOIR_*` ne sont définis nulle part dans le `.env` vivant → **le chemin
outillé n'a jamais tourné.** Le runner d'ingestion n'a jamais été écrit. `savoir-extraction` et
`savoir-reconcile` ne sont importés nulle part.

**Correction apportée en exécutant le lot 0 — le sous-système n'est pas vierge.**
`server/data/savoir/` contient **11 fichiers réels** : une base `savoir.db`, un `corpus.json`
(dossier `agentic-harness`) et **9 transcripts** (dont 6 sous `eleve-adhoc/`, donc produits par
un appel d'outil de l'Élève, hors du chemin flaggé). Dire « jamais exécuté » était **faux** :
la moitié extraction/stockage a bien tourné, en ad hoc.

**Le verdict ne change pas, son motif se précise :** ce n'est pas un sous-système mort, c'est un
sous-système **à moitié construit qui a servi ponctuellement**. L'archiver reste juste — il
faudrait écrire du neuf pour le finir, avant que la frontière produit existe. Mais il n'est plus
question de le traiter comme du code mort.

> **⛔ Contrainte dure pour le lot 1 : `server/data/savoir/` NE PART PAS avec le code.**
> Archiver du code sur une branche ne préserve pas des données non suivies par git. Ces 11
> fichiers sont une vraie ingestion. Ils restent sur disque, ou sont copiés hors du dépôt
> **avant** toute opération. Détruire un corpus en « archivant » serait exactement le genre de
> perte irréversible que la règle « rien ne sort sans trace » existe pour empêcher.

**Pourquoi archiver plutôt que finir :** finir demande **d'écrire du neuf**. Or la règle
anti-rechute dit qu'une capacité nouvelle rejoint une structure existante ou n'entre pas — et
il n'y a pas encore de structure pour l'accueillir. Écrire deux modules pour un sous-système
jamais allumé, avant même que la frontière produit existe, c'est exactement le geste qui a
produit les 23 fonctionnalités jamais exécutées.

**Ce qui l'invaliderait :** un usage réel qui réclame l'ingestion de savoir. On rouvre la
branche, elle est intacte.

### A2 — La couche autonome (§ H) → **option (1) réduite**

**Gardés et assumés :** `self/` (self-evolution) et `nocturnal`.
**Motif mesuré :** `SELF_EVOLVE=on`, `SELF_EVOLVE_AUTO=on`, budget `0,50 $`, plafond 24 agents,
`NOCTURNAL_JUDGE_PROVIDER=ollama` — c'est le **seul** bloc autonome réellement allumé dans le
`.env` vivant. Il tourne déjà ; il lui manque une surface, pas du code.

**⚪ ARCHIVE :** `stratege/` (13 modules, ~1 800 l., `STRATEGE_GLOBAL` non défini → jamais
exécuté) · `prompt-evolution.ts` · `train-loop.ts` · `auto-ablation.ts` · `reverse-learn.ts`
(jamais importé) · `veille.ts` + `radar.ts`.

**Surface produit :** **un seul écran**, « Ce que Mango a appris cette nuit ». Pas un menu,
pas un onglet par sous-système.

**Ce qui l'invaliderait :** une mesure montrant que le Stratège global améliore un résultat.
Elle n'existe pas — il n'a jamais tourné.

### A3 — Écran Code (`CODE_SECTION`) → 🔴 **SUPPRIME de la v3**

**Mesuré :** le flag n'est pas défini dans le `.env` vivant → l'écran n'a jamais été allumé.

**Lecture.** Un écran plein-cadre jamais activé une seule fois n'est pas une surface produit,
c'est une intention. Les écrans passent de 6 à 3 ; celui-ci est le moins cher à retirer parce
que personne ne l'a jamais vu. Rouvrable quand un usage le réclame.

### A4 — `/api/billing/*` → ⚪ **ARCHIVE**

MangoOS v3 n'est pas vendu (voir § 4). Une famille de routes de facturation dans un produit
sans facturation est du poids mort qui donne l'illusion d'une capacité.

**Ce qui l'invaliderait :** la décision de vendre MangoOS. Ce jour-là, la facturation se
reconçoit avec le modèle économique — pas depuis un vestige.

---

## 4. Une contradiction à nommer, pas à contourner

La décision de cadrage du 2026-08-04 fixait l'**ordre de sortie** : *« MangoQA en premier,
seul (CLI + serveur MCP), avant la refonte MangoOS v3 »*.

Le 2026-08-05, MangoQA a été mis en pause par Raf (« je vais utiliser ce qui existe déjà »),
et la relance porte sur MangoOS. **La décision d'ordre de sortie est donc caduque.** Elle
n'est pas oubliée : elle est remplacée ici, datée.

> **Nouvel ordre de sortie (2026-08-05) : MangoOS v3 en premier. MangoQA reste livrable en
> l'état** (CLI 1,6 Mo, serveur MCP, 240 tests verts, ADR-001 gelé au lot 1) **et garde sa
> place de différenciateur n°2 dans le registre A — sans travail supplémentaire.**

Conséquence directe sur ce plan : le document `06-MANGOQA-PRODUIT-AUTONOME.md` sort du chemin
critique. Il reste valide, il n'est plus prioritaire.

---

## 5. Les lots, dans l'ordre

Un lot n'ouvre que lorsque le précédent est terminé au sens de sa définition d'achèvement.
L'ordre suit une règle unique : **on ne construit rien au-dessus de ce qu'on n'a pas encore
coupé.**

### Lot 0 — Rendre le plan exécutable ✅ **FAIT (2026-08-05)**

Aucun code produit. Referme le blocage du § 2.

- [x] Documents 00 → 06 rapatriés dans `D:\IA\MangoOS\docs\refonte\`
- [x] Les 4 arbitrages du § 3 reportés dans le registre 01 (§ B, § G, § H, § I, § J), qui passe de « proposition » à **« ARRÊTÉ »**
- [x] Un **5ᵉ point implicite** tranché au passage : la ligne fourre-tout du § G (`NOCTURNAL_*`, `STRATEGE_*`, `SAVOIR_*`, `CODE_SECTION`, `FORMATION_TUTEUR`, `AB_HARNESS`, `DRY_RUN`, `BRAIN_ENSEMBLE`, `INTENT_ROUTER_LLM`, `FRONTIER_TOOLS_ANY_BRAIN`, `LLM_SEMANTIC_CACHE`) renvoyait elle aussi à « décision Raf ». Éclatée en verdicts individuels.
- [x] `CLAUDE.md` : `historique.md` 220 Ko → **1,35 Mo**, et `fondation.md` ~25 Ko → **41 Ko** (la seconde dérive n'avait pas été repérée avant l'exécution)
- [x] `statut.md` : entrée « Où on en est » du 2026-08-05
- [x] **Pointeur « prochaine session » de `statut.md` réécrit** — il annonçait *« À LANCER : activer le Savoir #177 »*, que l'arbitrage A1 venait d'archiver. Non corrigé, la session suivante aurait ouvert `statut.md` et **commencé à bâtir exactement ce qu'on retire**. Le contexte #177 est conservé, marqué archivé, pas supprimé.
- [x] Cible « écrans » corrigée de **6 → 3** en **6 → 4** dans le registre § I et § K : l'arbitrage A2 *ajoute* une surface (l'écran « appris cette nuit »). Un arbitrage qui ajoute et une cible qui ne bouge pas, c'est une cible qui ment.

**Achevé quand :** le registre 01 ne contient plus un seul `⚠️ DÉCISION RAF`. ✅ Vérifié —
seule subsiste la mention en en-tête qui *décrit* leur fermeture.

> **Ce que le lot 0 a appris.** Trois des sept actions ci-dessus n'étaient pas au plan : elles
> sont apparues **en exécutant**. Deux d'entre elles (le pointeur #177, la cible des écrans)
> étaient des contradictions qui auraient survécu à la découpe et l'auraient contredite en
> silence. C'est l'argument pour faire le lot 0 **avant** de toucher au code, pas pendant.

### Lot 1 — La coupe gratuite · *le mort confirmé*

Le seul lot **sans risque de conception** : rien de ce qui sort ici n'est appelé par quoi que ce soit.

> ## ✅ Passe A exécutée le 2026-08-05 — 21 fichiers retirés, tout est vert
>
> **Référence d'archive posée avant toute suppression :** `archive/pre-refonte-v3` → `054c9de`.
> Une seule référence, pas quatorze : tout ce code étant déjà commité au même point, quatorze
> branches auraient pointé sur le même objet. La copie de travail n'a jamais été touchée
> (`git branch <nom> <commit>`, aucun `checkout`, aucun `commit`, aucun `push`).
>
> | Mesure | Avant | Après | Δ |
> |---|---|---|---|
> | Modules de production | 343 | **331** | −12 |
> | Fichiers de tests | 245 | **239** | −6 |
> | Composants UI | 107 | **104** | −3 |
> | Entrées de `test-manifest.json` | 233 | **229** | −4 |
>
> **Retirés :** `forge-agents` · `agent/agent-scheduler` · `reverse-learn` · `audit-scan` ·
> `apply-brain-profile` · `compare-eleves` · `bench-coque-rigide` · `stratege/raf-tom` ·
> `stratege/eleve-workflow` · `regression/chaos-runner` · `regression/probe-content-gate` ·
> `grand-chantier` · leurs 6 tests · `EstheteChat.jsx` · `ObserverConseil.jsx` ·
> `StrategeGlobal.jsx`.
>
> **Vérifié :** `tsc --noEmit` **0 erreur** · `npm run build` (ui/) **vert en 8,4 s**.
>
> ### Ce que la vérification a coûté — et évité
>
> La liste de l'audit comptait 17 modules. **Quatre étaient fausses**, découvertes en
> vérifiant, pas en supprimant :
>
> | Module | Verdict corrigé | Ce qui serait arrivé |
> |---|---|---|
> | `kernel/kernel-curation-priority.ts` | 🟢 GARDE | build cassé (`kernel-curation-effect` l'importe) |
> | `cron-breaker.ts` | 🟢 GARDE | build cassé (`cron-scheduler` l'importe) |
> | `kernel/kernel-blackboard-sqlite.ts` | 🔵 FUSIONNE (lot 4) | substrat SQLite de la fusion mémoire détruit |
> | `render-integrity.ts` | 🟢 **GARDE** | chemin de production vivant : `taste/taste-render.ts:260` → `vision.capturePreviewWithIntegrity` → `measureIntegrity`. L'ancre `taste-anchors/floor.png` n'est pas un vestige, c'est une mesure **active**. |
>
> **`dry-run.ts` reporté en passe B** — pas parce qu'il est vivant, mais parce que le retirer
> oblige à opérer sur `test-fondations-gates-combines.ts` (745 lignes), qui teste aussi
> `ab-harness`, `prompt-evolution` et `llm-cache`, tous dans la vague d'archivage. Il part avec
> elle, en une fois, au lieu de deux mutilations successives du même fichier.
>
> > **Lecture.** Sur 17 lignes réputées « sans risque », **4 étaient fausses et 1 non exécutable
> > telle quelle** — soit 29 %. Deux de ces erreurs venaient d'un critère de détection trop
> > étroit (« n'apparaît pas dans un `import ... from '...'` ») qui rate les chaînes à deux
> > niveaux, les imports dynamiques et les guillemets doubles. **Mon propre premier passage de
> > vérification portait le même défaut** et avait laissé passer `render-integrity` : il a fallu
> > refaire le motif pour le voir. Aucune liste ne s'exécute sur confiance, y compris la mienne.
>
> ### Reste de passe B (non exécuté)
>
> Les 14 blocs ⚪ ARCHIVE ci-dessous **plus** `dry-run.ts`. Ce n'est **pas** une coupe gratuite :
> `stratege/`, `prompt-evolution`, `veille`, `radar` et `billing` ont des routes enregistrées et
> des flags câblés. Il faut débrancher avant de retirer, et le tester.

> ### ⚠️ Vérification préalable du 2026-08-05 — **3 des 17 lignes étaient fausses**
>
> La liste « jamais importés » de l'audit a été re-vérifiée module par module avant toute
> suppression. **Trois entrées ne pouvaient pas être supprimées :**
>
> | Module | Ce que dit l'audit | Ce que la vérification donne | Verdict corrigé |
> |---|---|---|---|
> | `kernel/kernel-curation-priority.ts` | jamais importé hors tests | **faux** — `kernel/kernel-curation-effect.ts` l'importe en production, et lui-même est importé par `index.ts`, `nocturnal.ts`, `integrity-audit.ts`, `chat-route.ts` | 🟢 **GARDE** — le supprimer cassait le build |
> | `cron-breaker.ts` | jamais importé | **faux** — `cron-scheduler.ts` en importe 7 symboles ; or le § H **garde** `cron-scheduler` (il porte `nocturnal`) | 🟢 **GARDE** — le registre se contredisait |
> | `kernel/kernel-blackboard-sqlite.ts` | jamais importé hors tests | **exact** (4 tests seulement), mais le § B en fait le **substrat SQLite unique** de la fusion mémoire | 🔵 **FUSIONNE** (lot 4) — le supprimer détruisait ce sur quoi le lot 4 doit bâtir |
>
> **Lecture.** « Jamais importé » et « mort » ne sont pas la même chose, et l'audit a confondu
> les deux. Sur 17 lignes, 2 étaient factuellement fausses et 1 contredisait un autre chapitre
> du même document. Sans cette vérification, le lot censé être « sans risque » cassait le build
> **et** amputait le lot 4. **Aucune ligne du registre ne s'exécute sur confiance.**
>
> ### Conséquence à traiter dans le même geste — 5 tests enregistrés
>
> `agent-scheduler` · `dry-run` · `grand-chantier` · `render-integrity` · `reverse-learn` ont
> chacun un test **inscrit à `server/test-manifest.json`**. Supprimer le module sans retirer le
> test **et** son entrée au manifeste casse la suite. Les trois vont ensemble, en une seule fois.
>
> ### Une donnée à ne pas perdre
>
> `render-integrity.ts` a produit une **ancre de goût mesurée** encore utilisée :
> `server/data/taste-anchors/floor.png` (24 Ko) + sa description dans `etalon.json`. La donnée
> reste (elle n'est pas dans le module) — mais on perd la **capacité de la régénérer**. Consigné
> ici pour que ce soit un choix, pas une découverte.

**🔴 SUPPRIME — 14 modules** (17 moins les 3 corrigés ci-dessus), tous re-vérifiés à zéro
référence de production : `render-integrity.ts` · `forge-agents.ts` · `agent/agent-scheduler.ts` ·
`reverse-learn.ts` · `audit-scan.ts` · `apply-brain-profile.ts` · `compare-eleves.ts` ·
`bench-coque-rigide.ts` · `stratege/raf-tom.ts` · `stratege/eleve-workflow.ts` ·
`regression/chaos-runner.ts` · `regression/probe-content-gate.ts` · `dry-run.ts` ·
`grand-chantier.ts`
**+ leurs 5 tests et entrées de manifeste** (voir ci-dessus)
**+ UI jamais montée :** `EstheteChat.jsx` · `ObserverConseil.jsx` · `StrategeGlobal.jsx`
— re-vérifiés le 2026-08-05 : **zéro référence** dans tout `ui/src`, confirmé.

**⚪ ARCHIVE** — doublons conceptuels nets et blocs tranchés au § 3 : `super-agent-builder.ts`
(+ `/api/super-agent/*`) · `council-skills-routes.ts` · `savoir/` (A1) · `stratege/` (A2) ·
`prompt-evolution.ts` · `train-loop.ts` · `auto-ablation.ts` · `veille.ts` · `radar.ts` ·
`blueprints.ts` · `tonight-specs.ts` · `mango-nuit-specs.ts` · `axioms-drift.ts` ·
`/api/billing/*` (A4)

**Règle absolue, non négociable :** rien ne part sans une branche `archive/<nom>` **et** une
ligne dans le registre 01 disant *pourquoi* et *ce qui le remplace*. Une suppression sans trace
est un défaut de processus, pas un gain de temps.

**Achevé quand :** `tsc --noEmit` vert · `npm run build` (ui/) vert · le compte de modules
re-mesuré et inscrit ici · chaque ligne retirée a sa ligne dans le registre 01.

> **Pourquoi ce lot en premier.** C'est l'**acte de sélection** que le diagnostic dit manquant,
> livré au coût le plus bas possible. Il rend aussi toute mesure ultérieure honnête : tant que
> le mort est là, « 346 modules » ne veut rien dire.

### Lot 2 — Les flags : 31 → ≤ 8 · *le Constat 1, refermé*

C'est ici qu'on referme l'écart entre **capacités théoriques** et **capacités vécues**.

1. **Mesurer avant de figer.** Chacun des 5 volets du Gardien (`ELEVE_GATE_*`), plus
   `ELEVE_CONTEXT_*`, `ELEVE_MEMOIRE`, `ELEVE_ETAT`, `ELEVE_RESUME`, `ELEVE_PLAN_V2`,
   `ELEVE_REFLEXION`, `BRAIN_FALLBACK`, `TEMPORAL_AWARENESS` : **allumé au moins une fois sur un
   vrai tour**, résultat consigné. Un gate OFF depuis des mois peut être cassé sans que personne
   le sache — c'est précisément le risque que crée la règle « un gate OFF ne change rien ».
2. **Puis figer ON en dur** ceux qui passent. Un volet qui échoue à l'allumage ouvre une ligne
   dans `limites.md` ; il ne se rallume pas en silence.
3. **Ne restent flags que les réglages CLIENT** : `BRAIN_LOCAL_ONLY` · `MANGOQA_STOP_AUTHORITY` ·
   `DESKTOP_PERIMETER` · `DESKTOP_SYSTEM_SHELL`.

**Achevé quand :** `flags.ts` compte ≤ 8 entrées, **toutes des réglages client** · chaque volet
figé ON a une trace d'exécution réussie · `tsc` + build verts.

> **Avant le socle v3, délibérément.** Construire `v3/` au-dessus de gates dont on ignore s'ils
> fonctionnent, c'est bâtir sur une inconnue et la découvrir plus tard, plus cher.

### Lot 3 — Le socle `v3/` : les équipes · 🔨 **À MOITIÉ FAIT (2026-08-06)**

La méthode arbitrée, enfin amorcée. `v3/` **appelle** l'existant ; il ne le réécrit pas.

- [x] Point de départ : `brain/brain-dispatch.ts` — la pièce que l'audit désigne comme la plus mûre. **Non réécrite d'une ligne** : `dispatchTeam` l'enveloppe (doc 03 § 4).
- [x] `brain-registry` : **16 rôles → 8** (2026-08-05), un par équipe.
- [x] Le socle existe : `server/src/v3/` — 6 modules, `test-v3-teams` **79 assertions**
      + `test-v3-parcours` **30**. **5 défauts de conception trouvés et corrigés en le
      construisant, dont aucun ne produisait d'erreur** — ils rendaient un résultat
      plausible. C'est le mode de panne contre lequel il faut écrire les tests ;
      l'exception, elle, se signale toute seule. Détail au registre 01 § L.
- [x] Les **42** outils de l'Élève sont des **membres d'équipe** — 42/42 affectés, prouvé à chaque exécution du test, jamais supposé.
- [ ] **6 concepts d'« agent » → 1** : le concept d'Équipe existe, mais les 5 autres n'ont pas été retirés.
- [ ] **Tout appel LLM du produit passe par `v3/`** — non fait : **25 fichiers** appellent `askLLM` en direct.
- [x] **Un parcours complet de bout en bout** à travers les équipes : `team-run.ts` +
      `test-v3-parcours` (**29 assertions**), déterministe et sans réseau. Il a trouvé
      **deux défauts que les tests unitaires ne pouvaient pas voir** : 🔨 Construction et
      🧠 Analyse ne se seraient jamais allumées (allumées sur des capacités que l'escalier
      ne produit pas), et sous plafond `read-only` aucune équipe ne savait lire un fichier
      du projet. Les deux sont corrigés ; détail au registre 01 § L.

> ### ⚠️ Le blocage réel du reste du lot : **deux façades pour la même place**
>
> `server/src/brain.ts` existe déjà et son en-tête annonce **le même objectif** que
> `v3/index.ts` : « à terme, tout appel de haut niveau passe par `brain(...)` ». Elle a
> **14 importateurs**. Faire converger le produit vers `v3/` sans trancher laquelle des deux
> survit reviendrait à créer la duplication que cette refonte supprime.
>
> **C'est une décision, pas une tâche** — et elle conditionne tout le reste du lot. Les deux
> ne sont pas au même niveau (`brain.ts` = transport : `dispatch`/`askLLM`/`chatEleve` ;
> `v3/` = produit : quelle équipe, quels outils, quel budget), donc la fusion est possible —
> mais il faut la vouloir explicitement.

> **Ce que le socle a appris.** Le doc 03 décrit **8** équipes, dont 📄 Extraction portée par
> `extracteur` — rôle retiré du registre la veille sur décision de Raf. Une équipe sans
> cerveau n'est pas une équipe : le socle en déclare **7**, et réaffecte les 3 compétences
> de l'Extraction plutôt que de les perdre. Un document de conception ne survit pas
> intact à une décision prise après lui ; le dire vaut mieux que coder un « 8 » creux.
>
> Deuxième leçon, plus banale et plus coûteuse : le doc annonce « les **41** outils ». Le
> compte réel est **42**. Le test l'affiche désormais à chaque exécution.

**Achevé quand :** tout appel LLM du produit passe par `v3/` · aucune capacité perdue (les
**42** outils restent joignables) · `tsc` + build verts · un parcours complet de bout en bout tourne.

### Lot 4 — Mémoire : 17 modules → 1

Le doc 05 porte déjà la conception et l'ordre de migration sans casse. Substrat unique SQLite,
un seul point de lecture : `recall(scope, query, budget)`, quatre étages (Identité · Goût ·
Savoir · Projet).

**Achevé quand :** un seul module `memory/` · aucun autre module n'écrit dans un store mémoire ·
les données existantes migrées, vérifiées, aucune perte.

### Lot 5 — Les surfaces

6 écrans → **4** · 15 outils du rail → 4 · 9 fenêtres → 2 · 8 modes → **1 curseur, 3 crans**.
Le doc 04 porte le parcours cible.

> **4 et non 3** : l'arbitrage A2 garde la couche autonome et lui impose une surface unique
> — l'écran « Ce que Mango a appris cette nuit ». Trois écrans existants conservés (Accueil,
> Atelier, Réglages) **plus celui-là**. Le registre 01 § I et § K ont été corrigés en
> conséquence : un arbitrage qui ajoute une surface doit se voir dans les chiffres cibles,
> sinon la cible ment.

**Achevé quand :** un utilisateur atteint son premier build **sans avoir choisi ni mode, ni
modèle, ni bascule.**

### Lot 6 — Les routes : 214 → ~40

En dernier, parce qu'une route meurt quand sa surface meurt. Tout ce qui reste et sert au
diagnostic va sous `/api/_debug/*`, non documenté, désactivable.

**Achevé quand :** chaque route restante est appelée par une surface du produit — vérifié, pas supposé.

### Hors chemin critique — la dette documentaire

`statut.md` a franchi son seuil (158,9 Ko). Le protocole d'allégement du 2026-07-12 s'applique :
audit de couverture → migration des orphelins vers `historique.md`/`wiki/` → compression.
**À faire, pas à faire maintenant** : ça ne bloque aucun lot.

---

## 6. Ce qu'on ne fait PAS pendant cette refonte

Même fonction que le § 4 de l'ADR-001 de MangoQA : chaque entrée est une tentation réelle,
refusée par écrit.

| Tentation | Pourquoi refusée |
|---|---|
| Réécrire un bloc « au propre » | Contredit la méthode arbitrée. `v3/` appelle, ne réécrit pas. |
| Finir `savoir/` parce que « c'est presque fait » | A1. C'est exactement le geste qui a produit 23 fonctionnalités jamais exécutées. |
| Ajouter une capacité pendant la découpe | Règle anti-rechute : elle rejoint une des 8 équipes, ou elle n'entre pas. |
| Rouvrir MangoQA (lots 2 à 6 de l'ADR-001) | § 4. Il est livrable en l'état ; il n'est plus sur le chemin critique. |
| Supprimer sans archiver | Lot 1. Une suppression sans trace tue la réversibilité, seule garantie que la découpe est sûre. |
| Toucher `limites.md`, `fondation.md`, le `wiki/` | Registre A : patrimoine, intouchable. |
| Une opération git quelconque | Règle absolue de l'atelier. Rien sans un « commit » explicite de Raf. |

---

## 7. Comment ce plan se révise

Trois portes, comme pour l'ADR-001 — et trois seulement :

1. **Une mesure contredit un arbitrage.** Le § 3 nomme pour chacun ce qui l'invaliderait.
2. **Un lot se révèle impossible tel que défini.** On réécrit sa définition d'achèvement ; on
   ne change pas l'ordre des lots.
3. **Raf décide autre chose.** C'est son produit. Mais ça s'écrit ici, daté — comme le § 4
   vient de le faire pour l'ordre de sortie.

**Tout le reste est une déviation.**
