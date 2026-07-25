# Plan de LANCEMENT — « le Savoir » (#177) — version Opus 5 (2026-07-25)

> **Statut : APPROUVÉ par Raf, exécution démarrée puis mise en pause à l'étape A1.**
> Ce document remplace `docs/plan-savoir-activation.md` comme plan d'exécution : même
> architecture, mais **API du code re-vérifiée le 2026-07-25** (deux corrections notables
> ci-dessous) et **décisions de portée tranchées avec Raf**. L'ancien document reste en
> place comme trace de l'investigation d'origine.

## Contexte

Raf veut activer la base de connaissance vidéo #177 : ingérer des vidéos YouTube (chaînes,
confs) et pouvoir les **interroger** — soit par l'Élève pendant qu'il construit, soit par Raf
lui-même (« je vais beaucoup l'utiliser »). Ce n'est pas un flag à basculer : la moitié
DIFFICILE est construite et testée, la moitié « restitution » n'a jamais existé.

### Ce qui existe et est testé (`server/src/savoir/`, ~2100 l., 4 suites au manifest)

| Module | API réelle vérifiée le 2026-07-25 |
|---|---|
| `savoir-transcript.ts` | `fetchTranscript(idOrUrl, deps)`, `resegmentCues`, `listChannelVideos(url, {run})`, `fetchTranscriptsSequential`, `fetchDelayMs`/`fetchMax`, `realRunner`, cache disque à vie |
| `savoir-store.ts` | `SavoirStore(dbPath)` + `savoirDbPath(slug)`/`savoirDataDir()` — insert/list vidéos·segments·claims·groupes, `getClaimsByGroupe`, `claimProvenanceUrl`, `journal`/`getJournal` |
| `savoir-extraction.ts` | `extractClaimsForVideo(store, videoId, {ask, embed?}, opts)` — garde VERBATIM déterministe |
| `savoir-reconcile.ts` | `reconcileCorpus(store, {dispatch, embed?, now?}, opts)` — clustering + juge souverain, fail-open `isole` |

**Deux corrections vs le plan d'origine** (trouvées en relisant le code) :
1. **Le cosinus est déjà en base** : `searchGroupes/searchSegments/searchClaims(embedding, k)`
   existent sur `SavoirStore` (via `rankByCosine` de `kernel-blackboard-store.ts`). A2 ne
   réimplémente aucun calcul de similarité.
2. **`extractVideoId` n'est pas exporté** par `savoir-transcript.ts` — or le runner en a besoin
   pour savoir si une vidéo est déjà en base AVANT de la re-fetcher (c'est ce qui rend
   l'ingestion resumable). **C'est le point exact où l'exécution s'est arrêtée** (voir « État »).

### Ce qui manque (jamais construit)

Le runner d'ingestion, le module de requête, les surfaces (outil Élève, REST, UI), le flag
`ELEVE_SAVOIR`. Le flag fantôme `SAVOIR_RUNNER` a déjà été retiré de `flags.ts` (audit du
2026-07-24, commentaire encore en place l. 171-175).

### Décisions tranchées avec Raf (2026-07-25)

- **Portée** : Plan A puis Plan B **d'affilée**, sans point d'arrêt intermédiaire.
- **Preuve en réel** : corpus `agents-ia` = les **3 transcripts déjà en cache disque**
  (`server/data/savoir/eleve-adhoc/transcripts/`) — Hermes v0.19 (Hugo Buisson),
  « Passez aux Loops » (Elliott Pierret), « 6 Skills Claude Code » (Naier Saidane) : même
  sujet, FR, publiées à 3 jours d'écart → fort potentiel de désaccord, zéro dépendance réseau.
- **Flag `ELEVE_SAVOIR`** : `default: false` au départ, **basculé à `true` dans la même
  livraison** si la preuve en réel est concluante.

### Prérequis vérifiés le 2026-07-25

yt-dlp `2026.03.17` présent · Ollama vivant avec `nomic-embed-text` · les 3 transcripts du
corpus de preuve sont bien sur disque.

---

## PLAN A — Moteur commun + outil Élève

### A1 — `server/src/savoir/run-savoir.ts` (NOUVEAU) · 🧠 Opus 4.8 · M

`ingestCorpus(slug, source, deps, opts)` — `source` = URL de chaîne (→ `listChannelVideos`)
**ou** liste d'IDs/URLs. Une vidéo = une unité bornée (décision D4 : jamais un run agentique géant).

- **Resumable** : toute vidéo déjà `reconciliee` est sautée (`store.getVideoByYoutubeId`) ;
  une vidéo déjà `transcrite`/`extraite` reprend à son étape, sans re-segmenter.
- Par vidéo : `fetchTranscript` → `source === "absent"` : statut `sans_transcript`, **on
  n'invente rien** → sinon `resegmentCues` → `insertSegment` (embedding `safeEmbed`) →
  `transcrite` → `extractClaimsForVideo` → `extraite`.
- Toutes vidéos extraites → `reconcileCorpus` **une passe** → statuts `reconciliee`.
- Politesse réseau : `fetchDelayMs()`/`fetchMax()` (mêmes réglages env que
  `fetchTranscriptsSequential`), `sleep` injectable.
- **Ne lève jamais** : une vidéo qui plante ne tue pas le run.
- Deps injectées (`run`/`ask`/`dispatch`/`embed`/`sleep`) → testable sans réseau ni yt-dlp.
  Prod : `realRunner`, `dispatch` de `brain.js` (patron `eleve-judge.ts:58`), `safeEmbed` de
  `notes-rag.js`.
- Exposé (a) comme fonction (consommée par B1) et (b) en CLI
  `npx tsx src/savoir/run-savoir.ts <slug> <source>` (patron `apply-brain-profile.ts:102`).
- Progression observable : `store.journal("ingest", …)` à chaque changement de statut.

**Point de décision ouvert (bloquant, à trancher par Raf)** — le runner a besoin de l'id
YouTube avant le fetch :
- **(a)** exporter `extractVideoId` depuis `savoir-transcript.ts` (+4 lignes de commentaire,
  aucune logique touchée) ;
- **(b)** ne pas toucher au module éprouvé et dupliquer ~10 lignes équivalentes dans
  `run-savoir.ts`.

### A2 — `server/src/savoir/savoir-query.ts` (NOUVEAU) · ⚖️ Sonnet 4.6 · S

`interroger(store, question, deps, opts)` — cœur de la restitution (D6), PUR, deps injectées,
**ne lève JAMAIS** (corpus absent → réponse vide honnête).

- `safeEmbed(question)` → `store.searchGroupes(emb, k)` **(autorité)** : résumé + verdict
  consensus/conditionnel/désaccord/isolé + claims via `getClaimsByGroupe` avec provenance
  vidéo+timestamp (`claimProvenanceUrl`) → puis `store.searchSegments(emb, k)` en **appoint**.
- Payload **cappé dur** (patron `MEMOIRE_SECTION_MAX_CHARS`), libellé explicite : *« les
  groupes font autorité, les segments sont du contexte »*.
- Embedding indisponible (Ollama mort) → repli lexical honnête, jamais une erreur.

### A3 — Outil Élève + flag · ⚖️ Sonnet 4.6 · S

- `server/src/eleve-tools/eleve-savoir-tools.ts` : `savoir_video(corpus, question)`, patron
  **identique** à `eleve-youtube-tools.ts` (`KernelTool`, `inputSchema` zod, budget par
  instance, deps injectables, handler qui ne lève pas). Sortie `sanitizeExternal`, format
  « énoncés réconciliés + sources horodatées cliquables + désaccords des deux côtés ».
- Flag `ELEVE_SAVOIR` dans `flags.ts` (bloc #177, après `SAVOIR_RECONCILE`), `default: false`.
- Câblage dans `eleve-action-tools.ts:463-465`, à côté de `buildEleveYoutubeTools()`.

### A4 — Tests + **preuve EN RÉEL** · ⚖️ Sonnet 4.6 · M

Tests déterministes (store temp + `ask`/`dispatch`/`embed` mockés, zéro réseau — patron
`test-savoir-reconcile.ts`), inscrits au `server/test-manifest.json` en tier `offline` :
`test-savoir-query.ts` · `test-run-savoir.ts` · `test-eleve-savoir-tools.ts`.

**Preuve EN RÉEL** : `ingestCorpus("agents-ia", ["F9YcVlyZahk","FD0i-wFhnC4","a7WtmEx15Yk"])`
avec les vraies deps → base peuplée (claims ancrés au verbatim, groupes réconciliés) → vraie
question via l'outil → énoncés **sourcés avec timestamps**, dont un désaccord si le corpus en
contient. Si concluant → `ELEVE_SAVOIR` à `default: true` dans la même livraison.

---

## PLAN B — Surfaces pour Raf (REST + UI)

### B1 — `server/src/savoir/savoir-routes.ts` · ⚖️ Sonnet 4.6 · S

Patron `registerKnowledgeStoresRoutes` (`knowledge-stores-routes.ts:34`), monté dans
`index.ts` près de la l. 158.
- `GET /api/savoir` — corpus (slugs + compteurs) depuis `savoirDataDir()`.
- `GET /api/savoir/:slug?q=…` — `interroger` → groupes + provenance + désaccords.
- `POST /api/savoir/:slug/ingest` — `ingestCorpus` en tâche de fond + **ancre `turn-ledger`**
  (l'ingestion est longue et doit survivre à un crash backend).
- `GET /api/savoir/:slug/status` — progression via `listVideos` (comptage par statut).

### B2 — Fenêtre UI « Savoir » · ⚖️ Sonnet 4.6 · M

`ui/src/components/Savoir.jsx` + entrée `SAVOIR: "savoir"` dans `WINDOWS` (`ui/src/nav.js`) —
fenêtre flottante comme `TASTE`/`DOCS`, pas un écran plein-cadre (`Knowledge.jsx` reste la
mémoire projet, distincte du corpus vidéo).
- Ajout de corpus (URL de chaîne ou liste) → Ingérer → progression (poll `/status`).
- Recherche en langage naturel → un **groupe** = énoncé réconcilié + badge verdict
  (consensus / conditionnel / **désaccord ouvert**) + sources cliquables horodatées
  (patron de lien `eleve-youtube-tools.ts:50`).
- Un désaccord affiche **les deux positions** — jamais un « vrai » décrété. Le différenciant.
- Registre néon-épuré MangoOS déjà validé. Responsive mobile.

### B3 — Tests + preuve UI · ⚖️ Sonnet 4.6 · S

`test-savoir-routes.ts` (deps mockées) · **preuve Playwright sur le vrai backend** (vérif
anti-orphelin ports 3000/5173 d'abord) : corpus `agents-ia` → question → synthèse réconciliée
avec timestamps cliquables, dont un désaccord. Build UI vert.

---

## Vérification (transverse)

1. `cd server && npx tsc --noEmit` propre **à chaque étape** · `cd ui && npm run build` vert (B).
2. Nouveaux tests verts + **suite offline complète** verte, tests inscrits au `test-manifest.json`.
3. **Preuve en réel avant tout « activé »** — un build vert ne prouve rien (règle absolue
   « qualité en situation réelle »).
4. Clôture `CLAUDE.md` : `statut.md` · `historique.md` · `wiki/` (page `savoir` + `log.md` +
   `index.md`) · `limites.md` · **aucune opération git sans permission explicite de Raf**.

## Limites honnêtes à consigner dans `limites.md` à la livraison

- **yt-dlp = dépendance externe** : yt-dlp périmé → verdict honnête `transcript:absent`,
  jamais d'invention. TOS YouTube en zone grise (usage perso local, faible volume).
- **Le juge de réconciliation est un LLM** : qualité des verdicts dépendante du cerveau `juge` ;
  fail-open → `isole` si muet, rien n'est supprimé, tout auditable via `savoir_journal`.
- **v1 = transcript seulement** : les démonstrations purement visuelles sont perdues —
  extension Whisper/frames nommée mais hors v1.

---

## État d'exécution au 2026-07-25

- ✅ Filet de reprise posé : 7 tâches (A1→B3) + cron heartbeat `4af1f263` (h:23 et h:53).
- ✅ Prérequis vérifiés (yt-dlp, Ollama, transcripts en cache).
- ⛔ **Aucun fichier du repo modifié.** L'exécution s'est arrêtée sur la toute première
  édition (l'export d'`extractVideoId`, option (a) ci-dessus), rejetée en attente de la
  décision de Raf.
- ℹ️ L'envoi de ce plan à **Ultraplan** (raffinage cloud) a échoué : *« Repo is too large to
  teleport. Please setup GitHub on claude.ai/code »*. Le plan reste donc purement local.
