# Audit MangoOS / MangoQA — 2026-09-28

**Auditeur** : Claude Opus 5 · **Mode** : lecture seule (aucune écriture hors ce rapport et son HTML)
**Périmètre** : architecture du harnais · pipeline Élève/Stratège/Forge/Gardien · MangoQA · registre des
cerveaux · fiabilité perçue · consommation de la boucle de génération.
**Hors périmètre** (demandé) : toute modification de code, tout refactoring, tout run de génération réel,
l'esthétique de l'interface MangoOS.

## Méthode et honnêteté des chiffres

Tout constat est ancré sur `fichier:ligne`. Les chiffres viennent soit d'un comptage réel sur le dépôt,
soit d'une lecture directe de constantes de code. Les grandeurs que je n'ai **pas** pu mesurer sont
écrites « **non mesuré** » — jamais remplacées par une estimation présentée comme un fait.

Mesures faites pendant l'audit :

| Mesure | Valeur | Source |
|---|---|---|
| Fichiers TypeScript dans `server/src` | 595 | comptage `find` |
| Fichiers de test dans `server/src/tests` | 249 | comptage `ls` |
| Rôles de cerveau déclarés dans le code | 16 | `server/src/brain/brain-registry.ts:43` |
| Rôles réellement présents dans le registre vivant | 15 | `server/data/brain-registry.json` |
| Drapeaux de fonctionnalité (`FlagSpec`) | 42 | `server/src/flags.ts:31-293` |
| … dont `default: true` | 3 | `flags.ts` (`TEMPORAL_AWARENESS`, `ELEVE_GATE_IMAGES`, `ELEVE_GATE_CONSTANTS`) |
| … dont activés par `server/.env` | 1 (`ELEVE_CLOSURE_GATE`) | `server/.env` |
| Limites enregistrées dans `limites.md` | 145 | comptage des lignes de tableau `L<n>` |
| Verdicts MangoQA présents sur disque | 11 (9 `red`, 1 `green`, 1 `unknown`) | `workspace/*/.mangoqa/audit-verdict.json` |
| Spécialistes forgés | 11 | `server/data/specialist-agents.json` |
| Lectures `process.env.X === "on"` hors `flags.ts` | 65 (dans 20 fichiers) | grep |

**Non mesuré**, et pourquoi :

- `npm run typecheck` / `npm run build` : l'exécution de ces commandes n'a pas été autorisée dans cette
  session non-interactive. L'état vert du dépôt est donc **non mesuré** ici.
- Consommation réelle en tokens d'une génération complète : **structurellement non mesurable**
  aujourd'hui (voir **B4**), pas seulement non mesurée par moi.
- Quotas consommés sur l'abonnement Claude Pro : **non mesuré** (aucun run lancé, comme demandé).
- Contenu du dépôt MangoQA au-delà de `README.md`, `FAILLES.md`, `.env` et `src/` : lu par sondage ciblé.

---

# A — Forces réelles, prouvées par le code

Ce ne sont pas les promesses des documents : chaque point ci-dessous a été vérifié dans le code.

### A1 — Le contrat d'agent universel et son parseur à 4 niveaux
`server/src/agent/agent-contract.ts:43-91`. `extractJsonCandidate` essaie sentinelles Mango → bloc
```json → premier objet `{...}` → abandon ; `parseAgentResponse` **ne lève jamais** et dégrade une
réponse tronquée en `partial` plutôt qu'en exception (`agent-contract.ts:88`). C'est exactement la
pièce qui manque à la plupart des harnais maison : elle absorbe la bavardise hétérogène des modèles
non-Anthropic. À préserver telle quelle.

### A2 — La compaction de contexte qui compte les `tool_calls`
`server/src/eleve-runtime.ts:171-176` (`totalChars` inclut `tool_calls.arguments`) et `:238-261`
(`compact` réduit `write_file`/`edit_file` à leur seul `path`). C'est une correction non triviale et
juste : sans elle, un `write_file` de 10 ko était resservi au modèle **à chaque tour suivant**. Le
commentaire de `:178-189` documente un O(n²) d'I/O réellement observé et corrigé (`snapshotTrace`,
`snapshotMessages` en `:184-210`). Rare et précieux.

### A3 — Le registre de cerveaux par rôle, tolérant aux pannes
`server/src/brain/brain-registry.ts:160-226`. `coerceConfig` valide **champ par champ** avec repli
individuel : un registre partiellement corrompu ne casse pas le rôle, il complète depuis
`DEFAULT_REGISTRY`. Le « rideau de fer » `BRAIN_LOCAL_ONLY` (`:231-235`) force `localOnly` sur tous les
rôles d'un coup. Et le correctif de `:120-127` (provider `openrouter` oublié de `VALID_PROVIDERS`, donc
silencieusement neutralisé) montre que ce fail-open a été audité une fois pour de vrai.

### A4 — Le Gardien de clôture : douze signaux, pas « build vert »
`server/src/eleve-gate.ts:31-75`. Le verdict porte intention, goût, WCAG, équilibre de mise en page,
placeholders, tests, pédago, images, constantes, contenu — et **surtout** `judgeSkipped`,
`critiqueSkipped`, `dualSkip` et `signalGap` (`:44-73`) : le Gardien dit quand il n'a pas pu vérifier.
Un gate qui déclare son propre aveuglement est plus mûr que la moyenne.

### A5 — Le Stratège : nommer le blocage avant de le traiter
`server/src/stratege/stratege-signals.ts` + `server/src/stratege.ts`. Un blocage est classé
(`missing-dependency`, `knowledge-gap`, `wrong-tool`, `repetitive-failure`, `wandering`,
`plateau-iterations`, `ambiguous`) puis mappé sur un remède borné, avec un remède `reframe` déclenché
seulement à la **récidive** du même blocage. `relay-agentic.ts:270-274` tient un compteur **par
signature de blocage**, remis à zéro quand la classe change — c'est-à-dire qu'on distingue « il
patine sur le même mur » de « il enchaîne dix problèmes différents ». Distinction juste.

### A6 — L'arrêt coopératif propre
`server/src/eleve-runtime.ts:450-454` : le `Stop` sort **sur la frontière d'itération**, avant l'appel
modèle et avant l'exécution d'outil, avec `clearRunSnapshot()`. Aucun état à demi-écrit. C'est ce qui
rend un harnais utilisable par un humain plutôt que subi.

### A7 — L'hygiène anti-injection et anti-fuite de secrets
`agent-contract.ts:98-100` (`sanitizeExternal` encadre toute donnée externe en `<<<UNTRUSTED_INPUT>>>`),
appliqué notamment à l'entrée des sous-agents (`server/src/specialist/specialist-agentic.ts:68`). Côté
MangoQA, `/home/raf/projets/mangoqa/src/llm.ts:21-65` supprime une liste nommée de secrets **plus**
toute variable dont le nom contient `SECRET`/`PASSWORD`/`_TOKEN`/`_KEY` avant de passer l'env au SDK.
C'est du travail de sécurité réel, pas décoratif.

### A8 — La séparation MangoQA / MangoOS, et son verdict conservateur
`/home/raf/projets/mangoqa/src/verdict.ts:14-38` : rouge dès **une** branche bloquante en échec, et la
première branche en échec dans l'ordre de priorité devient le rejet — déterministe, pas un vote flou.
Côté MangoOS, `server/src/mangoqa.ts:87-109` attend le verdict avec corrélation par `signalTimestamp`
(`:101`) — donc un vieux verdict ne peut pas être pris pour le nouveau. Le fail-open de `:108` est
assumé et documenté.

### A9 — La discipline de réversibilité
`server/src/flags.ts:10-12` pose la règle « un gate ne change JAMAIS le comportement quand il est OFF »,
et les descriptions de gates répètent « byte-identique » de façon vérifiable. Cette discipline est ce qui
rend l'activation progressive possible (action **D6**). Elle est réelle : les 42 entrées portent une
description exploitable, pas un nom nu.

---

# B — Faiblesses, classées par gravité

## Gravité 0 — le harnais croit vérifier, et ne vérifie pas

### B1 — MangoQA était **aveugle** au dernier run, sans que rien ne l'ait signalé
**Preuve** : `workspace/etang-des-roseaux/.mangoqa/audit-verdict.json:6-24` (2026-09-24) — les trois
branches bloquantes qui ont tourné rendent `skip` avec le même message :
« *Claude Code returned an error result: Your organization has disabled Claude subscription access* ».
Verdict final : `unknown`.

**Cause racine** : la chaîne de cerveaux d'audit n'a que deux maillons
(`/home/raf/projets/mangoqa/src/llm.ts:82-90` : primaire `askOllama`, repli `askClaude`) et les deux
étaient hors service — le primaire parce que `QA_OLLAMA_MODEL` pointe sur un alias cloud
(`/home/raf/projets/mangoqa/.env:21`) sur un endpoint qui n'a pas de daemon local (`.env:12-13`), le
repli parce que l'abonnement était refusé. Surtout : **la seule sonde de vivacité existante teste le
process, pas le cerveau** (`server/src/mangoqa.ts:22-36` lit un heartbeat de fichier). MangoQA pouvait
donc être « actif » et incapable d'auditer quoi que ce soit, indéfiniment.

Ce point est à re-vérifier maintenant que l'abonnement Claude Pro est authentifié — mais la faille
structurelle (aucune sonde de cerveau) reste, abonnement ou pas.

### B2 — Un « Feu Vert » peut être rendu sur une couverture quasi nulle
**Preuve** : `workspace/galerie-albatre/.mangoqa/audit-verdict.json` — verdict `green`, alors que
4 branches sur 6 sont `not_applicable` ou `skip`, et que la branche architecture écrit elle-même
« *le code fourni (App.jsx tronqué, main.jsx) ne contient pas d'éléments d'architecture auditable* »
(`:7`).

**Cause racine** : `/home/raf/projets/mangoqa/src/verdict.ts:23-26`. La règle verte est
`audited && !incomplete`, où `incomplete` ne compte que les `skip`. Un `not_applicable` — y compris
quand il signifie « je n'ai rien vu » et non « il n'y avait rien à voir » — est traité comme inoffensif.
Une seule branche bloquante en `pass` suffit alors à peindre tout le projet en vert. C'est le seul
défaut de cet audit qui produit un **faux positif rassurant**, la pire catégorie.

### B3 — L'audit ne voit pas un échantillon du projet : il voit un **préfixe**
**Preuve** : `/home/raf/projets/mangoqa/src/llm.ts:18` (`FILE_PAYLOAD_CAP = 24_000` caractères) et
`/home/raf/projets/mangoqa/src/fs-shared.ts:47-58` — `renderFiles` concatène dans l'ordre reçu et
**`break`** au premier fichier qui déborde (`:54`). Tout ce qui vient après est simplement invisible.

**Mesure de l'écart** (taille de `src/` des projets du workspace) :

| Projet | `src/` | Part visible par une branche d'audit |
|---|---|---|
| `shining-tactics` | 25,8 ko | ~93 % |
| `analytic-mind` | 60,1 ko | ~40 % |
| `galerie-albatre` | 62,0 ko | ~39 % |
| `mango-quest` | 116,4 ko | ~21 % |
| `nova-wing` | 134,8 ko | ~18 % |
| `etang-des-roseaux` | 199,1 ko | ~12 % |
| `toeic-quest` | 1 198,9 ko | ~2 % |

**Cause racine** : le module de tri par risque existe (`/home/raf/projets/mangoqa/src/priority.ts:28-39`,
`priorityScore` / `sortByPriority`) et son propre en-tête (`:4-12`) explique pourquoi il faut trier avant
de tronquer — mais `llm.ts:255` consomme `ctx.files` **tel quel**. Le tri est écrit, testé, et pas appliqué
sur ce chemin. Et même appliqué, un cap de 24 000 caractères pour un projet de 200 ko reste un coup de
sonde, pas un audit.

### B4 — La consommation de la boucle est **structurellement non mesurable**
**Preuve** : `server/src/llm/llm-engine.ts:191-220` — `askLLM` retourne `Promise<string>`. Le champ
`usage` renvoyé par tout endpoint OpenAI-compat est jeté au transport. Le **seul** endroit du dépôt qui
lit un `usage` réel est le chemin SDK Claude (`server/src/agent/agent.ts:276-306`, `contextTokens` et
`total_cost_usd`) — précisément le chemin **inactif** dans la configuration courante, où `codeur`,
`architecte`, `juge`, `stratege`… sont tous `provider: "openai"` (`server/data/brain-registry.json`).

**Conséquence** : il est aujourd'hui impossible de répondre à « combien coûte une app ? » autrement que
par une borne théorique. C'est la racine de **B5**, et le préalable de toute décision de modèle.

### B5 — Le fusible de coût existe, et il est **inerte**
**Preuve** : `server/src/eleve/relay-agentic.ts:241-248` — `loopBudget` n'est construit que si
`ELEVE_BUDGET_PROMPT_CHARS` **ou** `ELEVE_BUDGET_TOOL_CALLS` est > 0 ; sinon `undefined`, et le bloc de
garde `server/src/eleve-runtime.ts:484-497` est mort. Ni l'une ni l'autre variable n'est présente dans
`server/.env`.

**Enveloppe théorique laissée ouverte** (dérivée des constantes, pas mesurée) :
`ELEVE_AGENTIC_MAX_ITER=36` (`server/.env`) × `ELEVE_SELF_RELANCE_MAX` par défaut 10
(`relay-agentic.ts:264`) = **jusqu'à 360 appels modèle sur le rôle `codeur` pour un seul build**, chacun
avec un contexte plafonné à `ELEVE_AGENTIC_CTX_MAX = 60 000` caractères (`eleve-runtime.ts:48`). Le
coupe-circuit réel en pratique est `ELEVE_AGENTIC_MAX_CORRECTIONS` (défaut 8, `eleve-runtime.ts:55`),
mais c'est un détecteur d'anti-répétition, pas un budget.

## Gravité 1 — le harnais est bien plus riche que ce qu'il exécute

### B6 — 38 gates sur 42 sont dormants en production
**Preuve** : `server/src/flags.ts:31-293` déclare 42 `FlagSpec`, dont 3 seulement en `default: true`.
`server/.env` n'en active qu'un de plus (`ELEVE_CLOSURE_GATE=on`). Donc **4 actifs, 38 éteints**.

Le code que j'ai lu et trouvé bon **ne s'exécute jamais dans la configuration actuelle** :
la reprise après crash (`eleve-runtime.ts:405-443`, gate `ELEVE_RESUME`), l'état de travail réinjecté
après compaction (`:469-479`, `ELEVE_ETAT`), la réflexion périodique (`:503-518`, `ELEVE_REFLEXION`),
la mémoire cross-projet (`relay-agentic.ts:138-143`, `ELEVE_MEMOIRE`), le repli inter-cerveaux
(`BRAIN_FALLBACK`), le Stratège global, le dry-run, le cache sémantique, le harnais A/B.

**Cause racine** : la politique « défaut OFF = rétrocompatibilité stricte » (`flags.ts:10-12`) est
excellente pour livrer sans risque, mais elle n'a jamais été suivie d'une **phase de promotion**. Il n'y a,
dans le dépôt, aucun mécanisme qui fasse passer un gate éprouvé de OFF à ON. Résultat : la valeur écrite
s'accumule sans jamais être encaissée.

### B7 — Le repli inter-cerveaux est déclaré dans les données et désarmé par le code
`server/data/brain-registry.json` déclare pour le rôle `vision` une chaîne `fallback` vers
`claude/haiku`. Cette chaîne est bien chargée et validée (`brain-registry.ts:187-203`), mais elle n'est
jouée que si `BRAIN_FALLBACK` est actif — `flags.ts` le laisse à `false` et `server/.env` ne l'active pas.
Un `vision` en panne échoue donc sans essayer son repli déclaré.

### B8 — Un Gardien totalement aveugle rend quand même un verdict vert
**Preuve** : `server/src/eleve-gate.ts:478-487`. `dualSkip` (juge d'intention **et** critique visuelle
tombés au même tour) est calculé, journalisé… et n'entre dans `ok` que via `dualSkipBlocks`, lui-même
conditionné à `ELEVE_GATE_DUAL_SKIP_BLOCK` — `default: false` dans `flags.ts`, absent de `server/.env`.
Le commentaire `:472-477` décrit exactement le scénario : « *intention+goût+QA se réduit silencieusement
à 2 regex triviales — tout en restant marqué VERT* ». Le correctif est écrit ; il est éteint.

### B9 — Les spécialistes forgés annoncent des outils qui n'existent pas
**Preuve** : `server/data/specialist-agents.json:8-29` — le « Déchiffreur de PDF scannés » déclare
`detecter_couche_texte`, `rasteriser_pdf`, `extraire_ocr`, `reconstruire_structure`, `corriger_ocr`.
Recherche sur tout `server/src` : **zéro occurrence** de ces noms.

**Cause racine** : `server/src/specialist/specialist-agentic.ts:64` construit le registre du sous-agent
depuis `deps.buildTools(projectDir, agent.toolPolicy ?? {})` — c'est-à-dire depuis le registre **réel** de
l'Élève filtré par une policy. Le champ `tools` produit par la Forge n'est jamais câblé ; c'est de la
prose. Un spécialiste invoqué reçoit donc un prompt système qui lui ordonne d'utiliser cinq outils
absents de sa boîte. 11 spécialistes sont dans ce cas potentiel.

### B10 — `getBrain()` relit et re-parse le registre à **chaque** appel
`server/src/brain/brain-registry.ts:247-249` → `loadBrainRegistry()` → `fs.existsSync` +
`fs.readFileSync` + `JSON.parse` (`:211-226`), sans aucun cache. 75 sites d'appel répartis sur 49 fichiers,
dont des chemins chauds (`llm-engine.ts`, `kernel.ts`, `eleve/provider.ts`, `capabilities.ts`). Sur une
boucle à plusieurs centaines d'itérations (**B5**), c'est de l'I/O synchrone gratuite sur l'event loop.

### B11 — Le registre vivant est incomplet d'un rôle
`brain-registry.ts:43-47` déclare 16 `AgentId` ; `server/data/brain-registry.json` n'en contient que 15.
`codeur_frontiere` retombe donc sur son défaut `{ provider: "none", model: "" }` (`:106`). Sans effet
visible aujourd'hui (la section Code est elle-même gatée `CODE_SECTION`, `default: false`), mais c'est un
rôle qui existe pour le code et pas pour l'exploitant.

### B12 — Dérive documentaire sur l'emplacement réel des données
`pipeline-eleve-qa.md:39` désigne `server/src/data/brain-registry.json` comme le registre vivant, et
`:91-93` désigne `server/data/open-gaps.json` comme un « doublon orphelin » à ne pas toucher.
**Les deux sont faux** : `dataDir()` (`server/src/safe-io.ts:22-24`) résout sur `server/data/`, et
`server/src/data/` **n'existe pas sur le disque**. De plus `open-gaps.json` — le registre vivant de la
Forge (`server/src/self/self-evolution.ts:52`) — est **absent** de `server/data/`.
Ce document est la référence opérationnelle citée par `CLAUDE.md` ; sa dérive envoie sur un mauvais
fichier toute session qui le suit.

### B13 — Écart doc/code sur les budgets de boucle
`pipeline-eleve-qa.md:53` annonce `ELEVE_AGENTIC_MAX_ITER` à 36 ; le défaut du code est **24**
(`eleve-runtime.ts:47`). La valeur 36 ne vient pas du code mais de `server/.env`. Même famille que **B12** :
un document daté qui se lit comme une spécification.

## Gravité 2 — dette qui fausse le pilotage

### B14 — La table de coûts est fausse dans les deux sens
`server/src/agent/agent-contract.ts:164-175` :
- `claude/opus` à 30 $/Mtok, alors que le chemin Claude passe par l'**abonnement** et jamais par les
  crédits API (`agent.ts:243-246`, `subscriptionEnv()`) → le coût en crédits est 0.
- `ollama/*` à **0** (« local → gratuit », `:174`), alors que sur cette machine il n'y a **pas** de daemon
  Ollama local (`/home/raf/projets/mangoqa/.env:3-5`) et que tout passe par Ollama Cloud
  (`server/data/brain-registry.json`, `baseUrl: https://ollama.com/v1`).

`estimatePipelineCost` (`:189-201`) et son seuil `COST_WARNING_USD = 2` (`:177`) dissuadent donc d'utiliser
Claude pour une raison financière **qui n'existe pas**, tout en chiffrant à zéro le provider qui consomme
réellement du quota. Toute décision d'affectation prise sur cette base est fausse.

### B15 — La règle de centralisation des gates n'est pas tenue
`flags.ts:6-8` écrit : « on les CENTRALISE ici : une seule source de vérité […] jamais un
`process.env.X === "on"` dispersé ailleurs ». Comptage réel : **65 occurrences** de
`process.env.X === "on"` / `!== "off"` en dehors de `flags.ts`, dans 20 fichiers — dont 21 dans
`server/src/eleve-tools/eleve-action-tools.ts` et 15 dans `server/src/eleve/relay-agentic.ts`. L'état de
configuration du harnais n'est donc pas auditable depuis un seul endroit, ce qui est exactement le
problème que `flags.ts` disait résoudre.

### B16 — Deux registres de modèles sans source commune
MangoOS choisit ses cerveaux dans `server/data/brain-registry.json` ; MangoQA choisit le sien dans
`QA_OLLAMA_MODEL` / `QA_MODEL` (`/home/raf/projets/mangoqa/.env:21,27`, lus en
`/home/raf/projets/mangoqa/src/ollama-client.ts:15` et `src/llm.ts:16`). Aucun lien. Changer de cerveau
dans l'Atelier ne change rien à l'auditeur — et rien ne le signale. C'est la version inter-dépôts du
problème des « 3 registres » déjà connu (`pipeline-eleve-qa.md:31-35`).

### B17 — Un visage annoncé, non câblé
`/home/raf/projets/mangoqa/README.md:42-45` présente l'Observateur-Conseil comme le « Visage 2 » du
système. `/home/raf/projets/mangoqa/FAILLES.md:24` dit l'inverse et dit vrai : « *amorce non câblée […]
volontairement PAS branché dans `orchestrator.ts`/`index.ts`* ». La couverture réellement offerte est
donc inférieure à celle affichée en tête de README.

## Gravité 3 — hygiène

### B18 — Une entrée de répertoire manifestement accidentelle traîne dans `server/`
`git status` liste `server/Z:\\chemin\impossible\!!/` — vestige d'un test de chemin Windows sur une
machine Linux. Aucun impact fonctionnel repéré ; à nettoyer (hors périmètre de cet audit : aucune
suppression n'a été faite).

### B19 — Clés en clair et dupliquées dans `server/.env`
La même clé bearer sert de `OLLAMA_API_KEY` et de `ELEVE_API_KEY`, et la clé du fournisseur du rôle
`codeur` est en clair à côté. Une rotation devient une opération manuelle multi-fichiers
(`server/.env` **et** `/home/raf/projets/mangoqa/.env` portent la même valeur). Rien n'est exposé au
dépôt à ma connaissance, mais le couplage est un risque opérationnel.

---

# C — Ce qui empêche réellement d'atteindre Lovable / Base44, et ce qui est du bruit

## Les quatre vrais murs

### C1 — La vérification n'a **aucune autorité**, et parfois aucune vue
Lovable et Base44 ne sont pas meilleurs parce qu'ils écrivent un meilleur code au premier jet : ils sont
meilleurs parce qu'une boucle voit le produit tourner et refuse d'avancer tant que ça ne tient pas.
MangoOS a **deux** vérificateurs, et aucun n'a d'autorité :
- le Gardien est « convergent / non-bloquant » par décision explicite (`eleve-gate.ts:7-8`), et il passe
  vert même quand il n'a rien vérifié (**B8**) ;
- MangoQA est fail-open par construction (`mangoqa.ts:108`), ne voit qu'un préfixe du projet (**B3**),
  peut peindre en vert une couverture nulle (**B2**), et était purement aveugle au dernier run (**B1**).

Tant qu'un verdict rouge ne coûte rien, le « 95 % fini » reste une intention.

### C2 — On ne mesure rien, donc on ne pilote rien
**B4** + **B5**. Il n'existe aujourd'hui aucun moyen de répondre à : combien d'appels, combien de tokens,
combien de temps pour une application. La seule borne connue est théorique (jusqu'à 360 appels modèle
par build). Sans cette mesure, l'arbitrage « quel modèle sur quel rôle » — la question centrale posée
par ce brief — ne peut être qu'une opinion. C'est le préalable de tout le reste, et c'est la
correction la moins risquée du lot.

### C3 — Le cerveau exécutant, et tout ce que le harnais dépense pour le compenser
Une grande partie de la sophistication de MangoOS n'est pas de la capacité : c'est de la
**compensation**. Dix auto-relances (`relay-agentic.ts:264`), un Stratège qui reclasse les blocages, un
remède `reframe` pour les récidives, une Forge qui fabrique des spécialistes, des nudges « arrête de
lire, AGIS » — tout cela existe parce que le modèle qui code ne va pas au bout tout seul. Les
concurrents cités mettent un modèle de frontière sur ce rôle et se passent des trois quarts de cet
échafaudage. L'abonnement Claude Pro qui vient d'être activé rend cet arbitrage **testable pour la
première fois** ; il ne l'a pas encore tranché.

### C4 — Le harnais est éteint
**B6** : 38 gates sur 42 dormants. Il y a, dans ce dépôt, une reprise après crash, une mémoire
cross-projet, un état de travail résistant à la compaction, un repli inter-cerveaux et un mode
réflexion — tous écrits, tous testés, tous inertes. L'écart entre MangoOS-sur-le-papier et
MangoOS-qui-tourne est la plus grande valeur immédiatement disponible du projet.

## Ce qui n'est **pas** le problème (à ne pas traiter)

- **La taille du code.** 595 fichiers et ~103 000 lignes ne sont pas en soi de la dette. La modularité
  est réelle (`eleve/` éclaté en 11 feuilles, `eleve-tools/` en 24), les deps sont injectées pour la
  testabilité (`specialist-agentic.ts:25-33`), et 249 fichiers de test existent. Un refactoring de
  volume ne rapprocherait de rien.
- **La documentation.** Elle est abondante et, hors les dérives **B12**/**B13**, cohérente. Le triptyque
  `statut.md` / `historique.md` / `wiki/` fonctionne. Ce n'est pas là que ça coince.
- **Les échafaudages dormants** (Laya en shadow, Observateur non câblé, `SAVOIR_*` à moitié bâti, harnais
  A/B). Ils ne nuisent pas — ils ne comptent simplement **pas** comme capacité. L'erreur serait de les
  lire comme acquis dans un inventaire de couverture, pas de les supprimer.
- **Le débat « souveraineté locale vs cloud », dans son état actuel.** Sur cette machine il n'y a pas de
  daemon Ollama (`/home/raf/projets/mangoqa/.env:3-5`) : tout ce qui est étiqueté « local / $0 » passe en
  réalité par Ollama Cloud. La question n'est donc pas « souverain ou Claude », c'est « quel cloud, à
  quel coût, pour quelle qualité » — et **B14** montre que la table de coûts du harnais répond faux aux
  deux bouts.

---

# D — Plan d'action priorisé

Ordonné par rendement : ce qui débloque le reste d'abord, ce qui coûte cher en risque ensuite.

| # | Action | Effort | Risque de régression |
|---|---|---|---|
| D1 | Rendre la consommation mesurable | M | **aucun** |
| D2 | Armer le fusible de boucle | S | faible |
| D3 | Donner une sonde de cerveau à MangoQA et durcir la règle verte | M | faible |
| D4 | Faire voir le projet entier à l'audit | M | faible |
| D5 | Basculer le rôle `codeur` sur Claude et mesurer en A/B | S (config) | **élevé** |
| D6 | Promouvoir les gates éprouvés, un par un, avec mesure | M | faible (par gate) |
| D7 | Mettre en cache le registre des cerveaux | S | faible |
| D8 | Réconcilier la doc de données et honorer (ou retirer) les `tools` des spécialistes | S | **aucun** |

### D1 — Rendre la consommation mesurable · effort **M** · régression **aucune**
Faire remonter le champ `usage` des réponses OpenAI-compat (et l'équivalent Ollama) à travers
`openAiChat` → `askLLM` (`server/src/llm/llm-engine.ts:191-220`) jusqu'à un compteur par run, à côté de
ce que `agent.ts:302-306` fait déjà pour le chemin Claude. **Addition pure** : aucun chemin de décision
ne change, on ne fait que cesser de jeter une donnée déjà reçue. C'est le préalable de D2 et la seule
façon de répondre honnêtement à la question « quel modèle sur quel rôle ». À faire en premier.

### D2 — Armer le fusible de boucle · effort **S** · régression **faible**
Poser `ELEVE_BUDGET_PROMPT_CHARS` et `ELEVE_BUDGET_TOOL_CALLS` dans `server/.env` pour activer le garde
déjà écrit (`eleve-runtime.ts:484-497` via `relay-agentic.ts:241-248`). Risque réel et assumé : des runs
qui vont aujourd'hui au bout de leurs 360 appels seront coupés — c'est l'effet recherché, mais il change
le résultat de builds existants. À calibrer **après** D1, sur des chiffres.

### D3 — Sonde de cerveau MangoQA + règle verte durcie · effort **M** · régression **faible**
Deux corrections indissociables :
1. un appel de contrôle au démarrage de MangoQA qui vérifie que le cerveau d'audit **répond** (pas juste
   que le process vit, `mangoqa.ts:22-36`), et qui alerte bruyamment sinon — c'est ce qui manquait à
   **B1** ;
2. dans `/home/raf/projets/mangoqa/src/verdict.ts:23-26`, compter les `not_applicable` des branches
   **bloquantes** dans `incomplete`, de sorte qu'un projet où presque rien n'a été vu sorte `unknown` et
   non `green` (**B2**).

Effet attendu : plus de verdicts `unknown`, moins de faux verts. C'est une régression **désirée** du taux
de vert ; elle ne casse rien, elle cesse de mentir.

### D4 — Faire voir le projet entier à l'audit · effort **M** · régression **faible**
Appliquer `sortByPriority` (`/home/raf/projets/mangoqa/src/priority.ts:37-39`, déjà écrit et testé) en
amont de `renderFiles` sur le chemin `llm.ts:255`, et passer d'un **préfixe unique** à plusieurs lots de
24 000 caractères par branche, avec agrégation des constats. Sans cela, D3 rendra surtout des `unknown`
sur les gros projets (12 % de visibilité sur `etang-des-roseaux`, 2 % sur `toeic-quest`).

### D5 — Basculer `codeur` sur Claude et mesurer en A/B · effort **S** en config · régression **élevée**
Une édition du rôle `codeur` dans l'Atelier suffit côté configuration. Le risque est ailleurs, et il est
réel : le chemin agentique de l'Élève est bâti sur le **function-calling OpenAI-compat**
(`server/src/eleve/contract.ts`, `supportsTools(provider)`, `elevePost(...)`), tandis que le provider
`claude` passe par `query()` du SDK (`llm-engine.ts:132-141`) — un transport différent. Avant de basculer,
il faut **vérifier** que `askEleveAgentic` sait piloter un provider `claude` ; à défaut, la bascule
renverrait silencieusement l'Élève sur le moteur « contrat » (DSL texte, `relay-contract.ts`), qui n'a même
pas d'intégration MangoQA native (`pipeline-eleve-qa.md:29-30`). Ne pas faire cette action avant D1 : sans
mesure, on ne saura pas si le changement a payé.

### D6 — Promouvoir les gates éprouvés, un par un · effort **M** · régression **faible par gate**
Candidats par ordre de rapport/risque, tous déjà écrits et testés :
`ELEVE_GATE_DUAL_SKIP_BLOCK` (**B8**, corrige un faux vert), `BRAIN_FALLBACK` (**B7**, le registre déclare
déjà sa chaîne), `ELEVE_ETAT`, `ELEVE_RESUME`, puis `ELEVE_REFLEXION` et `ELEVE_MEMOIRE`. Un gate à la
fois, avec la mesure D1 avant/après — c'est précisément le mécanisme de promotion qui manque
aujourd'hui (**B6**).

### D7 — Mettre en cache le registre des cerveaux · effort **S** · régression **faible**
Cacher `loadBrainRegistry()` avec invalidation sur `mtime` du fichier
(`server/src/brain/brain-registry.ts:211-249`). Préserve la propriété qui compte — l'édition à chaud dans
l'Atelier reste prise en compte sans redémarrage — et supprime une lecture disque synchrone par appel sur
75 sites.

### D8 — Réconcilier la doc de données, honorer ou retirer les `tools` forgés · effort **S** · régression **aucune**
Deux corrections documentaires/contractuelles, sans effet d'exécution :
(a) corriger `pipeline-eleve-qa.md:39` et `:91-93` (le vivant est `server/data/`, `server/src/data/`
n'existe pas) et `:53` (24 par défaut, 36 par `.env`) — **B12**/**B13** ;
(b) trancher sur le champ `tools` des spécialistes forgés (`specialist-agents.json`) : soit le câbler dans
`specialist-agentic.ts:64`, soit le retirer du contrat de forge pour cesser de promettre à un sous-agent
des outils qu'il n'aura pas — **B9**.

---

# Section modèles — affectations comparées par rôle

## Comment lire la colonne « quota »

Il n'existe **aucune mesure** de consommation sur le chemin actuellement emprunté (**B4**). La colonne
« appels par app » ci-dessous est donc **dérivée de constantes du code**, pas observée :

- `codeur` : 1 à `ELEVE_AGENTIC_MAX_ITER` appels par relance (36, `server/.env` ; défaut code 24,
  `eleve-runtime.ts:47`), × jusqu'à `ELEVE_SELF_RELANCE_MAX` relances (10, `relay-agentic.ts:264`)
  → **plafond 360**, coupé en pratique par `ELEVE_AGENTIC_MAX_CORRECTIONS` (8, `eleve-runtime.ts:55`).
- `juge` : 1 appel par tour de clôture (`eleve-gate.ts`, `judgeIntention`).
- `vision` : 1 à 2 par tour de clôture (critique visuelle + volet images, `ELEVE_GATE_IMAGES`
  `default: true`, `flags.ts`).
- branches MangoQA : 6 appels par audit (`/home/raf/projets/mangoqa/src/index.ts`, 6 branches).
- `forgeron` : **0 aujourd'hui** — `SELF_EVOLVE` n'est pas dans `server/.env`.

**La conversion appels → tokens → quota d'abonnement est « non mesuré »** et le restera jusqu'à D1.
Toute table qui donnerait ici un nombre de tokens serait inventée.

## Affectations comparées

Tags réels tels qu'ils figurent dans `server/data/brain-registry.json` : `mimo-v2.6-pro`,
`glm-5.3`, `deepseek-v4-flash:0731`. « Opus 5.5 » ci-dessous désigne le tier `claude/opus`
(`brain-registry.ts:51`, via l'abonnement — coût crédits **0**, coût **quota** réel).

| Rôle | Aujourd'hui | Opus (abonnement) | GLM 5.3 | DeepSeek v4 flash | MiMo v2.6 pro | Appels/app (dérivé) |
|---|---|---|---|---|---|---|
| **codeur** (l'Élève) | MiMo v2.6 pro | qualité max, **quota lourd** — c'est le rôle qui domine tout le budget | milieu de gamme, tool-calling à re-prouver | trop faible pour 36 itérations outillées | tenant actuel | **1 → 360** |
| **architecte** | GLM 5.3 | pertinent : rare, structurant, décide du reste | tenant actuel, acceptable | trop faible pour un plan | possible | quelques appels |
| **juge** (clôture) | DeepSeek v4 flash | surdimensionné | bon compromis | tenant actuel, acceptable | possible | 1 / tour de clôture |
| **vision** | DeepSeek v4 flash (+ repli `claude/haiku` **désarmé**, **B7**) | Haiku suffit | ne voit pas | dépend du support image réel | non vérifié | 1–2 / clôture |
| **stratege** | DeepSeek v4 flash | surdimensionné — il **classe**, il ne résout pas | possible | tenant actuel, adapté | possible | ≤ budget Stratège |
| **forgeron** | GLM 5.3 | **recommandé** : acte le plus exigeant et le plus rare (`brain-registry.ts:86-90` le disait déjà) | tenant actuel | non | non | 0 aujourd'hui |
| **routeur** | DeepSeek v4 flash | jamais | possible | tenant actuel, adapté | possible | ≤ 1 / tour |
| **auditeur MangoQA** | `deepseek-v4-flash:0731` (registre **séparé**, **B16**) | repli `QA_MODEL=sonnet` déjà configuré | possible | tenant actuel | non | 6 / audit |

## Affectation recommandée

| Rôle | Recommandation | Raison |
|---|---|---|
| `codeur` | **Opus (abonnement) en A/B mesuré contre MiMo** — pas en bascule sèche | C'est le seul levier qui peut supprimer l'échafaudage de compensation (**C3**) ; mais c'est aussi 1→360 appels/app et le transport n'est pas prouvé (**D5**) |
| `architecte` | **Opus (abonnement)** | Rare, structurant, décide de tout le reste. Excellent rapport qualité/quota |
| `forgeron` | **Opus (abonnement)** | Acte le plus exigeant et le plus rare du système ; c'était déjà la décision documentée (`brain-registry.ts:86-90`) |
| `juge`, `stratege`, `routeur`, `extracteur` | **inchangés** (DeepSeek v4 flash / GLM) | Rôles de classement et d'arbitrage court : la montée en gamme y coûte du quota sans rien acheter |
| `vision` | **DeepSeek v4 flash + activer `BRAIN_FALLBACK`** | La chaîne de repli vers `claude/haiku` est déjà déclarée dans les données ; il suffit de l'armer (**B7**, **D6**) |
| `auditeur` MangoQA | **conserver `deepseek-v4-flash:0731`, mais ajouter la sonde de cerveau** | Le modèle n'est pas le problème : l'absence de détection de panne l'est (**B1**, **D3**) |

Ces recommandations sont des **hypothèses à valider par la mesure D1**, pas des conclusions : aucune n'a
pu être chiffrée en quota, faute d'instrumentation.

---

## Conformité du rapport aux interdits

Aucun fichier supprimé. Aucun code, configuration ou donnée de `server/data/` modifié — le registre des
cerveaux n'a pas été touché. Aucune génération d'application lancée, aucun appel à `/api/chat`, aucune
dépendance installée, aucune opération git. Les seuls fichiers écrits sont ce rapport et son HTML.
</content>
