# Plan #177-ambitieux — Base de connaissance cross-vidéos YouTube

> Conception Fable 5, 2026-07-03. Document autonome : exécutable par Sonnet/Opus sans retour vers l'architecte. L'annexe (section 5) alimente le corpus d'étude `docs/corpus-fable/`.
>
> **Existant lu avant de concevoir** : `fondation.md` · `docs/roadmap-game-changer.md` (#177/#181) · `docs/plan-181-formation-adaptative.md` · `docs/plan-178-bible-narrative.md` · `server/src/eleve-web-tools.ts` (chercher_web/lire_page) · `eleve-http-tools.ts` (requete_web #166) · `eleve-site-tools.ts` (extraire_site #159) · `kernel-blackboard-sqlite.ts` · `eleve-memoire.ts` · `eleve-judge.ts` · `eleve-content.ts` (têtes) · `limites.md` (intégral) · le skill Claude `lire-youtube` de Raf (`~/.claude/skills/lire-youtube/`) · l'environnement machine (yt-dlp, ffmpeg).

---

## 1. Contexte & contraintes

### 1.1 Le problème, reformulé

La demande n'est pas « résumer une vidéo ». C'est : **N vidéos d'un même sujet (jusqu'à une chaîne entière) → un savoir structuré, réconcilié, interrogeable, avec provenance au timestamp près** — qui alimente directement la Fabrique de formations #181 (« donne cette chaîne YouTube → Mango en fait une formation adaptative »).

Posons la nature réelle du problème. Une chaîne de photographie de 50 vidéos ≈ 15-25 h de parole ≈ 150 000-250 000 mots de transcript. Personne — ni humain ni LLM — ne « lit » ça à chaque question. Et surtout : **les 50 vidéos ne sont pas d'accord entre elles** (la vidéo de 2021 dit « toujours ISO 100 », celle de 2024 dit « l'ISO auto est devenu fiable »), et souvent **une même vidéo se contredit selon le contexte** (« f/1.8 » pour le portrait, « f/8 » pour le paysage — pas une contradiction : un savoir *conditionnel*).

Donc, comme pour #178, ce n'est pas un problème de génération. C'est un problème de **base de données de claims** :

> Le savoir d'un corpus vidéo est un ensemble d'**affirmations sourcées** (qui l'a dit, dans quelle vidéo, à quelle seconde, dans quelles conditions), **regroupées** par sujet, **réconciliées** (consensus / conditionnel / désaccord ouvert), et **jamais coupées de leur provenance**. La question n'est pas « comment résumer » mais : où vivent les claims, comment on les extrait, comment on les regroupe, qui arbitre, et comment on les requête.

Trois sous-problèmes, en difficulté croissante :

1. **Accéder** au contenu (transcripts YouTube) — problème **externe et fragile**, traité en 1.3 comme une décision d'architecture à part entière.
2. **Représenter et réconcilier** le savoir — problème de schéma + de juge, où le pattern cousin #178 (statut `candidat`, réconciliateur, journal) s'applique avec une divergence assumée (D2).
3. **Restituer** avec provenance — problème d'interface (outil Élève + route + export #181), le plus simple une fois 1-2 posés.

### 1.2 La vérité sur « la fondation #177 livrée » — un acquis fantôme

`docs/roadmap-game-changer.md` affirme : *« #177 — fondation livrée : outil `voir_video` avec logique pure testée et deps injectées »*. **C'est faux dans le code de ce repo** : `grep -ri voir_video` et `grep -ri video` sur `server/src` ne renvoient **rien** ; `statut.md` et `historique.md` n'en portent aucune trace ; aucun commit ne mentionne #177. La « fondation » a été soit décrite par anticipation, soit livrée dans un worktree jamais fusionné.

Conséquence (RÈGLE GRAVÉE v2 de `fondation.md`, appliquée à la roadmap elle-même) : **ce plan part de zéro sur l'ingestion vidéo** et n'hérite d'aucun module `voir_video`. Le nom même est abandonné au profit de modules `savoir-*` (le produit est une *base de savoir*, pas un « visionnage »). L'exécutant qui reprendra ce plan ne doit **pas** chercher à « brancher yt-dlp sur voir_video » (consigne obsolète du roadmap) : il n'y a rien à brancher.

### 1.3 Les voies d'accès aux transcripts — évaluation honnête

C'est LE mur externe du chantier. MangoOS n'a aucun accès YouTube natif ; `lire_page` sur une page `watch?v=` renvoie du bruit (page JS-lourde). Les voies réelles, évaluées :

| Voie | Comment | Forces | Fragilités | Verdict |
|---|---|---|---|---|
| **yt-dlp local** (sous-titres seuls, `--skip-download`) | `python -m yt_dlp -J` (métadonnées) + `--write-subs --write-auto-subs --sub-langs fr,en` → VTT parsé | Projet massivement maintenu (releases toutes les ~2 semaines, s'adapte aux changements YouTube plus vite que tout code maison) ; **déjà installé sur la machine de Raf** (module pip `2026.03.17` + ffmpeg winget) ; **déjà prouvé sur cette machine** par le skill Claude `lire-youtube` (script `transcript.py`, même mécanique exacte) ; pas de clé, pas de téléchargement vidéo ; sous-titres manuels ET auto | (a) **TOS gris** : les CGU YouTube interdisent l'accès automatisé non autorisé — usage personnel local à faible volume = risque pratique faible, mais à nommer ; (b) YouTube durcit (PO tokens, blocage d'IP datacenter — l'IP résidentielle de Raf passe aujourd'hui) ; (c) **binaire externe à maintenir** : quand YouTube change, un yt-dlp vieux de 3 mois casse — dépendance déclarée façon L57/`UNITY_PATH` (outil externe nommé, verdict honnête si absent), jamais vendorisée ; (d) dépendance Python hors stack Node | ✅ **VOIE PRIMAIRE** |
| **Scraping maison de la page watch** (Playwright `getBrowser()` existant → `ytInitialPlayerResponse.captions` → pistes timedtext) | Code maison keyless, réutilise l'infra navigateur de `chercher_web` | Zéro dépendance nouvelle ; souverain | Réimplémente à la main ce que yt-dlp maintient à plein temps (violation « ne jamais réinventer un standard maintenu ») ; casse aux mêmes changements YouTube que yt-dlp mais sans l'équipe qui répare ; les URLs timedtext exigent désormais des jetons (`pot`) selon les cas | 🟡 **REPLI n°2** (si module Python absent/cassé), pas primaire |
| **YouTube Data API v3 officielle** | Clé API gratuite (quota 10k unités/jour) | Légal, stable, officiel | `captions.download` exige **OAuth du PROPRIÉTAIRE de la vidéo** → inutilisable pour des vidéos tierces. Utile SEULEMENT pour métadonnées + énumération de chaîne | 🟡 **OPTIONNEL** (métadonnées/énumération si clé posée), jamais pour les transcripts |
| **Flux RSS de chaîne** (`youtube.com/feeds/videos.xml?channel_id=…`) | `requete_web` GET (déjà autorisé, anti-SSRF ok) | Keyless, officiel, stable | **15 dernières vidéos seulement** → insuffisant pour « chaîne entière » | ✅ retenu pour la **veille incrémentale** (nouvelles vidéos d'un corpus suivi) |
| **APIs tierces de transcript** (Supadata, SearchAPI, apify…) | `requete_web` + clé payante | Robustes, maintenues par un tiers | Abonnement ; les URLs consultées transitent par un tiers (contraire souveraineté) ; dépendance de survie d'un SaaS | 🔴 rejeté en v1 ; **piste externe documentée** si yt-dlp casse durablement (limites.md) |
| **Sites agrégateurs de transcripts** via `lire_page` (youtubetotranscript & co) | Outil existant | Zéro code | Instables, pub, captcha, pas de timestamps fiables | 🔴 rejeté |
| **ASR local (Whisper)** — faster-whisper/whisper.cpp sur la GTX 1080 Ti | Télécharger l'AUDIO (yt-dlp `-f bestaudio`) puis transcrire localement | Couvre les vidéos **sans aucun sous-titre** ; souverain, $0 | Téléchargement audio = TOS plus engageant ; minutes de calcul GPU par vidéo ; qualité vs sous-titres auto YouTube à valider ; conflit VRAM avec l'œil VL (précédent L61 : sérialiser) | 🟡 **HORS V1**, piste inscrite au registre (limites.md) pour les vidéos `transcript:absent` |

**La chaîne de dégradation retenue** (D1 la formalise) : yt-dlp (manuels > auto, fr > en) → scraping maison → **métadonnées seules** (titre, description, chapitres — la vidéo reste au corpus, marquée `transcript:absent`, **aucun claim n'en est extrait** — on ne compense JAMAIS un transcript manquant par de l'invention) → (futur gaté) Whisper local. Tout transcript obtenu est **caché sur disque à vie** — on ne re-frappe jamais YouTube pour une vidéo déjà ingérée ; politesse : une vidéo à la fois, délai entre requêtes, budget par run.

### 1.4 L'existant à réutiliser (cartographie, pas invention)

| Brique | Fichier | Ce qu'elle donne à #177 |
|---|---|---|
| Anti-SSRF + sanitisation | `vision.ts` (`isCloneableUrl`), `agent-contract.ts` (`sanitizeExternal`) | tout contenu externe (transcript inclus) = DONNÉE, jamais instruction |
| Recherche/lecture web | `eleve-web-tools.ts` (`searchWeb`, chaîne Tavily→DDG→Mojeek) | trouver la chaîne/les vidéos d'un sujet quand Raf donne un THÈME et pas une URL |
| Appels HTTP bordés | `eleve-http-tools.ts` (#166) | flux RSS de chaîne, oEmbed — GET bornés, anti-SSRF |
| Stockage versionné | `kernel-blackboard-sqlite.ts` (pattern qualifié « exemplaire ») | migrations PRAGMA `user_version`, backup `.bak-v<n>`, WAL, fail-open — copié tel quel (comme `bible-store` #178 É1) ; `cosine`/`rankByCosine` (`kernel-blackboard-store.ts`), `safeEmbed` (`notes-rag.ts`) |
| Extraction structurée | `eleve-content.ts` (`generateContentItems`, `extractJsonArray`, `validateItems`) | le patron éprouvé « prompt+schéma+retry, ne lève jamais » pour extraire les claims |
| Juge souverain | `eleve-judge.ts` (cerveau `juge` distinct de l'exécutant, verdict JSON, fail-open neutre) | l'arbitre de réconciliation (D3) |
| Rappel mémoire | `eleve-memoire.ts` (`rappelerSouvenirs`, caps durs, fail-open) | surfacer « tu as un corpus photo » dans la boucle |
| Runner resumable | `run-toeic-content.ts` (state.json) + manifest #181 D6 | l'ingestion de 50 vidéos = boucle par vidéo, reprenable, jamais un run géant |
| Précédent BD dédiée | `server/data/pdf-store.db` (+ `.bible/` prévu par #178) | une base SQLite dédiée par domaine de savoir est déjà la norme du repo |
| Gardien / gates | `eleve-gate.ts`, discipline `test-fondations-gates-combines.ts` | tout comportement neuf gaté `SAVOIR_*`/`ELEVE_SAVOIR`, défaut OFF, off = byte-identique |

### 1.5 Contraintes non négociables (héritées)

- **Local-first, zéro dépendance native npm** : `node:sqlite` uniquement ; yt-dlp = outil EXTERNE déclaré (comme Unity L57), jamais embarqué.
- **Gates opt-in, off = byte-identique** ; fail-open partout ; le Gardien #161 reste actif sur tout chemin livrable.
- **Qualité en situation réelle** (règle ⭐⭐⭐) : « la base se remplit » ne veut rien dire ; le critère est une **contradiction réelle réconciliée avec provenance vérifiable à la main** (É4).
- **Standards à la périphérie, custom au cœur** : yt-dlp et SQLite (périphérie standard) ; le schéma de claims, le réconciliateur et la jonction #181 (le différenciateur) sont custom.
- **Ne jamais présenter une cible comme un acquis** — leçon rejouée par l'acquis fantôme de 1.2.
- **Transmission** : l'extraction et l'arbitrage tournent sur les cerveaux de Mango (GLM exécutant + juge souverain), pas sur Claude.

### 1.6 Ce que ce chantier ne promet PAS

- Il ne promet pas que le savoir extrait est **vrai** — il promet qu'il est **fidèlement sourcé et honnêtement réconcilié**. Une base construite sur 50 youtubeurs restitue l'état de l'art *tel que ces youtubeurs le racontent*, désaccords inclus. C'est exactement ce que #181 exige (sources traçables), pas plus.
- Il ne promet pas le savoir **visuel** en v1 (D7) : ce qu'un photographe *montre* sans le *dire* n'entre pas dans la base v1.
- Il ne promet pas l'immunité aux changements YouTube : la voie d'accès est fragile par nature, la dégradation est conçue pour que la base déjà constituée, elle, ne dépende plus jamais de YouTube (cache à vie).

---

## 2. Décisions d'architecture

Chaque décision liste les alternatives **considérées et rejetées**, avec le pourquoi.

### D1 — L'ingestion : yt-dlp en voie primaire derrière une interface maison à dégradation explicite

**Décision.** Un module `server/src/savoir-transcript.ts` expose UNE interface, indépendante de la voie d'accès :

```ts
interface TranscriptResult {
  videoId: string;
  meta: { titre: string; chaine: string; dureeS: number; publieeLe?: string; description?: string; chapitres?: {t: number; titre: string}[] };
  source: "subs-manuels" | "subs-auto" | "scrape-maison" | "absent";
  langue?: string;
  segments: { tStartS: number; tEndS: number; texte: string }[]; // vide si absent
}
fetchTranscript(videoId, deps): Promise<TranscriptResult>   // ne lève jamais
listChannelVideos(channelUrl, deps): Promise<{videoId, titre, publieeLe}[]>
```

Derrière : la **chaîne de dégradation de 1.3**, chaque étage étant une dep injectée (testable sans réseau). L'étage yt-dlp lance `python -m yt_dlp` via un `CommandRunner` injecté (pattern exact du backend `bws` du coffre-fort #170 et de `unity_build` L57) : binaire absent → verdict **honnête** (`source:"absent"` + raison « yt-dlp introuvable : pip install yt-dlp »), jamais de faux contenu. Le VTT est parsé en segments horodatés avec **déduplication des cues répétées** (les sous-titres auto répètent chaque ligne — le script `transcript.py` du skill de Raf documente le piège, on reprend sa logique en TS). Énumération de chaîne : `yt-dlp --flat-playlist -J <channel>/videos` (complet) ; veille incrémentale : flux RSS via `requete_web`. **Cache disque à vie** : `server/data/savoir/<corpus>/transcripts/<videoId>.json` — l'ingestion ne re-contacte JAMAIS YouTube pour une vidéo cachée ; **politesse** : séquentiel, délai `SAVOIR_FETCH_DELAY_MS` (défaut 4 000), budget `SAVOIR_FETCH_MAX` par run.

**Alternatives rejetées.**
- *Scraping maison en primaire* (souveraineté maximale, zéro dépendance Python) — c'est l'option que j'ai failli choisir, par réflexe « souverain d'abord ». Basculé par trois faits : (a) la RÈGLE GRAVÉE (« jamais réinventer un standard maintenu ») — yt-dlp est LE standard de ce problème, avec une équipe qui répare en jours ce que YouTube casse ; (b) le **précédent prouvé sur cette machine** : le skill `lire-youtube` de Raf utilise exactement `python -m yt_dlp` sans téléchargement et fonctionne ; (c) le scraping maison casse aux mêmes changements que yt-dlp, mais personne ne le répare. Le scraping maison est **repêché en repli n°2** (pattern « rejet-total → repêchage-en-secondaire », annexe 5.3).
- *API tierce payante en primaire* — robuste mais : abonnement, données via un tiers, survie d'un SaaS. Contraire aux piliers. Documentée comme piste de secours au registre.
- *`lire_page`/`extraire_site` sur la page watch* — prouvé inadapté (page JS-lourde, transcript non rendu dans le DOM initial) ; `extraire_site` reste utile en AMONT (comprendre le site d'un youtubeur, trouver sa chaîne), pas pour le transcript.
- *Télécharger la vidéo entière et transcrire/analyser localement* — TOS nettement plus engageant, bande passante et disque (50 vidéos ≈ dizaines de Go), et inutile tant que les sous-titres existent (cas très majoritaire sur les chaînes pédagogiques). L'audio-seul + Whisper reste la piste future pour `transcript:absent` (limites.md).
- *Un MCP YouTube externe* — il en existe, mais tous enveloppent yt-dlp ou une API tierce : une couche de plus pour le même mur, sans gain. Le loader MCP externe (L59) reste disponible si un MCP officiel émergeait un jour (évolution à surveiller).

### D2 — Le modèle du savoir : des CLAIMS sourcés au timestamp, à énoncé libre + typage court, dans une SQLite dédiée par corpus

**Décision.** Une base **SQLite dédiée par corpus** : `server/data/savoir/<slug>/savoir.db`, module `server/src/savoir-store.ts` **copiant le pattern** `kernel-blackboard-sqlite.ts` (migrations versionnées, backup avant up(), WAL, fail-open, prune outillé). Schéma v1 — 6 tables, chacune exigée par une requête du pipeline :

```sql
-- Les vidéos du corpus (l'unité d'ingestion)
CREATE TABLE videos (
  id          INTEGER PRIMARY KEY,
  youtube_id  TEXT NOT NULL UNIQUE,
  titre       TEXT NOT NULL,
  chaine      TEXT NOT NULL,
  duree_s     INTEGER NOT NULL DEFAULT 0,
  publiee_le  TEXT,                      -- ISO, pour le poids de récence (D3)
  transcript_source TEXT NOT NULL,       -- subs-manuels|subs-auto|scrape-maison|absent
  langue      TEXT,
  statut      TEXT NOT NULL DEFAULT 'a_ingerer', -- a_ingerer|transcrite|extraite|reconciliee|sans_transcript
  fetched_at  INTEGER
);

-- La matière brute horodatée. Source de vérité de toute citation (jamais réécrite).
CREATE TABLE segments (
  id         INTEGER PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id),
  t_start_s  INTEGER NOT NULL,
  t_end_s    INTEGER NOT NULL,
  texte      TEXT NOT NULL,
  embedding  TEXT                        -- nomic via Ollama, TEXT JSON (pattern blackboard)
);

-- LE cœur : une affirmation extraite, autoportante, sourcée à la seconde.
CREATE TABLE claims (
  id         INTEGER PRIMARY KEY,
  enonce     TEXT NOT NULL,              -- affirmation normalisée, compréhensible seule
  sujet      TEXT NOT NULL,              -- entité/technique normalisée (lie à entites.nom)
  type       TEXT NOT NULL,              -- technique|reglage|recommandation|fait|opinion|avertissement
  conditions TEXT NOT NULL DEFAULT '',   -- contexte de validité ("en portrait", "en basse lumière")
  video_id   INTEGER NOT NULL REFERENCES videos(id),
  t_start_s  INTEGER NOT NULL,           -- provenance : URL horodatée dérivable (&t=<s>s)
  segment_id INTEGER NOT NULL REFERENCES segments(id),
  extrait    TEXT NOT NULL,              -- citation VERBATIM du transcript (vérifiabilité déterministe)
  statut     TEXT NOT NULL DEFAULT 'candidat', -- candidat|canon|conteste|rejete
  groupe_id  INTEGER REFERENCES groupes(id),
  poids      REAL NOT NULL DEFAULT 1.0,  -- posé par la réconciliation (D3)
  embedding  TEXT
);

-- Le niveau RÉCONCILIÉ : un groupe de claims sur le même point = l'unité de réponse.
CREATE TABLE groupes (
  id        INTEGER PRIMARY KEY,
  sujet     TEXT NOT NULL,
  resume    TEXT NOT NULL,               -- l'énoncé consolidé (ou l'exposé des deux écoles)
  verdict   TEXT NOT NULL,               -- consensus|conditionnel|desaccord|isole
  arbitrage TEXT NOT NULL DEFAULT '',    -- la note du juge : pourquoi ce verdict, condition discriminante
  embedding TEXT
);

-- Le référentiel du domaine (techniques, matériel, concepts) — pour normaliser `sujet`.
CREATE TABLE entites (
  id     INTEGER PRIMARY KEY,
  nom    TEXT NOT NULL UNIQUE,           -- "ouverture", "règle des tiers", "ISO"
  alias  TEXT NOT NULL DEFAULT '[]',     -- JSON ["diaphragme","f-stop"]
  type   TEXT NOT NULL DEFAULT 'concept',
  embedding TEXT
);

-- Append-only : toute mutation (promotion, arbitrage, rejet) — audit + undo.
CREATE TABLE savoir_journal (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, op TEXT NOT NULL, detail TEXT NOT NULL
);
```

La provenance d'un claim se rend en une ligne : `https://www.youtube.com/watch?v=<youtube_id>&t=<t_start_s>s` — **cliquable, et directement au format `sources:[url…]` que le volet PÉDAGO de #181 exige**.

**Convergences et divergence assumées avec la bible #178** (le pattern cousin) :
- **Converge** : SQLite dédiée hors Blackboard · migrations/backup/WAL/journal copiés du même patron · statut `candidat` obligatoire (rien n'entre canon directement) · réconciliateur entre extraction et canon · embeddings TEXT JSON + cosinus brute-force (volumétrie : 50 vidéos ≈ 3-6 k segments + 1-3 k claims → ~10-20 ms par recherche, mêmes ordres de grandeur que D7 de #178 — l'ANN attendra).
- **Diverge — pas de vocabulaire de prédicats contrôlé.** La bible #178 vit en **monde fermé** (l'histoire n'a que ~10 relations possibles : vivant, localisation, sait…) : un vocabulaire court rend les checks déterministes possibles. Un corpus YouTube vit en **monde ouvert** (la photographie, la menuiserie, TypeScript… n'ont pas de liste finie de prédicats) : imposer un vocabulaire fermé forcerait l'extraction à mutiler le savoir. À la place : `enonce` **libre**, discipliné par trois contraintes plus faibles mais tenables — un `type` contrôlé court (6 valeurs), un `sujet` normalisé contre `entites` (avec alias, comme #178), et l'`extrait` verbatim obligatoire. La réconciliation ne repose donc pas sur l'égalité de prédicats (impossible ici) mais sur le **clustering sémantique + juge** (D3). C'est le point où copier #178 aveuglément aurait été une faute.

**Alternatives rejetées.**
- *Scope Blackboard (`savoir:<corpus>`) comme stockage primaire* — même rejet que #178 D1 : un claim a besoin de colonnes réelles (statut, video_id, t_start_s, groupe_id) pour être requêté et joint ; le clé/valeur JSON opaque interdit « tous les claims contestés du sujet X avec leurs sources ». Le Blackboard **garde un rôle** : un pointeur d'index par corpus (scope `savoir:index`, une entrée = slug + sujet + résumé + embedding) pour que `eleve-memoire` fasse remonter « tu as déjà un corpus photo » dans n'importe quel projet. La base porte le savoir, le Blackboard porte le fait qu'elle existe.
- *Triplets stricts entité-prédicat-objet (mini graphe de connaissance)* — la forme académique du problème. Rejetée pour la même raison que le vocabulaire contrôlé : en monde ouvert, l'extraction LLM produit des prédicats infiniment variés (`recommande`, `conseille`, `préfère`…) → la réconciliation par jointure devient illusoire, on retombe sur du sémantique. Autant assumer l'énoncé libre + embedding directement, avec 2 colonnes structurantes (sujet, type) au lieu de 3 fausses-structurantes.
- *Stocker les transcripts en Markdown/fichiers et faire du RAG dessus sans claims* — rejeté comme mécanisme primaire (voir D3, alternative « RAG pur »). Les fichiers de cache existent (D1) mais ne sont pas la base : on ne requête pas des VTT.
- *Une seule grosse base multi-corpus* — rejeté : un corpus = un domaine = un cycle de vie (on supprime/archive un corpus entier) ; par fichier, la suppression est un `rm`, le backup un copy, le débogage un fichier. Précédent : `pdf-store.db` séparé de `blackboard.sqlite`.
- *`confidence` par claim posée par l'extracteur* — écarté (leçon de l'auto-critique #178 5.5 : « chaque colonne doit avoir un client nommé »). Le `poids` est posé par la **réconciliation** (D3, client nommé : le tri des réponses), pas par l'extracteur (qui s'auto-noterait).

### D3 — La réconciliation : clustering déterministe d'abord, juge souverain ensuite ; l'arbitrage pondère, il ne DÉCRÈTE jamais le vrai

**Décision.** Module `server/src/savoir-reconcile.ts`, en deux étages (la hiérarchie déterministe-d'abord de tout le repo) :

**Étage 1 — regroupement DÉTERMINISTE (pur, testable sans LLM).** Les claims `candidat` sont regroupés par : même `sujet` normalisé (via `entites` + alias) **ET** similarité d'embedding au-dessus d'un seuil (`SAVOIR_CLUSTER_MIN`, défaut 0.78 — à calibrer É4). Sortie : des groupes de claims « qui parlent du même point ». Fonction pure `clusterClaims(claims, entites, seuil)` — aucune écriture.

**Étage 2 — arbitrage par le juge souverain** (pattern exact `eleve-judge.ts` : cerveau `juge` distinct de l'exécutant, JSON borné, fail-open → verdict `isole` si le juge est muet). Pour chaque groupe multi-claims, le juge reçoit les énoncés + conditions + extraits verbatim + dates de publication, et classe :

| Verdict | Signification | Action sur la base |
|---|---|---|
| `consensus` | formulations concordantes | un `resume` consolidé ; tous les claims → `canon`, poids = f(nb vidéos concordantes, récence) |
| `conditionnel` | les « contradictions » tiennent à des CONDITIONS différentes (« f/1.8 » en portrait vs « f/8 » en paysage) | le juge **extrait la condition discriminante** → `arbitrage` la nomme ; claims → `canon` avec leurs `conditions` enrichies. C'est le verdict le plus précieux pédagogiquement — la majorité des faux désaccords d'un corpus technique sont conditionnels |
| `desaccord` | vraies écoles opposées (« toujours RAW » vs « le JPEG suffit ») | **les DEUX positions conservées** → statut `conteste`, chacune avec poids (concordance × récence) ; `resume` = exposé des deux écoles ; `arbitrage` = ce qui les départage factuellement s'il existe. JAMAIS de suppression d'un côté |
| `isole` | un seul claim, ou juge indisponible | claim → `canon` à poids faible (source unique — affiché comme tel) |

Toute promotion/pondération passe par `savoir_journal` (op, avant/après) — auditable, réversible.

**Le principe qui gouverne l'étage 2** : sur un corpus d'opinions d'experts, **le juge n'a aucune légitimité à décréter qui a raison** — il a la légitimité de *classer la nature du désaccord* et de *pondérer par des faits mesurables* (combien de sources, lesquelles sont récentes). La vérité décrétée par un LLM bruité (L1/L19) serait pire que le désaccord exposé : #181 veut précisément pouvoir enseigner « il existe deux écoles, voici leurs arguments sourcés ».

**Alternatives rejetées.**
- *Arbitrage automatique tranchant (le juge élit un gagnant, l'autre est rejeté)* — rejeté : (a) juge bruité documenté (L1, L19) ; (b) sur des opinions, « le vrai » dépend du contexte et de l'année ; (c) écraser un avis détruit exactement la valeur différenciante de la base (la carte des écoles). Le rejet (`rejete`) n'existe que pour les claims **défectueux** (extraction cassée, hors-sujet), jamais pour les claims perdants d'un débat.
- *Vote majoritaire mécanique (le plus répété gagne)* — rejeté comme arbitre : les chaînes YouTube se copient (une erreur virale est majoritaire) et la redondance ≠ vérité. La concordance reste un **facteur de poids** (repêchage en secondaire), jamais un verdict.
- *Pas de réconciliation du tout (RAG pur sur segments : on cherche, le LLM répond en lisant les extraits)* — rejeté comme mécanisme primaire, pour la raison structurelle déjà établie par #178 D3 : le retrieval par similarité **fait remonter des présences, pas des oppositions** — la requête « quelle ouverture en portrait » remonte 12 segments concordants et noie le segment discordant ; la contradiction doit être **matérialisée** (table `groupes`) pour être restituée fiablement. Le RAG sur segments est **conservé en couche secondaire** (D5) : citations étendues, contexte, questions hors-claims.
- *Réconciliation par double-extraction concordante (le mécanisme fort-impact de #178 D5)* — non transposé : en #178, la double extraction protège des prédicats binaires à fort impact (mort/vivant). Ici il n'y a pas de claims « à fort impact » au sens transactionnel — l'équivalent du sas est le passage par `groupes` + verdict. Une double passe d'extraction doublerait le coût GLM du corpus entier pour un gain non démontré. Réévaluable à É4 si le taux de claims défectueux dépasse ~20 % (gate de décision).

### D4 — L'ingestion complète : un RUNNER resumable par manifest, une vidéo = une unité bornée, jamais un run agentique géant

**Décision.** `server/src/run-savoir.ts` (CLI : `npx tsx src/run-savoir.ts "<chaîne ou liste d'URLs>" --corpus photo-argentique`) orchestre la boucle **par vidéo** : fetch transcript (D1, cache) → segmentation (~400-700 caractères, coupée aux frontières de cues, timestamps préservés) → embeddings segments (`safeEmbed`, fail-open) → extraction claims (D5 ci-dessous → `candidat`) → coche le manifest. Puis une passe de réconciliation cross-vidéos (D3) quand toutes les vidéos du lot sont extraites (les groupes se recalculent sur l'ensemble — la réconciliation est **globale au corpus**, pas incrémentale par vidéo, pour que la 50ᵉ vidéo puisse contredire la 1ʳᵉ).

L'état inter-runs vit dans `server/data/savoir/<slug>/corpus.json` (le **manifest**, patron exact de #181 D6 / `run-toeic-content.ts`) : liste des vidéos + statut par vidéo (`a_ingerer|transcrite|extraite|sans_transcript`) + décisions figées (langue, seuils). Kill -9 → relance → reprend à la première vidéo non faite. L'extraction est un appel LLM **direct** (façon `generateContentItems`), PAS un run agentique : pas d'outils à orchestrer, un prompt + un schéma suffisent — plus rapide, moins cher, plus testable.

**Alternatives rejetées.**
- *Un run agentique Élève « ingère cette chaîne »* — 50 vidéos ne tiennent ni dans `ELEVE_AGENTIC_MAX_ITER` ni dans un budget contexte ; et l'ingestion n'a besoin d'aucune décision d'outillage — c'est un pipeline, pas une mission. Même conclusion que #178 (« le runner porte la boucle longue »).
- *État de reprise dans le Blackboard ou dans `eleve-plan`* — pièges déjà documentés (#181 D6) : le plan est éphémère in-process ; le Blackboard n'est pas fait pour l'état d'UN pipeline. Le manifest fichier est le patron prouvé.
- *Réconciliation incrémentale au fil des vidéos* — séduisante (résultats précoces) mais fausse : les groupes formés à la vidéo 3 devraient être re-fusionnés à chaque arrivée → complexité d'invalidation pour un gain nul (la réconciliation complète sur 3 k claims ≈ secondes de clustering + N appels juge de toute façon bornés). On garde : extraction incrémentale, réconciliation par passes globales (relançables — les verdicts précédents sont journalisés et re-calculables).

### D5 — L'extraction de claims : LLM structuré avec CITATION VERBATIM OBLIGATOIRE — le garde-fou déterministe du maillon faible

**Décision.** `server/src/savoir-extraction.ts`, patron `eleve-content.ts` (prompt + schéma + `extractJsonArray` + `validateItems` + un retry, ne lève jamais). L'extracteur (GLM, $0-Claude) reçoit une **fenêtre de segments** (~3-5 k caractères, chevauchement d'un segment) + les `entites` déjà connues du corpus (pour lier au lieu de dupliquer — même mécanique que #178 D5), et sort des claims candidats : `enonce` autoportant, `sujet`, `type`, `conditions`, `t_start_s`, **`extrait`**.

La règle qui rend le maillon faible contrôlable : **chaque claim DOIT porter un `extrait` verbatim, et la validation vérifie DÉTERMINISTIQUEMENT que cet extrait figure dans le segment source** (matching tolérant : casse/espaces/ponctuation). Un claim dont l'extrait n'est pas dans le transcript est **rejeté mécaniquement** — l'hallucination d'extraction ne peut pas entrer dans la base, car elle ne peut pas produire un verbatim exact d'un texte qu'elle invente. C'est la transposition de l'asymétrie #178 §1.2 (charger l'arc fiable) : on ne sait pas garantir que l'énoncé est bien *interprété*, on sait garantir qu'il est *ancré* dans une phrase réellement prononcée, à un timestamp réel.

**Alternatives rejetées.**
- *Extraction sans verbatim (énoncés seuls)* — le défaut naïf : rien ne distingue alors un claim fidèle d'un claim halluciné, et la provenance timestamp serait elle-même invérifiable. Le verbatim coûte quelques tokens et achète la vérifiabilité déterministe de TOUTE la chaîne aval (y compris la vérification des leçons #181, D6).
- *Résumer chaque vidéo puis extraire du résumé* — perte en cascade (le résumé jette précisément les réglages/nuances qui font la valeur) + les timestamps se perdent. L'extraction travaille sur les segments bruts, toujours.
- *NER/IE classique (spaCy…)* — même rejet que #178 D5 : dépendance Python-modèles pour une IE faible sur ce qui compte (recommandations, conditions, modalités).
- *Faire extraire par le juge/un cerveau plus fort* — l'extraction est le poste de coût dominant (50 vidéos × ~40 fenêtres) ; GLM est le rédacteur prouvé du repo (TOEIC ~456 questions). Le juge (plus rare, plus cher) se réserve à l'arbitrage D3. Escalade Maître plafonnée si le taux de rejet explose (mécanique existante).

### D6 — La restitution : un module de requête unique, DEUX surfaces minces (outil Élève + route REST), et un contrat d'export « banque sourcée » pour #181

**Décision.** `server/src/savoir-query.ts` (pur, deps injectées) : `interroger(corpus, question)` → embedding de la question → (1) top-k `groupes` (le savoir réconcilié : résumé, verdict, arbitrage, claims avec provenances) + (2) top-k `segments` en couche d'appoint (citations étendues), le tout **cappé dur** (pattern `MEMOIRE_SECTION_MAX_CHARS`) et libellé : *les groupes font autorité, les segments sont du contexte*. Deux surfaces minces par-dessus :

1. **Outil Élève `savoir_video`** (`eleve-savoir-tools.ts`, gate `ELEVE_SAVOIR=on`, défaut off) : « interroge la base de connaissance vidéo (corpus, question) → énoncés réconciliés + sources horodatées + désaccords ». Sortie `sanitizeExternal` (le transcript reste de la donnée). C'est ce qui permet à un run de génération quelconque (une app photo, un article) de PUISER dans le corpus.
2. **Route `GET /api/savoir/:slug?q=…`** (+ `GET /api/savoir` liste des corpus) : pour l'UI, pour la Fabrique #181, pour Raf au curl.

**La jonction #181 — le contrat d'export.** `server/src/savoir-export.ts` produit ce que la Fabrique consomme :
- **`exportSujets(corpus)`** → la carte des sujets couverts (groupes par entité, poids, verdicts) : l'étape ① de la Fabrique (#181 É3, « cadrage — identité du sujet ») peut **dériver le curriculum du corpus** au lieu de partir du web nu.
- **`exportBanqueSourcee(corpus, sujet)`** → pour chaque point : énoncé consolidé + conditions + citations verbatim + `sources: [url horodatée…]` + désaccords exposés. La génération de leçons (#181, `generateContentItems`) reçoit ce paquet dans son `sujet` → **chaque leçon naît sourcée**, satisfaisant mécaniquement l'exigence « sources présentes » du volet PÉDAGO (#181 É4).
- **Adaptation déclarée du volet PÉDAGO** (retouche bornée côté #181, pas ici) : pour une source `youtube.com/watch…&t=…`, la vérification d'exactitude par échantillonnage ne passe PAS par `lire_page` (page JS-lourde, inutilisable) mais par la base : l'affirmation est comparée au **segment stocké** (le corpus porte le verbatim) — vérification plus déterministe que le juge-relit-la-page du cas web. Point d'extension à inscrire dans #181 É4 au moment du branchement.
- Les groupes `desaccord` deviennent de la **matière pédagogique de première classe** : la formation les présente comme « les deux écoles » (avec sources des deux côtés) au lieu de trancher faussement.

**Alternatives rejetées.**
- *Outil Élève seul (pas de route)* — la Fabrique #181 et l'UI ne passent pas par le registre d'outils ; et un humain (Raf) doit pouvoir inspecter sa base. Les deux surfaces coûtent ~40 lignes chacune sur le même module — le pattern `shared-data.ts` (« wrapper mince, aucun nouveau moteur ») s'applique tel quel.
- *Export = dump Markdown de la base pour #181* — perd la structure (le volet PÉDAGO a besoin des sources par affirmation, pas d'un document) ; le Markdown reste une **vue** pour Raf (export lisible optionnel, comme la bible #178 É6), jamais le contrat.
- *#181 lit la SQLite directement* — couplage de schéma entre deux chantiers (toute migration de `savoir.db` casserait la Fabrique). Le contrat passe par les fonctions d'export typées, le schéma reste privé au module.

### D7 — Les frames vidéo : HORS v1, tranché — avec un point d'extension nommé

**Décision.** La v1 est **transcript-only**. L'analyse de frames (télécharger la vidéo, extraire des images-clés ffmpeg, les faire lire par `qwen3-vl` local) est EXCLUE du périmètre, pour un rapport coût/valeur sans ambiguïté :
- **Coût** : téléchargement des vidéos entières (TOS plus engageant + dizaines de Go pour une chaîne) ; VL local sur des centaines de frames (~70 s de cold-load L22 + secondes/frame sur la 1080 Ti, conflit VRAM L61 à sérialiser) ; et surtout un problème ouvert d'**alignement image↔claim** (savoir QUELLE frame illustre QUELLE affirmation) qui est un chantier en soi.
- **Valeur** : sur les chaînes pédagogiques parlées (le cas d'usage), l'essentiel du savoir est **énoncé** — le transcript le porte. Ce que la v1 perd : les démonstrations purement visuelles (« regardez la différence » sans la dire) — perte réelle, nommée, inscrite au registre.

**Point d'extension nommé** (pour ne pas re-concevoir plus tard) : la piste v2 n'est PAS « analyser toutes les frames » mais **« frames ciblées »** — pour les N claims au poids le plus fort, télécharger ±10 s autour du timestamp (yt-dlp permet le découpage par sections), extraire 2-3 frames, VL local, rattacher l'image au claim. Le schéma v1 le prépare à coût zéro : `t_start_s` est déjà la clé d'alignement ; une table `medias` s'ajoutera par migration (le mécanisme est prévu).

**Alternative rejetée en sens inverse** : *couper aussi les métadonnées visuelles faciles (miniatures, chapitres)* — non : les **chapitres** (timestamps titrés posés par l'auteur) sont dans les métadonnées yt-dlp, gratuits, et améliorent la segmentation (frontières naturelles) — ils SONT dans la v1 (D1).

---

## 3. Plan d'implémentation par étapes

Règles transverses : chaque étape laisse `tsc --noEmit` vert (le build UI n'est pas touché avant É6-route/UI éventuelle) · tout comportement runtime derrière `SAVOIR_*` / `ELEVE_SAVOIR`, défaut OFF, off = byte-identique · chaque étape a son test de preuve exécutable sans réseau (deps injectées) SAUF les preuves live explicitement nommées · clôture : `statut.md` + `historique.md` + wiki + `limites.md`.

**La première preuve du chantier — le jalon qui commande tout** : *3 vidéos réelles d'un même sujet, 1 contradiction réelle détectée et réconciliée, provenance vérifiable au clic*. É1→É4 n'existent que pour l'atteindre ; rien ne s'industrialise (échelle chaîne, interface, jonction #181) avant qu'elle soit passée. É1 attaque le mur le plus risqué (l'accès), car on ne réconcilie pas des claims qu'on ne peut pas lire.

### É1 — `savoir-transcript.ts` : la sonde d'accès (le mur externe d'abord)
- **Fichiers** : `server/src/savoir-transcript.ts` (neuf : interface D1, étage yt-dlp via `CommandRunner` injecté, parseur VTT+dédup, étage scraping-maison en repli, étage métadonnées-seules, cache disque, énumération `--flat-playlist` + RSS) · `server/src/test-savoir-transcript.ts` (neuf).
- **Réutilise** : pattern runner-injecté (coffre `bws` #170, `unity_build` L57) ; `getBrowser()` (`vision.ts`) pour le repli ; `requete_web`-style fetch borné pour RSS ; la logique VTT du script `transcript.py` du skill `lire-youtube` (référence de comportement, réécrite en TS).
- **Test de preuve** : fixtures VTT (dont cues dupliquées auto) → segments horodatés corrects ; runner scripté « binaire absent » → `source:"absent"` avec raison honnête, jamais de throw ; **LIVE** : 3 vraies vidéos d'un sujet choisi par Raf (défaut : photographie) → 3 transcripts en cache avec timestamps ; 1 vidéo connue sans sous-titres → `absent` propre ; 1 chaîne → liste complète des vidéos.
- **Modèle optimal** : ⚖️ Sonnet 4.6 (patrons existants à décliner ; le parseur VTT est mécanique) · **Effort** : M

### É2 — `savoir-store.ts` : le schéma et les requêtes cardinales
- **Fichiers** : `server/src/savoir-store.ts` (neuf : 6 tables D2, migrations versionnées + backup, CRUD, `promoteGroupe`/`rejectClaim` journalisés, `resolveEntite(nom)` tolérant alias, recherches cosinus par table) · `server/src/test-savoir-store.ts`.
- **Réutilise** : copie du pattern `kernel-blackboard-sqlite.ts` (PRAGMA user_version, MIGRATIONS[], backup, WAL, fail-open, `tableHasColumn`) — le même geste que `bible-store` #178 É1 ; `cosine`/`rankByCosine` ; `safeEmbed` (`notes-rag.ts`).
- **Test de preuve** : en `:memory:` — poser un mini-corpus (2 vidéos, 8 segments, 6 claims dont 2 opposés) ; les requêtes « claims canon du sujet X », « groupes en désaccord », « provenance du claim N → URL horodatée » sortent juste ; une promotion et un rejet passent par le journal (avant/après) ; migration v1→v2 factice avec backup.
- **Modèle optimal** : ⚖️ Sonnet 4.6 · **Effort** : M

### É3 — `savoir-extraction.ts` : segments → claims candidats, verbatim vérifié
- **Fichiers** : `server/src/savoir-extraction.ts` (neuf : fenêtrage des segments, prompt d'extraction avec `type` contrôlé + entités connues + règle verbatim, validation `extrait ∈ segment` déterministe avec matching tolérant, écritures `candidat` via É2, `ask` injecté) · `server/src/test-savoir-extraction.ts`.
- **Réutilise** : `extractJsonArray`/`validateItems` et le patron une-passe+retry de `eleve-content.ts` ; la liaison aux entités existantes = mécanique #178 É3.
- **Test de preuve** : sans réseau (ask scripté) — un transcript-fixture photo : claims bien formés entrent `candidat` avec timestamps ; un claim dont l'extrait N'EST PAS dans le segment est **rejeté mécaniquement** (le test central du chantier) ; JSON cassé → rien n'entre, rien ne lève ; entité « diaphragme » liée à « ouverture » par alias, pas dupliquée.
- **Modèle optimal** : 🧠 Opus 4.8 (le prompt d'extraction + la règle de validation verbatim sont LE point critique — tout l'aval en dépend) · **Effort** : M

### É4 — `savoir-reconcile.ts` + `run-savoir.ts` v1 → **LA PREUVE : 3 vidéos, 1 contradiction réconciliée**
- **Fichiers** : `server/src/savoir-reconcile.ts` (neuf : `clusterClaims` pur + arbitre juge D3 avec deps injectées + application journalisée des verdicts) · `server/src/run-savoir.ts` (neuf : runner par vidéo, manifest `corpus.json` resumable, politesse/budget D1, passe de réconciliation globale) · `server/src/test-savoir-reconcile.ts`.
- **Réutilise** : patron juge de `eleve-judge.ts` (cerveau `juge` souverain distinct, fail-open neutre) ; patron runner resumable de `run-toeic-content.ts`/manifest #181 D6.
- **Test de preuve — le seul qui compte** : (a) pur : fixtures → 2 claims opposés même sujet clusterisés ensemble ; juge scripté `desaccord` → les DEUX passent `conteste` avec poids, rien n'est supprimé ; juge scripté `conditionnel` → conditions enrichies, `canon` ; juge muet → `isole`, fail-open. (b) **LIVE** : `run-savoir.ts` sur les 3 vidéos d'É1 → base peuplée ; **au moins 1 contradiction réelle** détectée (choisir 3 vidéos où elle existe — ex. exposition à droite vs exposition pour les ombres) ; verdict + les deux provenances **vérifiées à la main au clic** (l'URL horodatée tombe sur le passage) ; kill -9 en cours de run → relance → reprend au manifest. (c) coût et durée mesurés, extrapolés à 50 vidéos.
- **⚠ Gate de décision** (pattern #178 É5) : si le taux de claims rejetés (verbatim introuvable / hors-sujet) dépasse ~20-25 %, ou si l'accès transcripts s'avère bloqué en pratique, **ON S'ARRÊTE**, on inscrit la mesure dans `limites.md`, et on re-décide (double-extraction ? autre segmentation ? escalade Maître ?) avant d'engager É5-É7. L'échec éventuel coûte 4 étapes-preuves, pas un chantier entier.
- **Modèle optimal** : 🧠 Opus 4.8 (première confrontation au réel, cross-cutting) · **Effort** : L

### É5 — L'échelle : une chaîne entière, ingestion incrémentale
- **Fichiers** : extensions bornées de `run-savoir.ts` (mode `--chaine <url>` via `listChannelVideos`, lots avec reprise, veille RSS `--maj` pour les nouvelles vidéos d'un corpus suivi) ; mesures loggées (taux `sans_transcript`, claims/vidéo, coût cumulé, durée).
- **Réutilise** : tout É1-É4 ; le plafonnement type `RECIT_BUDGET_USD` → `SAVOIR_BUDGET_USD`.
- **Test de preuve** : une chaîne réelle de 20-50 vidéos ingérée en plusieurs runs (reprise prouvée entre les runs) ; rapport chiffré présenté à Raf (couverture transcript, coût réel vs extrapolation É4, top sujets/désaccords) ; re-run `--maj` n'ingère QUE les nouveautés (cache respecté, zéro re-fetch).
- **Modèle optimal** : ⚖️ Sonnet 4.6 · **Effort** : M

### É6 — La restitution : `savoir-query.ts` + outil `savoir_video` + route
- **Fichiers** : `server/src/savoir-query.ts` (neuf, pur : interroger → groupes cappés + segments d'appoint) · `server/src/eleve-savoir-tools.ts` (neuf : outil `savoir_video`, gate `ELEVE_SAVOIR`, sortie sanitizée) · routes `GET /api/savoir`, `GET /api/savoir/:slug` (retouche bornée `index.ts`) · index Blackboard (scope `savoir:index`, une entrée par corpus, pour le rappel `eleve-memoire`) · `server/src/test-savoir-query.ts`.
- **Réutilise** : caps durs et libellés de `eleve-memoire.ts` ; patron KernelTool + `sanitizeExternal` de `eleve-web-tools.ts` ; wrapper mince façon `shared-data.ts`.
- **Test de preuve** : pur (store fixture) : une question → groupes pertinents d'abord, désaccord affiché avec ses deux camps + sources ; caps tenus sur un corpus gonflé ; gate off → registre d'outils byte-identique (test d'égalité stricte, discipline revue Fable). LIVE : question réelle sur le corpus É5 → réponse avec ≥ 2 sources horodatées cliquables.
- **Modèle optimal** : ⚖️ Sonnet 4.6 · **Effort** : M

### É7 — La jonction #181 + clôture
- **Fichiers** : `server/src/savoir-export.ts` (neuf : `exportSujets`, `exportBanqueSourcee` — le contrat D6) · `server/src/test-savoir-export.ts` · note d'intégration dans le plan #181 (le volet PÉDAGO vérifie les sources YouTube contre les segments stockés — retouche à faire côté #181 É4 au moment de son branchement, PAS ici) · clôture : `statut.md`, `historique.md`, wiki (`wiki/savoir-video.md`, liens [[bible-narrative]], [[formation-adaptative]], [[transmission-competences]]), `limites.md` (les entrées de §4).
- **Test de preuve** : `exportBanqueSourcee` sur le corpus É5 → chaque point porte ses `sources:[url…]` non vides + citations verbatim ; un désaccord exporté expose les deux écoles ; **mini-preuve de jonction** : générer via `generateContentItems` UNE leçon dont le `sujet` embarque un paquet exporté → la leçon sort avec ses sources YouTube horodatées (sans attendre que la Fabrique #181 complète existe).
- **Modèle optimal** : ⚖️ Sonnet 4.6 · **Effort** : M

| # | Étape | Dépend de | Modèle optimal | Effort |
|---|-------|-----------|----------------|--------|
| É1 | savoir-transcript (accès + dégradation + cache) | — | ⚖️ Sonnet 4.6 | M |
| É2 | savoir-store (schéma + journal + cosinus) | — (parallélisable avec É1) | ⚖️ Sonnet 4.6 | M |
| É3 | savoir-extraction (claims verbatim-vérifiés) | É2 | 🧠 Opus 4.8 | M |
| É4 | **savoir-reconcile + runner → PREUVE 3 vidéos, 1 contradiction** | É1, É2, É3 | 🧠 Opus 4.8 | L |
| É5 | Échelle chaîne entière + veille RSS | É4 (gate passé) | ⚖️ Sonnet 4.6 | M |
| É6 | Query + outil `savoir_video` + route + index mémoire | É4 | ⚖️ Sonnet 4.6 | M |
| É7 | Export banque sourcée (jonction #181) + clôture | É5, É6 | ⚖️ Sonnet 4.6 | M |

**Budget honnête** : É1+É2 ≈ 1-2 sessions, É3+É4 ≈ 2 sessions, É5+É6+É7 ≈ 2 sessions — cohérent avec un chantier L/XL. Le coût cloud vit surtout à É4/É5 (extraction GLM ~40 fenêtres/vidéo + juge par groupe), borné par `SAVOIR_BUDGET_USD` et mesuré dès É4.

---

## 4. Risques & limites honnêtes

**R1 — L'accès aux transcripts est structurellement fragile (et en zone grise TOS).** yt-dlp casse quand YouTube change (réparé en jours par le projet, mais des fenêtres d'indisponibilité existeront) ; les CGU YouTube n'autorisent pas l'accès automatisé — l'usage personnel local à faible volume avec politesse (délais, cache à vie, sous-titres seuls sans téléchargement vidéo) est le choix assumé, pas un droit. Parades : dégradation D1, cache définitif (la base déjà bâtie ne redépend jamais de YouTube), mise à jour yt-dlp = maintenance nommée. → **`limites.md` dès É1** : *Accès transcripts YouTube fragile (TOS gris + durcissements PO-token/IP) · #177 · ingérer une vidéo sans yt-dlp fonctionnel · YouTube ne fournit aucune API tierce de captions · piste : maintenir yt-dlp (pip) + repli scraping maison + API tierce payante en dernier recours · 🟡 partiel (robuste = l'externe yt-dlp maintenu) · ⚖️ Sonnet · S · Ouvert.*

**R2 — Les vidéos sans sous-titres sont ingérées SANS savoir.** `transcript:absent` = métadonnées seules, zéro claim (on n'invente jamais). Sur les chaînes pédagogiques récentes, les sous-titres auto couvrent la grande majorité ; le taux réel se mesure à É5. → **`limites.md` dès É1** : *Vidéo sans transcript = savoir non capté · #177 · extraire d'une vidéo sans sous-titres · l'ASR exige le téléchargement audio + calcul GPU · piste : Whisper local (faster-whisper, GTX 1080 Ti, sérialisation VRAM façon L61) gaté, hors v1 · 🟢 codable en interne · ⚖️ Sonnet · M · Ouvert.*

**R3 — La base restitue des opinions sourcées, pas la vérité.** Le juge classe et pondère (D3), il ne certifie pas. Une erreur répétée par 5 youtubeurs entrera en `consensus`. La parade honnête est la traçabilité totale (Raf ou #181 remontent toujours à la source au clic) — pas une garantie d'exactitude. Pour #181 « vendable », la relecture humaine experte de la limite déjà inscrite au plan-181 (§4.1) s'applique inchangée. → **`limites.md` à É4** : *Consensus ≠ vérité (biais de corpus) · #177 · certifier l'exactitude d'un claim consensuel · le juge n'a pas d'accès au vrai, seulement aux sources · piste : croiser avec des sources NON-YouTube (chercher_web/lire_page sur doc de référence) en 2ᵉ opinion pour les claims à fort poids · 🟢 codable en interne · ⚖️ Sonnet · M · Ouvert.*

**R4 — L'extraction de claims est le maillon faible (rappel ET précision).** La précision est bordée par le verbatim obligatoire (D5) ; le **rappel**, lui, ne l'est pas — un savoir énoncé mais non extrait est invisible (même résidu que #178 R1). Le taux se constate à É4 (gate de décision ~20-25 % de rejets) ; la position de repli est la double-extraction ciblée ou l'escalade Maître sur les fenêtres pauvres.

**R5 — Le juge de réconciliation est bruité** (hérité, L1/L19). Contenu par : clustering déterministe d'abord, verdicts journalisés et re-jouables (une passe de réconciliation se relance à zéro coût de données), rien de supprimé (le pire verdict erroné est un mauvais classement, pas une perte). Résidu : des faux `consensus` sur des désaccords subtils passeront.

**R6 — Corpus multilingues.** Une chaîne FR + des sous-titres auto EN (ou l'inverse) → claims en deux langues ; `nomic-embed-text` est correct mais pas excellent en cross-lingue → des clusters peuvent se dédoubler par langue. V1 : normaliser les `enonce` en français à l'extraction (le prompt l'impose), garder l'`extrait` verbatim dans sa langue. Résidu assumé, à mesurer.

**R7 — Le savoir visuel n'est pas capté en v1** (D7, tranché). Ce qu'un youtubeur montre sans le dire n'entre pas dans la base — réel pour la photographie (comparaisons d'images). → **`limites.md` à É7** : *Savoir visuel des vidéos non capté · #177 · extraire une démonstration purement visuelle · frames = téléchargement vidéo + VL local + alignement image↔claim non résolu · piste : « frames ciblées » aux timestamps des claims à fort poids (yt-dlp sections + ffmpeg + qwen3-vl, table `medias` par migration) · 🟢 codable en interne · 🧠 Opus · L · Ouvert.*

**R8 — La qualité des sous-titres AUTO plafonne la base.** Les sous-titres auto mangent les termes techniques (« bokeh » → « beau quai ») ; le champ `transcript_source` est stocké par vidéo précisément pour ça : les claims issus d'auto-subs peuvent être pondérés plus bas, et le verbatim garde la trace de ce qui a réellement été transcrit. Résidu : un terme systématiquement mal transcrit crée une fausse entité — le référentiel `entites`+alias en absorbe une partie, pas tout.

**R9 — Interaction des gates jamais éprouvée ensemble** (leçon revue pré-#181) : `ELEVE_SAVOIR` + mémoire + Gardien sur un run qui PUISE dans un corpus n'ont jamais tourné ensemble ; É6 ajoute son scénario à `test-fondations-gates-combines.ts`.

---

## 5. ANNEXE OBLIGATOIRE — Trace de raisonnement (corpus Fable, `docs/corpus-fable/`)

*Honnête, pas performatif.*

### 5.1 Ma démarche, pas à pas

1. **J'ai lu les deux plans cousins AVANT le code** (#181 puis #178, tous deux frais du jour). Choix délibéré : la mission dit explicitement que #177 doit *alimenter* #181 et que #178 est un *pattern cousin* — les contrats à respecter (banques sourcées, exigence `sources:[url…]`, sas `candidat`, réconciliateur) préexistaient à ma conception. Concevoir #177 sans eux aurait produit une base incompatible avec son propre client principal.
2. **J'ai vérifié l'acquis annoncé, et il n'existait pas.** Le roadmap affirme « #177 fondation livrée : outil `voir_video` testé ». Trois greps (code, statut, historique) + le git log : **rien**. C'est la découverte la plus importante de l'investigation — pas pour ce qu'elle change au design (peu), mais pour ce qu'elle aurait coûté si je l'avais crue : un plan « branchant yt-dlp sur voir_video » aurait envoyé l'exécutant chercher un module fantôme. La RÈGLE GRAVÉE v2 (« ne jamais confondre cible et acquis ») s'applique aussi aux documents de roadmap, pas seulement au schéma du kernel.
3. **J'ai cherché le précédent d'accès réel avant de théoriser les voies.** L'environnement de Raf porte un skill Claude `lire-youtube` avec un script `transcript.py` qui fait EXACTEMENT l'ingestion visée (yt-dlp, sous-titres seuls, dédup VTT, timestamps) — et `python -c "import yt_dlp"` répond `2026.03.17` sur la machine. La question « quelle voie est réaliste ? » avait donc déjà une réponse **prouvée localement**, il suffisait d'aller la constater. Ça a dé-risqué D1 plus que n'importe quelle recherche web.
4. **J'ai transposé #178 en me demandant à chaque décision : monde fermé ou monde ouvert ?** C'est le crible qui a séparé ce qui se copie (statuts, journal, SQLite dédiée, migrations, déterministe-d'abord) de ce qui diverge (vocabulaire de prédicats contrôlé → impossible en monde ouvert → énoncé libre + verbatim + clustering). Sans ce crible, j'aurais soit copié #178 aveuglément (et mutilé le savoir), soit tout reconçu (et perdu les patterns payés).
5. **J'ai cherché l'invariant déterministe qui borde le maillon faible.** Le maillon faible est le même que #178 (extraction LLM). #178 le borde par la double-extraction sur prédicats à fort impact ; ce mécanisme ne se transpose pas (pas de prédicats). J'ai cherché un AUTRE invariant vérifiable mécaniquement et trouvé le **verbatim obligatoire** (D5) : un extrait exact d'un texte réel ne peut pas être halluciné. C'est la décision dont je suis le plus sûr.

### 5.2 Les alternatives que j'ai FAILLI choisir, et ce qui m'a fait basculer

- **Le scraping maison en voie primaire** (D1). Réflexe souverainiste du repo (« keyless, code maison, zéro dépendance ») — et `chercher_web` établit le précédent d'un scraping maison assumé. Basculé par la différence de nature : les SERP de DuckDuckGo changent peu ; l'accès YouTube est une **course aux armements active** (PO tokens, chiffrement des URLs) où seule une équipe dédiée suit le rythme — yt-dlp est cette équipe. La RÈGLE GRAVÉE tranche : standard maintenu > code familier. Le maison est repêché en repli n°2.
- **La réconciliation qui tranche** (D3). Ma première esquisse donnait au juge le pouvoir d'élire l'avis « correct » — c'est la lecture naïve de « réconcilier les contradictions » dans la mission. Basculé en me demandant *à quoi sert la base pour #181* : une formation honnête enseigne « il y a deux écoles » avec les arguments sourcés, pas un verdict de LLM bruité déguisé en vérité. « Réconcilier » = classer la nature du désaccord et pondérer, pas décréter. Ce glissement a redéfini la table `groupes` (le verdict `conditionnel` — le plus utile — n'existait pas dans l'esquisse).
- **Le scope Blackboard comme résidence** (D4). Tentant parce que le Blackboard a déjà embeddings + recherche + persistance, et que « savoir cross-projet » est sa définition. Basculé par la même question qui a tranché #178 D1 : *quelles requêtes le pipeline exige-t-il ?* — « les claims contestés du sujet X avec leurs deux provenances » est une jointure sur colonnes réelles, impossible proprement en clé/valeur. Le Blackboard garde le rôle où il excelle (l'index de rappel cross-projet).
- **Faire de l'ingestion un run agentique Élève** (D4) — cohérent avec « transmission : Mango fait ». Basculé par le constat que l'ingestion ne comporte AUCUNE décision d'outillage : c'est un pipeline déterministe avec deux appels LLM typés (extraction, juge). Le patron `run-toeic-content.ts` (runner + appels directs) est plus rapide, moins cher, testable — et c'est TOUJOURS Mango qui produit (GLM extrait, juge arbitre) ; la transmission porte sur les cerveaux, pas sur la présence d'une boucle d'outils.

### 5.3 Heuristiques employées (celles qui ont réellement servi)

1. **Vérifier l'acquis annoncé dans le CODE avant de bâtir dessus** (grep + git log). Coût : 3 commandes. Gain ici : tout le plan. Complète l'heuristique #181 (« les capacités cachées derrière des gates OFF se trouvent dans le code, pas dans la config ») par sa réciproque : *les capacités annoncées dans les docs peuvent ne pas exister dans le code.*
2. **Chercher le précédent d'exécution le plus proche, même HORS du repo.** Le skill `lire-youtube` n'est pas dans MangoOS, mais il est sur la machine de Raf et prouve la voie d'accès. L'environnement de l'utilisateur fait partie de l'existant à cartographier.
3. **Le crible monde fermé / monde ouvert** pour transposer une architecture cousine : chaque décision du cousin est re-testée contre la nature du domaine avant d'être copiée. C'est ce qui rend une transposition différente d'un copier-coller.
4. **Chercher l'invariant vérifiable mécaniquement qui encercle le maillon probabiliste** (ici : le verbatim ; en #178 : les intervalles + interdictions amont). Formulable en règle : *pour chaque sortie de LLM qui entre dans un état durable, exiger une propriété que le déterminisme peut vérifier.*
5. **Placer la preuve courte tôt et le gate de décision chiffré dessus** (É4 : 3 vidéos, 1 contradiction, seuil de rejets ~20-25 %) — hérité de #178 É5, renforcé par la consigne de mission (« première étape = preuve sur 3 vidéos ») : l'ordre des étapes est construit à rebours depuis cette preuve.
6. **Rejet-total → repêchage-en-secondaire** (motif récurrent du corpus, confirmé ici 3 fois) : scraping maison rejeté en primaire/repêché en repli ; vote majoritaire rejeté en verdict/repêché en facteur de poids ; RAG rejeté en primaire/repêché en couche de contexte (D6).

### 5.4 Ce qui a failli me tromper

- **La ligne « fondation livrée » du roadmap** — le piège le plus net. Elle est datée, détaillée (« logique pure testée et deps injectées »), plausible ; seuls les greps l'ont démentie. Un plan bâti dessus aurait été exécutable nulle part.
- **Le mot « réconcilier » de la mission** — il suggère un arbitrage qui tranche ; le cas d'usage réel (#181, formations honnêtes) exige l'inverse pour les vrais désaccords. J'ai dû relire l'énoncé de Raf (« avis contradictoires **arbitrés (avec provenance)** ») pour voir que la provenance y est constitutive de l'arbitrage — un arbitrage qui supprime sa provenance se contredit.
- **La symétrie séduisante avec #178** — deux « bases de savoir avec candidat/canon/juge » : la tentation de réutiliser le vocabulaire de prédicats contrôlé (si élégant en #178) était forte ; le crible monde-ouvert l'a tuée. Une architecture cousine est un GISEMENT de patterns, pas un moule.
- **L'envie d'inclure les frames en v1** — le cas d'usage « photographie » crie que le visuel compte. Le calcul (téléchargements massifs + VL lent + alignement image↔claim non résolu) et le constat que les chaînes pédagogiques *énoncent* leur savoir ont tranché — mais j'ai failli laisser le périmètre gonfler. La parade a été de nommer le point d'extension (frames ciblées, `t_start_s` comme clé) pour que le renoncement ne coûte rien plus tard.
- **`lire_page` qui « devrait suffire »** — sur le papier, une page watch est une page web. En pratique c'est une app JS où le transcript n'est pas dans le DOM initial. J'ai vérifié la nature de l'outil (scrapeExternal, texte lisible) avant de conclure — le réflexe « l'outil existe donc le besoin est couvert » aurait produit une voie d'ingestion morte-née.

### 5.5 Ce que je recommande d'étudier dans ma façon de raisonner

1. **Le geste « vérifier l'acquis annoncé »** (5.3.1) : mécanique, coût quasi nul, et il a ici évité l'erreur la plus chère. À distiller en axiome de méthode : *« un acquis cité dans une doc se grep dans le code avant d'entrer dans un plan »*. Mesurable sur le corpus : combien de plans citent des chemins/symboles non vérifiés ?
2. **Le crible de transposition** (monde fermé/ouvert, 5.1.4) : c'est un cas particulier d'une question plus générale — *« quelle propriété du domaine source rendait cette décision bonne, et mon domaine l'a-t-il ? »*. Les plans #178→#177 forment une paire idéale pour étudier ce geste (mêmes patterns, divergence localisée et argumentée).
3. **L'invariant verbatim** (D5) : la recherche d'une propriété mécaniquement vérifiable pour ancrer une sortie LLM est probablement l'heuristique la plus réutilisable de ce plan (elle vaut pour toute extraction : PDF, pages web, transcripts). À challenger : le matching tolérant (casse/espaces) est un curseur — trop strict, il rejette du fidèle ; trop lâche, il laisse passer du reconstruit. É3 devra le calibrer et c'est le premier endroit où chercher un bug.
4. **Ma limite observable, récurrente** (déjà notée en #178 5.5) : je conçois un étage de plus que nécessaire — ici, la première esquisse avait une table `relations` entre entités (graphe léger) sans AUCUNE requête cliente dans le pipeline. Supprimée par le correctif habituel (« chaque table doit avoir un client nommé »). Le relecteur devrait appliquer ce correctif à ce plan encore : candidat honnête restant = la table `entites` séparée (elle pourrait n'être qu'une normalisation dans `claims.sujet` + alias en JSON quelque part) — je la garde parce que la liaison d'alias cross-vidéos est une vraie requête d'É3, mais c'est l'élément le plus proche du superflu.
5. **Là où je suis le moins sûr** : le seuil de clustering (0.78) et le seuil du gate É4 (~20-25 %) sont des priors, pas des mesures — les calibrer sur le corpus pilote ; et la **langue** (R6) est le risque que j'ai le moins outillé : si le corpus pilote est bilingue et que les clusters se dédoublent, la normalisation-français-à-l'extraction est ma seule défense, et elle repose sur le maillon faible. À surveiller dès É4.

---

*Fin du plan #177-ambitieux — Fable 5, 2026-07-03. Prochaine action (post-validation Raf) : É1 et É2 en parallèle par Sonnet — la sonde d'accès et le schéma. Aucune étape ne requiert Fable.*
