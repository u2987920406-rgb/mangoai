# Refonte Mango — 06 · MangoQA en produit autonome

> Décidé le 2026-08-04 : **MangoQA sort en premier, seul.**
> Client fixé : **le solo maker / dev indé.**
> Travail sur `D:\IA\MangoQA` (copie vivante).
>
> Ce document est le cadrage produit. Aucune ligne de code n'a encore été modifiée.

---

## 1. Pourquoi lui d'abord

Trois raisons, dans l'ordre de force :

1. **C'est le seul morceau déjà livrable.** 4 361 lignes, 34 modules, 5 dépendances de
   production. À comparer aux 346 modules de MangoOS.
2. **C'est le vrai différenciateur.** Autant le vendre nu que caché dans un builder.
3. **C'est le terrain d'entraînement.** Découper pour un client sur un objet 8 fois plus petit,
   avant d'attaquer MangoOS. La v3 sera meilleure après.

---

## 2. Ce qui est DÉJÀ autonome (mesuré, pas supposé)

J'ai cherché le couplage réel à MangoOS. Voici ce que le code dit :

| Point vérifié | Résultat |
|---|---|
| Imports depuis MangoOS | **Zéro.** Les occurrences de « MangoOS » sont des **commentaires**. |
| Contrat d'échange | **2 fichiers JSON** : `phase-complete.json` (entrée) → `audit-verdict.json` (sortie) |
| Type d'entrée des branches | `ProjectFile[] = { path, content }` — **totalement générique** |
| Taille d'une branche | **~25 lignes** : un filtre de fichiers + un prompt de spécialité |
| Client LLM | autonome (`llm.ts` + `ollama-client.ts`), adapté de MangoOS mais **indépendant** |
| Cerveau primaire | **Ollama local, `$0`** — repli sur abonnement Claude si injoignable |
| Dépendances de prod | **5** : `chokidar`, `dotenv`, `claude-agent-sdk`, `web-tree-sitter`, `tree-sitter-wasms` |
| Résilience | watchdog + heartbeat + fail-open, **éprouvés sur 2 vrais crashs heap-overflow en prod** |
| Parsing structurel | **tree-sitter (AST réel)**, pas des regex — aujourd'hui grammaire TSX seule |

> **Conclusion : MangoQA n'est pas couplé à MangoOS. Il est simplement _déclenché_ par lui.**
> Tout le travail d'autonomisation tient dans **le déclencheur et la sortie**, pas dans le cœur.

### Les 3 seuls vrais points d'attache

1. Le nom de la variable `MANGOAI_WORKSPACE` — cosmétique.
2. Le déclencheur : il attend qu'on écrive `phase-complete.json`. **Rien d'autre que MangoOS ne l'écrit.**
3. La convention du dossier `.mangoqa/` dans chaque projet.

---

## 3. Le positionnement

> ### « Tu génères du code avec une IA. Voici l'auditeur indépendant qui le relit avant que tu l'expédies. »

**Le problème réel du marché** : les générateurs d'apps IA ne codent pas mal — ils **mentent sur
le fait d'avoir fini**. Ça compile, c'est joli, et c'est subtilement faux. Une clé API dans le
bundle, un contraste à 3.1, une injection SQL par concaténation, un CORS en `*`, zéro test. Rien
ne te le dit. **Le contrôle qualité, c'est toi.**

**Ce que MangoQA apporte, et que personne n'a** : un auditeur qui **n'obéit pas au constructeur**.
Ce n'est pas un auto-contrôle — c'est un processus séparé, qui dit rouge même quand le générateur
dit « terminé ».

| | Un linter (ESLint) | Un auto-check d'agent | **MangoQA** |
|---|---|---|---|
| Comprend l'intention | ❌ | ✅ | ✅ |
| Indépendant du générateur | ✅ | ❌ | ✅ |
| Verdict bloquant | ⚠️ syntaxique | ❌ | ✅ |
| Sécurité / a11y / archi | partiel | ⚠️ | ✅ 6 branches |
| Tourne en local, `$0` | ✅ | ❌ | ✅ |

**Marché adressable : tout utilisateur de Cursor, Copilot, Claude Code, Lovable, Bolt, v0** —
pas seulement les utilisateurs de MangoOS. C'est un marché d'un ordre de grandeur au-dessus.

---

## 4. Les quatre surfaces de sortie

Par ordre de priorité pour le dev indé.

### 4.1 — CLI (surface n°1)

```bash
npx mangoqa ./mon-projet              # audit ponctuel, rapport terminal
npx mangoqa ./mon-projet --json       # sortie machine
npx mangoqa ./mon-projet --html       # rapport HTML
npx mangoqa watch ./mon-projet        # mode continu (ce qu'il fait déjà)
npx mangoqa --only security,a11y      # branches ciblées
npx mangoqa --fail-on red             # code de sortie ≠ 0 → utilisable en CI
```

**Zéro friction, zéro installation.** C'est la forme naturelle pour ce client.

### 4.2 — Serveur MCP (surface n°2 — le levier le plus fort)

C'est le point qui change la nature du produit : **tu ne vends plus un outil à des humains, tu
deviens une capacité que les autres agents branchent.**

```jsonc
// .mcp.json — chez n'importe quel utilisateur de Claude Code / Cursor
{
  "mcpServers": {
    "mangoqa": { "command": "npx", "args": ["-y", "mangoqa", "mcp"] }
  }
}
```

**Outils exposés (proposition de contrat) :**

| Outil MCP | Entrée | Sortie | Usage |
|---|---|---|---|
| `audit_project` | `path`, `branches?`, `changedFiles?` | verdict + constats par branche | « audite ce que tu viens d'écrire » |
| `audit_files` | `files: [{path, content}]` | idem, sans toucher au disque | audit d'un diff en mémoire |
| `explain_finding` | `findingId` | explication + correctif proposé | l'agent comprend le rejet |
| `list_branches` | — | les branches disponibles + leur spécialité | découverte |

> **Pourquoi c'est décisif** : un agent qui code peut désormais **s'auto-faire auditer par un tiers**
> à chaque étape. C'est exactement la boucle « Production Aveugle / Audit Fantôme » de ta spec —
> mais offerte à tout l'écosystème, pas seulement à MangoOS.
>
> Et ton architecture est **déjà** la bonne pour ça : contrat figé, fail-open, dépendances injectées,
> orchestrateur testable. Il n'y a rien à redresser, seulement à exposer.

### 4.3 — Hook git / étape CI (surface n°3)

```bash
npx mangoqa install-hook pre-push     # bloque un push sur feu rouge
```
```yaml
# .github/workflows/qa.yml
- run: npx mangoqa . --fail-on red --html rapport.html
```

### 4.4 — Rapport lisible (transverse — indispensable aux trois)

Aujourd'hui MangoQA écrit `audit-verdict.json`, **pour une machine**. Il lui faut une voix.

```
  🥭 MangoQA — boutique-the                        12 fichiers · 8,4 s · $0.00

  🔴 FEU ROUGE                              la branche Sécurité bloque

  🔒 Sécurité          ÉCHEC    Clé Supabase exposée côté client
                                src/lib/api.ts:12 — VITE_SUPABASE_SERVICE_KEY
                                OWASP A05. Une clé de service ne doit jamais
                                porter le préfixe VITE_ (inlinée dans le bundle).
                                ▸ Correctif : déplacer l'appel côté serveur.

  ♿ Accessibilité      ÉCHEC    Contraste 3.1 sur le menu (seuil AA : 4.5)
                                src/components/Nav.tsx:34

  🏗️ Architecture      OK
  ⚡ Performance        OK
  🧪 Tests             OK       14 tests trouvés
  🎨 Design system     CONSEIL  3 valeurs de couleur hors palette

  ▸ mangoqa explain SEC-A05-001    pour le détail et le correctif
```

**Trois principes du rapport :** on cite toujours le fichier et la ligne · on nomme la règle
(OWASP, WCAG) · on propose un correctif. Un verdict sans correctif est un reproche, pas un audit.

---

## 5. Registre — ce qui reste, ce qui sort, ce qui s'ajoute

### 🟢 GARDE tel quel (le cœur, ne pas y toucher)

| Élément | Pourquoi |
|---|---|
| Les **6 branches** (archi, sécu, a11y, perf, tests, design-system) | Le produit |
| `orchestrator.ts` (dépendances injectées, testable) | Bien conçu |
| **Fail-open intégral** | Un auditeur qui casse la prod ne sera jamais adopté. **Invariant absolu.** |
| `watchdog.ts` + `watchdog-core.ts` + heartbeat | Éprouvés sur 2 vrais crashs |
| `retex.ts` (boîte noire) | Réinjecte les erreurs passées → l'audit s'améliore avec l'usage. **Actif différenciant.** |
| `types.ts` (contrat figé) | Devient le contrat **public** |
| `llm.ts` + `ollama-client.ts` (Ollama primaire, Claude en repli) | Le `$0` local est un argument de vente |
| Le **Disjoncteur** (`breakers/`) | Autorité d'arrêt réelle |
| tree-sitter (AST réel) | Différencie d'un simple grep |

### 🟡 MASQUE (reste dans le code, sort du produit v1)

| Élément | Pourquoi |
|---|---|
| **Visage 2 — Observateur-Conseil** | Analyse les patterns de rejets récurrents. Excellent, mais c'est une fonctionnalité de *deuxième* version : il faut d'abord un historique. Gate `QA_OBSERVER` reste OFF. |
| **Flux-Eye** (`flux-eye/`, 4 modules, 806 l.) | Graphe de navigation. Puissant, mais spécifique React/TSX — hors périmètre d'un auditeur multi-stack v1. |
| **Suite-Eye** (`suite-eye/`) | Audit d'une *suite* d'apps — concept MangoOS. Sans objet pour un utilisateur externe. |

### ⚪ ARCHIVE

| Élément | Pourquoi |
|---|---|
| La convention `phase-complete.json` comme **seul** déclencheur | Remplacée par CLI / MCP / watch générique. Le fichier reste **supporté** (rétrocompat MangoOS), il n'est plus la porte d'entrée. |
| `MANGOAI_WORKSPACE` | → `MANGOQA_ROOT`. Symbolique : il ne dépend plus de son parent. |

### 🔵 AJOUTE (le vrai travail)

| # | À construire | Effort estimé |
|---|---|---|
| 1 | **CLI** (`bin/mangoqa.ts`) — parse args, résout le projet, appelle l'orchestrateur | petit |
| 2 | **Collecteur de fichiers générique** — aujourd'hui il lit un delta fourni ; il faut scanner un dossier (respect `.gitignore`, bornes de taille) | petit |
| 3 | **Formateur de rapport** — terminal (couleurs) + HTML autonome | moyen |
| 4 | **Serveur MCP** (`src/mcp/server.ts`) — 4 outils, stdio | moyen |
| 5 | **Branches multi-stack** — généraliser le filtre `.ts/.tsx/.js/.jsx` + grammaires tree-sitter supplémentaires | moyen |
| 6 | **Packaging npm** — retirer `private: true`, `bin`, build, README public | petit |
| 7 | **Mode diff git** — `--since HEAD~1` pour n'auditer que ce qui a changé | petit |

---

## 6. Multi-stack — comment ça s'étend

Une branche fait ~25 lignes. Étendre à un autre langage, c'est **un filtre + un prompt** :

```ts
// src/branches/security.ts — le filtre AUJOURD'HUI
const SENSITIVE_PATH = /(server|api|auth|supabase|\.env|config)/i

// ce qu'il devient : par stack, déclaratif
const STACKS = {
  web:    { ext: ['.ts','.tsx','.js','.jsx','.vue','.svelte'], … },
  python: { ext: ['.py'],  secrets: /os\.environ|boto3|psycopg/, … },
  go:     { ext: ['.go'],  … },
  rust:   { ext: ['.rs'],  … },
}
```

`tree-sitter-wasms` fournit **déjà** les grammaires pré-compilées de la plupart des langages —
aujourd'hui seule TSX est chargée. Passer à Python ou Go = charger un autre `.wasm`.

**Recommandation v1 : web uniquement** (TS/JS/JSX/TSX/Vue/Svelte). C'est le terrain des
générateurs IA, donc du client. Python en v1.1 si la demande vient.

---

## 7. Les invariants — ce qui ne change JAMAIS

Ces cinq règles sont l'identité du produit. Toute évolution qui les viole est refusée, quel que
soit le gain apparent.

1. **Fail-open, toujours.** Une panne de l'auditeur ne bloque jamais le travail de l'utilisateur.
2. **Indépendance.** L'auditeur ne reçoit d'ordres de personne — ni du générateur, ni de l'agent
   qui l'appelle. Un outil MCP qui pourrait dire « ignore ce constat » détruirait le produit.
3. **`$0` par défaut.** Cerveau local Ollama en primaire. L'utilisateur peut auditer 200 fois sans
   regarder un compteur.
4. **Un verdict cite toujours sa source.** Fichier, ligne, règle nommée (OWASP/WCAG), correctif.
5. **`design-system` n'est jamais bloquant.** Le goût conseille, il n'interdit pas. (Règle déjà
   codée — à conserver.)

---

## 8. Le risque à nommer honnêtement

Le `README.md` actuel le dit lui-même :

> *« Reconstruction du 2026-06-19. Le code original n'a pas pu être rapatrié. Cette version est
> reconstruite à partir du contrat d'interface. Fonctionnellement compatible, mais les détails
> internes des branches (prompts, seuils) sont une réimplémentation. »*

**Conséquence pour une sortie publique** : la *qualité de jugement* des 6 branches n'a jamais été
mesurée contre un corpus. On sait que le mécanisme tourne — on ne sait pas **s'il a raison**.

Et l'audit de MangoOS du 2026-07-24 est explicite là-dessus : sur 4 défauts connus rejoués,
**1/4 raté** (le quiz dont toutes les réponses sont « a ») et 3/4 « attrapés avec réserves ».
Conclusion consignée à l'époque : **MangoQA protège solidement le CODE, pas le CONTENU.**

> **C'est le premier chantier, avant toute CLI :** un **corpus d'évaluation** — 20 à 30 projets
> avec des défauts *connus et étiquetés* — et une mesure de taux de détection et de faux positifs,
> branche par branche. Sortir un auditeur dont on ne connaît pas le taux d'erreur serait
> exactement la faute qu'on reproche aux générateurs.

### ⚠️ Correction du 2026-08-04 — le corpus n'existait pas

J'avais écrit ci-dessus que `regression-catalog.ts` (MangoOS) et `FAILLES.md` (MangoQA)
donnaient un point de départ. **Vérification faite, c'est faux et je le corrige :**

- `regression-catalog.ts` — 10 incidents réels, mais ce sont les **bugs internes de MangoOS**
  (divergence de chemins, race au boot, verrou posé avant le travail…). Rien à voir avec des
  défauts dans du **code généré**.
- `FAILLES.md` — 12 entrées, ce sont les **défauts de qualité de MangoQA lui-même** (OOM,
  duplication interne, `catch` muets). Même conclusion.

**Aucun corpus de défauts étiquetés dans du code généré n'existait.** Il a donc été créé de
zéro : `D:\IA\MangoQA\eval\` — 23 cas (19 à défaut · 4 contrôles propres), un harnais qui
rejoue le corpus contre les 6 branches réelles, et un rapport daté. Voir `eval/README.md`.

---

## 9. Plan de sortie — 5 jalons

Chaque jalon a un **critère de réussite mesurable**. On ne passe au suivant que s'il est atteint.

| # | Jalon | Contenu | Critère de réussite |
|---|---|---|---|
| **J0** | **Mesurer avant de vendre** | Corpus de 20-30 projets à défauts étiquetés · mesure par branche | Taux de détection et de faux positifs **connus et écrits**, branche par branche |
| **J1** | **Détacher** | `MANGOQA_ROOT` · collecteur de fichiers générique · orchestrateur appelable sans `phase-complete.json` | `auditProject('./nimporte-quel-dossier')` rend un verdict, sans MangoOS |
| **J2** | **Donner une voix** | Rapport terminal + HTML · `explain` | Un dev qui ne connaît pas Mango comprend un feu rouge **sans poser de question** |
| **J3** | **CLI** | `npx mangoqa` · `--fail-on` · `--since` · hook git | Audit d'un projet tiers réel, de bout en bout, en une commande |
| **J4** | **MCP** | serveur stdio · 4 outils · doc d'installation | Claude Code appelle `audit_project` et **agit** sur le verdict |
| **J5** | **Publier** | npm public · README · site d'une page | 1er utilisateur externe qui n'est pas Raf |

**J0 n'est pas négociable.** C'est le seul jalon qui décide si le produit mérite d'exister.

---

## 10. Ce que ça donne pour MangoOS ensuite

Trois retombées directes sur la refonte v3 :

1. **MangoOS devient un client de MangoQA comme un autre** — via MCP ou CLI. Le couplage résiduel
   (`phase-complete.json`) disparaît naturellement.
2. **La découpe aura été répétée** sur un objet 8 fois plus petit. Les erreurs de méthode seront
   faites ici, pas sur 346 modules.
3. **La promesse « l'atelier qui vérifie son travail » sera prouvée** — parce que le vérificateur
   existera comme produit indépendant, avec des chiffres de détection publics.
