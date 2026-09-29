# Brief — MangoOS, Élève = DeepSeek v4.1 flash (partition + bascule + preuves)

## 1. Contexte

Dépôt `/home/raf/projets/mangoai` (serveur Node/TS). Faits VÉRIFIÉS le 2026-09-29 par Hermès, à ne pas re-mesurer :

- `deepseek-v4.1-flash` existe sur Ollama Cloud et **pilote le function-calling** : appel réel
  `POST https://ollama.com/v1/chat/completions` avec `tools=[read_file]` → réponse
  `tool_calls=[{name:"read_file", arguments:"{\"path\":\"package.json\"}"}]`, `usage` complet
  (`prompt_tokens:329, completion_tokens:55`). Preuve copiée dans le rapport final.
- Le modèle n'a **pas de partition** dans `server/src/models/` : les profils existants sont
  gemma, uxui, layout, glm, qwythos, qwythos-tools, qwen3, llama3-groq-tool-use, generic.
  Résoudre `deepseek-v4.1-flash` aujourd'hui → `GENERIC` (repli), donc **chemin contrat** :
  pas de boucle agentique, pas de contrat WRITE+EDIT documenté pour un gros modèle.
- `server/data/brain-registry.json` est la SOURCE VIVANTE du cerveau `codeur` (= l'Élève) :
  lu au boot **et** à chaque sauvegarde via `syncEleveFromBrainRegistry()`
  (`server/src/eleve/provider.ts:71-89`). `server/.env` n'est qu'un amorçage à froid.
- `PROFILES` s'arrête au premier `matches()` vrai (`models/profile.ts:55-59`), et
  `agentic:true` fait entrer la boucle à outils (`server/src/eleve/relay.ts:87`) — provider
  `openai` est bien `supportsTools` (`server/src/eleve/contract.ts:83-85`).

## 2. Tâche

**Basculer l'Élève MangoOS sur `deepseek-v4.1-flash`**, proprement : créer sa partition de
modèle, et l'écrire comme valeur vivante du rôle `codeur`.

- **Inclus** : (a) un nouveau profil `server/src/models/deepseek.ts` + son enregistrement dans
  `models/profile.ts` ; (b) la valeur du rôle `codeur` dans `server/data/brain-registry.json` ;
  (c) le contrôle de cohérence de `server/.env` (`ELEVE_*`) pour qu'un amorçage à froid donne la
  même chose ; (d) des tests qui prouvent la résolution ; (e) la doc de clôture exigée par
  `CLAUDE.md` (statut.md, historique.md, wiki/ + wiki/log.md).
- **Exclus** : changer l'Élève d'un AUTRE rôle que `codeur` ; toucher au Maître (autre brief) ;
  refonte du moteur agentique ; toute génération d'application réelle ; tout ce qui est gaté OFF.

## 3. Contraintes

- **Aucune suppression de fichier, jamais.** Aucun `git` (ni add, ni commit, ni push).
- Aucune opération de réseau vers un LLM : **aucun appel modèle réel** (prouve par tests
  déterministes et par le raisonnement du code, jamais par un run de génération).
- Ne pas modifier les autres rôles du registre vivant (`architecte`, `juge`, `vision`,
  `forgeron`, `orchestrateur`…) — seul `codeur` change.
- Ne pas toucher aux fichiers déjà modifiés par un autre lot en cours : `server/src/llm/llm-usage.ts`,
  `llm-transport.ts`, `brain-registry.ts`, `relay-agentic.ts`, `flags.ts`, `specialist-*`.
- Langue : français. Rien d'inventé : un chiffre non mesuré s'écrit « non mesuré ».

## 4. Livrable

- Le code modifié dans `/home/raf/projets/mangoai/`.
- `npm run typecheck` **vert** et `npm test` (tier smoke) **12 PASS / 0 FAIL** (baseline du 2026-09-29).
- `/home/raf/projets/mangoai/models-deepseek-rapport.md` : ce qui a changé (`fichier:ligne`), la
  commande exacte pour rejouer, l'output réel, et ce que ça prouve.

## 5. Critères (mesurables)

- **C1** — `npm run typecheck` sort 0 ; tier smoke 12 PASS / 0 FAIL ; aucun test existant en échec.
- **C2** — `resolveProfile("deepseek-v4.1-flash").id === "deepseek"` **et** `.agentic === true` :
  prouvé par un test exécuté, output copié (avant : `id === "generic"`).
- **C3** — le profil porte `axiomFiles: [".axioms.md", ".axioms.deepseek.md"]` et un
  `escalateAppendix` non vide nommant la bonne famille, cohérent avec le style des profils
  existants (`glm.ts`, `qwen3.ts`) — le Maître doit savoir où ranger l'axiome.
- **C4** — `getBrain("codeur")` renvoie `provider:"openai"`, `model:"deepseek-v4.1-flash"`,
  `baseUrl:"https://ollama.com/v1"`, `apiKeyEnv:"OLLAMA_API_KEY"` : montrer la sortie réelle d'un
  script `tsx` qui appelle `getBrain` (pas une lecture de fichier à l'œil).
- **C5** — les caps du profil sont justifiés et **plus généreux que ceux de GENERIC**
  (`fileBudget`, `fileMax`, `axiomCap`, `maxAttempts`) : un gros modèle ne se bride pas comme un
  petit local. Écrire la valeur retenue et pourquoi.
- **C6** — `git status --short` ne montre aucun fichier supprimé, et aucun fichier modifié hors
  ceux listés dans ce brief.

## 6. Interdits

- **Aucune suppression de fichier, jamais.**
- Aucun `git`. Aucun commit, même « pour sauver ».
- **Ne pas lancer de génération d'application** (`/api/chat`, pipeline, `train-loop`) : le but est
  la configuration, pas un run.
- Ne pas installer de dépendance, ne pas mettre à jour le dépôt.
- Ne pas « améliorer » au-delà du périmètre : pas de refactoring opportuniste, pas de renommage.

## 7. Réponse attendue

Terminer par : changé / vérifié / reste, avec pour « vérifié » l'output réel des commandes.
**Un critère faux = pas terminé** — le dire explicitement plutôt que de le maquiller.
