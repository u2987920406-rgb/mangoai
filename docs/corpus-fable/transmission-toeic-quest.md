# Transmission GLM↔Fable — corrections sur TOEIC Quest (contenu réel généré par GLM)

**Périmètre.** Critique CODE-LEVEL du contenu pédagogique réellement produit par GLM-5.2 (l'Élève)
dans `workspace/toeic-quest/src/data/bank/*.gen.js` (~470 questions), confronté au moteur écrit à la
main (`curriculum.js`, `bank/index.js`, `hooks/useProgress.js`, `data/questions.js`) et au sous-ensemble
curé par un humain (`placement.js`, `debutant.js`). Ce n'est PAS un design : rien n'est conçu ici, on
relève ce que Fable corrige chez GLM. La leçon de haut niveau (spécifique-TOEIC, non-adaptatif) est déjà
dans le plan #181 §1.2 et n'est pas répétée. Constat d'ensemble à poser d'emblée : **l'anglais produit par
GLM est très majoritairement correct** ; les défauts systématiques ne sont pas de la grammaire fautive
mais des défauts de *calibrage*, d'*unicité de réponse* et de *justification* — invisibles au spot-check,
visibles seulement en comptant et en croisant avec le contrat du moteur.

---

## Corrections concrètes

### 1. Zéro question `difficulty: 3` dans TOUT le contenu GLM — le tier haut du moteur n'est jamais exercé
**Fichiers.** `debutant.gen.js`, `intermediaire.gen.js`, `avance.gen.js` (comptage : difficultés 1 et 2
uniquement — respectivement 75/69, 90/80, 49/53 ; **aucune** 3). À comparer au moteur
`data/questions.js:46` (`XP_PER_CORRECT = {1:10, 2:15, 3:25}`) et `:49`
(`DIFFICULTY_WEIGHTS = {1:0.6, 2:1.0, 3:1.6}`), et à `estimateScore` (`:64`) qui pondère par la difficulté.
Le fichier humain `placement.js` (PL-09…PL-12) EMPLOIE, lui, `difficulty: 3` — et bien (accord
neither/nor, concession `Although`, inférence).
**Fautif.** Même les modules « Avancé / grammaire piège / triple passage » (M37–M48) plafonnent à
`difficulty: 2`. Le moteur réserve son poids maximal (1.6) et son XP maximal (25) au tier 3 : le contenu de
GLM rend donc ces maxima **mécaniquement inatteignables**, et le score estimé est bridé par en haut.
**Correction.** Re-labelliser en tier 3 les items avancés réellement difficiles (double/triple passage,
lexique juridique, pièges d'accord), OU documenter que le moteur n'a que 2 tiers effectifs. La bonne cible :
GLM doit recevoir en entrée des **ancres calibrées** (« voici un exemple de 1, de 2, de 3 ») avant de tagger.
**Catégorie.** *GLM traite une échelle graduée ouverte comme un enum et se réfugie dans les valeurs basses ;
il valide la forme (le champ existe, valeur ∈ {1,2,3}) sans jamais honorer la sémantique de l'échelle.*

### 2. L'étiquette de difficulté n'est pas calibrée entre niveaux (locale, pas absolue)
**Fichier+ligne.** `avance.gen.js:191` — l'item P5-M39-G02 (lexique « conformité/compliance », niveau
Avancé) est taggé `difficulty: 1`, exactement comme les items P5-M05 débutants (`debutant.gen.js:1270` etc.).
**Fautif.** Dans `estimateScore`/`DIFFICULTY_WEIGHTS`, un « 2 » débutant et un « 2 » avancé pèsent
identiquement, alors que le second est bien plus dur. GLM a manifestement noté la difficulté *relativement
aux autres items du même lot de génération*, pas sur une échelle globale partagée avec le moteur.
**Correction.** La difficulté doit être une fonction du niveau (`level`) + de la complexité intrinsèque, pas
un rang intra-batch ; passer `level` comme contrainte de calibrage au moment du tagging.
**Catégorie.** *GLM confond difficulté LOCALE (relative au module/au lot) et difficulté ABSOLUE (échelle
globale que le moteur, lui, prend au sérieux).*

### 3. Justification pédagogique factuellement fausse pour éliminer un distracteur
**Fichier+ligne.** `avance.gen.js:200` — explication de P5-M39-G02 : « **« Quart » est un mot français** »
(pour écarter le distracteur `quart`).
**Fautif.** *Quart* est un mot **anglais** parfaitement valide (unité de volume ≈ 0,95 L). GLM a fabriqué une
justification confiante mais fausse plutôt que de choisir un distracteur propre. Un apprenant lit une contre-
vérité lexicale dans une app « d'excellence ».
**Correction.** « *quart* is an English word (a unit of liquid volume), but it doesn't fit a *time-period*
context » — ou remplacer le distracteur. La règle : ne jamais justifier par une affirmation invérifiée sur
un mot.
**Catégorie.** *Hallucination de justification — quand un distracteur est faible, GLM invente un rationnel
plausible et faux au lieu de corriger l'item.*

### 4. Item à DEUX réponses correctes, une seule acceptée (sur-généralisation d'une règle)
**Fichier+ligne.** `debutant.gen.js:1436` — P5-M06-G02 : « Ms. Tanaka _____ a meeting with the supplier
tomorrow at 10 a.m. » ; choix incluant `has` ET `will have` ; seul `will have` (answer 2) est marqué correct,
sur la logique « *tomorrow* → futur ».
**Fautif.** « Ms. Tanaka **has** a meeting tomorrow at 10 a.m. » est idiomatique et courant (présent simple
pour un rendez-vous programmé) — souvent MÊME plus naturel. La question a donc deux bonnes réponses ; un bon
élève est pénalisé.
**Correction.** Retirer `has` des distracteurs, OU choisir un marqueur qui exclut réellement le présent
programmé. Cf. aussi M06 en général : la règle « un marqueur temporel ⇒ un seul temps » y est appliquée trop
rigidement.
**Catégorie.** *GLM sur-généralise « marqueur temporel → temps unique » et ne stress-teste pas ses
distracteurs contre les lectures valides concurrentes → fausse unicité de la réponse.*

### 5. Réponse « unique » justifiée par l'usage, pas par la grammaire (item présenté comme grammatical)
**Fichier+ligne.** `debutant.gen.js:1284` — P5-M05-G04 : « Senior _____ decided to postpone… » ; seul
`management` accepté. L'explication reconnaît elle-même « « Managers » **serait possible grammaticalement** »
puis l'écarte sur « l'expression consacrée est *senior management* ».
**Fautif.** « Senior **managers** decided… » est grammatical ET fréquent. L'item se donne comme un test de
forme mais tranche sur une préférence d'usage non enseignée — même défaut structurel qu'au #4.
**Correction.** Rendre le contexte discriminant (p. ex. verbe au singulier forçant le collectif), ou retirer
`managers`.
**Catégorie.** *Fausse unicité — GLM justifie par « l'usage consacré » un choix qu'il admet grammaticalement
non-unique, tout en présentant l'item comme une question de grammaire.*

### 6. Diversité lexicale intra-module en trompe-l'œil (permutation d'un micro-ensemble)
**Fichier+lignes.** `debutant.gen.js:1226–1415` — les 10 items de M05 « Vocabulaire du bureau » ne font
permuter que **deux** lemmes : *manage/manager/management/managing* et *apply/applicant/application/applying*.
**Fautif.** Un module « vocabulaire du bureau » qui enseigne, de fait, deux mots. La couverture affichée
(10 questions) masque une couverture réelle quasi nulle. GLM confond volume et variété.
**Correction.** Contraindre la génération à N familles lexicales distinctes par module (deadline, invoice,
supplier, reimbursement…). C'est exactement ce qui a plus tard donné `genere_contenu` (#181 §1.2).
**Catégorie.** *Illusion de couverture — GLM atteint un quota en permutant un micro-ensemble plutôt qu'en
élargissant ; permutation prise pour couverture.*

### 7. Explication désalignée avec la structure réellement testée
**Fichier+lignes.** `debutant.gen.js:1938–1955` — P5-M10-G02 : blanc dans « held _____ the morning of
June 15 » ; réponse `on` (défendable : « *on the morning of* »), mais l'explication justifie par « *on* + date
précise (*on June 15*) » — elle raisonne sur un autre emplacement que le blanc réel.
**Fautif.** La réponse est bonne, mais le rationnel enseigne le mauvais mécanisme (préposition devant la date,
pas devant « the morning of »). L'apprenant retient une règle mal ancrée.
**Correction.** « *on the morning of + date* — *on* s'emploie devant *the morning/afternoon of* une date
précise. »
**Catégorie.** *Explication « template » recollée — plausible mais désalignée avec la vraie structure de
l'item ; GLM produit le bon verdict avec le mauvais raisonnement.*

### 8. Contrat de volume non honoré : `targetCount` vs contenu réel
**Fichiers.** `curriculum.js:38` (`targetCount … : 24` pour les modules non-mixtes) et le commentaire
`debutant.js:4` (« GLM enrichit ces modules jusqu'à ~24 q/module en Phase 6 »). Réel (comptage
`*.gen.js`) : ~8–12 questions/module. `bank/index.js:73` `buildSession` mélange puis tronque à `n` sans
répétition ni génération : un module rejoue donc les mêmes ~10 items à chaque tentative.
**Fautif.** Le template promet un contrat (24) que le run de génération n'a pas atteint ; combiné à
`completed = accuracy ≥ 0.7` et à l'incrément d'`attempts` (`useProgress.js:147`), la nouveauté d'un module
s'épuise en une session. Ce n'est pas une faute d'anglais de GLM, c'est un **écart contrat↔contenu** non
signalé.
**Correction.** Soit générer jusqu'au `targetCount`, soit abaisser le contrat, soit marquer le module
« léger ». Le point de méthode : un schéma strict a validé la *forme* de chaque item mais **rien** n'a
vérifié l'*agrégat* (volume par module, distribution des difficultés).
**Catégorie.** *La validation par schéma garantit la forme unitaire, jamais les propriétés d'agrégat ; GLM
(et le harnais) ne vérifient pas le contenu contre le contrat global du moteur.*

---

## Synthèse — limites systématiques de GLM révélées par ce cas

1. **Cécité au calibrage.** GLM écrit un anglais correct et sait produire du contenu objectivement difficile
   (lexique juridique, double passage), mais il est **incapable de situer sa propre production sur une échelle
   absolue** définie ailleurs (les 3 tiers de difficulté du moteur) : il note relativement à son lot et se
   réfugie dans les valeurs basses. Le tier 3 du moteur reste 100 % mort.
2. **Fausse unicité.** GLM conçoit ses QCM en supposant que sa réponse visée est la SEULE, sans éprouver ses
   distracteurs contre les lectures valides concurrentes ; il sur-généralise les règles (marqueur→un temps) et
   crée des items à réponses multiples.
3. **Justification comme rebouchage.** Face à un distracteur faible ou à un item bancal, GLM fabrique un
   rationnel confiant — parfois faux (« *quart* est français »), parfois désaligné avec ce qui est réellement
   testé — au lieu de corriger l'item.
4. **Volume ≠ couverture, forme ≠ sens.** GLM remplit un quota par permutation d'un micro-ensemble et s'appuie
   sur la validation de *forme* (schéma) comme si elle garantissait le *sens* calibré et les propriétés
   d'agrégat.

**En une phrase :** GLM produit un contenu localement correct mais globalement non calibré — il valide la
forme sans jamais vérifier que ses étiquettes, ses réponses et ses volumes tiennent sur l'échelle absolue et
face aux alternatives que le moteur, lui, prend au sérieux ; le rôle de Fable est de porter la vérification du
niveau de l'*item* à celui du *système* (calibrage cross-niveau, unicité éprouvée, agrégats contractuels).

---

## Annexe — trace de raisonnement

**Comment j'ai choisi quoi lire dans 35 fichiers sans tout lire.** Le signal le moins cher d'un comportement
*systématique* (par opposition à une bévue isolée) est une **distribution**, pas une lecture. J'ai donc
d'abord fait un unique `grep -oE` comptant `moduleId/part/difficulty/skill` sur les six fichiers de banque
d'un coup : c'est là qu'est apparu, sans lire une seule question, le fait le plus lourd du rapport —
**aucune** difficulté 3 dans tout le contenu GLM. Ensuite, principe de la revue globale MangoOS (« suivre la
donnée, pas le code ») : j'ai lu le **moteur** (`questions.js`, `useProgress.js`, `bank/index.js`) pour savoir
ce que le contenu est *censé* alimenter — c'est le moteur qui définit le contrat (poids 1.6, XP 25, tier 3) que
le contenu trahit. Puis j'ai lu `placement.js`/`debutant.js` en dernier **précisément parce qu'ils sont
écrits par un humain** : ils servent de vérité-terrain de calibrage à opposer à GLM (et c'est là que le tier 3
existe). Le contenu GLM lui-même, je l'ai échantillonné par *type d'item* (P5 grammaire d'abord, car c'est là
que l'unicité de réponse casse), pas linéairement.

**Ce qui m'a surpris.** (a) La qualité brute de l'anglais est haute — je cherchais des fautes de grammaire et
j'ai trouvé, à la place, des fautes de *méta-niveau* (calibrage, unicité, justification). Le meilleur défaut
était donc invisible à la lecture d'une question : il fallait *compter*. (b) Le contraste net humain↔GLM sur
le tier 3 : l'auteur humain démontre la difficulté 3 dans le test de placement, GLM ne la reproduit jamais
sur ~470 items — preuve que le problème n'est pas « GLM ne sait pas faire dur » (M39/M44 sont durs) mais « GLM
ne sait pas *étiqueter* le dur sur une échelle qu'on ne lui a pas ancrée ». (c) Le seul faux factuel net
(« *quart* est un mot français ») était enterré dans une explication d'un item par ailleurs correct : la
justification, et non la réponse, est le maillon faible de GLM.
