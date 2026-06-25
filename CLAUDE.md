# MangoOS — Instructions de session

## Démarrage automatique

**Au début de chaque session (après /clear ou reprise) :**
Lire `statut.md` uniquement et afficher immédiatement le **tableau consolidé** des idées et chantiers, sans attendre que l'utilisateur le demande.

Lire aussi `memory.md` pour l'état courant du projet.

Lire aussi `fondation.md` — le document fondateur (architecture, vision 10 ans, principes non-négociables). Léger (~25 ko) et structurant : c'est la référence absolue pour toute décision d'architecture.

**Ne PAS lire `historique.md` au démarrage** — ce fichier est lourd (~220 ko). Le lire uniquement quand l'utilisateur demande explicitement le détail d'une idée ou d'une session passée.

## Wiki de connaissance (`wiki/`, vault Obsidian)

Le dossier `wiki/` est une **couche de synthèse interconnectée** par-dessus les docs brutes (pattern *LLM Wiki* / Obsidian). Les sources (`statut.md`, `historique.md`, `fondation.md`, `memory.md`) restent **immuables** ; le wiki les relie en pages-entités vivantes (une par concept : [[kernel]], [[mangoqa]], [[boucle-curation]], etc.).

- **Conventions** : lire `wiki/_schema.md`. **Catalogue** : `wiki/index.md`. **Journal** : `wiki/log.md`.
- Pour répondre à une question d'architecture, **lire d'abord `wiki/index.md`** puis la page-entité pertinente — souvent plus rapide que de parcourir `historique.md`.
- Le vault Obsidian = ouvrir `D:\IA\MangoOS` en entier (les `[[liens]]` se résolvent par nom de fichier).

## ⚠️ Vérification anti-serveur-orphelin (IMPÉRATIF à chaque démarrage du backend)

**Avant de lancer le backend Express (port 3000), TOUJOURS vérifier qu'aucun process orphelin ne squatte le port.** Cette erreur s'est produite plusieurs fois : la session automatique nocturne de Raf laisse un `node` mort-vivant sur le port 3000 dans une session non-interactive. Tous ses spawns (npm/git/vite) échouent alors avec des codes obscurs (`3221225794` / `0xC0000142`, `git init` qui plante), ce qui bloque toute génération d'app.

**Procédure obligatoire avant chaque lancement backend :**

```powershell
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) { "PORT 3000 LIBRE" }
else { $conns | ForEach-Object { Get-Process -Id $_.OwningProcess } | Format-Table Id,ProcessName,StartTime,SessionId }
```

- **Port libre** → lancer le backend normalement.
- **Listener présent** → c'est presque toujours un orphelin de la run nocturne. Le tuer (`Stop-Process -Id <PID> -Force`) **puis** lancer un backend FRAIS dans la session active. Ne jamais essayer de réutiliser le serveur orphelin (sa session est morte, ses spawns échoueront).

## Comment accéder à l'historique

L'utilisateur peut demander :
- **"détail de l'idée #X"** → lire `historique.md`, section correspondante
- **"montre-moi la session du 2026-06-13"** → lire `historique.md`, section Journal
- **"lis l'historique"** → lire `historique.md` en entier
- **"vision fondatrice"** ou **"le robot"** → lire `historique.md`, section Vision

## Règles propres à MangoOS

- `tsc --noEmit` + `npm run build` (ui/) doivent rester verts après chaque modification
- Toute nouvelle fonctionnalité = entrée dans `statut.md` (tableau + ligne "Où on en est") ET dans `historique.md` (section détail de l'idée)
- Ports : backend Express 3000 · UI Vite 5173 · App générée 5174

## ⚠️ Règle git absolue à l'atelier

**Zéro opération git sans permission explicite de Raf** — ni `git add`, ni `git commit`, ni `git push`, ni `git pull`.

**Pourquoi :** Le PC local de Raf tourne une session automatique qui fait ses propres commits. Un commit parallèle depuis Claude Code crée des conflits d'historique.

- `save` ou "sauvegarde" = mettre à jour les fichiers (statut.md, historique.md, code) **uniquement**. Jamais de git.
- Git uniquement quand Raf dit explicitement : "commit", "push sur GitHub", ou donne une commande git directe.
- **`git pull` — condition absolue :** même si le repo local semble en retard, toujours s'arrêter et poser cette question exacte : *« Veux-tu que je fasse un git pull depuis origin ? »* — jamais de pull sans cette confirmation.

## Clôture automatique de chaque livraison

**À la fin de chaque module ou amélioration** (dès que `tsc` + build UI sont verts) :
1. Mettre à jour `statut.md` — passer l'idée en ✅ FAIT + mettre à jour le bloc "Où on en est"
2. Mettre à jour `historique.md` — ajouter le détail technique dans la section de l'idée + une entrée dans le Journal des sessions
3. **Mettre à jour le wiki** (`wiki/`) — éditer la/les page(s)-entité(s) touchée(s) par le changement (et en créer une si un nouveau concept apparaît, en suivant `wiki/_schema.md`), puis **ajouter une entrée datée dans `wiki/log.md`** (`## [date] ingest | titre`). Mettre à jour `wiki/index.md` si une page est créée. C'est du bookkeeping léger : viser le delta, pas une réécriture.
4. **Si la livraison comporte une « limite honnête »** (un truc qu'on assume ne pas savoir faire pour l'instant) → l'inscrire dans `limites.md` (le registre des limites) : nom · numéro de chantier · opération bloquée · pourquoi infaisable aujourd'hui · piste de résolution (**codage interne** / API / MCP / évolution officielle) · **Codable en interne ?** (🟢 oui code maison ou lib curée / 🟡 partiel, robuste = externe / 🔴 bloqué tant qu'un externe n'existe pas) · Modèle optimal · Effort · Statut. Règle de Raf (2026-06-25) : aucune limite ne se perd ; et beaucoup sont **codables en interne** (pas seulement « attendre une API ») — la colonne tranche la faisabilité.
5. Attendre la permission de Raf avant tout git.
