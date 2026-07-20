# MangoOS — Instructions de session

## ⚡ Auto-reprise sur limite d'usage (règle permanente de Raf, 2026-07-03)

**Pour TOUTE tâche non triviale (> ~15 min de travail estimé), poser un filet de reprise AVANT de commencer :**
1. Créer les tâches de suivi (TaskCreate) — c'est le fil qu'une reprise relit pour savoir où on en est.
2. Poser un **cron heartbeat récurrent défensif** (CronCreate, ~toutes les 30 min, minutes décalées type 23/53) dont le prompt dit : « via TaskList, si une tâche est in_progress/pending ET que le travail a été interrompu (rate-limit, crash), reprends immédiatement sans demander ; sinon réponds juste "heartbeat OK" sans rien relancer en double ».
3. Si l'heure de réinitialisation de la limite est CONNUE (le client l'affiche), poser EN PLUS un cron one-shot à reset+1 min (comme la nuit du 2026-07-03 : limite à 2h00 → reprise à 2h01, prouvé).
4. À la fin de la mission : **CronDelete** du heartbeat (ne pas laisser des crons zombies).

Raf dort ou s'absente pendant les longues missions : ne jamais rester bloqué en attente d'un humain — trancher avec les options recommandées, documenter le choix, continuer.

## Démarrage automatique

**Au début de chaque session (après /clear ou reprise) :**
Lire `statut.md` uniquement et afficher immédiatement le **tableau consolidé** des idées et chantiers, sans attendre que l'utilisateur le demande.

Lire aussi `memory.md` pour l'état courant du projet.

Lire aussi `fondation.md` — le document fondateur (architecture, vision 10 ans, principes non-négociables). Léger (~25 ko) et structurant : c'est la référence absolue pour toute décision d'architecture.

Lire aussi `pipeline-eleve-qa.md` — câblage TECHNIQUE concret du pipeline Élève + Stratège + Forge + MangoQA (fichiers, variables d'env, mécanismes réels, état daté 2026-07-14). Complément opérationnel de `fondation.md` (qui reste au niveau vision) — la référence à jour avant toute question ou modification touchant au pipeline.

**Ne PAS lire `historique.md` au démarrage** — ce fichier est lourd (~220 ko). Le lire uniquement quand l'utilisateur demande explicitement le détail d'une idée ou d'une session passée.

## Wiki de connaissance (`wiki/`, vault Obsidian)

Le dossier `wiki/` est une **couche de synthèse interconnectée** par-dessus les docs brutes (pattern *LLM Wiki* / Obsidian). Les sources (`statut.md`, `historique.md`, `fondation.md`, `memory.md`) restent **immuables** ; le wiki les relie en pages-entités vivantes (une par concept : [[kernel]], [[mangoqa]], [[boucle-curation]], etc.).

- **Conventions** : lire `wiki/_schema.md`. **Catalogue** : `wiki/index.md`. **Journal** : `wiki/log.md`.
- Pour répondre à une question d'architecture, **lire d'abord `wiki/index.md`** puis la page-entité pertinente — souvent plus rapide que de parcourir `historique.md`.
- Le vault Obsidian = ouvrir `D:\IA\MangoOS` en entier (les `[[liens]]` se résolvent par nom de fichier).

## ⚠️ Checklist de pré-lancement (IMPÉRATIF avant tout pipeline "zéro intervention")

**Avant de lancer un script long/autonome** (`run-*-apps.ts`, `run-mango-nuit.ts`, tout test `_prove-*` en conditions réelles, tout run sans supervision continue) : dérouler `PRELAUNCH_CHECKLIST.md` (racine du repo). Née d'un oubli réel (2026-07-14) : câblage modèle vérifié à fond mais MangoQA — dépendance d'EXÉCUTION, pas de config — mort sans que ce soit contrôlé avant le lancement. La checklist couvre : services externes vivants (Ollama, MangoQA), cohérence des 3 registres modèle, cohérence prompt↔chemin réellement emprunté (contrat vs agentique), capacité VRAM, hygiène du run (état nettoyé, filet de reprise posé).

## ⚠️ Vérification anti-serveur-orphelin (IMPÉRATIF à chaque démarrage du backend ET de l'UI)

**Avant de lancer le backend Express (port 3000) OU l'UI Vite (port 5173), TOUJOURS vérifier qu'aucun process orphelin ne squatte le port.** Cette erreur s'est produite plusieurs fois : la session automatique nocturne de Raf laisse un `node` mort-vivant sur le port 3000 dans une session non-interactive. Tous ses spawns (npm/git/vite) échouent alors avec des codes obscurs (`3221225794` / `0xC0000142`, `git init` qui plante), ce qui bloque toute génération d'app.

**Incident réel du 2026-07-20 — le même problème sur le port 5173** : un `vite` orphelin d'une app générée (`toeic-quest`, lancé sans `--port` explicite) est tombé sur le premier port libre = **5173**, exactement le port que `desktop/src-tauri/tauri.conf.json` charge EN DUR (`devUrl`). Résultat : lancer l'app desktop Tauri affichait `toeic-quest` au lieu de MangoOS — silencieux, aucune erreur, juste le mauvais contenu. **Le port 5173 (UI) doit être vérifié avec la MÊME discipline que le port 3000**, avant tout lancement UI et avant tout lancement de l'app desktop Tauri.

**Procédure obligatoire avant chaque lancement backend/UI/Tauri :**

```powershell
$conns = Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) { "PORTS 3000/5173 LIBRES" }
else { $conns | ForEach-Object { Get-Process -Id $_.OwningProcess } | Format-Table Id,ProcessName,StartTime,SessionId }
```

- **Ports libres** → lancer normalement.
- **Listener présent** → vérifier la `CommandLine` du process (`Get-CimInstance Win32_Process -Filter "ProcessId=<PID>"`) avant de tuer : si c'est un orphelin d'une AUTRE app (ex. `workspace/<autre-projet>/node_modules/.bin/vite`), le tuer sans hésiter. Si c'est un vrai backend/UI MangoOS de la session active, ne pas le tuer par erreur. Puis lancer un process FRAIS dans la session active — ne jamais réutiliser un orphelin (sa session est morte, ses spawns échoueront).

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

## ⚖️ Discipline de poids `statut.md` — index, jamais archive (règle de Raf, 2026-07-12)

**Contexte** : `statut.md` avait dérivé de son rôle d'index (état courant, lu à chaque démarrage) vers une archive complète (690 Ko, 241 entrées de journal + tableaux aux cellules-romans). Allégé le 2026-07-12 à 108 Ko (−84 %) après audit de couverture ligne par ligne (rien de perdu — tout migré vers `historique.md`/`wiki/` avant suppression, sinon laissé tel quel).

**Règle durable pour toute future entrée dans `statut.md`** :
- **Ligne "Où on en est"** : ~500-800 caractères MAX. Un résumé exécutif (quoi, statut, chiffre-clé), pas un roman. Le détail technique complet va TOUJOURS dans `historique.md` (`## Journal — DATE`).
- **Ligne de tableau** ("Idées en attente/actives", "Cap stratégique", etc.) : titre court (5-10 mots) + statut + éventuellement 1 clause de résultat-clé, puis un pointeur `→ historique.md`/`→ [[page-wiki]]`. Jamais de paragraphe dans une cellule de tableau.
- **Si un fait doit absolument être visible sans naviguer ailleurs** (une règle de sécurité, une limite bloquante) : il a sa place ailleurs par construction — `limites.md` pour une limite honnête, ce `CLAUDE.md` pour une règle de fonctionnement, `wiki/` pour la synthèse d'un concept. `statut.md` n'est jamais le SEUL endroit où vit une information importante.

**Pourquoi** : `statut.md` est lu en entier à CHAQUE démarrage de session (règle "Démarrage automatique" ci-dessus) — son poids est un coût récurrent, pas juste esthétique. Le triptyque `statut.md` (état courant) → `historique.md` (détail chronologique complet) → `wiki/` (synthèse thématique interconnectée) existe précisément pour que l'information reste **toujours disponible sans être toujours chargée**. Si `statut.md` regrossit significativement (repère : au-delà de ~150-200 Ko), relancer le même protocole d'allégement (audit de couverture → migration des orphelins → compression).

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
