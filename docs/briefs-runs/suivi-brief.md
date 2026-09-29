# Brief — Tracker de suivi du plan d'audit (HTML à cocher, rejouable)

## Objectif

Produire un **tableau de bord HTML** qui donne à Raf une vue unique de l'avancement
de l'audit MangoOS/MangoQA du 2026-09-28 : ce qui est **fait (vert)**, ce qui est
**en cours (orange)**, ce qui **reste (gris)**, pour chaque point D1→D8 et chaque
faiblesse B1→B19. Trois acteurs travaillent dessus (Opus, Hermès, Raf) — le fichier
est la mémoire partagée, il doit pouvoir être mis à jour **sans être réécrit à la main**.

## Contrainte de conception NON NÉGOCIABLE

**Ne PAS produire un HTML figé.** Produire trois artefacts :

1. `suivi/plan.json` — **la donnée**. Un tableau JSON, une entrée par point de l'audit.
   C'est le SEUL fichier qu'on édite pour mettre à jour l'avancement.
2. `suivi/build-suivi.mjs` — le **générateur** : lit `plan.json`, écrit `suivi/suivi.html`.
   Node pur, zéro dépendance à installer (pas de npm install), CSS embarqué,
   aucune ressource externe. `node suivi/build-suivi.mjs` doit produire le HTML.
3. `suivi/suivi.html` — le **rendu**, généré par le script (ne jamais l'éditer à la main).

Justification : mettre à jour un point = éditer une ligne JSON + relancer une commande.
Un HTML écrit à la main deviendrait faux dès la première correction et mentirait à Raf.

## Schéma de `plan.json`

```json
{
  "maj": "2026-09-29",
  "lots": [
    {
      "id": "D1",
      "titre": "Rendre la consommation mesurable",
      "gravite": "G0",
      "etat": "partiel",
      "effort": "M",
      "regression": "aucune",
      "fait": "Le compteur existe et compte réellement (4 briques du transport branchées, compteur par run).",
      "reste": "Rien n'expose la donnée : aucun endpoint, aucune lecture UI. Le compteur compte dans le vide.",
      "preuve": "server/src/llm/llm-usage.ts + 28 tests",
      "acteur": "Hermès",
      "bloquants": ["B4"]
    }
  ],
  "faiblesses": [
    { "id": "B1", "titre": "...", "gravite": "G0", "etat": "ouvert", "lot": "D3", "note": "" }
  ],
  "horsAudit": [
    { "id": "H1", "titre": "...", "etat": "fait", "date": "2026-09-29", "note": "..." }
  ]
}
```

`etat` ∈ `"fait" | "partiel" | "en-cours" | "a-venir" | "ouvert" | "ecarte"`.
`gravite` ∈ `"G0" | "G1" | "G2" | "G3" | "hors-audit"`.

## Contenu EXACT à porter (vérifié dans le code le 2026-09-29 — ne rien inventer)

### Plan D1→D8

- **D1 — Mesurer la consommation** · G0 · état **partiel** · effort M · régression aucune.
  Fait : compteur `llm/llm-usage.ts`, branché sur les 4 briques du transport
  (`openAiChat`, `openAiChatTools`, ollama, claude), compteur **par run** ventilé
  par modèle, avec compteur explicite d'appels non mesurés. 28 tests.
  Reste : **la donnée n'est exposée nulle part** — pas d'endpoint, pas d'UI.
  Preuve : `server/src/llm/llm-usage.ts`, `wiki/compteur-jetons.md`.
- **D2 — Armer le fusible de boucle** · G0 · état **a-venir** · effort S · régression faible (assumée).
  Le garde existe (`eleve-runtime.ts` via `relay-agentic.ts:249-253`) mais
  `ELEVE_BUDGET_PROMPT_CHARS` / `ELEVE_BUDGET_TOOL_CALLS` sont **absents de `server/.env`**
  → fusible **strictement inerte**. À calibrer après D1.
- **D3 — Sonde MangoQA + règle verte durcie** · G0 · état **a-venir** · effort M.
  Deux corrections : (a) sonde de cerveau au démarrage (vérifier que le cerveau
  **répond**, pas juste que le process vit) ; (b) dans `mangoqa/src/verdict.ts:25`,
  compter les `not_applicable` des branches **bloquantes** dans `incomplete` —
  aujourd'hui seule `skip` est comptée, donc un audit qui n'a rien vu peut sortir **vert**.
- **D4 — Faire voir le projet entier à l'audit** · G0 · état **a-venir** · effort M.
  `sortByPriority` est déjà appliqué en amont (`orchestrator.ts:115`, `MAX_FILES=40`),
  mais `llm.ts:265` passe toujours **un seul lot** de 24 000 caractères par branche,
  sans agrégation des constats. Visibilité mesurée : 12 % sur `etang-des-roseaux`.
- **D5 — `codeur` sur Claude + A/B** · état **écarté** · décision de Raf du 2026-09-29 :
  Élève = `deepseek-v4.1-flash`, Maître d'escalade = **Opus 5.5**. Remplacé par une
  mesure A/B DeepSeek↔GLM, pas par une bascule sèche.
- **D6 — Promouvoir les gates éprouvés, un par un** · G1 · état **a-venir** · effort M.
  État mesuré : **4 actifs sur 43** (`TEMPORAL_AWARENESS`, `ELEVE_GATE_IMAGES`,
  `ELEVE_GATE_CONSTANTS` en défaut ; `ELEVE_CLOSURE_GATE=on` par `.env`) → **39 dormants**.
  Candidats dans l'ordre : `ELEVE_GATE_DUAL_SKIP_BLOCK` (corrige un faux vert, B8),
  `BRAIN_FALLBACK` (B7), `ELEVE_ETAT`, `ELEVE_RESUME`, puis `ELEVE_REFLEXION`, `ELEVE_MEMOIRE`.
- **D7 — Cache du registre des cerveaux** · G1 · état **fait** · effort S.
  Cache invalidé sur `mtime`+taille, copie défensive, invalidation explicite à
  l'écriture ; l'édition à chaud de l'Atelier reste prise en compte. 13 tests.
- **D8 — Doc de données + `tools` forgés** · G2 · état **fait** · effort S · régression aucune.
  Chemins `server/src/data/` → `server/data/` corrigés dans `pipeline-eleve-qa.md` et
  `PRELAUNCH_CHECKLIST.md` ; champ `tools` fantôme **retiré du contrat de forge**,
  le sous-agent reçoit désormais la liste de ses outils réels. 11 specs conservées.

### Faiblesses B1→B19 (état réel, 2026-09-29)

- **B1** (G0) — MangoQA aveugle au dernier run sans alerte. **Ouvert**, lot D3.
- **B2** (G0) — Feu Vert possible sur couverture quasi nulle. **Ouvert**, lot D3.
- **B3** (G0) — L'audit voit un préfixe du projet, pas le projet. **Ouvert**, lot D4.
- **B4** (G0) — Consommation structurellement non mesurable. **Fermé** par D1 (mesure) — la lecture reste ouverte.
- **B5** (G0) — Fusible de coût inerte. **Ouvert**, lot D2.
- **B6** (G1) — 39 gates dormants sur 43. **Ouvert**, lot D6.
- **B7** (G1) — Repli inter-cerveaux déclaré dans les données, désarmé par le code. **Ouvert**, lot D6.
- **B8** (G1) — Gardien aveugle rendant quand même un vert. **Ouvert**, lot D6.
- **B9** (G1) — Spécialistes annonçant des outils inexistants. **Fermé** par D8.
- **B10** (G1) — `getBrain()` relisait le registre à chaque appel. **Fermé** par D7.
- **B11** (G1) — Registre vivant incomplet d'un rôle (`codeur_frontiere` absent des 15 rôles). **Ouvert**.
- **B12** (G1) — Dérive documentaire sur l'emplacement des données. **Fermé** par D8.
- **B13** (G1) — Écart doc/code sur les budgets de boucle. **Fermé** par D8.
- **B14** (G2) — Table de coûts fausse dans les deux sens (`claude/opus` à 30 $/Mtok alors que
  le chemin passe par l'abonnement ; `ollama/*` à 0 alors que tout passe par Ollama Cloud payant).
  **Ouvert**.
- **B15** (G2) — Règle de centralisation des gates non tenue : 65 `process.env.X === "on"`
  hors `flags.ts`. **Ouvert**.
- **B16** (G2) — Deux registres de modèles sans source commune. **Ouvert**.
- **B17** (G2) — Un visage annoncé non câblé (Observateur-Conseil : README dit « Visage 2 »,
  FAILLES dit « non câblé »). **Ouvert**.
- **B18** (G3) — Entrée de répertoire accidentelle dans `server/`. **Fermé le 2026-09-29**
  (dossier parasite supprimé, cause corrigée dans `test-axioms-design.ts` — le test vérifie
  désormais qu'aucun dossier parasite n'est créé).
- **B19** (G3) — Clés en clair et dupliquées (`OLLAMA_API_KEY` = `ELEVE_API_KEY`, même valeur
  dans `server/.env` et `mangoqa/.env`). **Ouvert** (les deux `.env` sont bien git-ignorés).

### Traités HORS audit, le 2026-09-29 (à afficher aussi, ce sont de vraies résolutions)

- **H1** — Élève basculé sur `deepseek-v4.1-flash` : partition créée (`models/deepseek.ts`),
  rôles du registre alignés, 9 tests. **Fait le 2026-09-29.**
- **H2** — **8 rôles sur 15 pointaient un modèle retiré** par Ollama le 2026-09-25
  (`deepseek-v4-flash:0731`) : tout build qui les sollicitait mourait en HTTP 400 silencieux.
  Corrigé, plus un contrôle de pré-vol `/v1/models`. **Fait le 2026-09-29.**
- **H3** — `orchestrateur` sur Xiaomi avec **quota épuisé** (429 mesuré). Basculé sur Ollama Cloud. **Fait le 2026-09-29.**
- **H4** — **Le HTTP 400 « invalid tool call arguments » qui tuait chaque tour** : cause trouvée
  par sonde — la compaction tronquait les arguments d'outil à 300 caractères **bruts**, coupant
  le JSON, ce que l'API refuse. Corrigé + invariant verrouillé par test + le corps d'erreur
  est désormais journalisé (il était jeté). **Fait le 2026-09-29.**
- **H5** — Maître d'escalade porté à **Opus 5.5** (3 défauts pointaient encore Sonnet). **Fait le 2026-09-29.**
- **H6** — MangoQA : **Sonnet 5 primaire**, repli **Ollama DeepSeek v4.1 flash** (le repli
  était lui-même un modèle mort). **Fait le 2026-09-29.**
- **H7** — **Premier build complet prouvé de bout en bout** : app Pomodoro générée par l'Élève,
  build vert, 16/16 tests, 0×400, gate visuel **6/6 lois** aux deux viewports après 3 FAIL
  corrigés à la cause, compteur prouvé par clic réel (25:00→24:56), aperçu durable `:8099`.
  **Fait le 2026-09-29.**
- **H8** — Pré-vol « les modèles du registre existent-ils encore ? » ajouté aux skills. **Fait le 2026-09-29.**
- **H9** — Deux commits posés (`mangoai c7cead1`, `mangoqa 3f5a395`), **non poussés**. **Fait le 2026-09-29.**

## Exigences de rendu (gate visuel strict — c'est vérifié en pixels)

- **Cible tactile ≥ 44×44 px**, **texte ≥ 16 px**, contraste **≥ 4.5:1** sur tout texte.
- **Viewports à valider sans débordement** : `1280×1400` (desktop), `1140×512` (Pixel 9 Pro XL
  paysage), `412×2400` (mobile). La loi « pas de débordement du conteneur » est binaire.
- Un bloc par **lot** avec une **case cochée verte** quand `etat == "fait"`, orange quand
  `partiel`/`en-cours`, grise quand `a-venir`/`ouvert`. Les faiblesses rattachées à un lot
  apparaissent **sous** ce lot.
- **Compteur de progression** en tête : « N points faits / total » pour les lots, idem pour
  les faiblesses. Chiffres **calculés depuis `plan.json`**, jamais écrits en dur.
- Pas de `<table>` pour la mise en page principale : des blocs **responsive** (une table
  large déborde ou se rogne en 412 px — c'est un défaut déjà rencontré). Grille de cartes.
- Français. Aucune ressource externe (pas de CDN, pas de police distante).
- Thème clair, sobre, lisible.

## Livrable et vérification

1. Écrire les 3 fichiers sous `suivi/`.
2. Lancer `node suivi/build-suivi.mjs` et **confirmer que `suivi/suivi.html` est produit**.
3. Vérifier soi-même le rendu (le générateur doit être déterministe : relancer le script
   deux fois donne le même HTML).
4. **Ne pas** modifier d'autre fichier du dépôt. **Aucun** `git add`/`git commit`/`git push`.

Termine en répondant : les 3 chemins, le nombre de lots et de faiblesses portés,
et le compteur de progression calculé.
