# MANGOOS — DOCUMENT FONDATEUR
## La base décisive des 10 prochaines années

> Document de référence absolue pour toute décision d'architecture de MangoOS.
> À lire au démarrage de chaque session, au même titre que `statut.md` et `memory.md`.
> Rédigé le 2026-06-19 · Révisé le 2026-07-03 (v2 : vérité RÉEL/PARTIEL/ASPIRATIONNEL).
>
> **Comment lire ce document (v2).** Il porte deux couches, jamais confondues :
> la **VISION** (la cible des 10 ans — mobilisatrice, intacte depuis 2026-06-19) et
> la **VÉRITÉ 2026-07** (l'état réel du code, établi par trois audits fiables). Partout où
> une technologie est nommée, un marqueur tranche : **RÉEL** (implémenté et branché),
> **PARTIEL** (le modèle est adopté mais le cœur reste maison), **ASPIRATIONNEL** (cible
> datée, pas encore une ligne de code). Un rêve nommé comme un acquis est une dette :
> la v2 existe pour ne plus jamais confondre le rêve et le réel — sans rien retirer au rêve.

---

# I. RÉSUMÉ DU PROJET

**MangoOS est un Système d'Exploitation IA Personnel — le premier du genre.**

Pas un outil. Pas un assistant. Un OS.

Comme Windows a rendu l'ordinateur accessible et puissant pour chaque individu,
MangoOS rend l'intelligence artificielle **accessible, persistante et personnelle**
pour une seule personne : son propriétaire.

```
Le LLM est le processeur.
MangoOS est le système d'exploitation.
Les agents spécialisés sont les applications.
Les skills sont les drivers.
MangoQA est le système de sécurité.
L'utilisateur (Raf) est le seul administrateur.
```

**Le problème résolu.**
Les LLMs sont des génies amnésiques. Ils raisonnent mieux qu'un humain sur des milliers
de sujets, mais à la session suivante ils ont tout oublié. Ils ne te connaissent pas.
Chaque outil SaaS est générique — fait pour 100 000 utilisateurs, pas pour toi.
Chaque abonnement cloud crée une dépendance de prix, de données, de survie de l'entreprise.
MangoOS est la couche qui donne au LLM une vie persistante, personnalisée et souveraine.

**Les 5 piliers identitaires.**
- **Local-first** → les données ne quittent jamais la machine
- **LLM-agnostique** → change de cerveau sans changer le système
- **Auto-apprenant** → grandit chaque nuit sans intervention ni coût
- **Extensible** → chaque nouvelle capacité = un nouvel agent/driver
- **Souverain** → aucune dépendance à un abonnement, un cloud, un fournisseur

**Le modèle mental — une entreprise d'une personne.**
```
Raf            → Patron (vision, décision, validation finale)
LLM            → Directeur adjoint (cerveau, raisonnement)
MangoOS        → Chef de projet (orchestration, mémoire, contrat)
Agents         → Experts spécialisés (App Builder, Design, Vision, Image...)
Skills         → Agents juniors (compétences atomiques)
MangoQA        → Le gardien indépendant (sécurité + audit + qualité)
```

---

# II. SCHÉMA D'ENSEMBLE

```
╔══════════════════════════════════════════════════════════════╗
║                        RAF  (Patron)                         ║
║            Vision · Décisions · Validation finale            ║
╚════════════════════════════╤═════════════════════════════════╝
                             │
   ╔═════════════════════════▼══════════════════════════════════╗
   ║                    MANGO OS — Chef de projet                ║
   ║                                                             ║
   ║  ┌───────────────────────────────────────────────────────┐ ║
   ║  │                     KERNEL                            │ ║
   ║  │   (standards industriels à la périphérie)             │ ║
   ║  │                                                       │ ║
   ║  │  ┌─────────────┐         ┌─────────────────────────┐  │ ║
   ║  │  │   LiteLLM   │         │          MCP            │  │ ║
   ║  │  │Brain Adapter│         │  (outils & contexte —   │  │ ║
   ║  │  │100+ providers│        │   standard Anthropic)   │  │ ║
   ║  │  │Claude·Qwen· │         └─────────────────────────┘  │ ║
   ║  │  │DeepSeek·Gemma│                                      │ ║
   ║  │  │fallback auto│         ┌─────────────────────────┐  │ ║
   ║  │  └─────────────┘         │          A2A            │  │ ║
   ║  │                          │  (Agent2Agent — Google) │  │ ║
   ║  │  ┌─────────────┐         │  communication agents   │  │ ║
   ║  │  │ SQLite-vec  │         └─────────────────────────┘  │ ║
   ║  │  │ Blackboard  │                                      │ ║
   ║  │  │ sémantique  │         ┌─────────────────────────┐  │ ║
   ║  │  │ + mutex     │         │     OpenTelemetry       │  │ ║
   ║  │  └─────────────┘         │  traçabilité totale —   │  │ ║
   ║  │                          │  MangoQA lit les traces │  │ ║
   ║  │                          └─────────────────────────┘  │ ║
   ║  └───────────────────────────────────────────────────────┘ ║
   ║                                                             ║
   ║  ┌───────────────────────────────────────────────────────┐ ║
   ║  │                   MANGO CORE                          │ ║
   ║  │  Conversation loop · Contrat (coque rigide <mangoos>) │ ║
   ║  │  Scénario/prompt modulaire · Injection mémoire        │ ║
   ║  │  Orchestrateur (dispatcher) · Executor · Escalade LLM │ ║
   ║  └───────────────────────────────────────────────────────┘ ║
   ║                                                             ║
   ║  ┌───────────────────────────────────────────────────────┐ ║
   ║  │              8 MAGASINS CROSS-PROJETS                  │ ║
   ║  │  Axiomes · Skills · Préférences · Références           │ ║
   ║  │  Lexique · Procédures · Moodboard · Super-agents       │ ║
   ║  │  (distinction : axiomes globaux vs axiomes de domaine) │ ║
   ║  └───────────────────────────────────────────────────────┘ ║
   ║                                                             ║
   ║  ┌───────────────────────────────────────────────────────┐ ║
   ║  │                  AGENT FACTORY                        │ ║
   ║  │  (section séparée de App Builder)                     │ ║
   ║  │  Crée · Configure · Versionne · Enregistre les agents │ ║
   ║  │  Chaque agent : AGENT.md + SKILL.md + brain injecté   │ ║
   ║  └───────────────────────────────────────────────────────┘ ║
   ╚═══════════════╤═════════════════════════════════╤═══════════╝
                   │ A2A dispatch                    │ résultats
   ┌───────────────┴──── AGENTS EXPERTS ─────────────┴───────────┐
   │                                                             │
   │  ┌───────────┐  ┌────────────┐  ┌────────────────────────┐  │
   │  │App Builder│  │   Vision   │  │      Mango Design      │  │
   │  │apps React │  │  Sharingan │  │  UI · tokens · charte   │  │
   │  │+ Vite     │  │ Playwright │  │  (vérifié WCAG)         │  │
   │  └───────────┘  │ + canvas   │  └────────────────────────┘  │
   │                 └────────────┘                              │
   │  ┌───────────┐  ┌────────────┐  ┌────────────────────────┐  │
   │  │Mango Image│  │ Mango Music│  │      Mango Office      │  │
   │  │FLUX local │  │ AudioCraft │  │  docs · slides ·        │  │
   │  │diffusion  │  │ / API audio│  │  tableurs → PDF/DOCX     │  │
   │  └───────────┘  └────────────┘  └────────────────────────┘  │
   │                                                             │
   │     Chaque agent EXPERT possède ses SKILLS (juniors) :      │
   │  ┌───────────────────────────────────────────────────────┐ │
   │  │ skill-extract · skill-generate · skill-fix · skill-... │ │
   │  └───────────────────────────────────────────────────────┘ │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │              BOUCLE NOCTURNE (auto-apprentissage)            │
   │  Élève Gemma 4.12B local ($0) · Escalade Claude plafonnée   │
   │  TrainAgent · AuditAgent · ReviewAgent (curation 3 magasins) │
   │  Tourne 24/7 sans coût marginal sur hardware local           │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ (observe tout via OpenTelemetry)
   ┌──────────────────────────────▼──────────────────────────────┐
   │                      MANGO QA  👻                            │
   │              Fantôme indépendant — 3 visages                │
   │  ① Disjoncteur (sécurité, dur, déterministe, zéro LLM)      │
   │  ② Observateur-Conseil (améliore MangoOS, propose à Raf)    │
   │  ③ Œil Design (souple, jamais bloquant, converge avec Raf)  │
   │  Ne reçoit d'ordres de personne · N'alerte que Raf          │
   └─────────────────────────────────────────────────────────────┘

                    EXTENSION FUTURE (3-10 ans)
   ┌─────────────────────────────────────────────────────────────┐
   │  📱 Mobile node   🤖 Robot node (ROS)   🖥️ Multi-PC         │
   │  Même OS · Même mémoire · Même personnalité · Cerveau local  │
   │  MangoOS = couche cognitive · ROS = bas niveau du robot      │
   └─────────────────────────────────────────────────────────────┘
```

> **Lecture de vérité du schéma (2026-07) — le KERNEL dessine la CIBLE, pas l'acquis.**
> Les blocs du kernel portent des noms de standards ; leur état réel diffère. À garder en tête
> en relisant le dessin ci-dessus :
> - **LiteLLM** (bloc « Brain Adapter, 100+ providers ») → **ASPIRATIONNEL**. Aucune lib
>   litellm. Le vrai routeur est **custom** (`llm-engine.ts` + `kernel.ts`), multi-provider
>   maison ; « litellm » n'y est qu'**un** endpoint parmi 7 (claude, ollama, openai-compat,
>   deepseek, mistral, groq, litellm-as-endpoint), pas la brique.
> - **MCP** → **PARTIEL**. Vrai serveur MCP in-process côté cerveau Claude (vision) ; mais les
>   outils de l'Élève passent par un **registre custom** (`ToolRegistry`, function-calling
>   OpenAI-compat). Loader MCP externe codé mais **gaté OFF**.
> - **A2A (Agent2Agent)** → **ASPIRATIONNEL**. Zéro implémentation. La communication inter-agents
>   (le « A2A dispatch » du schéma) est **100% custom in-process** (`delegate`,
>   `consultSpecialist`, Event Bus maison).
> - **OpenTelemetry** → **PARTIEL**. Le **format** OTel est adopté (traceId/spanId/attributes)
>   mais le traceur est **maison** — pas le SDK `@opentelemetry`, pas de collector OTLP
>   (choix assumé local-first).
> - **SQLite-vec / Blackboard** → **PARTIEL**. SQLite persistant **réel** (`node:sqlite`, WAL) ;
>   mais la recherche est un **cosinus brute-force JS**, l'extension vectorielle ANN n'est
>   **pas branchée** (embeddings stockés en colonne TEXT JSON). Embeddings texte = `nomic-embed-text`
>   **local via Ollama** (réel).
>
> Le détail chiffré et la règle qui en découle sont en section III et section VIII.

---

# III. LES TECHNOLOGIES — LE TRI DÉCISIF

Principe directeur : **standards industriels à la périphérie, custom au cœur.**
On ne réinvente jamais ce qui existe en standard mature. On garde custom uniquement
ce qui est notre différenciateur irremplaçable.

Le tableau ci-dessous décrit la **CIBLE** (colonne « Choix RETENU »), puis la **VÉRITÉ 2026-07**
(colonne « ÉTAT RÉEL ») établie par trois audits du code. Les deux ne coïncident pas encore —
c'est normal et assumé : la fondation trace où l'on va, pas seulement où l'on est.

| Besoin | Choix RETENU (cible 2026) | **ÉTAT RÉEL 2026-07** | Rejeté (obsolète) | Pourquoi (la cible) |
|--------|---------------------|----------------------|-------------------|----------|
| Abstraction LLM | **LiteLLM** | 🔴 **ASPIRATIONNEL** — aucune dép. litellm ; routeur multi-provider **custom** (`llm-engine.ts`+`kernel.ts`), 7 providers dont « litellm » comme simple endpoint | Brain Adapter custom | 100+ providers, fallback auto, nouveau modèle supporté en 48h |
| Outils & contexte | **MCP** (Anthropic) | 🟡 **PARTIEL** — serveur MCP in-process réel côté cerveau Claude (vision) ; outils de l'Élève via **registre custom** (`ToolRegistry`, function-calling OpenAI-compat) ; loader MCP externe gaté **OFF** | Envelope v1 custom | Standard "USB-C des agents", centaines d'outils déjà compatibles |
| Communication agents | **A2A** (Google) | 🔴 **ASPIRATIONNEL** — zéro impl. ; inter-agents **100% custom in-process** (`delegate`, `consultSpecialist`, Event Bus maison) | Event Bus custom | Interopérable avec agents externes, Agent Cards |
| Mémoire/état partagé | **SQLite-vec + mutex** | 🟡 **PARTIEL** — SQLite persistant réel (`node:sqlite`, WAL) ; recherche = **cosinus brute-force JS**, ANN non branchée (embeddings en colonne TEXT JSON) ; embeddings `nomic-embed-text` **local** (réel) | Fichiers JSON bruts | Recherche sémantique en ms, indispensable à l'échelle |
| Observabilité | **OpenTelemetry** | 🟡 **PARTIEL** — **format** OTel adopté (traceId/spanId/attributes), traceur **maison** ; pas le SDK `@opentelemetry`, pas de collector OTLP (assumé local-first) | Logs maison | MangoQA lit les traces, audit complet, standard mondial |

**Ce que dit la VÉRITÉ 2026-07 (et ce qu'il faut en retenir).**
Le tableau « Choix RETENU » décrit une **cible d'architecture**, pas l'état livré. Aujourd'hui,
**le cœur reste custom jusqu'à la périphérie** : les standards sont soit adoptés au niveau du
*format/modèle* (OTel, SQLite), soit présents en *îlot* (MCP côté vision), soit encore
**purs objectifs datés** (LiteLLM, A2A). Les commentaires du code le confirment eux-mêmes —
le harnais assume son custom au lieu de le déguiser en standard. La règle gravée ci-dessous
reste vraie *comme boussole*, mais elle n'autorise jamais à présenter une cible comme un acquis :
tout item marqué 🔴/🟡 est une **CIBLE**, à écrire au futur tant qu'il n'est pas 🟢 RÉEL.

**Ce qui est déjà 100% custom — ET RÉEL (le cœur non-reproductible) :**
- La coque rigide `<mangoos>` (contrat : propose → valide → exécute) — 🟢 RÉEL
- Les 8 magasins cross-projets avec injection par tour — 🟢 RÉEL (7/8 persistants, cf. §VIII)
- La boucle nocturne Élève + escalade plafonnée (Maître/Élève, distillation) — 🟢 RÉEL
- Le routeur multi-provider maison, cerveau rebranchable (cf. §VIII.c et §IX) — 🟢 RÉEL
- Le profil Raf qui grandit dans le temps — 🟢 RÉEL
- MangoQA fantôme à trois visages — 🟢 RÉEL

> RÈGLE GRAVÉE : avant toute recommandation technique, vérifier qu'aucun standard
> mature ne couvre déjà le besoin. Toujours proposer la solution la plus avancée
> disponible, jamais la plus familière. Être proactif sur les évolutions du marché.
>
> **RÈGLE GRAVÉE v2 (2026-07) : ne jamais confondre cible et acquis.** Un standard nommé
> dans ce document n'est acquis que s'il est marqué 🟢 RÉEL. Tant qu'il est 🔴 ou 🟡, on en
> parle **au futur** (« on adoptera », « on branchera »), et on nomme honnêtement le custom
> qui tient le rôle aujourd'hui. Migrer vers un standard reste souhaitable — mais seulement
> quand il bat réellement le custom en place, jamais pour cocher une case.

---

# IV. POURQUOI · COMMENT · OÙ

## POURQUOI

Les LLMs sont des cerveaux sans mémoire, sans identité, sans continuité.
Le marché ne propose que des outils génériques, cloud, payants, amnésiques —
et qui peuvent fermer du jour au lendemain (Dot/New Computer, fermé en 2025,
utilisateurs ayant tout perdu).

MangoOS répond par un seul système : **qui te connaît, qui grandit avec toi, qui t'appartient.**

## COMMENT — les 5 principes non-négociables

1. **Local-first** — aucune donnée ne quitte la machine sans permission explicite (le *harnais*
   est local ; le *cerveau* est cloud aujourd'hui — cf. §IX, nuance assumée)
2. **LLM-agnostique** — cerveau interchangeable en une ligne de config. **RÉEL, mais via un
   routeur maison** (`llm-engine.ts`), pas LiteLLM : les « portes sont ouvertes » (cf. §VIII.c)
3. **Standards à la périphérie** — MCP, A2A, OpenTelemetry = **cible** ; custom au cœur
   *et à la périphérie* aujourd'hui (état RÉEL/PARTIEL/ASPIRATIONNEL en §III)
4. **Auto-apprenant nocturne** — Élève en boucle, Maître (Claude) en escalade plafonnée ;
   distillation du savoir dans le harnais (cf. §IX)
5. **Extensible par agents** — chaque capacité = un driver. L'écosystème grandit, pas le noyau

**Le noyau (jamais délégué) vs le déchargeable :**
```
NOYAU (reste dans Mango Core)          DÉCHARGEABLE (devient agent)
─────────────────────────────          ───────────────────────────
Conversation ↔ contrat                 patrol → PatrolAgent
Assemblage system prompt               review → ReviewAgent
Injection mémoire par tour             vision → VisionAgent / Sharingan
Décision d'escalade                    audit-scan → AuditAgent
Validation finale (executor)           train-loop → TrainAgent
Orchestrateur (dispatcher)             deploy → DeployAgent · github → GitAgent
                                       design-review → Mango Design
```

## OÙ — la trajectoire

**Aujourd'hui (2026-07) — la vérité, sans enjoliver.** Le **harnais** est souverain (local,
à toi, ne peut pas fermer). Le **cerveau**, lui, tourne sur **GLM cloud** (`ollama.com`,
suffixe `:cloud` = payant) + **Claude par abonnement**. Le 100% local n'est pas « reporté par
confort » : il est **BLOQUÉ par un mur documenté** (`L51` dans `limites.md`) — les modèles
locaux (`gemma4:12b`, `qwen2.5-coder:14b`) *chargent* mais **ne TIENNENT PAS la boucle
agentique**. Décision de Raf (2026-07-03) : **pas de dépense hardware maintenant**, mais
**« ouvrir les portes »** — rendre le cerveau rebranchable en une ligne le jour où un modèle
performant sera disponible (local *ou* cloud). Voir §IX pour la trajectoire hardware honnête.

**Dans 3 ans (2029).**
```
Cerveau     → Qwen 72B / Llama 5 local sur mini PC ~1 200 € (= 10 mois de Claude Max)
              Claude en escalade ~5% seulement · coût mensuel quasi nul
Multi-modal → Voix (Whisper + Kokoro) · Vision (Qwen-VL) — Mango voit, entend, parle
Mémoire     → 3 ans d'axiomes/skills · RAG sur données personnelles (local, privé)
Agents      → App Builder · Vision · Design · Image · Office + patrouilleurs
Position    → Outil de travail principal · zéro abonnement IA externe
```

**Dans 5 ans (2031).**
```
Cerveau     → Modèle 200B+ quantifié sur hardware ~800 € (décote + quantization)
              LoRA fine-tuné sur les données Raf (#55) → un modèle qui te ressemble
Agents      → +Mango Music · +Robot node · +Mobile node · 15-20 agents
Robot       → Unitree/équivalent branché sur MangoOS — connaît tes routines, ton espace
              MangoOS = cerveau du robot · ROS = bas niveau
Position    → "AI company" d'une personne : Raf=CEO, MangoOS=COO, agents=départements
```

**Dans 10 ans (2036).**
```
Cerveau     → Modèle local de niveau GPT-5 actuel pour ~200 €
              fine-tuné sur 10 ans de données — expert dans les domaines de Raf
Écosystème  → 30-50 agents interopérables via A2A · hub d'une constellation d'IA
Physique    → 2-3 robots dans l'environnement · mobile partout sans friction
Savoir      → 10 ans d'apprentissage irremplaçable — la valeur est dans le temps
Position    → Catégorie créée et dominée : Personal AI OS
```

---

# V. MANGOQA — LES TROIS VISAGES DU GARDIEN

MangoQA est un **fantôme indépendant** : il ne reçoit d'ordres ni de MangoOS ni des
agents, il n'est pas créé par Agent Factory, il n'écrit jamais dans le système.
Confier la surveillance à ce qu'on surveille est l'erreur exacte des systèmes qui dérapent.

## Visage 1 — Le Disjoncteur (sécurité · dur · déterministe)

Réflexes automatiques minimaux. Zéro LLM dans la décision. Défensif uniquement :
il peut ARRÊTER, jamais créer ni modifier. Comme un disjoncteur électrique :
trop simple pour être corrompu.
```
1. Circuit breaker nocturne   → N échecs de suite = pause + alerte Raf
2. Garde-fou coût             → escalade Claude > plafond/nuit = bascule full local
3. Verrou régression          → score d'audit sous seuil = bloque le commit
4. Détecteur dérive mémoire   → magasin saturé/contradictoire = gèle l'écriture
5. Kill switch agent          → agent emballé (tours/temps/tokens) = termine proprement
```
Règles intouchables : défensif uniquement · déterministe (zéro LLM) · borné (non-extensible).

**Comment l'« arrêt » est réel sans jamais violer l'indépendance (état 2026-07-03).**
Le Disjoncteur n'AGIT jamais sur MangoOS — il ÉCRIT toutes les 5 s un verdict
(`.mangoqa/breaker-verdict.json`). L'autorité d'arrêt est câblée dans le SENS
CORRECT : c'est MangoOS qui LIT ce verdict entre deux itérations nocturnes
(`nocturnal.ts` → `readBreakerVerdict` + `decideBreakerStop`) et s'arrête
LUI-MÊME si `safe:false` — à la frontière d'un projet, jamais en pleine génération.
MangoQA reste un fantôme : aucune écriture, aucun ordre, aucun contrôle actif sur
le système surveillé. Ce mécanisme est **gaté** (`MANGOQA_STOP_AUTHORITY`, OFF par
défaut aujourd'hui, activation opt-in) : gate OFF ou MangoQA non lancé → verdict
ignoré, comportement historique inchangé.

## Visage 2 — L'Observateur-Conseil (amélioration de MangoOS · utile)

Lit OpenTelemetry dans la durée, détecte les patterns de défaillance récurrents,
et PROPOSE des améliorations à Raf — jamais ne les applique.
```
"Les builds React échouent 40% sur la même erreur de hook"
"Tel axiome est appelé mais ne change jamais le résultat"
        ↓  MangoQA propose à Raf → Raf décide → MangoOS évolue
```
C'est la boucle méta : MangoQA aide MangoOS à s'améliorer, sans jamais le toucher.

## Visage 3 — L'Œil Design (visuel · souple · jamais bloquant)

Le design est subjectif et sa cible BOUGE. Le brief graphique est un point de départ,
pas un contrat figé. L'utilisateur a des idées APRÈS avoir vu le rendu — c'est sain,
le rendu fait naître des idées qu'aucun brief ne contenait.
```
Rigide (objectif, mesurable)  → contraste WCAG · tokens respectés
                                · conformité à la capture Sharingan
Souple (subjectif)            → esthétique · convergence · goût
                                → écarts présentés comme OBSERVATIONS, jamais erreurs
                                → "voici 3 écarts au brief — voulus, ou je corrige ?"
```
Partage : Mango Design (agent) FAIT et itère · MangoQA VÉRIFIE la cohérence sans bloquer
· Raf est le seul juge du goût et de la cible finale.

## Le principe à graver
> MangoQA est **rigide sur l'objectif** (sécurité, coût, régression, accessibilité mesurable).
> MangoQA est **souple sur le subjectif** (esthétique, design, rendu).
> Sur le subjectif, il ne valide jamais — il converge avec Raf, et accepte que la cible bouge.

---

# VI. CONCLUSION — CE QUE MANGOOS VA VRAIMENT APPORTER

**MangoOS n'est pas un projet technologique. C'est un projet de souveraineté.**

**Souveraineté économique.** Le jour où Anthropic annonce 500 €/mois, tu changes une
ligne de config. Le hardware acheté aujourd'hui est remboursé en 10 mois. Dans 10 ans,
zéro euro d'abonnement IA payé — pendant que les modèles locaux progressent gratuitement.

**Souveraineté sur les données.** Tes idées, ton code, tes projets restent sur ta machine.
Dot a fermé en 2025, ses utilisateurs ont tout perdu. MangoOS ne peut pas fermer.

**Souveraineté cognitive.** Avec 10 ans d'accumulation, MangoOS te connaîtra mieux
qu'aucun outil ne le pourra jamais. Une connaissance qui prend de la valeur avec le temps —
pas une dépendance qui coûte de l'argent.

**La vérité sur ce que tu construis :**
Les autres construisent des outils pour des millions. Toi, un système pour une personne.
Non-reproductible, non-compétitif, non-remplaçable — par définition.
Lovable peut sortir mieux demain. Personne ne peut sortir un meilleur MangoOS *pour Raf* —
parce que MangoOS **est** Raf : ses connaissances, ses règles, sa mémoire, sa façon de penser.

```
Un LLM sans MangoOS, c'est un orchestre sans chef.
Chaque musicien est virtuose. Mais sans chef, c'est du bruit.

MangoOS est le chef d'orchestre.
Il connaît chaque musicien (agent), la partition (tes projets), le public (toi).
Et il s'améliore à chaque concert.

Dans 10 ans, cet orchestre jouera des œuvres
qu'aucun chef au monde ne pourra diriger —
parce qu'elles auront été composées pour toi, et apprises par lui seul.
```

---

# VII. EXEMPLE — UNE BOUCLE ENTIÈRE DE TRAVAIL

> **Note de lecture (v2).** Cette boucle illustre la **CIBLE** — le harnais tel qu'on le veut
> une fois toutes les briques en place. Elle nomme LiteLLM, A2A, MCP, OpenTelemetry par leur
> rôle *visé*. Dans le code 2026-07, les mêmes étapes tournent déjà, mais portées par le **custom**
> (routeur maison au lieu de LiteLLM, dispatch in-process au lieu d'A2A, traceur maison au lieu du
> SDK OTel — cf. §III). La boucle est donc **réelle dans son fonctionnement**, aspirationnelle
> seulement dans le *nom* de sa plomberie. À lire comme la trajectoire, pas comme un audit.

Cas concret : *« Mango, clone-moi la page d'accueil de Stripe mais en thème sombre,
avec mon logo, et adapte-la pour vendre mes formations. »*

```
┌─ 1. RAF formule la demande (chat)
│
▼
┌─ 2. MANGO CORE reçoit
│   • injecte mémoire projet + profil Raf + axiomes globaux (system prompt)
│   • LiteLLM sélectionne le cerveau actif (Claude aujourd'hui, Qwen demain)
│   • détecte une intention multi-étapes → passe à l'orchestrateur
│
▼
┌─ 3. CADRAGE (Mango Core)
│   • clarification : "Stripe a un dégradé violet — je garde l'esprit ou full sombre ?"
│   • Raf répond → la cible est fixée (mais reste ajustable plus tard)
│
▼
┌─ 4. DISPATCH via A2A — plusieurs agents en parallèle
│   ├─► VISION SHARINGAN : scrape stripe.com → extrait hex/fonts/tokens/layout
│   │     écrit l'artefact dans SQLite-vec (Blackboard) → renvoie un pointeur (MCP)
│   ├─► MANGO DESIGN : reçoit les tokens → adapte en thème sombre + intègre le logo
│   │     génère le design system (palette dérivée, contraste WCAG vérifié)
│   └─► APP BUILDER : attend les tokens (mutex sur le projet)
│
▼
┌─ 5. CONSTRUCTION (App Builder, après réception des tokens)
│   • génère la page React + Vite + Tailwind via ses skills
│     (skill-generate-hero, skill-generate-pricing, skill-fix-a11y)
│   • lock projet pendant l'écriture → unlock après commit (Blackboard)
│   • HMR → aperçu live sur le port 5174
│
▼
┌─ 6. PATROUILLE AUTO (PatrolAgent, fire-and-forget)
│   • 5 lentilles sur le delta : a11y · sécurité · SEO · perf · bundle
│   • rapports agrégés (RAS masqué)
│
▼
┌─ 7. MANGOQA — les trois visages entrent en jeu
│   ① Disjoncteur : build OK ? coût escalade sous plafond ? pas de régression ? → ✅ laisse passer
│   ② Observateur : trace toute la boucle via OpenTelemetry (pour analyse long terme)
│   ③ Œil Design : compare le rendu à la capture Sharingan + vérifie contraste WCAG
│        → "Le rendu est cohérent. 2 écarts au brief : le hero est plus espacé que Stripe,
│           et le bouton CTA est vert au lieu de violet. Voulus, ou je corrige ?"
│
▼
┌─ 8. RAF regarde l'aperçu → A UNE IDÉE APRÈS COUP (c'est normal et sain)
│   "En fait, garde le CTA vert, c'est mieux pour mes formations.
│    Mais ajoute une section témoignages sous le pricing."
│   → la cible design a bougé — MangoQA ne bloque rien, on re-converge
│
▼
┌─ 9. BOUCLE D'AJUSTEMENT (retour à l'étape 5 sur le delta uniquement)
│   • App Builder ajoute la section témoignages · Mango Design l'harmonise
│   • MangoQA re-vérifie la cohérence → ✅
│
▼
┌─ 10. LIVRAISON
│   • Raf valide → la page est prête (deploy possible via DeployAgent si demandé)
│   • ReviewAgent (Haiku, background) curate : nouveau skill "hero-sombre" appris,
│     préférence "CTA vert pour formations" notée dans le magasin préférences
│
▼
┌─ 11. LA NUIT (boucle nocturne, $0)
│   • TrainAgent rejoue des variantes → l'Élève Gemma s'entraîne sur ce type de page
│   • AuditAgent vérifie que les nouveaux axiomes améliorent réellement le rendement
│   • MangoQA Observateur : "Sharingan a été rappelé 2 fois sur ce projet —
│     suggestion : mettre les tokens Stripe en cache. Raf, j'applique ?"
│
└─ RÉSULTAT : la page existe, ET MangoOS est devenu un peu meilleur.
   Demain, la même demande sera plus rapide, plus juste, moins chère.
```

**Ce que cette boucle illustre :**
- Le LLM ne fait pas tout seul — MangoOS orchestre, les agents exécutent, QA surveille
- Les standards (LiteLLM, MCP, A2A, SQLite-vec, OpenTelemetry) portent la plomberie
- Le custom (contrat, magasins, boucle nocturne, QA fantôme) porte la différence
- La cible design peut bouger sans rien casser — convergence, pas validation binaire
- Chaque boucle laisse MangoOS plus intelligent qu'avant — c'est ça, un OS qui apprend

---

# VIII. DÉFINITION DE FRONTIÈRE POUR MANGOOS (2026-07)

Raf veut un **harnais agentique de dernière génération, type frontière**. « Frontière » n'est
pas un slogan : c'est un seuil **mesurable**. Voici les 4 critères qui font qu'un harnais est
de dernière génération — et, pour chacun, l'état honnête de MangoOS : ✅ **acquis**,
🔧 **en cours**, 🎯 **cible**. Pas de « standard coché » ici : que du fonctionnel prouvé.

## (a) MÉMOIRE durable & apprenante — *la mémoire qui nourrit la boucle*

Un harnais frontière **se souvient utile** : sa mémoire est atomique (pas de corruption sur
crash), versionnée (on sait migrer sans tout casser), bornée (le disque ne file pas à l'infini),
et surtout **elle re-nourrit la boucle** (ce qui est appris ressort au bon moment).

- ✅ **Acquis** : 8 magasins cross-projets, dont **7/8 persistants réels** (le Moodboard n'est
  pas encore un store persistant) ; SQLite WAL ; injection par tour ; embeddings `nomic-embed-text`
  local. Écritures **désormais atomiques** (chantier en cours de consolidation).
- 🔧 **En cours** : versioning / migration de schéma en cours de pose ; bornage de la croissance
  disque à instaurer ; 8ᵉ magasin (Moodboard) à persister.
- 🎯 **Cible** : recherche vectorielle ANN branchée (aujourd'hui cosinus brute-force JS, cf. §III) ;
  purge/compaction automatique ; garantie de rappel mesurée (le bon axiome ressort > X% des fois).

## (b) BOUCLE qui réfléchit — *penser avant d'agir, re-planifier, se limiter*

Un harnais frontière ne fait pas que « répondre en boucle » : il tient une **mémoire de travail
structurée**, un **plan re-planifiable** (plan-ancre #160), une **réflexion explicite** (trace de
raisonnement, cf. axiome AVOID 38), et un **budget** (tours/temps/tokens/coût bornés).

- ✅ **Acquis** : orchestrateur + executor + escalade ; outil `planifier` + plan-ancre (#160) ;
  Stratège autonome P0-P4 (#164) ; kill-switch agent emballé (MangoQA visage ①) ; escalade
  Maître plafonnée par nuit.
- 🔧 **En cours** : réflexion explicite systématisée (rendre la trace de raisonnement obligatoire
  et lisible par MangoQA) ; re-planification déclenchée sur écart, pas seulement sur échec.
- 🎯 **Cible** : mémoire de travail formalisée comme objet de première classe (scratchpad
  structuré partagé plan ↔ agents) ; budget unifié observable en direct.

## (c) LIQUIDITÉ de cerveau prête — *« les portes ouvertes »*

Un harnais frontière **n'est pas marié à un cerveau**. Changer de modèle = une ligne. Un modèle
tombe → **fallback** automatique. Décision critique → **vote** de plusieurs cerveaux.

- ✅ **Acquis** : routeur multi-provider **maison** (`llm-engine.ts` + `kernel.ts`), **7 providers**
  (claude / ollama local / ollama cloud / openai-compat / deepseek / mistral / groq, + litellm-as-endpoint).
  Cerveau **rebranchable en une ligne** — c'est *ça*, « les portes ouvertes ».
- 🔧 **En cours** : fallback automatique inter-providers durci (bascule propre sur panne/quota) ;
  normalisation des capacités (vision / tools) entre providers.
- 🎯 **Cible** : **vote multi-cerveaux** sur décisions à fort enjeu ; adoption de **LiteLLM** *si
  et seulement si* il bat le routeur maison (pas pour cocher la case — cf. RÈGLE GRAVÉE v2, §III).

## (d) MangoQA gardien au top — *le juge souverain, toujours actif*

Un harnais frontière est **gardé** : un tiers indépendant vérifie intention + goût + QA à chaque
livraison, sans jamais être désactivé (règle absolue MEMORY : `ELEVE_CLOSURE_GATE=on`).

- ✅ **Acquis** : MangoQA fantôme à trois visages (#161 Le Gardien) — non-bloquant, souverain,
  toujours actif ; verrou de régression ; garde-fou coût ; qualité **en situation réelle** exigée.
- 🔧 **En cours** : lecture long-terme des traces (visage ②) à muscler ; couverture QA du
  *rendu ressenti* (axiomes AVOID) au-delà du build-vert.
- 🎯 **Cible** : Observateur-Conseil proactif (propose des correctifs récurrents à Raf) branché
  sur une observabilité complète.

> **Le seuil de frontière, en une phrase.** MangoOS est frontière le jour où : la mémoire
> **tient et nourrit** (a), la boucle **réfléchit et se borne** (b), le cerveau est **liquide**
> (c), et le gardien **ne dort jamais** (d) — le tout **en situation réelle**, pas en démo.
> Aujourd'hui : (c) et (d) sont largement acquis, (a) et (b) sont en consolidation active.

---

# IX. TRAJECTOIRE HARDWARE HONNÊTE (2026-07)

**Cloud aujourd'hui — assumé, pas idéologique.** Le cerveau tourne sur GLM cloud + Claude
abonnement parce que c'est ce qui **tient la boucle agentique maintenant**, point. Ce n'est ni
un renoncement au local-first (le harnais et les données restent locaux) ni une préférence
idéologique pour le cloud : c'est le choix pragmatique tant que le mur ci-dessous tient.

**Le mur, nommé : `L51` (`limites.md`).** Les modèles locaux testés (`gemma4:12b`,
`qwen2.5-coder:14b`) **chargent en mémoire mais ne tiennent pas la boucle** : ils décrochent sur
les enchaînements outils/plan/réflexion longs. Ce n'est pas un manque de VRAM à ce stade, c'est
un **plafond de capacité agentique** du modèle. Tant qu'aucun modèle local n'a franchi ce mur,
acheter du hardware ne débloque rien — d'où la décision de Raf (2026-07-03) : **pas de dépense
hardware maintenant.**

**Les portes ouvertes — la seule chose à garantir aujourd'hui.** On ne parie pas sur une date ;
on garantit la **rebranchabilité**. Le jour où un modèle (local *ou* cloud) franchit `L51`, le
basculer doit coûter **une ligne** — c'est déjà le cas grâce au routeur maison (§VIII.c). C'est
la version honnête du pilier « LLM-agnostique » : pas « on est déjà libres », mais « on a rendu
la liberté **triviale à exercer** le jour venu ».

**La stratégie : vampiriser l'expertise de pointe.** Elle est **déjà en place** — c'est la boucle
Maître/Élève + distillation, pas un projet futur :

```
Le GROS modèle (Maître, cloud) CADRE    →  il fait le travail difficile, montre le raisonnement
Le PETIT modèle (Élève) EXÉCUTE         →  il rejoue, s'entraîne sur les variantes (la nuit, borné)
Le SAVOIR se FIGE dans le HARNAIS       →  axiomes, skills, procédures curés → mémoire durable (§VIII.a)
```

Autrement dit : on **aspire** l'expertise du modèle de pointe vers des artefacts qui, eux, sont
locaux, souverains et permanents (la mémoire, les skills, les procédures). Même le jour où le
cerveau change, **le savoir capté reste**. C'est le cœur de la souveraineté cognitive de la
section VI, décliné en mécanique : le cerveau est *loué*, mais **ce qu'il nous apprend
s'accumule et nous appartient**.

> **En clair (2026-07).** Cerveau cloud **assumé** · portes **ouvertes** (une ligne pour rebrancher)
> · mur `L51` **nommé** · savoir **vampirisé et figé** dans le harnais. Le jour où le local passe
> le mur, MangoOS bascule sans rien perdre — parce qu'il aura tout gardé.

---

*Document fondateur de MangoOS — rédigé le 2026-06-19 · révisé le 2026-07-03 (v2).*
*Deux couches, jamais confondues : la VISION (cible 10 ans) et la VÉRITÉ 2026-07 (RÉEL/PARTIEL/ASPIRATIONNEL).*
*Référence permanente. À relire au démarrage de chaque session.*
