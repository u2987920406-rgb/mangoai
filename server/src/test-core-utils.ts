// Tests unitaires purs pour deux modules core sans couverture :
//   - net.ts      : lanIPv4s déduplique les IP en double
//   - tokenizer.ts: estimation tokens + coûts + cohérence segments
//
// Aucun réseau, aucun fs — uniquement des fonctions pures.
// Lancer :  npx tsx src/test-core-utils.ts

import { estimateTokens, estimateCosts } from './tokenizer.js'
import { lanIPv4s } from './net.js'

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

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

// ── 1) net : lanIPv4s déduplique ─────────────────────────────────────────────
line('═')
console.log('1. net — lanIPv4s déduplique les IP en double')
line()

{
  // lanIPv4s lit os.networkInterfaces() — sur une machine réelle on ne
  // contrôle pas le résultat, mais on peut vérifier le contrat : pas de
  // doublons, pas d'IP internes, toutes en IPv4.
  const ips = lanIPv4s()
  const unique = new Set(ips)
  check('aucun doublon dans lanIPv4s()', ips.length === unique.size)
  check('toutes les IP sont non-internes (pas 127.x ni 169.254.x)', ips.every((ip) => !ip.startsWith('127.') && !ip.startsWith('169.254.')))
  check('toutes les IP sont IPv4 (contiennent un point, pas ":")', ips.every((ip) => ip.includes('.') && !ip.includes(':')))
}

// ── 2) tokenizer : estimation + coûts ───────────────────────────────────────
line('═')
console.log('2. tokenizer — estimateTokens + estimateCosts')
line()

{
  // Texte simple : "hello world" = 11 chars / 3.5 ≈ 3.14 → ceil = 4 tokens
  const r = estimateTokens('hello world')
  check('count ≥ 1 pour du texte non vide', r.count >= 1)
  check('segments non vide', r.segments.length > 0)

  // Texte vide → 0 tokens, 0 segments
  const empty = estimateTokens('')
  check('texte vide → count 0', empty.count === 0)
  check('texte vide → 0 segments', empty.segments.length === 0)

  // Code entre backticks → segment de type 'code'
  const code = estimateTokens('voir `const x = 42` ici')
  const codeSeg = code.segments.find((s) => s.type === 'code')
  check('backtick → segment code détecté', !!codeSeg && codeSeg.text.includes('const x = 42'))

  // Nombre → segment de type 'number'
  const num = estimateTokens('le prix est 42.5 euros')
  const numSeg = num.segments.find((s) => s.type === 'number')
  check('nombre décimal → segment number', !!numSeg && numSeg.text === '42.5')

  // Ponctuation → segment 'punct' (doit être isolée par des espaces,
  // sinon [^\s]+ l'absorbe dans un segment text contigu)
  const punct = estimateTokens('a ! b')
  const punctSeg = punct.segments.find((s) => s.type === 'punct')
  check('ponctuation → segment punct', !!punctSeg && punctSeg.text === '!')

  // Cohérence : la somme des tokens des segments = count
  const sum = code.segments.reduce((acc, s) => acc + s.tokens, 0)
  check('count = somme des tokens des segments', code.count === sum)
}

{
  // Coûts : 1000 tokens → Haiku input = 0.0008 * 1 = $0.0008
  const costs = estimateCosts(1000)
  check('3 modèles dans la liste', costs.length === 3)
  const haiku = costs.find((c) => c.model === 'Haiku 4.5')
  check('Haiku 1000 tokens input ≈ $0.0008', !!haiku && near(haiku.inputCost, 0.0008))
  check('Haiku 1000 tokens output ≈ $0.004', !!haiku && near(haiku.outputCostEstimate, 0.004))

  const opus = costs.find((c) => c.model === 'Opus 4.8')
  check('Opus 1000 tokens input ≈ $0.015', !!opus && near(opus.inputCost, 0.015))
  check('Opus 1000 tokens output ≈ $0.075', !!opus && near(opus.outputCostEstimate, 0.075))

  // 0 tokens → tout à 0
  const zero = estimateCosts(0)
  check('0 tokens → coûts à 0', zero.every((c) => c.inputCost === 0 && c.outputCostEstimate === 0))
}

// ── Résultat ─────────────────────────────────────────────────────────────────
line('═')
const total = pass + fail
if (fail === 0) {
  console.log(`✅ ${total}/${total} vérifications OK — net, tokenizer.`)
  process.exit(0)
} else {
  console.log(`❌ ${fail}/${total} vérification(s) en échec.`)
  process.exit(1)
}
