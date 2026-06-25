// Tests de la réinjection composants/blueprints (#119).
//   npx tsx src/test-kernel-reuse.ts
// Déterministe : embedder injecté (mappe un texte → vecteur), composants écrits
// sur un workspace temporaire, Blackboard en mémoire.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Blackboard } from './kernel-blackboard.js'
import { saveComponent } from './components.js'
import {
  keywordRank,
  blueprintHintSection,
  indexComponents,
  relevantComponentsSection,
  searchComponentsRanked,
  relevantSkillsSection,
  COMPONENT_SCOPE,
  SKILL_SCOPE,
  type Embed,
} from './kernel-reuse.js'
import type { SkillMeta } from './skills.js'

let passed = 0
let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ❌ ${name}`)
  }
}

// ── keywordRank ──────────────────────────────────────────────────────────────
{
  const items = ['table de données triable', 'fenêtre modale', 'barre de navigation']
  const ranked = keywordRank(items, (s) => s, 'je veux une table triable', 3)
  check('keywordRank : meilleur = table', ranked[0] === 'table de données triable')
  check('keywordRank : requête vide → ordre d’origine', keywordRank(items, (s) => s, '', 2).length === 2)
  check('keywordRank : stable à égalité', JSON.stringify(keywordRank(['aaa', 'bbb'], (s) => s, 'zzz', 2)) === JSON.stringify(['aaa', 'bbb']))
}

// ── blueprintHintSection ─────────────────────────────────────────────────────
{
  check('blueprint : dashboard détecté', blueprintHintSection('crée un dashboard analytics').includes('dashboard'))
  check('blueprint : jeu détecté', blueprintHintSection('un petit jeu canvas arcade').includes('jeu'))
  check('blueprint : générique → ""', blueprintHintSection('change la couleur du bouton') === '')
}

// ── indexComponents + relevantComponentsSection ──────────────────────────────
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-reuse-'))
  const mk = (name: string, description: string, tags: string[]) =>
    saveComponent(ws, {
      meta: { name, description, tags, props: [], usedIn: [], createdAt: 'x', updatedAt: '1' },
      code: '// ' + name,
    })
  mk('DataTable', 'table de données triable et paginée', ['table', 'data'])
  mk('Modal', 'fenêtre modale accessible', ['modal', 'overlay'])
  mk('ChartCard', 'carte avec graphique recharts', ['chart', 'stat'])

  // Embedder de test : vecteur [table?, modal?, chart?] selon le contenu.
  const fakeEmbed: Embed = async (t) => {
    const s = t.toLowerCase()
    return [s.includes('table') ? 1 : 0, s.includes('modal') ? 1 : 0, s.includes('chart') || s.includes('graph') ? 1 : 0]
  }

  // Sous le seuil k → tout est listé (pas d'embedding requis).
  const full = await relevantComponentsSection('peu importe', ws, { embed: fakeEmbed, k: 8 })
  check('composants : sous le seuil → tout listé', full.includes('DataTable') && full.includes('Modal') && full.includes('ChartCard'))

  // Au-dessus du seuil (k=1) → tri sémantique via Blackboard.
  const bb = new Blackboard()
  const tableReq = await relevantComponentsSection('je veux une table triable', ws, { bb, embed: fakeEmbed, k: 1 })
  check('composants : top-1 sémantique = DataTable', tableReq.includes('DataTable') && !tableReq.includes('Modal'))
  check('composants : en-tête « PERTINENTS »', tableReq.includes('PERTINENTS'))
  check('composants : indexés dans le Blackboard', bb.keys(COMPONENT_SCOPE).length === 3)

  const chartReq = await relevantComponentsSection('ajoute un graphique de stats', ws, { bb, embed: fakeEmbed, k: 1 })
  check('composants : top-1 = ChartCard pour une demande graphique', chartReq.includes('ChartCard'))

  // Repli mots-clés quand l'embedder est indisponible ([]).
  const noEmbed: Embed = async () => []
  const bb2 = new Blackboard()
  const fallback = await relevantComponentsSection('une fenêtre modale', ws, { bb: bb2, embed: noEmbed, k: 1 })
  check('composants : repli mots-clés → Modal', fallback.includes('Modal') && !fallback.includes('DataTable'))

  // Idempotence de l'indexation (même updatedAt → pas de ré-embed).
  let embedCalls = 0
  const counting: Embed = async (t) => { embedCalls++; return [t.length % 3, 0, 0] }
  const bb3 = new Blackboard()
  await indexComponents(ws, bb3, counting)
  const after1 = embedCalls
  await indexComponents(ws, bb3, counting)
  check('indexComponents : idempotent (pas de ré-embed)', embedCalls === after1)

  // searchComponentsRanked (#156/L3) : renvoie les METAS triées, utilisable par
  // l'outil chercher_artefact de l'Élève (pas une section de prompt).
  const bbS = new Blackboard()
  const ranked = await searchComponentsRanked('je veux une table triable', ws, { bb: bbS, embed: fakeEmbed, k: 2 })
  check('searchComponentsRanked : renvoie des metas (pas du texte)', Array.isArray(ranked) && ranked[0]?.name === 'DataTable')
  check('searchComponentsRanked : top-1 sémantique = DataTable', ranked[0].name === 'DataTable')
  // Repli mots-clés (embedder []).
  const rankedFb = await searchComponentsRanked('une fenêtre modale', ws, { bb: new Blackboard(), embed: async () => [], k: 1 })
  check('searchComponentsRanked : repli mots-clés → Modal', rankedFb[0]?.name === 'Modal')

  fs.rmSync(ws, { recursive: true, force: true })
}

// ── searchComponentsRanked : bibliothèque vide → [] ──────────────────────────
{
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-reuse-src-empty-'))
  const ranked = await searchComponentsRanked('quoi que ce soit', empty, { embed: async () => [] })
  check('searchComponentsRanked : vide → []', Array.isArray(ranked) && ranked.length === 0)
  fs.rmSync(empty, { recursive: true, force: true })
}

// ── Skills : même mécanisme (tri sémantique + repli mots-clés) ───────────────
{
  const skills: SkillMeta[] = [
    { name: 'paginate-table', description: 'pagination de table de données', file: '/s/paginate/SKILL.md' },
    { name: 'auth-flow', description: 'flux d’authentification login signup', file: '/s/auth/SKILL.md' },
    { name: 'drag-drop', description: 'glisser-déposer réordonnable', file: '/s/dnd/SKILL.md' },
  ]
  const fakeEmbed: Embed = async (t) => {
    const s = t.toLowerCase()
    return [s.includes('pagination') || s.includes('table') ? 1 : 0, s.includes('auth') || s.includes('login') ? 1 : 0, s.includes('drag') || s.includes('dépos') ? 1 : 0]
  }

  // Sous le seuil → tout listé.
  const full = await relevantSkillsSection('peu importe', { skills, embed: fakeEmbed, k: 8 })
  check('skills : sous le seuil → tout listé', full.includes('paginate-table') && full.includes('auth-flow') && full.includes('drag-drop'))
  check('skills : chemin SKILL.md présent (divulgation progressive)', full.includes('/s/paginate/SKILL.md'))

  // Au-dessus (k=1) → tri sémantique Blackboard.
  const bb = new Blackboard()
  const authReq = await relevantSkillsSection('ajoute un login', { skills, bb, embed: fakeEmbed, k: 1 })
  check('skills : top-1 sémantique = auth-flow', authReq.includes('auth-flow') && !authReq.includes('drag-drop'))
  check('skills : en-tête « PERTINENTS »', authReq.includes('PERTINENTS'))
  check('skills : indexés dans le Blackboard', bb.keys(SKILL_SCOPE).length === 3)

  // Repli mots-clés sans embeddings.
  const noEmbed: Embed = async () => []
  const fallback = await relevantSkillsSection('une table à paginer', { skills, bb: new Blackboard(), embed: noEmbed, k: 1 })
  check('skills : repli mots-clés → paginate-table', fallback.includes('paginate-table') && !fallback.includes('auth-flow'))

  // Aucun skill → "".
  check('skills : aucun → ""', (await relevantSkillsSection('x', { skills: [], embed: noEmbed })) === '')
}

// ── Aucun composant → "" ─────────────────────────────────────────────────────
{
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-reuse-empty-'))
  const section = await relevantComponentsSection('quoi que ce soit', empty, { embed: async () => [] })
  check('aucun composant → ""', section === '')
  fs.rmSync(empty, { recursive: true, force: true })
}

console.log(`\n[kernel-reuse] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
