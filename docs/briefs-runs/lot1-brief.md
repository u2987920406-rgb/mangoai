# Brief — MangoOS, lot 1 : mesurer, cacher le registre, réconcilier la doc

## 1. Contexte

Dépôt local `/home/raf/projets/mangoai` (serveur Node/TS, `server/src` ~103 000 lignes, 595 fichiers).
Un audit externe a été rendu le 2026-09-28 : `/home/raf/projets/mangoai/audit-opus-2026-09-28.md`
(496 lignes, à lire AVANT de coder ; c'est la source des constats cités ci-dessous, ancrés fichier:ligne).
La baseline est mesurée : `HEAD = 863f094`, `npm run typecheck` **vert** au 2026-09-28T18:54.

## 2. Tâche

**Implémenter** les trois actions à risque nul ou faible de la partie D de l'audit, exactement :

- **D1 — Rendre la consommation mesurable** (audit §D1, constat B4). Faire remonter le champ `usage`
  des réponses OpenAI-compat à travers `server/src/llm/llm-engine.ts:191-220` jusqu'à un compteur par run,
  à côté de ce que `server/src/agent/agent.ts:276-306` fait déjà pour le chemin Claude.
  **Addition pure** : aucun chemin de décision ne change.
- **D7 — Mettre en cache le registre des cerveaux** (audit §D7, constat B10).
  `server/src/brain/brain-registry.ts:211-249` (`loadBrainRegistry` → `getBrain`, 75 sites d'appel) :
  cache avec invalidation sur `mtime` du fichier. L'édition à chaud dans l'Atelier doit rester prise en
  compte sans redémarrage — critère vérifiable.
- **D8 — Réconcilier la doc de données, honorer ou retirer les `tools` forgés** (audit §D8, constats B9/B12).
  (a) corriger la dérive documentaire de `pipeline-eleve-qa.md` (le registre vivant est `server/data/`,
  pas `server/src/data/` ; `open-gaps.json`) ; (b) trancher sur le champ `tools` des spécialistes de
  `server/data/specialist-agents.json:8-29`, qui annoncent des outils inexistants
  (`server/src/specialist/specialist-agentic.ts:64`). Recommandation de l'audit : **retirer** le champ
  fantôme, ou le câbler réellement — trancher, ne pas laisser les deux.

**Inclus** : ces trois actions, leurs tests, et la mise à jour documentaire de clôture exigée par
`CLAUDE.md` (statut.md, historique.md, wiki/ + wiki/log.md, limites.md si limite honnête).

**Exclus** : D2 (budget de boucle), D3/D4 (MangoQA), D5 (bascule `codeur` sur Claude), D6 (promotion des
gates). Ne pas les amorcer, même partiellement.

## 3. Contraintes

- **Aucune opération git** : ni add, ni commit, ni push, ni pull (règle du dépôt, `CLAUDE.md`).
- **Aucune suppression de fichier, jamais.**
- Ne pas modifier `server/data/brain-registry.json` (registre vivant) ni le rôle `codeur`.
- Ne pas lancer de génération d'application réelle (`/api/chat`, pipeline). Zéro appel modèle externe.
- Ne pas installer de dépendance, ne pas mettre à jour le dépôt.
- Tout défaut de comportement nouveau est **gaté OFF par défaut** (politique `flags.ts:10-12`) — sauf D1,
  qui est une addition de mesure sans effet de bord, et D7, dont l'invalidation au mtime préserve la sémantique.
- Chaque affirmation de résultat doit être un output réel copié, jamais une intention.
- Langue : français.

## 4. Livrable

- Le code modifié, dans `/home/raf/projets/mangoai/`.
- `npm run typecheck` **vert** et `npm test` (tier smoke) **sans nouvelle erreur** par rapport à la baseline.
- Un fichier `/home/raf/projets/mangoai/lot1-mesure-cache-doc-2026-09-28.md` : pour chacune des 3 actions,
  ce qui a changé, `fichier:ligne`, la commande exacte pour rejouer, l'output réel, et ce que ça prouve.

## 5. Critères (mesurables)

- **C1** — `npm run typecheck` sort 0, et `npm test` ne régresse pas (comparer à la baseline fournie).
- **C2** — le champ `usage` d'une réponse OpenAI-compat est lu et cumulé : le prouver par un test
  exécuté dont l'output est copié (valeur attendue vs valeur obtenue sur un faux client injecté).
  Le chemin Claude existant (`agent.ts`) continue de fonctionner.
- **C3** — le cache du registre est prouvé par un test qui (a) lit deux fois → une seule lecture disque,
  (b) modifie le `mtime` du fichier → la valeur est relue (l'édition à chaud marche encore).
- **C4** — `grep -rn "server/src/data" /home/raf/projets/mangoai/*.md` ne renvoie plus de référence au
  registre vivant ; le champ `tools` fantôme n'est plus annoncé sans implémentation (montrer le `grep`).
- **C5** — `git -C /home/raf/projets/mangoai status --short` ne montre **aucun** fichier supprimé, et
  aucun nouveau fichier hors les livrables de ce lot et la doc de clôture.

## 6. Interdits

- **Aucune suppression de fichier, jamais.**
- Aucun `git` (voir contraintes). Aucun commit, même « pour sauver ».
- Rien d'inventé : un chiffre non mesuré s'écrit « non mesuré ».
- Ne pas « améliorer » au-delà du périmètre : pas de refactoring opportuniste, pas de renommage.

## 7. Réponse attendue

Terminer par : changé / vérifié / reste, avec pour « vérifié » l'output réel des commandes.
**Un critère faux = pas terminé** — le dire explicitement plutôt que de le maquiller.
