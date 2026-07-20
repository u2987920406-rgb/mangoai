---
type: entité
tags: [veille, atlas, harnais-2027, cortex, souverainete, externe]
statut: repo perso de Raf — audit ponctuel 2026-07-19
sources: ["D:\\HERMES AGENT\\harnais 2027", "audit 17/20 (2026-07-19)"]
maj: 2026-07-19
---

# Atlas (`harnais-2027`)

> Repo **perso de Raf**, distinct de MangoOS (`D:\HERMES AGENT\harnais 2027`) — un « cortex cognitif souverain » : processus continu (pas une session de chat) avec mémoire persistante, boucle de pensée en arrière-plan, 100% Ollama (0 dépendance à Claude/Anthropic dans le code). Ne pas confondre avec [[harnais]] (l'essai théorique de Flavien Chevret, sujet totalement différent malgré le nom proche).

## Rôle

Là où MangoOS construit des apps sur demande (réactif, s'arrête entre les tours), Atlas est pensé pour **penser en continu** : 3 modes AWAKE (utilisateur présent) / IDLE (pense en arrière-plan — explore des hypothèses, anticipe) / SLEEP (consolidation profonde, dégrade le bruit). Boucle cognitive (`tick`) : observer → évaluer → décider → agir → apprendre → consolider.

**Fait clé (confirmé par Raf, 2026-07-19)** : dans TOUT le code et les docs d'Atlas, **"NayaOS"/"NayaQA" sont des codenames qui désignent MangoOS/MangoQA** — `src/bridge/nayaos.ts` et `src/bridge/nayaqa.ts` sont des ponts VERS ce repo-ci, pas vers un système tiers. Voir mémoire auto `reference_naya_est_mango`.

## Analogie (vs OpenAI/Anthropic)

Pas le modèle fournisseur-de-modèle (un cerveau frontière servant toutes les surfaces). Plus proche d'un **mesh d'agents faiblement couplés**, chacun choisissant son propre cerveau :
- **Atlas** (mémoire persistante, cognition continue) ≈ Devin (Cognition Labs) — ingénieur autonome qui persiste dans le temps
- **MangoOS** (builder réactif à la demande) ≈ Cursor/Replit Agent
- **MangoQA** (audit séparé) ≈ bot de review/CI dédié

Les deux (Atlas et la boucle d'apprentissage de MangoOS, [[memoire-expertise]]) descendent conceptuellement de la même étude **Hermes** (`hermes-agent-study`) — Atlas a poussé cette filiation beaucoup plus loin (graphe de connaissance complet, cycle de sommeil) pendant que MangoOS a spécialisé sa branche vers le builder d'apps.

## Modèles (via Ollama, aucun SDK externe)

`ModelBridge` route par capacité (`reasoning`/`creative`/`general`/`vision`/`meta`/`consolidation`/`critique`), local-first puis tier de coût croissant : Qwythos v2 (raisonnement/méta local), GLM 5.2 (généraliste cloud), Qwen 3.5 (consolidation cloud), Qwen-VL (vision locale). Budget tokens+itérations, self-consistency + debate.

## Audit du 2026-07-19 (état au moment du contrôle)

Note **12/20**, plan porté à 17/20-équivalent sur 3 chantiers Ollama-indépendants (2 restent bloqués par une indisponibilité Ollama de ~8h ce jour) :

- **Sécurité réellement câblée, pas déclarative** — `Governance.decide()` appelée avant CHAQUE `tools.execute()`, sandbox whitelist branchée dans `terminal.ts`, audit log hash-chaîné, fail-safe d'approbation confirmé en code (canal null → refus). Vérifié en lisant le code, pas en faisant confiance aux commentaires.
- **Port du pont NayaOS/MangoOS corrigé** (2026-07-19) : `src/bridge/nayaos.ts` pointait par défaut sur `localhost:3001`, le vrai backend MangoOS tourne sur `3000` — corrigé. Avertissement laissé dans le code : les endpoints `/api/agents` (CRUD complet) ne correspondent pas à l'API MangoOS actuelle vérifiée, le pont reste non prouvé end-to-end au-delà du port.
- **3 gaps `GAPS.md` fermés** (2026-07-19) : skills dans `idleThought` (nouveau), TOM dans `processInput` (déjà fait avant l'audit, juste jamais documenté), verifier couvre `shell_exec` (nouveau, détecte un motif d'erreur crasse malgré exit success).
- **Approbation Telegram durcie** (2026-07-19) : vérifiait seulement `chat.id`, pas l'expéditeur — insuffisant en groupe. `approverUserId` ajouté (défaut = `chatId`, override `TELEGRAM_APPROVER_USER_ID`).
- **Reste ouvert, bloqué par Ollama** : faire tourner le cortex en continu sur une vraie durée (la boucle awake/idle/sleep n'a jamais tourné longtemps en conditions réelles — `cortex-state.json` ne contenait qu'une session manuelle de 10 cycles au moment du contrôle) ; exécuter `test/live/*.smoke.ts` (5 fichiers, jamais lancés automatiquement, exclus du glob `npm test`).

157 tests verts au final (152 avant l'audit + 5 nouveaux ciblés sur les changements du jour), `tsc` propre.

## Décision d'intégration (2026-07-20)

Raf a tranché : **pas d'intégration complète**. Gouvernance/sandbox/audit-log dupliquent le Gardien+#180+MangoQA, mémoire (KnowledgeGraph+VectorStore) duplique le Blackboard. **Seule capacité réellement absente de MangoOS** : la cognition continue (penser entre deux sessions). Portée en code natif MangoOS plutôt qu'en pont live — voir [[stratege-global]] § É7bis (`STRATEGE_PERIODIC`, 3ᵉ point de greffe basse fréquence, ~25 min contre le tick 5s/idleThought~15s d'Atlas — jugé disproportionné sur machine mono-GPU). L'outil navigateur interactif d'Atlas (fenêtre Chrome visible, auto-clic résultat) n'a pas été porté, jugé hors-sujet pour un outil de codegen — à réévaluer séparément si un besoin précis apparaît.

## Liens

Distinct de [[harnais]] (homonymie, sujets différents) · filiation conceptuelle avec [[memoire-expertise]] (boucle Hermes) · analogue à [[gardien-cloture]] côté "vérification avant action" (Governance ≈ philosophie proche, implémentation indépendante) · cf. `PRELAUNCH_CHECKLIST.md` pour la discipline de vérif live qui a permis de trouver les 2 vrais bugs MangoQA le même jour (voir [[mangoqa]]).

## Sources

Repo `D:\HERMES AGENT\harnais 2027` (GitHub `u2987920406-rgb/harnais-2027`) · `CHECKPOINT.md`/`GAPS.md`/`CLAUDE.md` du repo · [[historique]] Journal 2026-07-19 · mémoire auto `reference_naya_est_mango`.
