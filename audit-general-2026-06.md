# 🥭 Audit général de MangoOS — rétrospective + empirique

> **Date de l'audit : 2026-06-23** · Période couverte : **2026-06-13 → 2026-06-23** (10 jours)
> Auteur : audit transversal sur `historique.md`, `statut.md`, `fondation.md`, `idee.md`, `wiki/`, et les données réelles
> (`workspace/.metrics.jsonl`, `.mangoqa/`, `server/data/nocturnal.json`, `.axioms*.md`, Blackboard SQLite).
> **Nature : constat + priorisation. Aucun correctif appliqué ici** (les trous deviennent du backlog, §8).
>
> **Légende des statuts** : ✅ Validé (preuve : test / live / chiffre) · 🟡 Partiel · ⚪ Annoncé, non construit · 🔴 Manque / risque.

---

## 1. Résumé exécutif

En **10 jours**, MangoOS est passé d'un **clone local de Lovable** (générer une app React via Claude, `idee.md`) à un
**moteur d'OS IA personnel souverain** : une « coquille » neutre au modèle (skills, mémoire, contrat d'exécution,
audit qualité, interface) pilotée par un **cerveau interchangeable**, avec un **moteur agentique maison** (boucle
lire→agir→vérifier→corriger→déléguer) qui tourne désormais **sans Claude** sur GLM-5.2, Claude restant le filet
d'escalade. La direction est nette et cohérente avec `fondation.md` : **de « générer des apps » vers « posséder un
cerveau qui s'auto-améliore »**.

**Les 5 chiffres-clés (vérité-terrain `.metrics.jsonl`)**

| Indicateur | Valeur réelle |
|---|---|
| Tours exécutés | **1661** |
| Coût tracé total | **182,87 $** |
| Taux de succès | **89,3 %** (178 échecs / 1661) |
| Apps générées (dossiers `workspace/`) | **40**, dont **23 avec build** (58 %) |
| Gradient de réutilisation prouvé (RUN 2026-06-20) | **0 % → 67 %** |

**Verdict en un paragraphe.** Le **cœur custom est réel et prouvé** (contrat d'exécution, mémoire/curation, MangoQA,
Kernel, moteur agentique A→E, multi-cerveaux mesuré) — c'est solide, testé unitairement et validé en live. Mais
**trois écarts honnêtes** tempèrent le récit : (1) la **souveraineté est récente** — sur l'ensemble de l'historique,
**Claude (« maître ») a résolu 1182 tours contre 134 pour l'Élève seul** ; le « $0 souverain » est prouvé en labo, pas
encore dans la masse ; (2) plusieurs **piliers de la vision restent à l'état d'annonce** (A2A, Mango Image/Music/Office,
vault-projet, fine-tuning) ; (3) le **coût cloud de l'Élève GLM est mal tracé**, ce qui rend les économies affichées
partiellement illusoires. MangoOS a **dépassé son idée fondatrice** et tient l'essentiel de ses promesses d'architecture
— il lui reste à **convertir les promesses de périphérie en réalisations** et à **rendre sa souveraineté majoritaire,
pas seulement démontrable**.

---

## 2. Trajectoire d'évolution — l'arc en 10 jours

| Date | Jalon / Phase | Ce qui bascule | Direction prise |
|---|---|---|---|
| 06-12→13 | **Idée fondatrice + Jalons A-D** | Clone Lovable (React/Vite via Claude SDK) → Coque **Souple** (prompt par blocs) + **Contrat `<mangoos>`** (propose→valide→exécute) + branchement **Élève** | Poser une coquille neutre au modèle |
| 06-14→15 | **Mémoire & autonomie** | Boucle **nocturne** #32, **backend généré** #35, **biblio composants** #36, **multi-projets** #26, **RLHF 👍/👎** #41, métriques #14/#21 | L'OS apprend et compose, pas juste génère |
| 06-16 | **Atelier intensif (20 entrées)** | **Conseil d'experts** #44, **contrat de langage** #45, **cadrage multimodal** #47, **Élève local Gemma** #54, indépendance LLM #57, tutoriel orchestral #56 | Cadrage + souveraineté naissante |
| 06-17→18 | **Expertise + multi-user** | Patrouille #73, super-skills #74, mémoire procédurale #75, auto-réécriture prompt #76, **couche universelle** #100 + **onboarding** #101 | L'OS se personnalise et se généralise |
| 06-19 | **Kernel #108** | 5 piliers (Brain, Bus, Blackboard, MCP, Tracing) ; chat branché sur Bus + Tracer #112 ; **Disjoncteur** #110 | Standards à la périphérie, système nerveux |
| **06-20** | **RUN DE VALIDATION** | 3 apps réelles (Svelte/Vue/React) MVP→Élite, **MangoQA actif**, **gradient réutilisation 0→67 %**, 5 bugs d'intégration trouvés | Preuve end-to-end sur du réel |
| 06-21 | **Bureau OS #136 + dette #140 + Composer #138/#139** | Fenêtres superposables, refonte nav P0-P4, tree-sitter flux, suite d'apps + gros projet, **Command Center** #144 | L'OS devient un environnement, pas un chat |
| **06-22** | **Bascule GLM cloud + Moteur agentique A→D** | Élève = **GLM-5.2 cloud** ; **outils d'action** (A), **runtime maison `buildAgentic`** (B), **bifurcation `runRelay`** (C), **délégation/sous-agents** (D) | **Mango possède son moteur** |
| **06-23** | **#148 Examen cerveau + Phase E multi-cerveaux** | Scan 6 sondes → verdict de placement ; **registre `.brains` mesuré** + routage intention→cerveau + transport Ollama local | **Le bon cerveau par tâche, mesuré et souverain** |

**Sens de l'évolution :** un mouvement constant de l'**extérieur vers l'intérieur** — d'abord emprunter le cerveau de
Claude, puis reconstruire pièce par pièce tout ce qui l'entoure (coquille), puis **reconstruire le moteur lui-même** et
**rendre le cerveau interchangeable et mesuré**. C'est exactement la thèse de `fondation.md` : *« le LLM est le
processeur, MangoOS est l'OS »*.

---

## 3. Vision fondatrice vs livré — a-t-il tenu ses promesses ?

### 3a. Les 5 principes non-négociables

| Principe (`fondation.md`) | État réel | Statut | Écart / verdict |
|---|---|---|---|
| **Local-first** (rien ne sort sans permission) | Code sur disque, apps locales ; mais l'Élève est **GLM cloud** (Ollama Turbo) depuis le 22/06 | 🟡 | Tension assumée : souveraineté de *contrôle* oui, mais le cerveau actif est **hébergé**. Le repli **Ollama local** existe (transport E4) mais n'est pas le défaut. |
| **LLM-agnostique** (changer de cerveau en 1 ligne) | `MangosBrain` + `llm-engine` (7 providers) + `resolveBinding` par intention | ✅ | Tenu, et **dépassé** : non seulement agnostique mais **mesuré** (#148) et **routé par intention** (#135). |
| **Standards à la périphérie** (MCP, A2A, OTel) | MCP ✅, OpenTelemetry ✅ (traces), **A2A ❌** | 🟡 | 2/3. A2A annoncé mais **non implémenté** — la délégation passe par `delegate` maison, pas par Agent Cards A2A. |
| **Auto-apprenant nocturne** (Élève $0 + escalade) | `train-loop.ts` / `nocturnal.ts`, 23 runs nocturnes, axiomes appris | ✅ | Tenu (23 entrées `nocturnal.json`, 69 axiomes). |
| **Extensible par agents** (chaque capacité = driver) | Agents spécialisés #145 (UX/Layout/PDF), `ModelProfile` par famille | ✅ | Tenu pour les agents construits ; l'**Agent Factory** annoncée reste partielle. |

### 3b. Les 5 standards Kernel (le tri « retenu vs custom rejeté »)

| Besoin | Standard retenu | État | Statut |
|---|---|---|---|
| Abstraction LLM | LiteLLM | `llm-engine` multi-provider opérationnel | ✅ |
| Outils & contexte | MCP | `kernel-mcp.ts` (test 23/23), registre → MCP **et** OpenAI | ✅ |
| Communication agents | **A2A** | Bus d'événements interne ✅ mais **A2A/Agent Cards inter-process ❌** | 🔴 |
| Mémoire / état | SQLite-vec + mutex | Blackboard `blackboard.sqlite` persistant (WAL 1,8 Mo) | ✅ |
| Observabilité | OpenTelemetry | `kernel-trace.ts`, `/api/traces` — **mais spans non persistés** | 🟡 |

### 3c. Les 8 magasins cross-projets (incohérence interne repérée)

`fondation.md` annonce **8 magasins** ; la couche wiki (`memoire-expertise.md`) n'en synthétise que **4**.

| Magasin | Code présent ? | Synthétisé wiki ? | Statut |
|---|---|---|---|
| Axiomes | ✅ (`.axioms.md`, 69) | ✅ | ✅ |
| Skills | ✅ (`skills.ts`) | ✅ | ✅ |
| Profil utilisateur | ✅ (`.user-profile.md`) | ✅ | ✅ |
| Mémoire projet | ✅ | ✅ | ✅ |
| Références | ✅ (banque de références #50) | ❌ | 🟡 non relié |
| Lexique | ✅ (`lexique.ts` #45) | ❌ | 🟡 non relié |
| Procédures | ✅ (`reverse-learn.ts` #75) | ❌ | 🟡 non relié |
| Moodboard / Super-agents | ✅ (`MOODBOARD_RULES`, `super-agent-builder.ts`) | ❌ | 🟡 non relié |

**Verdict :** les 8 existent **en code**, mais la **carte de synthèse en cache 4** → la mémoire de MangoOS sur
lui-même sous-représente sa propre richesse. À corriger côté wiki (backlog §8).

### 3d. Les 6 agents experts annoncés

| Agent expert | État | Statut |
|---|---|---|
| App Builder | Cœur historique, **mais sans page-entité propre** (diffus) | ✅ (capacité) / 🟡 (carte) |
| Vision (Sharingan) | Clone/scrape web, clic→source, PDF-Vision #147 | ✅ |
| Mango Design | Œil Design + axiomes UI + moodboard | ✅ |
| Mango Image (FLUX) | Placeholder, requiert `REPLICATE_API_TOKEN` | ⚪ |
| Mango Music (AudioCraft) | Placeholder | ⚪ |
| Mango Office (docs/slides→PDF/DOCX) | **Aucune trace** (l'agent PDF #145 lit, ne produit pas) | ⚪ |

---

## 4. Capacités par domaine — Validé / Manque

### 4a. Génération d'apps

| Capacité | Statut | Preuve | Manque / limite |
|---|---|---|---|
| Coque souple (prompt par blocs/scénario, modes MVP/Élite/Finition/Esthétique) | ✅ | 1429 MVP + 110 Élite + 58 Finition + 33 Esthétique tracés | — |
| Contrat rigide `<mangoos>` + executor + inspection | ✅ | `executor.ts`/`inspection.ts`, builds verts | Backend `api/` validé tardivement (corrigé 06-20) |
| Backend généré (#35) | ✅ | MangoPulse Express/SQLite | Validation statique backend partielle |
| Déploiement (#16 GitHub, #17 Supabase, #18 Vercel/Netlify/CF) | 🟡 | GitHub+Supabase **live e2e** ; deploy CLI testé 14/14 | Déploiement étendu **e2e à reconfirmer** |
| Multi-stack (Svelte/Vue/React) | ✅ | RUN 3 familles, builds 2,7-4,5 s | — |

### 4b. Cerveau & souveraineté

| Capacité | Statut | Preuve | Manque / limite |
|---|---|---|---|
| Élève (relais avant escalade) | ✅ | bascule Gemma→GLM-5.2 ; `resolveProfile` | — |
| Moteur agentique maison A→D (action, runtime, bifurcation, délégation) | ✅ | `test-eleve-runtime` 29 ; **live : 3 itér., finish propre, $0** | Compaction/review/Lab/web-search encore sur `query()` Claude |
| Multi-cerveaux par intention (Phase E) | ✅ | brains 30 · brain-runtime 21 · ollama-tools 10 ; panneau live | **Validation locale réelle (Ollama tool-capable) encore 🔴** |
| Examen d'entrée du cerveau (#148) | ✅ | `test-model-scan` 13 ; GLM scanné 6/6 → agentic | — |
| Escalade Claude (filet) | ✅ | `escalateToClaude`, coût SDK extrait | **C'est encore le résolveur majoritaire** (maître 1182 vs élève 134) |

### 4c. MangoQA → **section dédiée §5**

### 4d. Kernel & infra (5 piliers)

| Pilier | Statut | Preuve | Manque |
|---|---|---|---|
| Brain Adapter (LiteLLM) | ✅ | 7 providers, bascule `BRAIN_PROVIDER` | — |
| Bus d'événements | ✅ | chat branché #112, `bus-events.jsonl` | A2A inter-process ❌ |
| Blackboard (SQLite-vec) | ✅ | 9 palettes cross-projet, WAL 1,8 Mo | Pas de compteur d'accès/réutilisation |
| MCP | ✅ | `test-kernel-mcp` 23/23 | — |
| Tracing OTel | 🟡 | `/api/traces` live | **Spans non persistés** (éphémères) |

### 4e. Mémoire & curation

| Capacité | Statut | Preuve | Manque |
|---|---|---|---|
| Axiomes / RLHF (#10/#41) | ✅ | **69 axiomes** (`.axioms.md` 383 l. + universal 8 + gemma 19 + qwen 95) | Pas de timestamp par axiome (croissance non datée) |
| Biblio composants (#36) | 🟡 | `.components/` = **2 entrées** | Faible volume curé |
| Boucle de curation (réutilisation) | ✅ | **gradient 0→33→50→60→67 %** (RUN), réutilisation cross-stack | Effet coût directionnel (`sampleSufficient:false`) |
| Blackboard persistant | ✅ | SQLite + sqlite-vec | Opacité (pas de query count) |

### 4f. Vision

| Capacité | Statut | Preuve | Manque |
|---|---|---|---|
| Entrées visuelles (clone/scrape, image jointe) | ✅ | landing reproduite e2e | — |
| Clic→source / édition chirurgicale (#27/#6) | ✅ | overlay inspect natif | — |
| PDF-Vision (#147, rendu page→PNG + crop + images) | ✅ | `test-pdf-render` 17/17 ; live | OCR scanné #36 ⚪ ; outil vision **pas encore dans la boucle agentique** |

### 4g. Bureau OS / UX / Flux

| Capacité | Statut | Preuve | Manque |
|---|---|---|---|
| Bureau iconique + fenêtres (#136) | ✅ | phase-2-finition livrée | — |
| Refonte nav P0→P4 + contrat de flux | ✅ | Auditeur de Flux re-passé (1 suspect) | — |
| Dette technique (#140, 4 points) | ✅ | tree-sitter flux 33/33, tests UI 34/34, nav typée 15/15 | Affinage tests UI continu |

### 4h. Composer la production

| Capacité | Statut | Preuve | Manque |
|---|---|---|---|
| Suite d'apps composables (#138) | ✅ | 2 spines prouvées e2e | — |
| Gros projet unique (#139, socle+Kanban) | 🟡 | Command Center #144 livré (prototype) | **Pré-requis gros projet partiels** ; cartographie/vault non construits |
| Vault-projet auto-cartographié (#141) | ⚪ | concept validé | **Non construit** |

---

## 5. MangoQA en profondeur (le système de sécurité de l'OS)

MangoQA = l'**audit fantôme** de MangoOS, *« rigide sur l'objectif, souple sur le subjectif »*. **5 dimensions**, toutes
ayant parlé sur du réel pendant le RUN du 06-20.

| # | Dimension | Rôle | Attrapé sur du réel | Limite mesurée |
|---|---|---|---|---|
| ① | **Disjoncteur** (déterministe, 0 LLM) | Coupe avant dérive (coût, durée, tours) | **5 trips réels** : cost-guard **12,65 $ > 5 $** → bascule locale ; agent-killswitch (kernel **787 s** > 600 s, ×4 ; mangopulse 43 tours > 40) | Seuils fixes (pas adaptatifs) |
| ② | **Observateur** (6 branches, conseil) | Améliore MangoOS, propose à Raf | Verdicts 🔴 : `architecture` **FAIL ×3** (data-fetching non extrait), test mal placé, import mort, libellés nav en `<p>` | **Branche architecture peut-être trop stricte** (rouge sur les 3 Élite) |
| ③ | **Œil Design** (souple, jamais bloquant) | Mesure la cohérence visuelle | styled-components : 2 écarts couleur + 1 question de convergence | **`measured:0` sur UnoCSS (atomic) ET CSS-vars** → couverture nulle sur ~60 % des apps |
| ④ | **Auditeur de Flux** (#137, tree-sitter) | Routes mortes, cohérence de nav | Cockpit MangoOS : 9 suspects → 1 ; résolution de constantes `WINDOWS.*` | Tier 1 LLM cost-aware (gaté) |
| ⑤ | **Auditeur de Suite** (#138) | Cohérence cross-app de la suite | `suite-observations.json` produit | Récent, peu de recul |

**Verdict MangoQA :** **le filet fonctionne et il est honnête** — il a tripé pour de vrai (le test du filet = sa
réussite) et a sorti des verdicts rouges sur du code réellement imparfait, sans complaisance. Ses **deux limites
mesurées** sont nettes : la **couverture de l'Œil dépend du style** (aveugle à l'atomic/CSS-vars), et la **branche
architecture est peut-être sur-stricte**. Ce sont des réglages, pas des défauts de conception.

---

## 6. Audit empirique — la donnée parle (vérité-terrain `.metrics.jsonl`)

### 6a. Vue d'ensemble (1661 tours, 13→22 juin)

| KPI | Valeur | Source |
|---|---|---|
| Tours | 1661 | `.metrics.jsonl` |
| Coût tracé | **182,87 $** | somme `costUsd` |
| Échecs | 178 (**10,7 %**) | `error:true` |
| Durée moyenne | **86,9 s / tour** | `durationMs` |

### 6b. Coût & volume par modèle (corrige le récit « Élève $0 »)

| Modèle | Tours | Coût | Lecture |
|---|---|---|---|
| **eleve** (GLM/Gemma) | 1421 (86 %) | **30,64 $** | **Pas $0** : inclut les coûts d'escalade attribués au tour routé Élève |
| **sonnet** (escalade) | 209 | **135,16 $** | Le **vrai centre de coût** (74 %) |
| **opus** | 9 | 13,97 $ | Rare, cher |
| **haiku** | 22 | 3,10 $ | Marginal |

### 6c. Qui résout réellement ? (l'angle souveraineté)

| `resolvedBy` | Tours | Lecture |
|---|---|---|
| **maitre** (Claude) | **1182** | **Claude porte la majorité des résolutions sur tout l'historique** |
| eleve (seul) | 134 | La souveraineté « $0 » est **prouvée mais minoritaire** (surtout récente) |
| none / absent | 105 / 240 | Tours conversationnels / champ non écrit (sémantique évolutive) |

> **Constat central :** la souveraineté est **démontrée en labo** (tests live récents : finish propre, $0, zéro
> escalade) mais **pas encore majoritaire dans la masse** — l'essentiel des 10 jours a tourné avec Claude au résultat.
> L'évolution est réelle ; la bascule quantitative reste **devant** MangoOS.

### 6d. Le RUN de validation (2026-06-20)

| App | Stack | MVP | Élite | Build | Coût |
|---|---|---|---|---|---|
| MangoBoard | Svelte+Vite·UnoCSS·Dexie | ✅ | ✅ | ✅ 3,59 s | 3,31 $ |
| MangoNotes | Vue 3·CSS-vars·Pinia | ✅ | ✅ | ✅ 2,68 s | 3,25 $ |
| MangoPulse | React·styled-comp·Express/SQLite | ✅ | ✅ | ✅ 4,53 s | 2,68 $ |

**Gradient de réutilisation : 0 → 33 → 50 → 60 → 67 %** (palette Svelte réutilisée par Vue puis React). Effet coût
directionnel : tours **avec** réutilisation 1,48 $ vs **sans** 1,65 $ (**−10 %**, honnête : `sampleSufficient:false`).

### 6e. Production réelle

| Indicateur | Valeur |
|---|---|
| Apps (`workspace/`) | **40** |
| Avec build (`dist/`/`build/`) | **23 (58 %)** |
| Runs nocturnes (`nocturnal.json`) | **23** |
| Axiomes appris | **69** |

### 6f. ⚠️ Encart honnêteté — ce que la donnée NE peut PAS dire

1. **Coût cloud GLM mal tracé** : `askEleveOpenAI()` (`eleve.ts` ~l.365) n'extrait pas le coût du payload openai-compat.
   L'Élève étant **GLM-5.2 cloud depuis le 22/06**, une partie des tours « Élève » a **réellement coûté** sur Ollama
   Cloud sans être comptée → le **182,87 $ sous-estime la dépense réelle**.
2. **Spans OTel non persistés** : impossible de rejouer une session ou d'auditer les itérations a posteriori.
3. **Pas de coût intra-tour** : une tentative Élève (gratuite) suivie d'une escalade (payante) sont fondues dans le même tour.
4. **Échantillon curation insuffisant** : l'effet coût de la réutilisation est directionnel, pas significatif.
5. **Croissance des axiomes non datée** : on ignore *quand* chaque axiome est entré.
6. **Réconciliation mineure** : les compteurs `resolvedBy` mêlent des sémantiques écrites à des dates différentes — à lire comme tendance, pas au tour près.

---

## 7. Dette technique & limites connues

| Sujet | Statut | Détail |
|---|---|---|
| Dette #140 (4 points) | ✅ renforcé | god-component, nav typée, regex→tree-sitter, harnais tests UI — tous traités |
| Portages hors `query()` Claude | 🔴 | compaction, review, Lab, recherche-web encore sur le SDK Anthropic |
| Validation locale réelle du moteur souverain | 🔴 | transport Ollama prêt, **pas encore éprouvé sur un vrai modèle local tool-capable** |
| A2A | 🔴 | pilier Kernel annoncé, non implémenté |
| Suivi de coût cloud (#134) | 🔴 | le centre de gravité financier (GLM cloud) est aveugle |
| Couverture Œil Design | 🟡 | aveugle atomic/CSS-vars |
| Spans OTel persistés | 🟡 | observabilité incomplète |

---

## 8. Ce qui manque encore — backlog priorisé

> Colonnes **Modèle optimal** + **Effort** conformes à la règle globale (référentiel : ⚡ Haiku · ⚖️ Sonnet · 🧠 Opus ;
> XS→XL).

| # | Chantier | Priorité | Modèle optimal | Effort |
|---|---|---|---|---|
| A | **Tracer le coût cloud GLM** (#134) — extraire tokens+pricing dans `askEleveOpenAI`, persister par tour | 🔴 Haute | ⚖️ Sonnet 4.6 | S |
| B | **Valider le moteur souverain en LOCAL réel** (Ollama tool-capable : Qwen-Coder/GLM quantisé) | 🔴 Haute | 🧠 Opus 4.8 | M |
| C | **Persister les spans OTel** (export `.jsonl` rejouable) | 🟠 Moyenne | ⚖️ Sonnet 4.6 | S |
| D | **Relier les 4 magasins manquants au wiki** (Références/Lexique/Procédures/Moodboard) + page **App Builder** | 🟠 Moyenne | ⚡ Haiku 4.5 | XS |
| E | **Porter compaction/review/Lab/web-search hors `query()`** (souveraineté complète de la boucle) | 🟠 Moyenne | 🧠 Opus 4.8 | L |
| F | **A2A** (Agent Cards inter-process) — combler le 3ᵉ standard Kernel | 🟡 Basse | 🧠 Opus 4.8 | L |
| G | **Œil Design : couvrir atomic/CSS-vars** (résolution runtime) | 🟡 Basse | ⚖️ Sonnet 4.6 | M |
| H | **Cartographie-projet + vault** (#139-P2 / #141) — photogrammétrie→indexation | 🟡 Basse | 🧠 Opus 4.8 | XL |
| I | **Agents Image (FLUX) / Music / Office** — sortir des placeholders | 💤 Diff. | ⚖️ Sonnet 4.6 | L |
| J | **Fine-tuning LoRA de l'Élève** (#55) | 💤 Diff. | 🧠 Opus 4.8 | XL |
| K | **Audit de coûts d'origine** (#13 : dégraissage prompt ~33k, thinking par classe de tâche) | 🟠 Moyenne | 🧠 Opus 4.8 | M |

---

## 9. Verdict & sens de l'évolution

**La direction.** MangoOS s'est déplacé de **« générer des apps avec le cerveau de Claude »** vers **« posséder un
cerveau souverain, mesuré, qui s'auto-améliore et s'audite lui-même »**. Chaque jour a poussé l'intelligence un cran
plus à l'intérieur du système : coquille → mémoire → audit → Kernel → **moteur** → **multi-cerveaux**. C'est rare et
cohérent — l'architecture promise dans `fondation.md` est, pour son **cœur custom**, **réellement construite et prouvée**.

**Le momentum.** En 10 jours : 85 idées, 4 jalons + 5 phases moteur, un RUN de validation honnête, 40 apps, un système
de sécurité (MangoQA) qui a vraiment tripé. La vélocité est exceptionnelle et la **discipline de preuve** (tests verts
cités, live vérifié) tient.

**Les 3 risques majeurs.**
1. **Souveraineté encore minoritaire** — Claude résout 1182 tours contre 134 pour l'Élève seul. Le « $0 » est un cap
   atteint en labo, pas encore le régime normal.
2. **Cécité financière** — le coût du cerveau cloud actif (GLM) n'est pas tracé : les économies affichées sont
   partiellement illusoires (chantier A, prioritaire).
3. **Dette de promesses de périphérie** — A2A, agents Image/Music/Office, vault, fine-tuning restent annoncés ; l'écart
   intention↔réalité se concentre là.

**Les 3 prochains paliers logiques.**
1. **Rendre la souveraineté majoritaire** : valider le moteur en local réel (B) + tracer le coût (A) → mesurer la vraie
   bascule Élève vs Claude.
2. **Compléter la boucle souveraine** : porter compaction/review hors `query()` (E).
3. **Tenir les promesses de carte** : relier les 8 magasins, créer la page App Builder, statuer les agents experts (D).

> **MangoOS n'a pas seulement évolué — il a changé de catégorie.** D'un clone d'app-builder, il est devenu le **brouillon
> fonctionnel d'un OS IA personnel souverain**. Le cœur tient ses promesses ; il lui reste à **rendre réel ce qui est
> encore annoncé**, et **majoritaire ce qui est encore démontré**.

---

*Audit produit le 2026-06-23. Sources brutes : `historique.md`, `statut.md`, `fondation.md`, `idee.md`, `wiki/`,
`workspace/.metrics.jsonl` (1661 tours), `workspace/.mangoqa/`, `server/data/nocturnal.json`, `.axioms*.md`, Blackboard
SQLite. Chiffres recalculés directement depuis le JSONL. Aucun code modifié. Zéro git.*
