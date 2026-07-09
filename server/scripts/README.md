# server/scripts — scripts autonomes (hors application)

Ce dossier regroupe les **49 scripts jetables / de preuve / d'expérimentation**
qui étaient auparavant dans `server/src`. Ils ne sont importés par **aucun**
fichier applicatif : ce sont des points d'entrée lancés à la main via `tsx`.

Ils ont été sortis de `src/` (et donc de `include:["src"]` du `tsconfig.json`
principal) pour que `npx tsc --noEmit` sur l'application reste **vert** : deux
d'entre eux (`_prove-assets.ts`, `_prove-demo.ts`) ne compilent pas (TS2322).

## Familles

- `_prove-*` — preuves de comportement ponctuelles (audits de brief, correctifs L111/L113, chaînes ambiguës…).
- `exp-*` — bancs d'essai (clicksource, édition visuelle, Moteur de Goût `exp-taste-*` — ces derniers restent **git-ignorés**).
- `run-*` — lanceurs de runs (nuit, showcase, TOEIC, savoir, formation…).
- `drive-*` — pilotage de test.

## Lancer un script

Depuis `server/`, en résolvant les imports vers `../src/…` déjà réécrits :

```bash
cd server
npx tsx scripts/<nom-du-script>.ts
```

## Type-check des scripts (optionnel, hors gate CI)

```bash
cd server
npx tsc --noEmit -p tsconfig.scripts.json
```

Ce `tsconfig.scripts.json` étend le `tsconfig.json` principal, remplace
`include` par `["scripts"]` et **exclut** les deux fichiers non compilables
(`_prove-assets.ts`, `_prove-demo.ts`). Il n'est **pas** dans le gate G1.
