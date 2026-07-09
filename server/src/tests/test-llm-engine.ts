// Pure unit tests for llm-engine.ts — zero network calls.
// Tests: resolveProvider (6 providers, fallback, LLM_PROVIDER env),
//        PROVIDER_PRESETS coherence (baseURL / defaultModel / apiKeyEnv).
//        C1-P1 : resolveOllamaBaseUrl / resolvePresetEndpoint / resolveLitellmEndpoint
//        — override baseUrl/apiKeyEnv honoré pour ollama/presets/litellm, avec
//        égalité stricte à la résolution historique quand l'override est absent,
//        et repli fail-open quand apiKeyEnv nomme une variable non définie.
//
// Run: npx tsx src/test-llm-engine.ts

import { resolveProvider, PROVIDER_PRESETS, resolvePresetEndpoint, resolveLitellmEndpoint } from '../llm/llm-engine.js'
import { resolveOllamaBaseUrl } from '../ollama.js'

const line = (c = '─') => console.log(c.repeat(64))
let pass = 0
let fail = 0

function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}`)
    fail++
  }
}

// ── Save and restore env between groups ──────────────────────────────────────
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

line('═')
console.log('resolveProvider — 7 valid providers')
line()

withEnv({ LLM_PROVIDER: undefined }, () => {
  // All 7 valid providers accepted when passed directly
  check("'claude' → 'claude'", resolveProvider('claude') === 'claude')
  check("'ollama' → 'ollama'", resolveProvider('ollama') === 'ollama')
  check("'openai' → 'openai'", resolveProvider('openai') === 'openai')
  check("'deepseek' → 'deepseek'", resolveProvider('deepseek') === 'deepseek')
  check("'mistral' → 'mistral'", resolveProvider('mistral') === 'mistral')
  check("'groq' → 'groq'", resolveProvider('groq') === 'groq')
  check("'litellm' → 'litellm'", resolveProvider('litellm') === 'litellm')
})

line()
console.log('resolveProvider — fallback on unknown / empty values')
line()

withEnv({ LLM_PROVIDER: undefined }, () => {
  check("unknown value → default fallback 'claude'", resolveProvider('banana') === 'claude')
  check("empty string → default fallback 'claude'", resolveProvider('') === 'claude')
  check("undefined → default fallback 'claude'", resolveProvider(undefined) === 'claude')
  check("unknown value with custom fallback 'ollama'", resolveProvider('??', 'ollama') === 'ollama')
})

line()
console.log('resolveProvider — LLM_PROVIDER global env fallback')
line()

withEnv({ LLM_PROVIDER: 'deepseek' }, () => {
  // empty string '' is NOT null/undefined — ?? operator keeps it, so LLM_PROVIDER is NOT read
  check("LLM_PROVIDER=deepseek: envValue='' → default fallback 'claude' ('' bypasses LLM_PROVIDER)", resolveProvider('') === 'claude')
  check("LLM_PROVIDER=deepseek → 'deepseek' when envValue is undefined", resolveProvider(undefined) === 'deepseek')
  check("explicit envValue 'groq' overrides LLM_PROVIDER", resolveProvider('groq') === 'groq')
  // unknown explicit value uses its own raw, LLM_PROVIDER is NOT consulted (raw='banana' → fallback)
  check("LLM_PROVIDER=deepseek: unknown explicit 'banana' → default fallback 'claude'", resolveProvider('banana') === 'claude')
})

withEnv({ LLM_PROVIDER: 'totally-invalid' }, () => {
  check("LLM_PROVIDER=totally-invalid → default fallback 'claude'", resolveProvider(undefined) === 'claude')
})

line()
console.log('PROVIDER_PRESETS — coherence for deepseek / mistral / groq')
line()

const presetProviders = ['deepseek', 'mistral', 'groq'] as const

for (const p of presetProviders) {
  const preset = PROVIDER_PRESETS[p]
  check(`${p}: baseURL is a non-empty string`, typeof preset.baseURL === 'string' && preset.baseURL.length > 0)
  check(`${p}: baseURL starts with https://`, preset.baseURL.startsWith('https://'))
  check(`${p}: defaultModel is a non-empty string`, typeof preset.defaultModel === 'string' && preset.defaultModel.length > 0)
  check(`${p}: apiKeyEnv is a non-empty string`, typeof preset.apiKeyEnv === 'string' && preset.apiKeyEnv.length > 0)
  check(`${p}: apiKeyEnv contains '_API_KEY'`, preset.apiKeyEnv.includes('_API_KEY'))
}

// Spot-check specific values
check("deepseek baseURL = https://api.deepseek.com/v1", PROVIDER_PRESETS.deepseek.baseURL === 'https://api.deepseek.com/v1')
check("deepseek defaultModel = deepseek-chat", PROVIDER_PRESETS.deepseek.defaultModel === 'deepseek-chat')
check("deepseek apiKeyEnv = DEEPSEEK_API_KEY", PROVIDER_PRESETS.deepseek.apiKeyEnv === 'DEEPSEEK_API_KEY')

check("mistral baseURL = https://api.mistral.ai/v1", PROVIDER_PRESETS.mistral.baseURL === 'https://api.mistral.ai/v1')
check("mistral defaultModel = mistral-large-latest", PROVIDER_PRESETS.mistral.defaultModel === 'mistral-large-latest')
check("mistral apiKeyEnv = MISTRAL_API_KEY", PROVIDER_PRESETS.mistral.apiKeyEnv === 'MISTRAL_API_KEY')

check("groq baseURL = https://api.groq.com/openai/v1", PROVIDER_PRESETS.groq.baseURL === 'https://api.groq.com/openai/v1')
check("groq defaultModel = llama-3.3-70b-versatile", PROVIDER_PRESETS.groq.defaultModel === 'llama-3.3-70b-versatile')
check("groq apiKeyEnv = GROQ_API_KEY", PROVIDER_PRESETS.groq.apiKeyEnv === 'GROQ_API_KEY')

line('═')
console.log('C1-P1 — resolveOllamaBaseUrl : override baseUrl honoré, absent = identique à aujourd\'hui')
line()

withEnv({ OLLAMA_URL: undefined }, () => {
  // Sans override, sans OLLAMA_URL en env → défaut historique inchangé
  check("sans override, OLLAMA_URL absent → défaut 'http://localhost:11434' (comportement actuel)", resolveOllamaBaseUrl() === 'http://localhost:11434')
  check("sans override, OLLAMA_URL absent → identique en appelant explicitement undefined", resolveOllamaBaseUrl(undefined) === 'http://localhost:11434')
})

withEnv({ OLLAMA_URL: 'http://ollama-interne:11434' }, () => {
  // Sans override → OLLAMA_URL (comportement actuel, juste testable maintenant)
  check("sans override, OLLAMA_URL=custom → OLLAMA_URL (repli historique)", resolveOllamaBaseUrl() === 'http://ollama-interne:11434')
  // Avec override → l'override prime, OLLAMA_URL ignoré
  check("avec override → l'override prime sur OLLAMA_URL", resolveOllamaBaseUrl('http://override:9999') === 'http://override:9999')
})

withEnv({ OLLAMA_URL: undefined }, () => {
  check("avec override, OLLAMA_URL absent → l'override est quand même utilisé", resolveOllamaBaseUrl('http://override:9999') === 'http://override:9999')
})

line()
console.log('C1-P1 — resolvePresetEndpoint (deepseek/mistral/groq) : override + égalité stricte + fail-open')
line()

// ── Sans override : égalité stricte avec la résolution historique ───────────
withEnv({ DEEPSEEK_API_KEY: 'dsk-real-key', LLM_OPENAI_KEY: undefined, ELEVE_API_KEY: undefined }, () => {
  const r = resolvePresetEndpoint('deepseek')
  check("deepseek sans override : baseURL = preset.baseURL (identique à aujourd'hui)", r.baseURL === PROVIDER_PRESETS.deepseek.baseURL)
  check("deepseek sans override : key = process.env[DEEPSEEK_API_KEY] (identique à aujourd'hui)", r.key === 'dsk-real-key')
})

withEnv({ MISTRAL_API_KEY: undefined, LLM_OPENAI_KEY: 'fallback-openai-key', ELEVE_API_KEY: undefined }, () => {
  const r = resolvePresetEndpoint('mistral')
  check("mistral sans override, sans MISTRAL_API_KEY : repli sur LLM_OPENAI_KEY (identique à aujourd'hui)", r.key === 'fallback-openai-key')
  check("mistral sans override : baseURL = preset.baseURL", r.baseURL === PROVIDER_PRESETS.mistral.baseURL)
})

withEnv({ GROQ_API_KEY: undefined, LLM_OPENAI_KEY: undefined, ELEVE_API_KEY: 'fallback-eleve-key' }, () => {
  const r = resolvePresetEndpoint('groq')
  check("groq sans override, sans GROQ_API_KEY ni LLM_OPENAI_KEY : repli sur ELEVE_API_KEY (identique à aujourd'hui)", r.key === 'fallback-eleve-key')
})

withEnv({ DEEPSEEK_API_KEY: undefined, LLM_OPENAI_KEY: undefined, ELEVE_API_KEY: undefined }, () => {
  const r = resolvePresetEndpoint('deepseek')
  check("deepseek sans override, aucune clé en env : key = '' (identique à aujourd'hui — l'appelant lève)", r.key === '')
})

// ── Avec override : baseUrl et apiKeyEnv priment ─────────────────────────────
withEnv({ ZHIPU_KEY_TEST: 'zhipu-secret-123', DEEPSEEK_API_KEY: 'dsk-should-be-ignored' }, () => {
  const r = resolvePresetEndpoint('deepseek', { baseUrl: 'https://custom-endpoint.example/v1', apiKeyEnv: 'ZHIPU_KEY_TEST' })
  check("deepseek + override baseUrl : pointe vers l'override (pas preset.baseURL)", r.baseURL === 'https://custom-endpoint.example/v1')
  check("deepseek + override apiKeyEnv : key = process.env[ZHIPU_KEY_TEST], pas DEEPSEEK_API_KEY", r.key === 'zhipu-secret-123')
})

// ── Fail-open : apiKeyEnv nomme une variable ABSENTE d'env → repli, pas de crash ──
withEnv({ VAR_INEXISTANTE_XYZ: undefined, MISTRAL_API_KEY: 'mistral-preset-key' }, () => {
  const r = resolvePresetEndpoint('mistral', { apiKeyEnv: 'VAR_INEXISTANTE_XYZ' })
  check("apiKeyEnv absent d'env → fail-open : repli sur la résolution historique (pas de crash, pas d'exception)", r.key === 'mistral-preset-key')
})

withEnv({ VAR_INEXISTANTE_XYZ: undefined, MISTRAL_API_KEY: undefined, LLM_OPENAI_KEY: undefined, ELEVE_API_KEY: undefined }, () => {
  const r = resolvePresetEndpoint('mistral', { apiKeyEnv: 'VAR_INEXISTANTE_XYZ' })
  check("apiKeyEnv absent d'env + aucun repli disponible → key = '' (pas de throw dans la fonction pure)", r.key === '')
})

line()
console.log('C1-P1 — resolveLitellmEndpoint : override + égalité stricte + fail-open')
line()

withEnv({ LITELLM_BASE_URL: undefined, LITELLM_API_KEY: undefined }, () => {
  const r = resolveLitellmEndpoint()
  check("litellm sans override, sans env : baseURL = défaut localhost:4000 (identique à aujourd'hui)", r.baseURL === 'http://localhost:4000/v1')
  check("litellm sans override, sans env : key = placeholder 'sk-litellm-local' (identique à aujourd'hui)", r.key === 'sk-litellm-local')
})

withEnv({ LITELLM_BASE_URL: 'http://litellm-interne:4000/v1', LITELLM_API_KEY: 'litellm-real-key' }, () => {
  const r = resolveLitellmEndpoint()
  check("litellm sans override, env défini : baseURL = LITELLM_BASE_URL (identique à aujourd'hui)", r.baseURL === 'http://litellm-interne:4000/v1')
  check("litellm sans override, env défini : key = LITELLM_API_KEY (identique à aujourd'hui)", r.key === 'litellm-real-key')
})

withEnv({ LITELLM_BASE_URL: 'http://litellm-interne:4000/v1', ZHIPU_KEY_TEST_2: 'zhipu-secret-456' }, () => {
  const r = resolveLitellmEndpoint({ baseUrl: 'https://override.example/v1', apiKeyEnv: 'ZHIPU_KEY_TEST_2' })
  check("litellm + override baseUrl : pointe vers l'override (pas LITELLM_BASE_URL)", r.baseURL === 'https://override.example/v1')
  check("litellm + override apiKeyEnv : key = process.env[ZHIPU_KEY_TEST_2]", r.key === 'zhipu-secret-456')
})

withEnv({ VAR_INEXISTANTE_ABC: undefined, LITELLM_API_KEY: 'litellm-fallback-key' }, () => {
  const r = resolveLitellmEndpoint({ apiKeyEnv: 'VAR_INEXISTANTE_ABC' })
  check("litellm apiKeyEnv absent d'env → fail-open : repli sur LITELLM_API_KEY (pas de crash)", r.key === 'litellm-fallback-key')
})

line('═')
const total = pass + fail
if (fail === 0) {
  console.log(`✅ All ${total}/${total} checks passed.`)
  process.exit(0)
} else {
  console.log(`❌ ${fail}/${total} check(s) failed.`)
  process.exit(1)
}
