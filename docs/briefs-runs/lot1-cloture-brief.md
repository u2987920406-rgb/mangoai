# Brief — MangoOS lot 1, CLÔTURE : livrable de preuve + verdict C4

## 1. Contexte

Le lot 1 (`/home/raf/projets/mangoai/lot1-brief.md`) a été exécuté : D1 (compteur de jetons
`server/src/llm/llm-usage.ts`, transport `llm-transport.ts`, ouverture de run `eleve/relay-agentic.ts`,
gate `LLM_USAGE_LOG`), D7 (cache du registre `brain/brain-registry.ts` + `tests/test-brain-registry-cache.ts`),
D8 (doc `pipeline-eleve-qa.md`, outils fantômes traités à l'exécution `specialist/specialist-agentic.ts`
+ `tests/test-llm-usage.ts`) sont **déjà écrits sur le disque, non commités**.
Le run précédent a été coupé par son plafond de tours AVANT d'écrire le livrable de preuve `C-listed`.

Vérifié par Hermes après ce run (ne pas refaire) : `npm run typecheck` **exit 0** ;
`npm test` (tier smoke) **12 PASS / 0 FAIL** ; `test-llm-usage` (28 pass), `test-brain-registry-cache`
(13 pass), `test-specialist-agentic` (33/33) **PASS**.

## 2. Tâche

**Rédiger le livrable de preuve manquant** et **trancher** le point C4 resté ouvert.

- **Livrable** : `/home/raf/projets/mangoai/lot1-mesure-cache-doc-2026-09-28.md`.
  Pour chacune des 3 actions (D1, D7, D8) : ce qui a changé, `fichier:ligne`, la **commande exacte**
  pour rejouer, l'**output réel** (copié d'une exécution que tu lances toi-même), et ce que ça prouve.
- **C4 — point resté ouvert** : `grep -rn "server/src/data" /home/raf/projets/mangoai/*.md` renvoie encore
  des occurrences, dont **`historique.md:3619`** — une **entrée d'historique datée** qui décrit un état passé.
  Tranché : on **ne réécrit pas un journal historique** (effacer le passé est un mensonge documentaire).
  Écris ce verdict noir sur blanc dans le livrable, avec le `grep` réel, et confirme que la référence
  d'**état courant** (`pipeline-eleve-qa.md`) est bien corrigée. Ne modifie PAS `historique.md` sur ce point.

## 3. Contraintes

- **Aucune opération git** (ni add, ni commit, ni push). **Aucune suppression de fichier, jamais.**
- Ne pas modifier `server/data/*.json` (registre vivant et spécialistes) : leurs modifications actuelles
  sont antérieures à ce lot, on n'y touche pas.
- Ne pas modifier le code déjà écrit au lot 1 sauf **bug prouvé** par un test qui échoue — dans ce cas,
  dis-le explicitement dans le livrable.
- Ne pas lancer de génération d'application réelle. Zéro appel modèle externe.
- Chaque output copié doit venir d'une commande que tu as réellement lancée (jamais reconstitué).
- Langue : français.

## 4. Critères (mesurables)

- **C1** — `lot1-mesure-cache-doc-2026-09-28.md` existe, ≥ 4 000 caractères, et contient pour chaque action
  une commande de replay + un output réel.
- **C2** — `npm run typecheck` sort 0 (coller l'output).
- **C3** — `node --import tsx src/test-runner.ts --tier smoke` sort « Tous les tests du tier sont verts » (coller l'output).
- **C4** — le livrable contient le `grep` réel de `server/src/data` dans les `*.md`, et le verdict daté ci-dessus.
- **C5** — `git -C /home/raf/projets/mangoai status --short` ne montre **aucun** fichier supprimé.

## 5. Interdits

- **Aucune suppression de fichier, jamais.** Aucun `git`. Rien d'inventé (un chiffre non mesuré s'écrit « non mesuré »).
- Ne pas « améliorer » au-delà de la rédaction du livrable : pas de refactoring, pas de renommage, pas de nouveau gate.

## 6. Réponse attendue

Terminer par : **changé / vérifié / reste**, avec l'output réel de chaque commande de vérification.
**Un critère faux = pas terminé** — le dire, pas le maquiller.
