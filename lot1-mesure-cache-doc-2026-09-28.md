# MangoOS — lot 1 : mesure (D1), cache registre (D7), doc + outils fantômes (D8)

**Date** : 2026-09-28 · **Baseline** : `HEAD 863f094`, `typecheck` vert, smoke 12 PASS / 0 FAIL
**Auteur du code** : Claude Opus 5 (D1, D7, D8) + Sonnet 5 (gabarits de test) · **Vérification et rédaction** : Hermès
**Replay de tout ce document en une commande** : `bash /home/raf/projets/mangoai/lot1-verif.sh`

> **Statut du livrable** : le run Opus a été coupé par son plafond de tours (121/120) avant d'écrire ce
> fichier ; le run Sonnet de clôture a été coupé par la limitation de fenêtre 5 h de l'abonnement à son
> 4ᵉ tour. Les outputs ci-dessous ont donc été **produits et copiés par Hermès**, pas par le rédacteur du
> code — c'est une vérification indépendante, pas une auto-déclaration.

---

## §1 — C1 : aucune régression sur la baseline

```
### §1 — C1 : typecheck (attendu : exit 0)

> mangoos-server@0.1.0 typecheck
> tsc --noEmit

TYPECHECK_EXIT=0

### §1b — C1 : tier smoke (attendu : 12 PASS · 0 FAIL)
────────────────────────────────────────────────────────────────────────
TOTAL : 12 PASS · 0 FAIL · 3.7s cumulées

✅ Tous les tests du tier sont verts.
```

**Ce que ça prouve** : l'ajout du compteur, du cache du registre et des clauses d'outils ne casse ni la
compilation ni le tier de référence. Identique à la baseline du 2026-09-28T18:54.

---

## §2 — D1 : la consommation d'un build est désormais mesurable

**Constat d'origine (audit, B4)** : le champ `usage` renvoyé par tout endpoint OpenAI-compatible était
**jeté** au transport — `openAiChat` ne lisait que `choices[0].message.content`. Le seul endroit du dépôt
qui lisait un usage réel était le chemin SDK Claude, c'est-à-dire précisément le chemin inactif. La question
« combien coûte une app ? » n'avait donc aucune réponse mesurée.

**Ce qui a changé**

| Fichier | Rôle |
|---|---|
| `server/src/llm/llm-usage.ts` (nouveau) | `parseUsage` (PUR), `recordLLMUsage`, `startLLMRun`, `getLLMRun`, `resetLLMUsage` |
| `server/src/llm/llm-transport.ts` | `ollamaChat`, `openAiChat`, `openAiChatTools` remontent le payload brut au compteur |
| `server/src/eleve/relay-agentic.ts` | `startLLMRun('build …')` à la frontière d'un build |
| `server/src/flags.ts` | nouveau gate `LLM_USAGE_LOG` (défaut `false`) — **seul l'affichage est gaté**, le comptage ne l'est pas |
| `server/src/tests/test-llm-usage.ts` (nouveau) | 28 vérifications |

Trois propriétés tenues, chacune écrite dans l'en-tête du module :
1. **Addition pure** : aucune fonction ne retourne autre chose, aucune décision ne lit le compteur.
2. **Ne lève jamais** : une erreur de mesure ne peut pas casser un build (règle fail-open du dépôt).
3. **Honnêteté** : un appel dont la réponse ne porte pas d'`usage` exploitable est compté dans
   `unmeasuredCalls` — jamais estimé. Un total affiché est donc un **plancher explicite**.

**Preuve exécutée**

```
[134/248] test-llm-usage … PASS (0.3s)
test-llm-usage                         ✓ PASS   0.3s     ✅ llm-usage : 28 pass, 0 fail
```

Le test couvre les trois formats réels (`usage.prompt_tokens` OpenAI-compat, `usage.input_tokens`
Anthropic, `prompt_eval_count`/`eval_count` Ollama natif) et le cas « pas d'usage → non mesuré ».

**Replay** : `cd /home/raf/projets/mangoai/server && node --import tsx src/test-runner.ts --tier full 2>&1 | grep llm-usage`

**Limite honnête** : le compteur est **en mémoire du process** (20 runs glissants, borné). Il ne survit pas
à un redémarrage et n'est encore exposé par aucune route HTTP — c'est la brique de mesure, pas encore le
tableau de bord. À suivre dans une action D1-bis si Raf veut la lecture depuis l'UI.

---

## §3 — D7 : le registre des cerveaux n'est plus relu du disque à chaque appel

**Constat d'origine (audit, B10)** : `getBrain()` → `loadBrainRegistry()` faisait
`existsSync + readFileSync + JSON.parse` **à chaque appel**, sur 75 sites d'appel répartis dans 49 fichiers,
dont des chemins chauds (`llm-engine`, `kernel`, `eleve/provider`, `capabilities`) — de l'I/O synchrone
gratuite sur l'event loop, à chaque itération d'une boucle qui peut en faire des centaines.

**Ce qui a changé** (`server/src/brain/brain-registry.ts`)

- Cache du registre **parsé**, invalidé sur `mtimeMs` + `size` du fichier : un `statSync` (1 syscall)
  remplace lecture + parse.
- La propriété non négociable est préservée : **l'édition à chaud dans l'Atelier reste prise en compte
  sans redémarrage**.
- Trois précautions pour que la sémantique soit identique : le rideau de fer `BRAIN_LOCAL_ONLY` est
  ré-appliqué à chaque appel (et non gelé dans le cache), une **copie** est renvoyée (des appelants mutent
  leur résultat avant `saveBrainRegistry`), et `saveBrainRegistry` invalide explicitement (l'horloge sous
  Windows a une granularité de ~15 ms).
- Diagnostic : `brainRegistryCacheStats()` renvoie `{diskReads, hits, cached}`.

**Preuve exécutée**

```
[24/248] test-brain-registry-cache … PASS (0.1s)
test-brain-registry-cache              ✓ PASS   0.1s     ✅ brain-registry-cache : 13 pass, 0 fail
```

Le test prouve les deux moitiés du contrat (extraits réels de `src/tests/test-brain-registry-cache.ts`) :

```
61:  check(`2 lectures → 1 SEULE lecture disque (diskReads=${statsA.diskReads})`, statsA.diskReads === 1)
67:  check(`12 lectures au total → toujours 1 lecture disque (diskReads=${statsB.diskReads})`, statsB.diskReads === 1)
```

et l'autre moitié : un fichier réécrit avec un `mtime` neuf est **relu** (édition à chaud toujours vivante).

**Replay** : `cd /home/raf/projets/mangoai/server && node --import tsx src/test-runner.ts --tier full 2>&1 | grep brain-registry-cache`

---

## §4 — D8 : doc d'état corrigée, outils fantômes traités

### (a) Dérive documentaire

`pipeline-eleve-qa.md` désignait `server/src/data/brain-registry.json` comme registre vivant — un dossier
qui **n'existe plus depuis la migration `dataDir()` du 2026-07-23**. Corrigé aux endroits d'état, plus
`PRELAUNCH_CHECKLIST.md:31` qui portait la même erreur.

```
/home/raf/projets/mangoai/pipeline-eleve-qa.md:43:`server/src/data/` n'existe pas sur le disque (corrigé le 2026-07-23, cf.
/home/raf/projets/mangoai/pipeline-eleve-qa.md:110:  `server/src/data/` n'existe plus depuis la migration du 2026-07-23. Le
```

Les deux occurrences restantes sont des **négations explicites** — c'est la correction, pas le défaut.

**Décision assumée : `historique.md` n'est PAS réécrit** (8 occurrences). C'est un journal daté qui décrit
l'état passé du dépôt ; le réécrire effacerait le passé et rendrait la trace mensongère. Le critère C4 du
brief est donc satisfait dans son intention (plus aucune **référence d'état courant** fausse) et
explicitement non satisfait dans sa lettre (le `grep` brut renvoie encore des lignes). Écart déclaré, pas maquillé.

### (b) Outils fantômes des spécialistes

**Constat d'origine (audit, B9)** : le champ `tools` des specs forgées annonçait des capacités que le
sous-agent n'avait pas (`rasteriser_pdf`, `extraire_ocr`…) — la boîte à outils réelle vient de
`deps.buildTools(projectDir, toolPolicy)`, jamais de la spec.

**Tranché : ni retirer les 11 agents forgés, ni laisser la promesse fausse — corriger la promesse à
l'exécution.** `specialist-agentic.ts` ajoute une clause `realToolboxClause(registry.names())` qui énonce
les outils **réellement** disponibles et invalide explicitement tout nom absent. Registre vide → clause
vide → prompt identique à avant. Le chemin est lui-même gaté `ELEVE_DELEGATE_AGENTIC` (défaut off), donc
aucun comportement par défaut ne change. Le champ `tools` reste dans les **données** des agents déjà forgés
(on ne supprime pas de données) mais plus rien ne le présente comme exécutable.

```
test-specialist-agentic                ✓ PASS   0.8s     specialist-agentic (#175) : 33/33
```

**Replay** : `cd /home/raf/projets/mangoai/server && node --import tsx src/test-runner.ts --tier full 2>&1 | grep specialist-agentic`

---

## §5 — C5 : périmètre respecté

```
fichiers supprimés: 0
```

Aucune suppression, aucun `git add`, aucun commit. Fichiers touchés : les 4 du code (D1, D7, D8), le gate,
les 3 fichiers de test, + la doc de clôture exigée par `CLAUDE.md` (`statut.md`, `historique.md`,
`limites.md`, `pipeline-eleve-qa.md`, `wiki/`, `PRELAUNCH_CHECKLIST.md`, `test-manifest.json`, `wiki/compteur-jetons.md`).

**Deux modifications ne viennent PAS de ce lot** (présentes avant le 18:54, non touchées) :
`server/data/brain-registry.json` (le registre vivant a été rebasculé sur `mimo-v2.6-pro` / Xiaomi pour
`codeur` et `orchestrateur`, alors que git porte `glm-5.3` / `deepseek-v4-flash`) et
`server/data/specialist-agents.json` (horodatage). À traiter séparément : ce n'est pas un livrable, c'est
un état local à réconcilier avec git.

---

## Réponse — changé / vérifié / reste

**Changé** — D1 : la consommation de chaque build est mesurée par run, par modèle, avec le nombre d'appels
non mesurés affiché à côté (4 fichiers, 1 gate, 28 tests). D7 : le registre des cerveaux est mis en cache
et invalidé au `mtime`, l'édition à chaud intacte (13 tests). D8 : la doc d'état pointe le bon dossier, et
la promesse d'outils des spécialistes est ramenée à la vérité de leur boîte réelle (33/33).

**Vérifié** — `typecheck` exit 0 ; smoke 12 PASS / 0 FAIL ; `test-llm-usage` 28/28 ;
`test-brain-registry-cache` 13/13 ; `test-specialist-agentic` 33/33 ; 0 fichier supprimé.
Tout rejouable par `bash /home/raf/projets/mangoai/lot1-verif.sh`.

**Reste** — (1) le compteur n'est pas encore exposé par une route HTTP (D1-bis). (2) `historique.md` garde
ses 8 mentions du chemin historique : décision assumée. (3) `brain-registry.json` et
`specialist-agents.json` portent des modifications locales d'origine inconnue — à réconcilier. (4) Les
actions D2, D3, D4, D5, D6 de l'audit ne sont **pas** amorcées, comme demandé.
