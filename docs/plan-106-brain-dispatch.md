# Plan — Système multi-agents Brain-Dispatch pour MangoOS

## Contexte

MangoOS orchestre déjà des agents (patrol.ts, orchestrator.ts) mais tous partagent le même cerveau via `askLLM`. L'objectif est de créer une couche universelle où chaque agent dispose de son propre cerveau (Claude, Gemma via Ollama, GLM via Zhipu, DeepSeek, Mistral, Groq…), configurable dans un fichier JSON sans toucher au code. Toutes les failles identifiées (injection, saturation contexte, timeout, race condition, coût incontrôlé, hallucination cascade, registre corrompu) sont adressées dès le socle.

## Les 10 agents définis

| id | Nom | Cerveau par défaut |
|----|-----|--------------------|
| `orchestrateur` | Orchestrateur | claude / opus |
| `architecte` | Architecte | claude / opus |
| `codeur` | Codeur | ollama / gemma4:12b |
| `vision` | Vision | openai / glm-4v (Zhipu) |
| `designer_ux` | Designer UX | claude / sonnet |
| `extracteur` | Extracteur de documents | claude / haiku |
| `testeur` | Testeur / QA | claude / sonnet |
| `auditeur` | Auditeur sécurité | claude / sonnet |
| `optimiseur` | Optimiseur performance | ollama / gemma4:12b |
| `chercheur` | Chercheur web | claude / sonnet |

---

## Architecture — 6 couches

```
brain-registry.json          ← config éditable par Raf
        ↓
brain-registry.ts            ← charge, valide, expose getBrain()
        ↓
agent-contract.ts            ← contrat universel + parseur + timeout + sanitize
        ↓
brain-dispatch.ts            ← dispatch(agentId, system, user) → AgentResult
        ↓
llm-engine.ts (étendu)       ← AskLLMOptions + baseUrl + apiKeyEnv
        ↓
orchestrator.ts (étendu)     ← CouncilLens.agentId → dispatch par cerveau
patrol.ts (étendu)           ← Patroller.agentId → dispatch par cerveau
```

---

## Fichier 1 — `brain-registry.json` (workspace-level)

```json
{
  "orchestrateur": { "provider": "claude",  "model": "opus",       "timeoutMs": 30000 },
  "architecte":    { "provider": "claude",  "model": "opus",       "timeoutMs": 45000 },
  "codeur":        { "provider": "ollama",  "model": "gemma4:12b", "timeoutMs": 120000 },
  "vision":        { "provider": "openai",  "model": "glm-4v",
                     "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
                     "apiKeyEnv": "ZHIPU_API_KEY",                  "timeoutMs": 60000 },
  "designer_ux":   { "provider": "claude",  "model": "sonnet",     "timeoutMs": 30000 },
  "extracteur":    { "provider": "claude",  "model": "haiku",      "timeoutMs": 30000 },
  "testeur":       { "provider": "claude",  "model": "sonnet",     "timeoutMs": 45000 },
  "auditeur":      { "provider": "claude",  "model": "sonnet",     "timeoutMs": 30000 },
  "optimiseur":    { "provider": "ollama",  "model": "gemma4:12b", "timeoutMs": 60000 },
  "chercheur":     { "provider": "claude",  "model": "sonnet",     "timeoutMs": 90000 }
}
```

Champs optionnels : `baseUrl` (endpoint custom OpenAI-compat), `apiKeyEnv` (nom de la variable d'env qui contient la clé), `localOnly` (boolean — refuse d'envoyer du code source à un cloud externe).

---

## Fichier 2 — `server/src/brain-registry.ts` (NOUVEAU)

```typescript
export interface BrainConfig {
  provider: LLMProvider
  model?: string
  baseUrl?: string      // ex. "https://open.bigmodel.cn/api/paas/v4"
  apiKeyEnv?: string    // ex. "ZHIPU_API_KEY" → lu dans process.env
  timeoutMs?: number
  localOnly?: boolean   // true → refuse de router vers un cloud
}

export type AgentId =
  | "orchestrateur" | "architecte" | "codeur" | "vision"
  | "designer_ux" | "extracteur" | "testeur" | "auditeur"
  | "optimiseur" | "chercheur"

// Valeurs par défaut (fallback si registre absent ou corrompu)
const DEFAULT_REGISTRY: Record<AgentId, BrainConfig> = { /* ... */ }

export function loadBrainRegistry(): Record<AgentId, BrainConfig>
  // 1. Lit data/brain-registry.json
  // 2. Valide le JSON (try/catch) → fallback DEFAULT_REGISTRY si invalide
  // 3. Merge champ par champ : valeurs custom écrasent les défauts
  // 4. Log un warning si le registre était corrompu

export function saveBrainRegistry(registry: Record<AgentId, BrainConfig>): void
  // atomicWriteFileSync (réutilise safe-io.ts)

export function getBrain(agentId: AgentId): BrainConfig
  // loadBrainRegistry()[agentId] ?? DEFAULT_REGISTRY[agentId]
```

**Réutilise :** `atomicWriteFileSync` de `safe-io.ts`, `LLMProvider` de `llm-engine.ts`

---

## Fichier 3 — `server/src/agent-contract.ts` (NOUVEAU)

### Contrat de réponse universel

```typescript
export interface AgentResult {
  status:      "ok" | "partial" | "error" | "timeout"
  agent:       AgentId
  summary:     string          // 1 phrase — ce que l'agent a trouvé
  data:        Record<string, unknown>  // payload spécifique au rôle
  confidence:  number          // 0.0 → 1.0 (auto-déclaré par le modèle)
  durationMs:  number
}
```

### Fragment system injecté dans TOUS les agents

```typescript
export const MANGO_CONTRACT_PROMPT = `
RÈGLE ABSOLUE — FORMAT DE RÉPONSE MANGO :
Ta réponse doit commencer par <<<MANGO>>> et finir par <<<END>>>.
Entre ces balises, uniquement du JSON valide, zéro texte, zéro markdown.
Format : <<<MANGO>>>{"status":"ok","summary":"...","data":{...},"confidence":0.9}<<<END>>>
`
```

### Parseur robuste à 4 niveaux

```typescript
export function parseAgentResponse(raw: string, agentId: AgentId, durationMs: number): AgentResult
  // 1. Entre <<<MANGO>>> et <<<END>>> (cas nominal)
  // 2. JSON dans backticks ```json ... ``` (GLM, Mistral)
  // 3. Premier { ... } trouvé dans le texte (Gemma)
  // 4. Échec total → { status: "error", summary: raw.slice(0,200), data: {} }
  // Vérification complétude JSON : tous les champs requis présents ?
  // Si JSON tronqué (status manquant, data manquant) → status: "partial"
```

### Protection contre les données externes (anti-injection prompt)

```typescript
export function sanitizeExternal(content: string): string
  // Encadre : "<<<UNTRUSTED_INPUT>>>\n" + content + "\n<<<END_UNTRUSTED>>>"
  // L'orchestrateur sait que c'est du contenu externe, PAS des instructions
```

### Timeout avec dégradation gracieuse

```typescript
export async function withAgentTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  agentId: AgentId
): Promise<T | { timedOut: true; agentId: AgentId }>
  // Promise.race([promise, sleep(timeoutMs)])
  // Si timeout → retourne { timedOut: true } plutôt que de rejeter
  // AbortController sur le fetch sous-jacent (annule la connexion HTTP)
```

### Session immuable (amnésie impossible)

```typescript
export interface PipelineSession {
  readonly sessionId:   string
  readonly originalTask: string     // jamais écrasé
  readonly createdAt:   string
  readonly maxTurns:    number      // circuit breaker (défaut 6)
  turns:                number      // incrémenté par le dispatch
  results:              AgentResult[]
}

export function createSession(task: string): PipelineSession
export function sessionBudgetExceeded(s: PipelineSession): boolean
  // s.turns >= s.maxTurns
```

### Estimation de coût avant exécution

```typescript
export function estimatePipelineCost(
  agents: AgentId[],
  estimatedTokens: number
): { usd: number; warning: boolean }
  // Tarifs approximatifs par provider/model
  // warning: true si > 2 USD estimés
```

---

## Fichier 4 — `server/src/brain-dispatch.ts` (NOUVEAU)

```typescript
export async function dispatch(
  agentId: AgentId,
  system:  string,
  user:    string,
  opts?: {
    imageBase64?:    string
    session?:        PipelineSession
    trustExternal?:  boolean   // false (défaut) → sanitizeExternal() sur `user`
  }
): Promise<AgentResult>
  // 1. Vérifie session.turns < maxTurns (circuit breaker)
  // 2. getBrain(agentId) → BrainConfig
  // 3. Si brain.localOnly && provider !== "ollama" → erreur immédiate
  // 4. Injecte MANGO_CONTRACT_PROMPT dans le system
  // 5. Si !trustExternal → sanitizeExternal(user)
  // 6. Rate limit check par provider (queue simple, max N appels/minute)
  // 7. withAgentTimeout(askLLM(...), brain.timeoutMs)
  // 8. parseAgentResponse(raw)
  // 9. session?.results.push(result) + session?.turns++
  // Retourne AgentResult (jamais throw — toujours un résultat dégradé si erreur)

export async function dispatchParallel(
  tasks: Array<{ agentId: AgentId; system: string; user: string; opts?: DispatchOpts }>
): Promise<AgentResult[]>
  // Promise.all(tasks.map(t => dispatch(t.agentId, t.system, t.user, t.opts)))
  // Résultats avec status "timeout" ou "error" n'arrêtent pas les autres
```

### Rate limiter par provider (simple)

```typescript
const RATE_LIMITS: Record<LLMProvider, { maxPerMinute: number }> = {
  claude: { maxPerMinute: 10 },
  ollama: { maxPerMinute: 999 },   // local, pas de limite
  openai: { maxPerMinute: 20 },
  // ...
}
// Compteurs en mémoire, reset toutes les 60s
// Si dépassé → retry exponentiel (1s → 2s → 4s, max 3 essais)
```

---

## Modifications des fichiers existants

### `server/src/llm-engine.ts` (étendu)

Ajouter dans `AskLLMOptions` :
```typescript
baseUrl?:    string   // endpoint custom (ex. Zhipu API)
apiKeyEnv?:  string   // nom de la var d'env pour la clé API
```
Thread vers `askOpenAI` (qui accepte déjà `baseURLOverride`/`apiKeyOverride` en interne).

### `server/src/orchestrator.ts` (étendu)

`CouncilLens` gagne un champ optionnel :
```typescript
agentId?: AgentId   // si présent → dispatch() avec le bon cerveau
```

Les 5 lenses câblées sur les agents :
- Architecte → `agentId: "architecte"`
- Product → `agentId: "designer_ux"`
- UX/UI → `agentId: "designer_ux"`
- Données → `agentId: "architecte"`
- Robustesse → `agentId: "auditeur"`

`diagnose()` : si `lens.agentId` → `dispatch(lens.agentId, ...)` sinon `deps.ask()` (backward compatible).

### `server/src/patrol.ts` (étendu)

`Patroller` gagne :
```typescript
agentId?: AgentId
```

Câblage :
- a11y → `agentId: "auditeur"`
- security → `agentId: "auditeur"`
- seo → `agentId: "chercheur"`
- perf → `agentId: "optimiseur"`
- bundle → `agentId: "optimiseur"`

`runPatroller()` : si `p.agentId` → `dispatch()` sinon `deps.ask()`.

---

## Routes Express (dans `index.ts` ou module dédié)

```
GET  /api/brain-registry          → retourne le registre complet
PUT  /api/brain-registry          → valide + sauvegarde (atomicWriteFileSync)
POST /api/brain-dispatch/estimate → { agents, tokens } → { usd, warning }
```

---

## UI — Panneau « Cerveaux »

Nouveau panneau dans `Knowledge.jsx` (icône `Brain` de lucide-react) :

- Liste des 10 agents avec leur cerveau actuel (provider + model)
- Par agent : sélecteur provider + champ model + baseUrl + timeoutMs
- Badge « local » (Ollama) vs « cloud »
- Indicateur `localOnly` toggle
- Bouton « Sauvegarder » → PUT /api/brain-registry
- Bouton « Réinitialiser les défauts »

---

## Failles adressées et leur fix

| Faille | Fix dans |
|--------|----------|
| Amnésie orchestrateur | `PipelineSession.originalTask` immuable |
| Saturation contexte | `trimToContext(result, maxChars)` — compresse avant passage |
| Injection prompt | `sanitizeExternal()` + balises `<<<UNTRUSTED_INPUT>>>` |
| Fuite données cloud | `BrainConfig.localOnly` → refuse dispatch non-Ollama |
| Race condition fichiers | Mutex par projet dans `dispatch()` (réutilise `agentBusy`) |
| Accès silencieux FS | Sandbox path dans dispatch Codeur (anti-traversal) |
| Rate limiting | Queue par provider avec retry exponentiel |
| Cold start Ollama | Health check `ollama ps` avant dispatch + fallback cloud |
| JSON tronqué | Vérification complétude dans `parseAgentResponse()` |
| Hallucination cascade | `confidence` score + spot-check optionnel |
| Coût incontrôlé | `estimatePipelineCost()` + plafond configurable |
| Boucle infinie | `PipelineSession.maxTurns` + circuit breaker |
| Registre corrompu | Validation JSON + `DEFAULT_REGISTRY` fallback |
| Dérive comportement | Sessions stateless (contexte propre à chaque run) |
| Timeout agent | `withAgentTimeout()` + `AbortController` |
| Agent fantôme | AbortController annule la connexion HTTP proprement |

---

## Ordre d'implémentation

1. **`llm-engine.ts`** — ajouter `baseUrl` + `apiKeyEnv` dans `AskLLMOptions`
2. **`brain-registry.ts`** — registre + `getBrain()` + validation + defaults
3. **`agent-contract.ts`** — contrat + parseur + timeout + sanitize + session + estimateCost
4. **`brain-dispatch.ts`** — dispatch() + dispatchParallel() + rate limiter
5. **`orchestrator.ts`** — `CouncilLens.agentId` + dispatch dans `diagnose()`
6. **`patrol.ts`** — `Patroller.agentId` + dispatch dans `runPatroller()`
7. **Routes** — GET/PUT `/api/brain-registry` + `/api/brain-dispatch/estimate`
8. **UI** — panneau Cerveaux dans `Knowledge.jsx`
9. **`data/brain-registry.json`** — fichier initial avec les 10 agents

## Vérification

```bash
# TypeScript
cd server && npx tsc --noEmit

# Tests (à créer)
npx tsx src/test-brain-dispatch.ts
  → dispatch avec mock ask → AgentResult ok
  → dispatch timeout → status "timeout", pipeline continue
  → dispatchParallel 3 agents → Promise.all, résultats indépendants
  → parseAgentResponse sentinelle / backticks / brut / échec
  → sessionBudgetExceeded après maxTurns
  → sanitizeExternal injecte les balises
  → loadBrainRegistry fallback sur DEFAULT si JSON invalide

# Build UI
cd ui && npm run build

# E2e manuel
Ouvrir MangoOS → Panneau Cerveaux → modifier le modèle "codeur" → Sauvegarder
Lancer un build → vérifier dans les logs que le bon provider est utilisé
```
