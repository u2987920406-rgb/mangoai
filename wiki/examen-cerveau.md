---
type: entite
tags: [architecture, cerveau, souverainete, audit, multi-cerveaux, scan]
statut: actif
sources: [statut, historique]
maj: 2026-06-23
---

# Examen d'entrée du cerveau (#148)

> Le « **révélateur de cerveau** » de Raf. Quand on branche un modèle **inconnu** en entrée (Qwen-Coder, DeepSeek, un local…), on ne sait pas ce qu'il vaut. Cet examen le **mesure** par des sondes à signaux **objectifs** et en tire un **verdict de placement** : vaut-il d'être dans la boucle agentique, ou pas ? C'est la **fondation mesurée du multi-cerveaux** ([[eleve-local]] Phase E / #135).

## Rôle

La Phase E (le bon cerveau par intention) ne peut router que ce qu'elle **connaît**. Aujourd'hui les profils sont **écrits à la main** (`models/gemma.ts` = write-only, `models/glm.ts` = `agentic:true`). L'examen les **génère par la mesure** : on cesse de deviner les capacités d'un nouveau cerveau, on les teste. Métaphore du Dojo : **tout nouvel élève passe un examen d'entrée**, on connaît sa ceinture, on sait où le placer.

## Détails clés

- **`server/src/model-scan.ts`** — module **PUR** : le transport (`ask` texte + `post` function-calling) est **injecté** → testable sans réseau. `defaultScanDeps(model)` (import dynamique d'`eleve.js` : `chatEleve` + `elevePost`) fournit le transport réel pour la CLI / le live.
- **6 sondes à signaux OBJECTIFS** (juger sur du mesurable, pas au feeling) :
  1. **raisonnement** — compteur 0 +7 ×3 → attend `21`
  2. **format JSON** — objet `{somme:42, nom:"mango"}` parsé strictement
  3. **suivi de consigne** — un seul mot « Paris »
  4. **contrat `<mangoos>`** — `parseContract` (voir [[coque-rigide]]) réussit + action `write`
  5. **appel d'outils** — stub `read_file` via `toOpenAITools` ([[kernel]]) → `tool_calls` valide = **LE gate agentique** (#135)
  6. **codage exécutable** — écrit `sum(a,b)`, exécuté en **`node:vm` sandbox** (timeout 1 s) → `sum(2,3)===5`
- **Runner cost-aware** : tiers **T0** (texte) → **T1** (outils) → **T2** (codage), avec **early-exit** — si la moyenne T0 < 0.35, le modèle rate les bases → `reject` sans gaspiller les appels outils/codage.
- **Verdict de placement** : `agentic` (outils + codage ok → dans la boucle) · `contract` (contrat/code ok, pas d'outils fiables → écriture `<mangoos>`) · `discuss` (bases ok, ne construit pas) · `reject` (ne vaut pas le coup → **rester sur le cerveau courant**). Sortie `ScanReport` : `probes` + `capabilities` + `verdict` + `suggestedProfile{agentic, caps}` (presets caps agentic/contract/weak). `formatReport` = tableau CLI.
- **CLI** : `npx tsx --env-file=.env src/model-scan.ts [modèle]`.
- **Prouvé** : `test-model-scan` **13/13** (simulateur de cerveau mocké : fort→agentic, sans-outils→contract, faible→reject+early-exit, bavard→discuss). **LIVE GLM-5.2** : 6/6 dimensions à 100 %, verdict 🟢 **agentic**, `suggestedProfile` **identique** au profil codé main (`glm.ts`) → l'examen reproduit objectivement le profil deviné, validant la méthode.

## Liens

Fondation du routage de [[eleve-local]] (Phase E / cerveaux hétérogènes #135) · produit un [[memoire-expertise|ModelProfile]] mesuré (la partie `agentic`/`caps`) · réutilise `parseContract` de [[coque-rigide]] et `toOpenAITools` de [[kernel]] · prolonge la souveraineté (« change de cerveau sans changer le système », cf. `fondation.md`).

## Sources

[[statut]] (#148) · [[historique]] (Journal 2026-06-23).
