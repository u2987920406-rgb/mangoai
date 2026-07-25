# Plans — Activer « le Savoir » (#177, base de connaissance vidéo)

> **Statut : PLANIFIÉ, à lancer.** Rédigé le 2026-07-24 (session d'audit/allègement). Raf
> relancera ces plans dans une prochaine session. Investigation du code déjà faite et
> ancrée (API réelle des modules vérifiée) — au démarrage, commencer directement par
> **Plan A / étape A1**. Poser un filet de reprise (tâches + heartbeat) car c'est un
> chantier de plusieurs sessions.

## Contexte

Raf veut activer la base de connaissance vidéo #177. Constat vérifié en creusant le code : ce n'est PAS un flag à basculer — l'interrupteur `SAVOIR_*` n'est branché à rien et la moitié « restitution » du système n'a jamais été construite. Mais la moitié DIFFICILE l'est déjà (transcript, stockage SQLite, extraction de claims ancrés, réconciliation par juge — ~2100 lignes, 4 modules, 4 suites de tests).

**Ce qui est déjà construit et testé** (`server/src/savoir/`) :
- `savoir-transcript.ts` — `fetchTranscript`, `resegmentCues`, `listChannelVideos`, `fetchTranscriptsSequential` (VIVANT : c'est l'outil `lis_video_youtube`)
- `savoir-store.ts` — classe `SavoirStore` (SQLite/corpus) : `insertVideo`/`getVideoByYoutubeId`/`updateVideoStatut`/`listVideos`/`insertSegment`/`getSegmentsByVideo`/`insertClaim`/`listClaims`/`insertGroupe`/`getGroupesByVerdict`/`getGroupesBySujet`/`getClaimsByGroupe`/`getJournal`/`close`
- `savoir-extraction.ts` — `extractClaimsForVideo(store, videoId, deps, opts)`
- `savoir-reconcile.ts` — `reconcileCorpus(store, deps, opts)`

**Ce qui manque** (jamais construit) : le runner d'ingestion, le module de requête, les surfaces (outil Élève + route/UI), le flag `ELEVE_SAVOIR`.

**Cycle de vie d'une vidéo** (statuts déjà définis dans le store) : `a_ingerer → transcrite → extraite → reconciliee` (ou `sans_transcript`). Le runner fait avancer ce statut ; c'est lui qui rend l'ingestion **resumable** (on saute ce qui est déjà `reconciliee`).

Helpers réutilisés (déjà en place, pas à écrire) : `safeEmbed` (`notes-rag.ts`) pour embedder la question, cosinus (plusieurs implémentations existantes), `sanitizeExternal` (le transcript reste de la donnée externe), patron d'outil Élève (`eleve-tools/*.ts`), patron de route (`routes/*.ts`). Doc d'origine complète : `docs/plan-177-video-connaissance.md` (D1-D7, schéma SQL, décisions d'archi).

---

# PLAN A — Moteur commun + Fenêtre Option 1 (mémoire pour l'Élève)

Le chemin le plus court vers quelque chose d'utilisable. Le « moteur commun » (runner + requête) est partagé avec le Plan B — c'est ~80% du travail, fait une seule fois.

## A1 — Le runner d'ingestion (`server/src/savoir/run-savoir.ts`) — NOUVEAU

Enchaîne le pipeline pour un corpus, resumable, une vidéo = une unité bornée (jamais un run agentique géant — décision D4 du plan d'origine).

- `ingestCorpus(slug, source, deps, opts)` où `source` = une URL de chaîne (→ `listChannelVideos`) OU une liste d'IDs/URLs de vidéos.
- Pour chaque vidéo pas encore `reconciliee` (resume) : `fetchTranscript` → si absent, statut `sans_transcript`, on n'invente rien ; sinon `resegmentCues` → `store.insertSegment` (avec embedding via `safeEmbed`) → statut `transcrite` → `extractClaimsForVideo` → statut `extraite`.
- Une fois toutes les vidéos extraites : `reconcileCorpus` une passe → statuts `reconciliee`.
- Politesse déjà câblée dans `fetchTranscriptsSequential` (délai entre requêtes, budget par run, cache disque à vie) — le runner s'appuie dessus.
- Deps injectées (`run`/`ask`/`embed`/`browser`) → testable sans réseau ni yt-dlp.
- Exposé (a) en fonction appelable par une route (Plan B) et (b) en CLI `npx tsx src/savoir/run-savoir.ts <slug> <source>` pour Raf/opérateur.

| Modèle optimal | Effort |
|---|---|
| 🧠 Opus 4.8 (orchestration + effets de bord, resume) | M |

## A2 — Le module de requête (`server/src/savoir/savoir-query.ts`) — NOUVEAU

Le cœur de la restitution (décision D6). PUR, deps injectées.

- `interroger(store, question, deps, opts)` : `safeEmbed(question)` → top-k `groupes` par cosinus (le savoir réconcilié fait AUTORITÉ : résumé + verdict consensus/conditionnel/désaccord + claims avec provenance vidéo+timestamp via `getClaimsByGroupe`) + top-k `segments` en couche d'appoint (citations étendues, contexte). Payload **cappé dur** (patron `MEMOIRE_SECTION_MAX_CHARS`) et libellé explicite : *« les groupes font autorité, les segments sont du contexte »*.
- Ne LÈVE JAMAIS (fail-open, corpus absent → réponse vide honnête).

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 (logique de tri bornée, pas d'effet de bord) | S |

## A3 — L'outil Élève (`server/src/eleve-tools/eleve-savoir-tools.ts`) + flag — NOUVEAU

- Outil `savoir_video(corpus, question)` gaté `ELEVE_SAVOIR` (nouveau flag `flags.ts`, défaut **OFF** — feature neuve, rollout prudent) : appelle `interroger`, sortie `sanitizeExternal`, format « énoncés réconciliés + sources horodatées + désaccords ». Patron identique aux outils Élève existants (`eleve-youtube-tools.ts`).
- Câblage dans le registre d'outils de l'Élève (même endroit que `lis_video_youtube`).

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 (surface mince sur A2) | S |

## A4 — Tests + vérification EN RÉEL

- `test-savoir-query.ts` (déterministe, store en mémoire/temp + embed mocké) : groupes prioritaires sur segments, cap respecté, désaccord restitué, corpus vide → vide.
- `test-run-savoir.ts` (deps injectées, zéro réseau) : resume (une vidéo `reconciliee` sautée), `sans_transcript` n'extrait rien, ordre des statuts.
- `test-eleve-savoir-tools.ts` : gate OFF → outil absent ; ON → appelle `interroger`, sanitize.
- **Preuve EN RÉEL** (la vraie validation, comme toute la session fault-finding) : ingérer un VRAI petit corpus (2-3 vraies vidéos courtes d'un même sujet, yt-dlp réel) → vérifier la base peuplée (claims ancrés au verbatim, groupes réconciliés) → poser une vraie question via l'outil → obtenir des énoncés sourcés avec timestamps, y compris un désaccord si le corpus en contient. Suite offline complète verte. Nouveaux tests enregistrés au `test-manifest.json`.

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 | M |

**Effort total Plan A : L (2-4 sessions).** Livrable : l'Élève peut puiser dans un corpus vidéo réel pendant qu'il construit → qualité de contenu sourcée (sert le produit).

---

# PLAN B — Fenêtre Option 2 (base personnelle interrogeable : REST + UI)

Se branche SUR le moteur commun du Plan A (A1 runner + A2 requête déjà faits). Ne réécrit rien du moteur — uniquement les surfaces que Raf utilisera directement. Raf a indiqué qu'il « va beaucoup l'utiliser » → Plan B n'est pas optionnel, c'est la 2ᵉ livraison ferme.

## B1 — Routes REST (`server/src/savoir/savoir-routes.ts`) — NOUVEAU

- `GET /api/savoir` — liste des corpus (slugs + compteurs : nb vidéos, nb groupes, statut d'ingestion).
- `GET /api/savoir/:slug?q=…` — interroge (appelle `interroger`), renvoie groupes réconciliés + provenance + désaccords.
- `POST /api/savoir/:slug/ingest` — lance `ingestCorpus` en tâche de fond (fire-and-forget, patron des tâches longues existantes ; poser une ancre de livraison type `turn-ledger` car l'ingestion est longue) sur une URL de chaîne ou une liste.
- `GET /api/savoir/:slug/status` — progression d'ingestion (compte les statuts via `listVideos`).

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 | S |

## B2 — Écran UI « Savoir » (`ui/src/components/Savoir.jsx` + entrée nav) — NOUVEAU

- Un champ « ajouter un corpus » : coller une URL de chaîne YouTube (ou une liste de vidéos) → bouton Ingérer → barre de progression (poll `/status`).
- Une barre de recherche : taper une question en langage naturel → résultats structurés : chaque **groupe** = un énoncé réconcilié + son verdict (badge consensus/conditionnel/**désaccord ouvert**) + les sources cliquables (vidéo + timestamp, lien YouTube `&t=`).
- Un désaccord affiche LES DEUX positions (jamais un « vrai » décrété) — c'est le différenciant vs un résumé plat.
- Registre visuel : réutilise le style néon-épuré MangoOS déjà validé (pas d'invention de design). Responsive mobile (Raf teste sur téléphone via LAN).

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 (UI + intégration) | M |

## B3 — Tests + vérification EN RÉEL

- `test-savoir-routes.ts` : liste, requête, lancement d'ingestion (deps mockées), statut.
- **Preuve EN RÉEL via l'UI** (Playwright sur le vrai backend, ports 3000/5173 vérifiés anti-orphelin d'abord) : coller une vraie chaîne courte → ingestion visible → poser une vraie question → voir la synthèse réconciliée avec timestamps cliquables, dont un désaccord. Build UI vert, suite offline verte.

| Modèle optimal | Effort |
|---|---|
| ⚖️ Sonnet 4.6 | S |

**Effort total Plan B : M (1-2 sessions), APRÈS Plan A.** Livrable : Raf ingère des chaînes/confs et les interroge lui-même — un second cerveau vidéo.

---

## Ordre recommandé & jonctions

1. **Plan A d'abord** (moteur + outil Élève) — le moteur est le prérequis dur des deux fenêtres, et l'outil Élève est la plus petite surface pour prouver le moteur en réel.
2. **Plan B ensuite** (REST + UI) — pur ajout de surfaces sur un moteur déjà prouvé, donc rapide et à faible risque.
3. **Jonction future #181** (hors scope ici, notée) : le plan d'origine prévoit un `savoir-export.ts` (contrat typé « banque sourcée ») pour que la Fabrique de formations consomme le corpus. À ne construire que si/quand #181 le demande.

## Prérequis à vérifier au lancement (checklist de démarrage)

- `PRELAUNCH_CHECKLIST.md` déroulée si un run réel long est prévu.
- yt-dlp toujours présent/fonctionnel sur la machine (`python -m yt_dlp --version`) — dépendance externe.
- Ollama vivant + cerveau `juge` répondant (la réconciliation en dépend).
- Ports 3000/5173 libres (anti-orphelin) avant tout lancement backend/UI/Playwright.
- Filet de reprise posé (TaskCreate + cron heartbeat) — chantier multi-sessions.

## Limites honnêtes (à consigner dans `limites.md` à la livraison)

- **yt-dlp = dépendance externe** (déjà installée sur la machine de Raf, déjà prouvée) : quand YouTube durcit, un yt-dlp périmé casse — verdict honnête `transcript:absent`, jamais d'invention. TOS YouTube en zone grise (usage perso local, faible volume).
- **Le juge de réconciliation est un LLM** : la qualité des verdicts consensus/désaccord dépend du cerveau `juge` souverain — même classe de limite que le volet contenu (L138) : un juge peut se tromper ; fail-open → `isole` si muet, rien n'est jamais supprimé, tout passe par `savoir_journal` auditable.
- **v1 = transcript seulement** : les démonstrations purement visuelles (« regardez la différence » sans le dire) sont perdues — point d'extension Whisper/frames nommé mais hors v1.

## Vérification transverse (les deux plans)

`tsc --noEmit` propre à chaque étape · suites de tests nouvelles + suite offline complète verte · preuve EN RÉEL sur un vrai corpus (pas un mock) avant de déclarer « activé » · `historique.md`/`statut.md`/`limites.md`/wiki mis à jour · commit demandé explicitement à Raf après chaque plan.
