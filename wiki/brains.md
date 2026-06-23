---
type: entite
tags: [architecture, cerveau, multi-cerveaux, registre, routage, phase-e]
statut: actif
sources: [statut, historique]
maj: 2026-06-23
---

# Registre de cerveaux (`.brains`)

> La mémoire **mesurée** du multi-cerveaux : les sorties de l'examen d'entrée [[examen-cerveau|#148]] persistées en **fiches cerveau** durables + le **routage intention→cerveau**. C'est ce qui rend la [[phase-e-multicerveaux|Phase E]] *mesurée* plutôt que devinée.

## Rôle

Sans persistance, un scan #148 est jetable et MangoOS ne sait plus ce qu'un cerveau vaut. Le registre transforme la mesure en **donnée de routage durable** : on scanne une fois, on route, et MangoOS peut **avertir** si une affectation contredit la mesure. Stockage = un JSON plat versionnable à la racine (`.brains/registry.json`).

## Détails clés

- **`server/src/brains.ts`** — module **PUR/synchrone** (chemin `BRAINS_DIR` résolu paresseusement → testable vers un dossier temporaire).
- **`BrainCard`** : `{id, label, model, provider, verdict, agentic, caps, capabilities, avgLatencyMs, scannedAt}` — construite depuis un `ScanReport` via `cardFromScan(report, provider, opts)`.
- **`BrainRegistry`** : `{brains: BrainCard[], routing: {intention → brainId}}`. Intentions = `construire` · `planifier` · `discuter` (les 3 boutons).
- **CRUD** : `loadRegistry`/`saveRegistry`, `upsertBrain` (clé = id), `removeBrain` (nettoie aussi les affectations orphelines), `getBrain`.
- **Routage** : `setRouting(intention, brainId|null)` (lève si cerveau inconnu), `resolveBrainForIntention(intention)`.
- **« MangoOS avertit »** : `intentionFit(intention, card)` → `ok` / `suboptimal` (ex. Construire sur un cerveau `contract` : fonctionnel mais le moteur agentique lui est fermé) / `mismatch` (ex. Construire sur un cerveau `discuss`/`reject` : risque d'échec élevé) + message prêt à afficher. `routingWarnings()` = tous les fits ≠ ok du routage courant.
- **Consommé par** : [[phase-e-multicerveaux|brain-runtime]] `resolveBinding` (→ profil mesuré pour `runRelay`/`chatEleve`) et l'API/UI (`brain-routes.ts` → Réglages › Cerveaux).
- **Prouvé** : `test-brains` **30/30** (CRUD, routage, suppression nettoyante, les 4 verdicts d'`intentionFit`, `routingWarnings`).

## Liens

Alimenté par [[examen-cerveau]] (le scan) · consommé par [[phase-e-multicerveaux]] (routeur runtime) · sert la souveraineté de [[audit-souverainete]] · profils = [[memoire-expertise|ModelProfile]] mesurés.

## Sources

[[statut]] (#135/#146 Phase E, E1) · [[historique]] (Journal 2026-06-23).
