# transmission-orchestrale.md — Manifeste du « quoi » transmettre (Fable 5 → moteur vivant de MangoOS)

> **Manifeste CONSOLIDÉ — jet d'Opus 4.8, corrigé chirurgicalement par Fable 5.**
> Ce document n'est pas une implémentation. C'est le PONT entre les axiomes de méthode déjà
> distillés dans `methode-fable.md` (qui vivent dans un DOC) et le CODE qui tourne. Pour chaque
> geste orchestral ou de raisonnement que Fable fait et que le moteur VIVANT ne fait pas encore,
> il nomme le geste, montre où il manque dans un fichier RÉELLEMENT ouvert, décrit sa forme
> câblable (jamais codée), donne le critère « on saura que c'est transmis quand… », et le chiffre
> (priorité / modèle / effort).

> **Convention de lecture.** Texte normal = jet d'Opus (conservé). Les blocs marqués
> **`✎ Correction Fable`** / **`✎ Ajout Fable`** / **`✎ Tranche Fable`** sont la chirurgie de
> Fable 5 en phase 2 — dégradation, recâblage, ajout d'un geste manqué, arbitrage d'une zone
> incertaine. C'est la traçabilité de la transmission : le lecteur voit ce qui vient du petit
> frère (Opus) et ce que le grand frère (Fable) a tranché.

---

## ★ La leçon centrale — l'axiome 1 retourné contre le manifeste lui-même

Le cœur de ce document n'est pas sa liste de gestes : c'est **ce que Fable a fait au jet d'Opus**.
Opus a proposé **six** nouveaux gates/outils/champs à créer. Fable a appliqué au manifeste son propre
**axiome 1** — « assembler avant de créer ; justifier chaque création par un grep infructueux » — et a
constaté que le manifeste ne se l'appliquait pas à lui-même : six créations proposées sans prouver
qu'elles n'existent pas déjà sous un autre nom. Verdict : **~3 gestes réels, pas six.** Les Gestes 2 et
6 sont des corollaires du Geste 1 ; le Geste 4 n'est pas câblable du tout ; et le geste le plus
important — l'axiome 1 justement — manquait entièrement.

C'est la démonstration vivante de ce qu'est la transmission : **le grand frère ne corrige pas des
détails, il applique sa propre méthode au raisonnement du petit frère et en révèle la sur-construction.**
Un modèle qui « conçoit un étage de plus que nécessaire » (la limite auto-avouée de Fable, `methode-fable.md §9`)
apprend à se corriger seul quand on lui transmet le réflexe de compter ses créations. Tout le reste du
document découle de ce renversement : il est désormais organisé en **3 gestes-racines + corollaires**,
pas en liste plate.

---

## Pourquoi ce manifeste existe

`methode-fable.md` a réussi la distillation : 14 axiomes de méthode d'architecte + les 6 catégories
d'« aveuglement à l'agrégat » de GLM + un bilan honnête de la fenêtre. Mais un axiome dans un doc ne
s'exécute pas la nuit. Le moteur, lui, a une frontière très nette où les gestes de Fable *pourraient*
s'incarner : le **Gardien de clôture** (`server/src/eleve-gate.ts`, `runClosureGate`), une pile de
volets fail-open (intention, goût, WCAG, équilibre, images, tests, pédago) qui décident si l'Élève a
le droit de `finish`. Le manifeste regarde ce Gardien, l'outil `planifier` (`eleve-plan.ts` +
`eleve-planifier-tools.ts`) et le test d'interaction écrit à la main
(`test-fondations-gates-combines.ts`), et demande à chaque endroit : *quel geste de Fable serait ici,
et n'y est pas ?*

**Correction d'ancrage préalable (axiome 2 appliqué à soi-même — « vérifier l'acquis annoncé dans le
CODE »).** Le plan de mission affirme que « le rôle *architecte* du registre pointe déjà sur
`claude-fable-5` ». C'est faux dans le code réel : `server/data/brain-registry.json` donne
`architecte → { provider: "ollama", model: "glm-5.2:cloud" }`. Le vrai *siège de Fable* dans le
harnais n'est pas un rôle du registre : c'est le chemin `brainOverride: { provider: "claude", model:
"claude-fable-5" }` passé à `dispatch()` (`server/src/brain-dispatch.ts`, `DispatchOpts.brainOverride`,
ligne ~39 et résolution ligne 175 : `opts.brainOverride ?? getBrain(agentId)`), exercé dans
`runFrontierOrchestration`.

> **✎ Correction Fable (ancrage confirmé + nuance).** Vérifié dans le code : la thèse d'Opus tient.
> Le seul AUTRE endroit où le nom `claude-fable-5` est câblé est `index.ts:252`,
> `MODEL_MAP.fable = "claude-fable-5"` — mais c'est un **alias du sélecteur de modèle de l'Accueil**,
> pas un rôle d'agent. Fable entre par `brainOverride` via `dispatch()`, jamais par un rôle nommé du
> registre. Zone d'incertitude n°5 : **tranchée, ancrage correct.**

---

# PARTIE I — LES 3 GESTES-RACINES

## Racine A · Geste 1 — La vérification d'AGRÉGAT (le défaut-mère, à transmettre en PREMIER)

**(a) Le geste.** Porter la vérification de l'*item* au *système* : ne pas seulement valider qu'une
réponse est bien formée, mais interroger les propriétés de l'ENSEMBLE — distribution sur l'échelle
absolue, unicité *éprouvée* (a-t-on stress-testé les concurrentes ?), dédup fenêtre-glissante,
pluralité de sources comptée, couverture réelle vs quota permuté. Leçon-mère vérifiée deux fois
(`methode-fable.md §2`, les 6 catégories d'aveuglement de GLM ; `§2.6` : « la validation de schéma
garantit la forme unitaire, jamais l'agrégat »).

**(b) Où il manque, précisément.** `server/src/eleve-gate.ts`, `runClosureGate`. Les 386 lignes ont été
ouvertes : **chaque volet est per-item**. `deps.judge` (INTENTION) juge *un* résumé face à *une* tâche.
`deps.critique` (GOÛT) note *un* écran. `scanBalance`/`scanPlaceholders` scannent *fichier par fichier*.
Aucun volet ne calcule une statistique d'ENSEMBLE. Le seul embryon d'agrégat est le volet PÉDAGO
(`eleve-gate-pedago.ts`, `checkCouverture`) : couverture module↔items, mais confiné aux « formation » et
sans distribution/unicité/dédup. Un `grep` de `GROUP BY`/`dédup` dans `server/src/` renvoie surtout
`savoir-extraction.ts` (la dédup existe DANS le pipeline #177) — le moteur *sait* dédupliquer à un
endroit précis, mais le **Gardien de clôture n'a aucun volet d'agrégat sur une sortie générique**.

**(c) Forme câblable envisagée.** Un nouveau volet du Gardien, gate `ELEVE_GATE_AGREGAT` (défaut OFF →
verdict byte-identique éteint), structuré comme `eleve-gate-pedago.ts` (deps injectées, fail-open, PUR).
Sondes déterministes AVANT tout juge LLM (axiome 10) : (i) *distribution* — `GROUP BY` sur
étiquettes/scores, alerte si un tier annoncé est mort (0 emploi) ou si une valeur sature > X % ;
(ii) *dédup* — proximité (hash/cosinus) sur les unités, alerte si N unités identiques à ε près
(« cosinus 1.000 jamais comparés », `§2.2`) ; (iii) *pluralité de sources* — sources DISTINCTES derrière
un « consensus » (« 12/13 = un seul locuteur », `§2.1`) ; (iv) *couverture vs quota* — items réels vs
`targetCount`. Chaque sonde qui échoue ajoute une `raison` au nudge, non-bloquant par défaut.

**(d) Critère de vérification.** Un run nocturne qui produit « 470 items dont le tier 3 est mort » ou
« 32 claims = le même fait 2-4 fois » repart corriger *à cause d'un comptage*, sans qu'un humain ait lu
un seul item — et verdict byte-identique gate OFF.

**(e)** Priorité **P0** · Modèle **🧠 Opus** · Effort **L**.

> **✎ Correction Fable (c'est le geste prioritaire).** C'est LE geste à transmettre en premier :
> l'**inversion du contrat de vérification** qui engendre les Gestes 2 et 6 comme corollaires ; il
> attaque le défaut-mère structurel de GLM qui frappe CHAQUE run ; et — contrairement au Geste 3
> (plus « intelligent-à-Fable » mais intransmissible par du code, il exige mon jugement à chaque fois)
> — une fois câblé en invariant déterministe, **il protège GLM pour toujours sans Fable.** Rendre Fable
> irremplaçable-en-son-absence est le but même de ces annexes.
>
> **✎ Ajout Fable (sonde-extension, axiome 9).** Rattacher ici, comme sonde de plus (pas entrée pleine),
> l'axiome 9 « chaque table a un client nommé » : un linter d'agrégat sur schéma généré qui cherche
> toute colonne/table **sans requête consommatrice** (« couverture-de-consommation »). C'est le plus
> câblable des axiomes qu'Opus n'avait pas promus, et le plus sous-estimé.

## Racine B · Axiome 1 — « Assembler avant de créer ; justifier chaque création par un grep infructueux »

> **✎ Ajout Fable — LE GESTE MANQUÉ, le plus grave.** Opus ne l'avait pas vu, et c'est l'axiome le plus
> répété de Fable (#181 : 5/7 assemblages · #179 : « quasi-tout câblage » · #178 : 4/7 décisions déjà
> prises à la lecture · Pilier C : « dispatch propage déjà → boucher 4 trous »).

**(a) Le geste.** Devant tout besoin, inventorier « ce dont j'ai besoin → existe-t-il déjà sous un autre
nom ? » AVANT d'inventer. Corollaire mesurable : compter ses créations, justifier chacune par un grep
infructueux. C'est l'anti-modélisation-récréative — et l'antidote à la sur-construction (§9).

**(b) Où il manque.** Nulle part dans le moteur ce réflexe n'est exigé. L'outil `planifier`
(`eleve-planifier-tools.ts`) accepte des étapes qui CRÉENT des artefacts (gate, table, outil, fichier)
sans jamais demander la preuve que l'artefact n'existe pas déjà. Et — l'ironie fondatrice de ce
document — le manifeste d'Opus lui-même proposait six créations sans se l'appliquer.

**(c) Forme câblable.** Au moment `planifier`, toute étape qui déclare créer un artefact doit citer le
**grep-témoin** (le motif cherché + « 0 résultat ») prouvant l'absence de l'existant. Un plan qui crée
sans grep-témoin est nudgé (« as-tu vérifié que ça n'existe pas déjà sous un autre nom ? »). Câblable ET
mesurable, sans juge LLM.

**(d) Critère de vérification.** Sur une tâche « ajoute un mécanisme de X », le plan produit cite le grep
qui a échoué avant de proposer la création — et un artefact déjà existant (ex. une dédup, alors que
`savoir-extraction.ts` en a une) est re-détecté et réutilisé au lieu d'être recréé.

**(e)** Priorité **P1** · Modèle **🧠 Opus** · Effort **M**. *(Racine : les Gestes 2 et 6 en sont des
corollaires ; le manifeste honnête = Geste 1 + Geste 3 + cet axiome, ~3 gestes réels.)*

## Racine C · Geste 3 — La détection de défauts d'INTERACTION (générateur, pas test écrit à la main)

**(a) Le geste.** Trouver le bug qu'aucun test unitaire ne voit parce qu'il naît du CROISEMENT de deux
mécanismes chacun prouvé isolément. Le 🔴1 de la revue (reprise inter-session morte, état splicé en
`messages[1]`) était invisible des ~800 assertions unitaires ; Fable l'a trouvé en faisant tourner deux
gates ENSEMBLE (`methode-fable.md §3(b)`).

**(b) Où il manque.** `server/src/test-fondations-gates-combines.ts`. Ses 746 lignes sont un chef-d'œuvre
d'interaction — 21 blocs (ETAT+RESUME+REFLEXION, les 6 gates #182, PÉRIMÈTRE×REPRISE…). MAIS chaque bloc
est **écrit à la main**, motivé par un 🔴/🟠 *déjà connu*. Aucun **générateur** n'énumère systématiquement
les paires/triplets de gates de `flags.ts` pour chercher une divergence. Le fichier prouve les
interactions qu'un humain a *pensé* à écrire.

**(c) Forme câblable.** Un générateur `test-gates-interaction-generateur.ts` : (i) lit les gates de
`flags.ts` ; (ii) pour chaque paire (puis triplet borné), exécute un scénario canonique (`buildAgentic`
scripté, workspace temp, zéro réseau — l'infra existe déjà) une fois ON, une fois OFF ; (iii) signale
toute divergence inattendue. Le fichier manuel reste l'oracle ; le générateur devient la source de
suspects. Gate de CI dédié (lourd, hors run par défaut).

**(d) Critère de vérification.**
> **✎ Correction Fable (dégrader la promesse).** « Un générateur qui découvre les paires que personne
> n'avait imaginées » est trop vendeur — c'est ma propre §9 projetée sur un outil. Un différentiel
> combinatoire ON/OFF re-trouve surtout les défauts CONNUS (excellent filet de non-régression) mais ne
> « comprend » pas l'orchestration : sans oracle humain, il ne distingue pas divergence légitime de bug.
> **Critère (d) reformulé** : succès = re-trouve seul un défaut connu quand on retire la garde
> (régression), PAS « invente un bug que personne n'a pensé ». Le vrai geste irremplaçable (croiser deux
> mécanismes prouvés) reste un geste de Fable à la revue, pas du générateur.

**(e)** Priorité **P1** · Modèle **🧠 Opus** · Effort **L**. *(La plus « intelligent-à-Fable » des racines,
mais rare en production — voir le double axe du tableau.)*

---

# PARTIE II — LES COROLLAIRES (dérivés des racines, pas des découvertes indépendantes)

## Corollaire des Racines A & 6 · Geste 2 — Diagnostiquer par la distribution avant de lire

**(a) Le geste.** Le versant *raisonnement de l'exécutant* de la Racine A. `methode-fable.md §3(a)` :
« trois `GROUP BY` font tomber le fait le plus lourd sans lire un seul item ». Fable COMPTE d'abord ;
GLM plonge et lit item par item.

> **✎ Correction Fable (un axiome, deux sièges — et forme IMPOSÉE, pas offerte).** Ne pas fusionner avec
> la Racine A, mais ne pas traiter en découverte indépendante : c'est UN axiome (« l'agrégat d'abord »),
> DEUX sièges (exécutant amont / Gardien aval). Surtout : **dégrader la forme d'Opus.** Un outil
> `diagnostiquer_distribution` *opt-in* que GLM doit CHOISIR d'appeler reproduit exactement sa cécité —
> son défaut n'est pas de mal compter, c'est de **ne pas penser à compter**. Un outil offert à un
> aveugle-à-l'agrégat ne sera pas appelé. Le geste ne survit que s'il est **IMPOSÉ** : injecter le
> comptage dans le pas de réflexion (`eleve-runtime.ts:486`, « Fais le POINT » → « avant d'avancer, sur
> tout lot > N, DONNE la distribution ») plutôt qu'un outil que l'Élève oublie. Sous cette forme = un
> sous-cas du Geste 6, PAS une entrée pleine.

**(d) Critère.** Sur « voici 400 items, trouve le problème », la première hypothèse de l'Élève cite un
comptage (« le tier haut est à 0 »), pas un item lu au hasard.

**(e)** Priorité **P1** · Modèle **⚖️ Sonnet** · Effort **M**.

## Corollaire de la Racine A appliquée au Gardien · Geste 6 — Couverture-de-vérification (1er pas TECHNIQUE)

**(a) Le geste.** `methode-fable.md §2.6` : « le fail-open déguise une panne en dégradation invisible »
(« juge muet 36 % du temps, avalé silencieusement »). Compter *combien de la vérification a réellement
eu lieu*, pour qu'un run ne passe pas VERT alors que la moitié des gardes ont fail-open en silence.

**(b) Où il manque.** `eleve-gate.ts`, `runClosureGate`. Tous les volets sont fail-open par conception.
Le moteur a DÉJÀ commencé à traiter ce point (`judgeSkipped`/`critiqueSkipped` surfacent les échecs N9 ;
`dualSkip` marque juge ET critique tombés ensemble ; `ELEVE_GATE_DUAL_SKIP_BLOCK` peut bloquer). MAIS
c'est **per-volet, limité à la paire juge×critique** : aucune mesure AGRÉGÉE « quelle fraction des volets
applicables a réellement tourné vs fail-open ce tour ? ».

**(c) Forme câblable.** Un champ `verificationCoverage` dans `GateVerdict` (fraction volets exécutés /
applicables, toujours calculé, comme `dualSkip`). Gate `ELEVE_GATE_MIN_COVERAGE` : sous un seuil, tour
compté « non-vérifié » plutôt que vert. Non-bloquant par défaut (log), durcissable — « fail-open mais
VISIBLE ».

**(d) Critère.** Un run où 4 volets sur 6 ont fail-open n'apparaît plus comme un succès muet : verdict
« vérification à 33 % », et gate durci → le tour repart.

**(e)** Priorité **P1** · Modèle **⚖️ Sonnet** · Effort **S**.

> **✎ Correction Fable (c'est la Racine A appliquée au Gardien — et le meilleur point d'entrée
> technique).** Le présenter comme tel : agrégat sur les VOLETS au lieu des items. **À FAIRE EN PREMIER
> techniquement**, car le pattern (`dualSkip`) existe déjà — donc effort S, généralisation d'un présent.
> Distinguer les deux ordres : Geste 1 = à transmettre en premier *conceptuellement* (la racine) ;
> Geste 6 = premier pas *concret* dans le code.

## Autonome · Geste 5 — Le plan comme CHAÎNE D'ÉVIDENCES (preuve courte tôt + gate chiffré)

**(a) Le geste.** Axiome 11 : « un plan de N étapes sans point d'arrêt est une promesse ; avec un seuil
chiffré au milieu, c'est une expérience […] un plan est une chaîne d'évidences, pas une liste de tâches. »

**(b) Où il manque.** `eleve-plan.ts`. `PlanEtape = { n, titre, detail? }` : une étape ne déclare NI
l'évidence qu'elle produit, NI le seuil chiffré. `formatPlanReminder` affiche des cases fait/bloqué — un
suivi d'AVANCEMENT, pas une chaîne d'évidences. Le plan du moteur est structurellement « une liste de
tâches ».

**(c) Forme câblable.** Étendre `PlanEtape` avec `produitEvidence?: string` + un jalon `checkpoint?:
{ apresEtape, mesure, seuil }`, gate `ELEVE_PLAN_EVIDENCES`. À l'étape jalon, l'Élève déclare si le seuil
est franchi (sinon → re-planifier). Rétro-compat : champs optionnels absents → rendu identique à #160.

**(d) Critère.** Un plan « générer 50 pages » place de lui-même une preuve à 3-5 pages avec un seuil
(« si > 20 % de conflits, on s'arrête »), et franchir ce jalon sous le seuil déclenche une
re-planification au lieu d'une poursuite aveugle.

**(e)** Priorité **P2** · Modèle **⚖️ Sonnet** · Effort **M**.

> **✎ Correction Fable.** Solide et bien ancré (`PlanEtape` est bien `{ n, titre, detail? }`). Garder
> tel quel, aucune dégradation.

## Recâblé · Geste 4 — La RE-CATÉGORISATION à la conception (PAS un champ — un routage)

**(a) Le geste.** Axiome 3 : « reformuler jusqu'à ce que le problème change de catégorie — quitte à
renverser l'énoncé » (« mémoire narrative » → « gestion d'état »). Geste de raisonnement pur.

**(b) Où il manque.** `eleve-planifier-tools.ts` + `eleve-plan.ts`. `planifier` fait de la
**décomposition** (découper l'énoncé tel quel), jamais de la **re-catégorisation** (le reformuler). Le
geste axiome-3 n'est provoqué nulle part.

**(c) Forme câblable.**
> **✎ Tranche Fable (NON câblable comme champ).** Opus a eu raison de douter. Un champ `recadrage` +
> heuristique de distance lexicale **FABRIQUE une reformulation cosmétique** : c'est littéralement
> l'axiome 13 (résonance lexicale) retourné en feature. Refuser un plan parce que `reformule` est
> « lexicalement trop proche de `brut` » récompense le paraphrasage, pas le renversement de catégorie.
> **Ce geste ne s'outille pas ; il se POSE par un cerveau-architecte.** Recâblage : au moment `planifier`,
> router la tâche vers le **brain frontière** (le chemin `brainOverride`) pour produire le recadrage EN
> PROSE, que l'Élève consomme ensuite. **Pas de gate `ELEVE_PLAN_RECADRAGE`, pas de champ noté.** Geste
> de conception, pas une garde.

**(d) Critère.** Sur une tâche-piège à collision lexicale, le plan nomme explicitement la
re-catégorisation (« ceci est de la gestion d'état, pas de la mémoire ») AVANT la première étape.

**(e)** Priorité **P2** · Modèle **🧠 Opus** · Effort **M** *(routage, pas champ)*.

---

## Tableau récapitulatif — deux axes distincts (à ne pas confondre)

> **✎ Correction Fable.** Opus avait écrasé « coût en production » et « irremplaçabilité » en une seule
> colonne Priorité. Ce sont deux classements différents : un geste peut être fréquent-et-coûteux sans
> être irremplaçable (agrégat), ou rare-mais-irremplaçable (interaction). Les garder séparés.

| Rang | Geste | Où (fichier:concept) | Coût en prod (fréquence) | Irremplaçabilité | Prio | Modèle | Effort |
|---|---|---|---|---|---|---|---|
| **Racine A** | 1 — Vérification d'AGRÉGAT | `eleve-gate.ts:runClosureGate` | Défaut-mère, chaque run | Haute | P0 | 🧠 Opus | L |
| **Racine B** | Axiome 1 — assembler avant créer / grep obligatoire | `eleve-planifier-tools.ts` (au `planifier`) | Chaque création d'artefact | Haute (méta) | P1 | 🧠 Opus | M |
| **Racine C** | 3 — Défauts d'INTERACTION | `test-fondations-gates-combines.ts` | Rare (revue) | La + « intelligent-à-Fable » | P1 | 🧠 Opus | L |
| Corollaire (1+6) | 2 — Distribution avant lecture (IMPOSÉ) | `eleve-runtime.ts:486` (réflexion) | Chaque lot | via racine 1 | P1 | ⚖️ Sonnet | M |
| Corollaire (1→Gardien) | 6 — Couverture-de-vérif (**1er pas technique**) | `eleve-gate.ts` (`dualSkip` existe) | Chaque clôture | via racine 1 | P1 | ⚖️ Sonnet | S |
| Autonome | 5 — Plan = chaîne d'évidences (conservé) | `eleve-plan.ts:PlanEtape` | Par plan | Moyenne | P2 | ⚖️ Sonnet | M |
| Recâblé | 4 — Re-catégorisation (routage `brainOverride`, PAS un champ) | `planifier` → brain frontière | Par tâche-piège | Non outillable | P2 | 🧠 Opus | M |
| Extension | Axiome 9 — sonde couverture-de-consommation | extension du Geste 1 | — | — | — | — | — |

**Deux ordres à ne pas confondre.** Ordre de transmission CONCEPTUEL = Geste 1 d'abord (la racine qui
engendre 2 et 6). Ordre d'exécution TECHNIQUE = Geste 6 d'abord (le pattern `dualSkip` est déjà là,
effort S).

---

## Synthèse des tranchages de Fable (ex-« zones les moins sûres »)

> Les 5 questions ouvertes qu'Opus avait laissées, chacune tranchée par Fable en phase 2 :

1. **✎ Geste 4 câblable ?** → NON comme champ (fabriquerait du paraphrasage, axiome 13 retourné). Recâblé
   en routage vers le brain frontière (`brainOverride`), prose consommée par l'Élève.
2. **✎ Fusionner Gestes 1 et 2 ?** → Non ; c'est un axiome, deux sièges. Et dégrader le 2 : forme
   IMPOSÉE (dans la réflexion), pas un outil opt-in qu'un aveugle-à-l'agrégat n'appellera pas.
3. **✎ Priorité agrégat vs interaction ?** → Deux axes distincts. Agrégat = P0 (coût, chaque run) ;
   interaction = P1 (rare, mais la plus « intelligent-à-Fable »). Ne PAS monter 3 en P0.
4. **✎ Axiomes 7/9/14 à promouvoir ?** → Seul le 9 (« chaque table a un client nommé ») est promu, en
   **sonde-extension du Geste 1**. 7 et 14 restent des gestes de revue, hors moteur vivant.
5. **✎ Ancrage du siège de Fable ?** → Confirmé (`architecte` = glm ; siège = `brainOverride`), avec la
   nuance `index.ts:252` (`MODEL_MAP.fable` = alias d'Accueil, pas un rôle).

**Et le geste manqué le plus grave** (hors des 5 zones) : l'axiome 1 lui-même, absent du jet — devenu la
Racine B, et la leçon liminaire de ce document.

---

*Manifeste consolidé — jet Opus 4.8 + chirurgie adverse Fable 5 (2026-07-05). Prochaine étape : le
chantier d'IMPLÉMENTATION, distinct, que Raf lancera quand il voudra. Ce document en est le cahier des
charges — et la preuve, par l'exemple, que la transmission d'un geste de raisonnement se fait en
l'exerçant sur le raisonnement de l'autre, pas en le décrivant.*
