# 🔁 TRANSFERT V2 — À lire par Claude sur le PC maison

> **Pour Raf** : sur le PC maison, dis simplement à une session Claude neuve :
> « J'ai fait une V2 de MangoOS sur mon PC d'atelier, elle est sur la branche `forge-auto-evolution`. Récupère-la et lis `TRANSFERT-V2.md`, il t'explique tout. »

---

## Pour Claude (PC maison) — contexte

Une **refonte 2.0 de l'interface MangoOS** a été développée sur un autre poste (« l'atelier »), puis **poussée sur GitHub** sur la branche **`forge-auto-evolution`** (elle contient ~15 commits, du `a3e2f68` au `c093c27`). Ce fichier existe sur cette branche : si tu le lis, c'est que tu l'as (ou vas) récupérer. Ton job : mettre la V2 en route ici, sans casser le reste.

## Règles NON négociables

1. **Ne touche pas à `master`.** C'est la branche de la session automatique de Raf. `master` et `forge-auto-evolution` ont **divergé**. **Aucun `git pull`, aucun `git merge`, aucun `rebase` sans permission explicite de Raf.** Ici on fait uniquement un `checkout` de branche.
2. **Le `.env` est gitignoré** — il n'est pas dans git, `checkout` n'y touche jamais. **Ne le reconstruis pas, ne l'écrase pas.** Il est déjà en place (`server/.env`) avec les vraies clés (GLM, etc.).
3. **Zéro commit/push git sans que Raf le demande** (règle du `CLAUDE.md` de ce repo). Ce transfert ne demande AUCUN commit.

## Marche à suivre (A → Z)

**0. Vérifier l'état du dépôt** (la session auto committe sur `master`) :
```bash
cd D:\IA\mangoai   # ou le chemin réel du repo
git status
```
- Propre (« working tree clean ») → continue.
- Des changements non commités → **ne les écrase pas** : demande à Raf s'il faut committer/stash côté `master` avant de basculer (c'est peut-être le travail de sa session auto).

**1. Récupérer la branche V2** :
```bash
git fetch origin
git checkout forge-auto-evolution
```
Le code V2 est maintenant en place. Le `.env` n'a pas bougé.

**2. Ajouter 2 gates au `.env`** (et RIEN d'autre) — ouvre `server/.env`, ajoute à la fin :
```
ELEVE_HOOKS=on
ELEVE_AUTOTEST=on
```
> `ELEVE_HOOKS=on` = hooks de config actifs (#172). `ELEVE_AUTOTEST=on` = nouvelle compétence auto-test de l'Élève (`ecris_test`/`lance_tests`).
> La clé Krea (images) est **inutile** (elle renvoie 402, solde API à zéro) — ne l'ajoute pas.
> Tout le reste du `.env` (clés GLM, `ELEVE_PROVIDER`, etc.) reste **tel quel**.

**3. Mettre à jour les dépendances UI** (la V2 a ajouté TypeScript + `@types/react` + `@axe-core/playwright`, déjà dans `ui/package.json`) :
```bash
cd ui && npm install
```
> Côté `server` : aucune nouvelle dépendance npm (`krea.ts` et l'auto-test réutilisent l'existant). Un `npm install` dans `server/` ne casse rien mais n'est pas requis.

**4. Lancer** — respecte la **procédure anti-orphelin sur le port 3000** décrite dans `CLAUDE.md` (tuer un éventuel `node` mort-vivant AVANT de démarrer le backend), puis :
```bash
cd server && npm run start      # backend :3000
cd ui && npm run dev            # UI :5173
```
Ouvrir **http://localhost:5173/?v2** — l'ancienne UI reste sur `http://localhost:5173/` (la V2 vit sur `?v2`, elle n'écrase pas la 1.0).

**5. Revenir sur `master` plus tard** (pour que la session auto reprenne sa branche) :
```bash
git checkout master
```
Le `.env` restera intact (il ne dépend pas de la branche).

## Pour comprendre ce que la V2 apporte

Lis, dans cet ordre :
- **`statut.md`** — entrées « Dernière mise à jour » récentes (repères `ci` → `de`) : elles racontent toute la refonte 2.0 pas à pas.
- **`wiki/log.md`** — journal daté 2026-07-02 (toutes les livraisons du jour).
- **`docs/audit-mango-2.0.md`** — l'audit fondateur + la feuille de route.
- **`docs/audit-competences-mango.md`** — l'audit des compétences de l'Élève + la nouvelle compétence auto-test.

En deux mots : un **shell hybride** (sidebar de sections + panneau principal, façon Cursor/ChatGPT) accessible sur `?v2`, avec un **design system TypeScript** (`ui/src/design/`), l'**App Builder** réel monté dans le shell, les apps 1.0 rangées en sections, un flux **« Gros projet »** (Perfect Plan → squelette → Chantier), la génération d'images (Krea, en attente de solde), la **Phase D** (fluidité, ErrorBoundary, a11y, souveraineté chiffrée), et une nouvelle **compétence auto-test** pour l'Élève.

## Le seul vrai piège
`master` (session auto) ↔ `forge-auto-evolution` (V2) = **divergence**. Tant que tu fais juste `checkout` d'une branche à l'autre, aucun risque. Le jour où Raf voudra faire de la V2 sa ligne principale (fusionner dans `master`), c'est une **décision + une opération à part** — à faire seulement sur sa demande explicite, avec soin, pour ne pas casser l'historique de la session auto.
