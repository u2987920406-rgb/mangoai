# Transmission GLM↔Fable — corrections sur l'exécution réelle de #177 (base savoir-vidéo)

**Périmètre.** Critique de l'EXÉCUTION réelle du pipeline É1→É4 de mon plan #177 sur 3 vidéos
YouTube réelles (1 FR de commentaire géopolitique-IA de Raf, 2 EN de « harness engineering »),
telle qu'elle vit dans `server/data/savoir/agentic-harness/savoir.db` : 275 claims canon, 244 groupes,
verdicts **13 consensus + 1 conditionnel + 0 désaccord + 230 isolé** (8/22 groupes multi-claims muets).
Rien n'est conçu ici : on relève ce que GLM (extracteur) et qwen3.5:cloud (juge) ont réellement produit,
confronté au contrat de mon propre plan (D2/D3/D5). Le taux de rejet global (34 %, cause = dédup
fenêtre-glissante manquante) est **déjà** consigné (`limites.md` L78) et n'est PAS re-découvert ici — ma
valeur ajoutée est ailleurs. Constat d'ensemble à poser d'emblée : **le pipeline s'est exécuté sans lever,
le fail-open a tenu, et pourtant la base ne prouve rien de ce que le plan promettait** (« 1 contradiction
réelle réconciliée ») — 0 désaccord, un seul vrai consensus cross-vidéo. Les défauts ne sont pas des crashs :
ce sont des propriétés d'AGRÉGAT non gardées, invisibles au spot-check, visibles seulement en comptant et en
recalculant les similarités.

---

## Corrections concrètes

### 1. Duplication d'extraction non dédupliquée : 32 claims sont la MÊME phrase extraite 2 à 4 fois
**Code + contenu.** `savoir-extraction.ts:78-81` (`windowSegments` — chevauchement d'UN segment entre
fenêtres consécutives) fait que le segment-frontière est présenté DEUX fois à GLM ; GLM le ré-extrait à
chaque passage. **Rien** ne déduplique ensuite par `(video_id, extrait)` avant le clustering. Comptage réel :
**16 buckets de duplicata (même vidéo, extrait identique) couvrant 32 claims.**
**Table + id.** G3 (`c12` = `c14`, énoncé ET extrait strictement identiques), G24 (`c24` = `c27`), G4
(`c13`/`c15`), G38 (`c39`/`c42`, cosinus 0.984), G62 (`c56`/`c58`, 0.966), G64 (`c69`/`c71`/`c89`/`c91`).
**Fautif.** Le verbatim (D5) a validé chacun — ils SONT dans le transcript — mais D5 borne la *précision*,
jamais l'*unicité*. La base compte donc 4 claims « Anthropic a scindé ses offres le 15 juin » là où il y a
UN fait dit une fois.
**Correction.** Dédup déterministe `(video_id, normalize(extrait))` en fin d'extraction (avant écriture
`candidat`), OU faire porter le chevauchement au fenêtrage sans ré-émission (marquer les segments déjà
couverts). C'est un garde-fou d'agrégat, pas de forme.
**Catégorie.** *GLM traite chaque fenêtre indépendamment et ré-émet le segment partagé ; le pipeline ne
distingue pas « le même fait redit » de « un nouveau fait » — redondance prise pour matière.*

### 2. « Consensus » ne sépare pas mono-vidéo et cross-vidéo : 12 des 13 consensus sont intra-locuteur
**Code + décision juge.** `savoir-reconcile.ts:326` calcule `distinctVideos` mais ne s'en sert qu'au **poids**
(`:386`, `min(3, distinctVideos)`), jamais au **verdict** ; et `JUGE_SYSTEM` ne signale pas au juge qu'un
groupe peut être mono-source. Résultat mesuré : **consensus mono-vidéo = 12, cross-vidéo = 1.**
**Table + id.** Seul **G70** (`c155` v2 + `c222` v3) est un vrai consensus entre deux sources. G3/G16/G24/
G51/G55/G60/G76/G94/G95/G134/G148/G238 concordent parce qu'un SEUL locuteur se répète (ou s'auto-duplique,
cf. #1). Les résumés du juge le trahissent : « les deux affirmations **issues de la même source**
concordent » (G76, G95).
**Fautif.** Le plan (D3) définit `consensus` = « formulations concordantes [de plusieurs vidéos] », poids =
« f(nb vidéos concordantes) ». Un locuteur d'accord avec lui-même n'est pas un consensus de corpus : le
chiffre « 13 consensus » gonfle de 1200 % le vrai signal cross-source.
**Correction.** Un groupe mono-vidéo ne peut pas obtenir `consensus` — soit `isole`/`restatement`, soit le
prompt du juge reçoit explicitement « attention : toutes ces affirmations viennent de la MÊME vidéo ».
**Catégorie.** *Le juge classe la concordance textuelle sans jamais compter les SOURCES ; le harnais expose
un « consensus » qui n'atteste que la redondance d'un seul locuteur.*

### 3. La corruption de sous-titres a fui dans le champ `extrait` : 32 claims canon portent un verbatim « X X X » triplé
**Code.** `savoir-transcript.ts:156-167` déduplique uniquement les cues **exactement identiques**
(`texte !== last`) — or le commentaire `:151-152` décrit lui-même le vrai piège (« chaque ligne est répétée à
la cue suivante **avec un mot de plus** », style *rolling*). Ces cues progressives ne sont jamais égales, donc
jamais dédupliquées ; `resegmentCues` les concatène ensuite en un segment de 400-700 car → le verbatim stocké
devient « `skills make work repeatable, but they do skills make work repeatable, but they do skills make…` ».
**Table + id.** 32 claims touchés — `c159`, `c230`, `c254`, `c257`, `c260`, `c261`, `c263`, `c271`… (surtout
la vidéo 3). Exemple net `c159.extrait` = « `It is not the case that these agents It is not the case that these
agents It is not the case that these agents don't know…` ».
**Fautif.** D5 fait de l'`extrait` l'**ancre de provenance déterministe** — « l'URL horodatée tombe sur le
passage, vérifiable à la main ». Pour ces 32, l'ancre est du charabia ; la vérification `extrait ∈ segment` a
réussi *uniquement parce que le segment lui-même est corrompu*. Garbage-in a franchi le garde-fou. C'est un
angle distinct de L78 (qui mesure le taux de REJET) : ici ce sont des claims **acceptés et promus canon** dont
la citation est fausse.
**Correction.** Étendre la dédup VTT au cas *rolling* : si `texte.startsWith(last)` (ou `last.startsWith` /
plus-long-préfixe-commun ≥ N mots), garder la cue la PLUS longue et écraser la précédente, plutôt que de
tester l'égalité stricte. À faire dans `parseVtt` avant `resegmentCues`.
**Catégorie.** *Un invariant déterministe (verbatim ∈ segment) ne vaut que ce que vaut sa référence : quand la
source est corrompue en amont, la vérification atteste une corruption au lieu de l'arrêter.*

### 4. Juge muet sur 8/22 groupes (36 %) : le fail-open masque un tiers de l'arbitrage, sans retry ni diagnostic
**Code + infra.** `savoir-reconcile.ts:337-346` : un seul `dispatch("juge", …)`, `catch → ""`, puis
`judgeSilent++` et fail-open `isole` poids 0.5. Le journal confirme `judgeSilent: 8` sur `judged: 22`.
**Table + id.** Les 8 groupes muets (G4, G38, G62, G64, G79, G90, G112, G130) sont pour la plupart des
duplicata triviaux (#1) qui auraient dû être `consensus`/dédupliqués — ils finissent `isole` poids 0.5, donc
**sous-pondérés**.
**Fautif.** 36 % de silence est trop élevé pour du bruit LLM ponctuel : cela sent l'infra (timeout /
qwen3.5:cloud renvoyant vide) plus que le prompt. Or le code ne distingue pas `status != "ok"` d'un `summary`
vide, ne réessaie pas, et ne journalise pas la raison — on ne PEUT pas diagnostiquer après coup (j'ai dû le
déduire du ratio). Le fail-open est correct (rien n'est perdu, la passe est re-jouable) mais il **avale
silencieusement** un tiers du travail du juge.
**Correction.** Un retry avec backoff sur dispatch muet AVANT le fail-open ; logguer `{groupeId, status,
len(summary)}` dans `savoir_journal` pour rendre le silence observable ; alerter si `judgeSilent/judged`
dépasse un seuil (~15 %) — exactement l'esprit du gate de décision D4.
**Catégorie.** *Robustesse : le fail-open transforme une panne d'infra en dégradation invisible ; sans retry
ni trace, un défaut systématique se déguise en « source unique ».*

### 5. Le sujet-AND-gate + le tagging `sujet` incohérent de GLM séparent des claims identiques et éclatent les thèmes cross-vidéo
**Code + contenu.** `savoir-reconcile.ts:102-109` (`clusterClaims`) *bucketise d'abord par sujet canonique*,
PUIS cluster par embedding À L'INTÉRIEUR du bucket. Le regroupement est donc commandé par `sujet` — un champ
**libre et bruité de GLM**. Preuve terminale : `c257` et `c258` sont la **même phrase** (« Skills make work
repeatable but do not prove that the work succeeded », cosinus **1.000**) mais GLM a taggé l'une `harnais` et
l'autre `agents IA` → buckets différents → jamais comparées → **2 isolés**.
**Table + id.** Fragmentation massive : « harness » éclaté en `harnais` (44) / `Harnet agentique` (7) [
« Harnet » = mé-transcription de *harness* que `entites` (94) n'a pas absorbée] ; le thème « modèles chinois »
dispersé sur ≥ 8 sujets (`GLM`, `Modèles chinois`, `Modèle ouvert chinois`, `Jeunes pousses américaines`,
`Marché des modèles IA`, `Intégration de modèles`, `Architectures chinoises`…) avec des paires inter-sujets à
0.80-0.84 jamais regroupées. Mesure décisive : **0 paire v2×v3 ≥ 0.80** alors que ce sont deux vidéos sur le
MÊME sujet (harness engineering) — le moteur cross-vidéo n'a rien pu relier.
**Fautif.** L'AND strict (même `sujet` ET cosinus) donne à un label bruité un droit de veto sur le
regroupement sémantique. Mon plan (5.5.5) désignait le seuil 0.78 comme le risque ; le vrai risque était le
GATE lui-même, pas sa valeur.
**Correction.** Cluster par embedding SEUL puis dériver l'étiquette de sujet du cluster ; OU passer à un
OR-gate (même sujet OU cosinus très élevé ≥ ~0.90) pour rattraper les cas identiques mal étiquetés ; OU
pré-fusionner les sujets par similarité d'entités avant le bucketing.
**Catégorie.** *GLM étiquette `sujet` de façon instable ; le clustering en fait la clé primaire de
regroupement → le bruit d'étiquetage fragmente le savoir et bloque précisément le recoupement cross-vidéo qui
est la raison d'être de la base.*

### 6. Le seul conditionnel (G138) sur-généralise l'arbitrage et fabrique une « condition » non-queryable
**Code + décision juge.** `savoir-reconcile.ts:393-395` applique la MÊME `arbitrage` (condition discriminante)
à CHAQUE claim du groupe, indistinctement.
**Table + id.** G138 : le juge estampille la condition « distinction entre compétence technique de production
de code et compréhension contextuelle du travail d'équipe » sur les 3 claims — y compris `c124` (« best
practices not yet fully known ») qui ne porte AUCUNE condition de ce type. De plus `c159`, dont l'énoncé est
incohérent (il AFFIRME « agents know how to write high-quality software » quand `c145` affirme l'inverse — et
son extrait est corrompu, cf. #3), est « réconcilié » comme s'il était propre.
**Fautif.** D3 attendait une condition *discriminante et opérationnelle* (façon « en portrait » vs « en
paysage ») : ici c'est une **méta-description abstraite** du désaccord, inutilisable comme filtre de requête, et
plaquée uniformément. Le juge a donc « résolu » une contradiction dont l'un des termes est un artefact
d'extraction.
**Correction.** Le juge doit rattacher la condition au(x) claim(s) concerné(s), pas au groupe entier ; et un
claim au verbatim corrompu (#3) ne devrait pas atteindre l'arbitrage. `changes.conditions` ne doit s'appliquer
qu'aux claims que le juge nomme.
**Catégorie.** *Le juge produit un verdict plausible sur un groupe partiellement défectueux et sur-généralise
une condition unique — bon verdict de surface, discrimination réelle absente.*

### 7. Corpus pilote inadapté à la preuve : 0 désaccord, 89 % de singletons, quasi aucun recoupement
**Exécution / méthode.** Mon plan D4 exigeait « 3 vidéos où une contradiction EXISTE ». Le corpus réel = 1
vidéo FR de commentaire géopolitique-IA + 2 vidéos EN de harness engineering : elles **ne se répondent pas**.
Mesures : 244 groupes pour 275 claims (**89 % de singletons**), verdicts **0 désaccord**, **1 seul consensus
cross-vidéo**. Le verdict `desaccord` — le mécanisme différenciant de tout le chantier, celui qui « conserve
les deux écoles » — n'a **jamais été exercé**.
**Fautif.** Le moteur de réconciliation n'a rien réconcilié de contradictoire : il a surtout dédupliqué un
seul locuteur (v1) et listé des affirmations parallèles. La « preuve » É4 est passée mécaniquement (base
peuplée, provenances cliquables) sans démontrer la capacité qui justifie l'architecture.
**Correction.** Rejouer la preuve sur un corpus où la contradiction est garantie (p. ex. 3 vidéos « RAW vs
JPEG » ou « agents autonomes : pour/contre ») AVANT d'industrialiser (É5+). C'est exactement le gate D4 :
sans désaccord réel réconcilié, on ne franchit pas.
**Catégorie.** *Preuve mal cadrée : le jeu de test n'exerce pas la capacité différenciante (le désaccord) ;
« la base se remplit » ≠ « la réconciliation fonctionne ».*

### 8. Claims non-autoportants : déixis du transcript non résolue
**Contenu (GLM).** D5 exige un `enonce` « compréhensible seul ». GLM recopie la déixis de la parole.
**Table + id.** `c188` « **The speaker** has started applying **certain techniques** to their open source work »
(qui ? quelles techniques ?) ; `c187` « some of **these** harness techniques » ; `c214.extrait` « **this**
alone is also not enough ». Ces claims ne sont pas interrogeables hors contexte.
**Correction.** Contraindre l'extraction à résoudre les référents (« the speaker » → nommer, « these
techniques » → expliciter) ou rejeter les énoncés à déixis non résolue.
**Catégorie.** *GLM produit un énoncé localement fidèle mais dépendant du contexte oral — forme valide, autonomie
absente.*

---

## Synthèse — limites systématiques révélées (extraction + jugement)

1. **GLM ne garde aucune propriété d'agrégat.** Chaque fenêtre est traitée isolément : il ré-émet le segment
   partagé (32 doublons), étiquette `sujet` de façon instable (phrases identiques sous deux sujets), et recopie
   la déixis orale. Ses sorties sont *unitairement fidèles* (verbatim exact, JSON valide) et *globalement non
   dédupliquées, non-clés, non-autonomes* — la même famille d'échec que le cas TOEIC (forme validée, agrégat
   jamais vérifié).
2. **qwen3.5 confond concordance textuelle et pluralité de sources.** Il ne compte pas les vidéos : 12 de ses 13
   « consensus » sont un locuteur d'accord avec lui-même. Quand il arbitre (le seul conditionnel), il
   sur-généralise une condition abstraite sur tout le groupe, y compris un claim défectueux.
3. **Le juge est fragile en volume** : muet 36 % du temps, sans retry ni trace — le fail-open déguise une panne
   probable d'infra en « source unique » sous-pondérée.
4. **L'invariant verbatim (ma décision la plus sûre en conception) est plus faible qu'annoncé** : il atteste que
   l'extrait est dans le segment, pas que le segment est propre. Une corruption amont (dédup rolling manquante)
   franchit le garde-fou et empoisonne l'ancre de provenance de 32 claims canon.

**En une phrase :** GLM et qwen3.5 produisent des unités localement correctes, mais **aucun des deux ne
surveille les propriétés d'agrégat** (déduplication, cross-source réel, spécificité de condition, propreté de
l'ancre) — si bien que le harnais confond redondance intra-source et consensus, laisse le bruit d'étiquetage de
GLM commander le regroupement, et perd silencieusement un tiers de l'arbitrage ; le rôle de Fable est de porter
la vérification de l'*item* (verbatim présent) au *système* (unicité, pluralité de sources, ancre vérifiée,
capacité différenciante réellement exercée).

---

## Annexe — trace de raisonnement

**Comment j'ai choisi quoi interroger sans tout lire.** Réflexe hérité du cas TOEIC : le signal d'un
comportement *systématique* est une **distribution**, pas une lecture. Trois `GROUP BY` (statut, type, verdict)
ont suffi à faire tomber les deux faits les plus lourds sans lire un seul claim : **244 groupes pour 275 claims
= 89 % de singletons**, et **12/13 consensus mono-vidéo**. Puis le test le plus révélateur du chantier : j'ai
recalculé la similarité cosinus **pairwise** entre les isolés — c'est là qu'est apparu `c257`/`c258` (cosinus
1.000, sujets différents) et 19 paires même-sujet ≥ 0.78 restées isolées. Enfin, j'ai lu le CODE
(`savoir-reconcile.ts`, puis `savoir-transcript.ts`) seulement une fois les données pointant clustering + juge,
pour épingler fichier+ligne — jamais avant.

**Le point de bascule de mon enquête.** J'ai d'abord conclu « le clustering sous-groupe massivement » (des
paires à 0.98 même-sujet non regroupées). Un chiffre m'a arrêté : **244 claims-isolés-avec-embedding ≠ 230
groupes isolés**. Cette incohérence m'a fait vérifier les tailles de groupes isolés → certains sont
**multi-claims**. Donc mes « paires ratées » étaient en réalité **co-groupées**, puis rendues isolées par le
**juge muet** (fail-open). Tout le diagnostic a basculé de « le clustering échoue » vers « l'extraction
duplique + le juge se tait » — le vrai défaut était deux crans plus loin. (Note honnête : j'ai moi-même
reproduit le classique bug de réutilisation d'un curseur SQLite dans une boucle imbriquée, ce qui a d'abord
tronqué mes dumps à une ligne — corrigé avec deux curseurs.)

**Ce qui m'a surpris.** (a) L'ancre verbatim — la décision de conception dont j'étais le PLUS sûr (D5) — est
elle-même **corrompue** sur 32 claims canon (« X X X » triplé) : le garde-fou déterministe atteste une
corruption au lieu de l'arrêter. (b) **0 désaccord et un seul consensus cross-vidéo** : le moteur de
réconciliation, cœur différenciant du plan, n'a **jamais rien réconcilié de contradictoire** — parce que le
corpus pilote ne se recoupe pas. (c) Les plus gros chiffres de « consensus » sont des **auto-duplicata d'une
seule vidéo française**, pas un accord entre experts. Le meilleur défaut, comme pour TOEIC, était invisible à
la lecture d'un claim : il fallait compter les sources et recalculer les similarités.
