---
type: entite
tags: [stratege, global, proactif, cross-session, cross-projet, briefing, push]
statut: complet-borne
sources: ["#176", docs/plan-176-stratege-global.md, statut 2026-07-04, historique 2026-07-04]
maj: 2026-07-04
---

# Stratège global proactif (#176)

> Mango cesse d'être un exécutant docile **au-delà d'un run** : un cerveau qui persiste **cross-projet ET cross-session**, agrège N capteurs, et **initie** (PUSH) — il propose la suite, signale un problème avant qu'on demande, questionne la demande de Raf quand l'accumulation des faits suggère mieux. Jamais bloquant, toujours conseil.

## Rôle

Le spine intra-run (`ELEVE_REFLEXION`, self-critique #62, `CLARIFICATION_RULES`) réfléchit *en avançant* et critique *avant de livrer*, mais oublie tout à la fin du run — rien ne relie le run d'aujourd'hui à celui d'hier. Le Stratège global comble ce trou : c'est le **review-à-la-main** que le protocole d'observation de Raf demandait déjà (classes de blocage, taux d'escalade Claude, réutilisation), rendu automatique, permanent et proactif.

## La frontière avec l'Observateur-Conseil (MangoQA, D1)

**Capteur vs cerveau.** L'Observateur-Conseil (Visage 2 de [[mangoqa]], fantôme, dépôt séparé `D:\IA\MangoQA`) reste une **sonde d'une seule modalité** — il ne voit que les rejets d'audit QA, en mode PULL, il n'écrit jamais dans MangoOS et ne reçoit d'ordres de personne (`fondation.md` §V). Il **ne change pas**. Le Stratège global (nouveau, côté MangoOS) est le **cerveau qui fusionne les sondes** : il **consomme** `readObserverReport()` comme un signal parmi 8, à côté du Bus, des traces, de la réutilisation, des blocages [[le-stratege|#164]], des lacunes #168, de l'hygiène mémoire et de l'historique des demandes de Raf. Il ne recalcule JAMAIS un pattern QA — zéro duplication.

## Les 7 décisions d'architecture (D1-D7)

- **D1** — l'Observateur = capteur fantôme d'une modalité ; le Stratège = cerveau agrégateur.
- **D2** — « global » = cross-projet **ET** cross-session (les deux, explicitement requis).
- **D3** — état durable = fichier JSON atomique dédié `data/strategist-state.json`, jumeau exact d'`open-gaps.json` #168 (pattern « Mango propose, Raf valide »).
- **D4** — fusion multi-capteurs : spine PUR qui agrège 8 collecteurs fail-open ; ne recalcule aucun capteur ; le déterminisme trie, un LLM optionnel ne fait qu'habiller la rédaction.
- **D5** — remise en question de la DEMANDE de Raf : cross-session, jamais bloquante, seuil N≥2, patron « Œil Design » (observation en question ouverte, jamais un verdict).
- **D6** — PROACTIF = PUSH (déclencheur = fin de lot nocturne + injection au démarrage de session), jamais de notification en cours de tâche.
- **D7** — la sortie est un BRIEFING conseil (proposition/alerte/question), jamais une action ; Raf ferme la boucle (accepte/rejette/reporte).

## Les 6 étapes de code (É1-É6)

- **É1** `stratege-global-model.ts` + `stratege-global.ts` : `synthesize(signals, previousState, now) → Briefing` PUR — seuils déterministes, tendance sur fenêtre glissante, dédup par `sig`, `hits++`, bornage anti-spam, un `sig` déjà `rejete`/`accepte` n'est jamais re-proposé.
- **É2** `stratege-collecteurs.ts` : 7 sondes fail-open — QA (← `readObserverReport`), Bus (cost/turns/duration), traces (escalades Claude), reuse (`reuseRatePct`), blocages ([[le-stratege|#164]] agrégés cross-run), lacunes (#168 `open-gaps.json`), mémoire (axioms-conflicts/quarantine).
- **É3** `stratege-store.ts` : store cross-session, écriture atomique, cap 200 items + TTL 90j sur les items réglés, jamais de throw.
- **É4** `stratege-run.ts` : `runStrategistCycle` (collecteurs → synthesize → advanceState → persiste), greffé en FIN de lot nocturne (`nocturnal.ts`, gate `STRATEGE_GLOBAL` défaut OFF), CLI `npx tsx src/stratege-run.ts`.
- **É5** `stratege-routes.ts` : `GET /api/stratege/briefing` + `POST /:id/{accepte,rejette,reporte}` ; injection PUSH d'un briefing court au démarrage de session (jumeau de `spawnVerdictWatcher`) ; onglet UI `StrategeGlobal.jsx`.
- **É6** `stratege-demandes.ts` : 8ᵉ collecteur `collectDemandesGated`, gate `STRATEGE_QUESTION_DEMANDE` (dépend de `STRATEGE_GLOBAL`) — corrélation déterministe demande↔issue depuis `.chat-history.json` + `.preferences.md`, seuil N≥2, double verrou anti-radotage.

## É7 — Preuve bout-en-bout + clôture (2026-07-04, périmètre honnêtement adapté)

Le plan original demandait « plusieurs jours de données réelles » — irréalisable en une session. Adapté : preuve **réelle mais bornée**, limite honnête inscrite plutôt que fabriquée ([[limites|L83]]).

- **Test d'interaction des gates** (`test-fondations-gates-combines.ts`, 45→**56/56**) : `STRATEGE_GLOBAL`+`STRATEGE_QUESTION_DEMANDE` ON en même temps que 8 gates éprouvés (`MANGOQA_STOP_AUTHORITY`, `NOCTURNAL_QA_BUS`, `NOCTURNAL_BUDGET_HARD`, `TEMPORAL_AWARENESS`, `LLM_SEMANTIC_CACHE`, `DRY_RUN`, `FRONTIER_TOOLS_ANY_BRAIN`, `AB_HARNESS`). **Aucune interaction cassée trouvée** : le cycle est greffé APRÈS le `try/finally` du lot nocturne (jamais de `spendGlobalBudget` — le ledger reste inchangé) et la synthèse ne fait aucun appel `cachedComplete`/`dispatch` (scope `llm-cache:*` inchangé) — confirmant que D4 (déterminisme/$0) tient réellement sous charge combinée.
- **Preuve live bornée** : 3 cycles réels sur le vrai `server/data/` — 66 signaux réels collectés à chaque run (famille `bus:chat.turn` + `blocages:wrong-tool`), **zéro doublon sur 3 lancements** (dédup par `sig`, `hits` 1→2→3), et le seuil de saillance a fait apparaître une 2ᵉ alerte au 3ᵉ run exactement comme prévu par le mécanisme anti-bruit (D4/§4.1).

## Limites honnêtes

- [[limites|L83]] — la preuve « plusieurs jours, zéro radotage » du plan original reste à observer en conditions réelles (code prêt, observation multi-nuits pas encore faite).
- [[limites|L84]] — peu de signaux réels disponibles aujourd'hui (dépend des gates amont OFF par défaut + historique de demandes encore jeune — pas un manque de code).

## Liens

- [[le-stratege]] — #164, le diagnostiqueur tactique INTRA-RUN dont les classes de blocage sont réutilisées comme UN signal d'entrée (pas le mécanisme).
- [[mangoqa]] — l'Observateur-Conseil (Visage 2), la sonde QA lue par le Stratège global, jamais recalculée.
- [[boucle-curation]] — même esprit de mesure cross-projet (réutilisation, curation pondérée) consommé comme signal `reuse`.
- [[gardien-cloture]] — patron du non-bloquant (« propose, ne bloque jamais ») partagé avec le Stratège.
- [[limites]] — L83-L84.

## Sources

- `docs/plan-176-stratege-global.md` — plan complet (D1-D7, 7 étapes, format corpus Fable).
- [[statut]] / [[historique]] — livraison #176 du 2026-07-04.
