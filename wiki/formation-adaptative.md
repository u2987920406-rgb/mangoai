---
type: entite
tags: [formation, apprentissage, fsrs, tuteur, gardien-pedago, spine-pur, curriculum]
statut: complet
sources: ["#181", docs/plan-181-formation-adaptative.md, statut 2026-07-05, historique 2026-07-05]
maj: 2026-07-05
---

# Formation adaptative (#181)

> Mango ne génère plus seulement des apps : il fabrique une **FORMATION** complète sur n'importe quel sujet — curriculum structuré, banque d'items variés (leçon/qcm/flashcard/texte-à-trous/appariement), et une boucle de progression RÉELLE à deux tempos qui s'adapte à l'apprenant, pas un quiz statique.

## Rôle

Deux boucles orthogonales gouvernent la progression :

- **La boucle RAPIDE** (client, `formation-adaptive.ts`) — déterministe, sans réseau, tourne à chaque réponse : sélectionne le prochain item, ajuste la difficulté, met à jour la maîtrise estimée (EWMA).
- **La boucle LENTE** (serveur, le [[#Le Tuteur|Tuteur]]) — asynchrone, diagnostique les faiblesses PERSISTANTES (pas une erreur isolée) et génère des exercices de remédiation ciblés, absorbés côté client par SSE sans jamais régénérer l'app.

## Les 7 décisions (D1-D7)

- **D1** — spine PUR d'abord (types+Zod, zéro I/O), patron déjà éprouvé (#149/#164/#176/#182).
- **D2** — modèle apprenant en DOUBLE résidence : `localStorage` client (réactivité) + miroir `/api/shared/<collection>` (le Tuteur lit ce miroir).
- **D3** — moteur de répétition espacée = **FSRS** (`ts-fsrs`) avec **repli Leitner pur JS** (5 boîtes, intervalles `[1,2,4,9,21]` jours) si la lib manque/plante — le moteur ne casse jamais.
- **D4** — deux boucles orthogonales : RAPIDE (chaque réponse) / LENTE (le Tuteur, ne génère QUE sur faiblesse PERSISTANTE).
- **D5** — le contenu de remédiation voyage par la DONNÉE (`bank-ext:<module>`), jamais par régénération de l'app.
- **D6** — manifest de fabrication RESUMABLE (`formation.json`, état par module `a_faire/genere/verifie/integre`, écriture atomique) — patron identique à l'auto-amélioration.
- **D7** — volet PÉDAGO du Gardien (#161) : échantillonnage déterministe (seed) + garde anti-« quiz déguisé », gate `ELEVE_GATE_PEDAGO` off par défaut.

## Les 6 étapes (É1-É6)

- **É1** — Spine pur : `server/src/formation-model.ts` (types+Zod : `Curriculum`/`Item`/`LearnerModel`/`FormationManifest`) + `server/src/formation-adaptive.ts` (`estimateMastery` EWMA, `adjustDifficulty`, `selectNextItem` priorité FSRS-échu>faiblesse>progression, `diagnoseWeaknesses`).
- **É2** — Starter React+Vite : `server/templates/formation/` — `src/lib/spaced.ts` (FSRS+repli Leitner), `src/lib/learner-store.ts` (double résidence D2), écrans Placement/CarteParcours/Lecon/Exercice/Revision/Bilan.
- **É3** — La Fabrique : `server/src/formation-fabrique.ts` (pipeline sujet→curriculum→banques, manifest resumable D6) + `run-formation.ts` (CLI) + `formation-routes.ts` (`POST /api/formation`).
- **É4** — Volet PÉDAGO : `server/src/eleve-gate-pedago.ts` — `seedFromString`/`tirerEchantillon` (échantillonnage déterministe), `checkPedagoReel` (garde leçon-avant-exercice).
- **É5** — Le Tuteur : `server/src/formation-tuteur.ts` — `runTuteurSurFormation` (diagnostic via le MÊME `diagnoseWeaknesses` qu'É1, `groupWeaknessesByModule`, `buildSujetCible` cite précisément skill+mastery+pattern d'erreur, `genererLotCible`, `mergeBankExt`), fail-open total, gate `FORMATION_TUTEUR`.
- **É6** — Preuve bout-en-bout + clôture (2026-07-05, voir ci-dessous).

## Le bug de nommage corrigé

`sharedCollectionForMangoAppId` doublait autrefois le préfixe (`"formation-" + mangoAppId`) alors que `mangoAppId` porte déjà `"formation-<slug>"` en entier — désynchronisant le Tuteur du client (`learner-store.ts`) et de `.mangoapp.json`. Corrigé en identité stricte (`return mangoAppId`). Vérifié sur le pilote : `.mangoapp.json` et la collection lue par le client matchent exactement (`formation-les-bases-du-velo`).

## É6 — preuve bout-en-bout (2026-07-05)

Session de clôture reprenant un agent précédent qui avait livré É1-É5 + fabriqué la formation pilote (`workspace/les-bases-du-velo`, 3 modules tous `integre`) mais s'était arrêté sans finir ni rapporter.

- **Contenu** : les 3 banques ont chacune une leçon avec `sources` non vides (vraies URLs).
- **Build** : `npm run build` du pilote vert (Vite, ~7s).
- **Test FSRS « lendemain simulé »** : script ad hoc sur `reviewItem`/`dueItemIds` (vrai moteur `ts-fsrs`) — un item raté revient plus tôt et redevient échu à J+24h avant un item réussi.
- **Boucle Tuteur RÉELLE** : anti-orphelin (port 3000 nettoyé), backend frais, faiblesse simulée via le Blackboard SQLite partagé, `runTuteurSurFormation` avec vrai GLM `glm-5.2:cloud` → diagnostic correct, **6 items de remédiation écrits** dans `bank-ext:velo-equilibre-pedalage`, tous ciblant le skill faible ; nettoyage complet, backend arrêté proprement.

**Limite notée** : la preuve passe par l'API/Blackboard, pas par un test Playwright cliquant réellement dans l'app pilote ([[limites|L105]]).

## Limites honnêtes

- [[limites|L96]] — exactitude factuelle jamais certifiée, seulement échantillonnée.
- [[limites|L97]] — qualité rédactionnelle GLM variable selon le domaine (pas encore mesurée sur plusieurs sujets).
- [[limites|L98]] — mur des médias (pas de vidéo générée, TTS = voix navigateur).
- [[limites|L99]] — le Tuteur dépend d'un backend vivant.
- [[limites|L100]] — la maîtrise EWMA n'est pas une mesure psychométrique certifiée.
- [[limites|L101]] — coût/durée de fabrication en heures, pas en minutes.
- [[limites|L102]] — collision de scope `shared:formation-<slug>` possible sans garde d'unicité.
- [[limites|L103]] — dérive « quiz déguisé » à surveiller au-delà de la garde déclarative actuelle.
- [[limites|L104]] — interaction des gates #181 × pile fondations jamais testée ENSEMBLE.
- [[limites|L105]] — preuve Tuteur API/Blackboard, pas de test UI navigateur rejoué.

## Liens

- [[le-stratege]] — #164, même patron de diagnostic déterministe réutilisé (`diagnoseWeaknesses` ≈ classes de blocage).
- [[stratege-global]] — #176, même discipline fail-open par collecteur/module.
- [[gardien-cloture]] — #161, dont le volet PÉDAGO (É4) est une extension.
- [[limites]] — L96-L105.

## Sources

- `docs/plan-181-formation-adaptative.md` — plan complet (D1-D7, 6 étapes).
- [[statut]] / [[historique]] — livraison #181, clôturée 2026-07-05.
