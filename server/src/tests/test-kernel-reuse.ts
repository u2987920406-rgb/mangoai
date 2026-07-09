// Tests de la réinjection composants/blueprints (#119).
//   npx tsx src/test-kernel-reuse.ts
// Déterministe : embedder injecté (mappe un texte → vecteur), composants écrits
// sur un workspace temporaire, Blackboard en mémoire.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Blackboard } from '../kernel/kernel-blackboard.js'
import { saveComponent } from '../components.js'
import { saveLayout } from '../layouts.js'
import {
  keywordRank,
  blueprintHintSection,
  indexComponents,
  relevantComponentsSection,
  searchComponentsRanked,
  relevantSkillsSection,
  searchSkillsRanked,
  searchLayoutsRanked,
  indexLayouts,
  relevantLayoutsSection,
  COMPONENT_SCOPE,
  SKILL_SCOPE,
  LAYOUT_SCOPE,
  type Embed,
} from '../kernel/kernel-reuse.js'
import type { SkillMeta } from '../skills.js'

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
  // branchement template : le hint nomme le template prêt pour les types qui en ont un
  check('blueprint : dashboard → template charts surfacé', blueprintHintSection('crée un dashboard analytics').includes('`charts`'))
  check('blueprint : carte → template leaflet surfacé', blueprintHintSection('une carte interactive de mes randonnées').includes('`leaflet`'))
  check('blueprint : jeu (sans template) → pas de mention de template', !blueprintHintSection('un petit jeu canvas arcade').includes('template prêt'))
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

// ── searchSkillsRanked : metas triées + repli mots-clés (L3) ─────────────────
{
  const skills: SkillMeta[] = [
    { name: 'paginate-table', description: 'pagination de table de données', file: '/s/paginate/SKILL.md' },
    { name: 'auth-flow', description: 'flux d’authentification login signup', file: '/s/auth/SKILL.md' },
  ]
  const fakeEmbed: Embed = async (t) =>
    [t.toLowerCase().includes('pagination') || t.toLowerCase().includes('table') ? 1 : 0, t.toLowerCase().includes('auth') || t.toLowerCase().includes('login') ? 1 : 0]
  const ranked = await searchSkillsRanked('paginer une table', { skills, bb: new Blackboard(), embed: fakeEmbed, k: 1 })
  check('searchSkillsRanked : top-1 = paginate-table', ranked[0]?.name === 'paginate-table')
  const fb = await searchSkillsRanked('login', { skills, bb: new Blackboard(), embed: async () => [], k: 1 })
  check('searchSkillsRanked : repli mots-clés → auth-flow', fb[0]?.name === 'auth-flow')
  check('searchSkillsRanked : aucun skill → []', (await searchSkillsRanked('x', { skills: [], embed: async () => [] })).length === 0)
}

// ── Layouts : type DISTINCT (L3) — index + recherche par sens + repli ────────
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-layouts-'))
  const mk = (name: string, description: string, structure: string[], tags: string[]) =>
    saveLayout(ws, {
      meta: { name, description, tags, structure, usedIn: [], createdAt: 'x', updatedAt: '1' },
      code: '// ' + name,
    })
  mk('LandingHero', 'landing produit héro + features + CTA', ['hero', 'features', 'cta'], ['landing'])
  mk('DashboardShell', 'tableau de bord sidebar + topbar + grille', ['sidebar', 'topbar', 'grid'], ['dashboard'])
  mk('MagazineGrid', 'mise en page éditoriale magazine multi-colonnes', ['masthead', 'columns'], ['editorial'])

  const fakeEmbed: Embed = async (t) => {
    const s = t.toLowerCase()
    return [s.includes('landing') || s.includes('héro') || s.includes('hero') ? 1 : 0, s.includes('dashboard') || s.includes('bord') ? 1 : 0, s.includes('magazine') || s.includes('éditorial') ? 1 : 0]
  }

  const bb = new Blackboard()
  const ranked = await searchLayoutsRanked('je veux une landing avec un héro', ws, { bb, embed: fakeEmbed, k: 1 })
  check('searchLayoutsRanked : top-1 sémantique = LandingHero', ranked[0]?.name === 'LandingHero')
  check('searchLayoutsRanked : structure conservée', JSON.stringify(ranked[0]?.structure) === JSON.stringify(['hero', 'features', 'cta']))
  check('layouts : indexés dans le Blackboard (scope dédié)', bb.keys(LAYOUT_SCOPE).length === 3)

  const dash = await searchLayoutsRanked('un tableau de bord', ws, { bb, embed: fakeEmbed, k: 1 })
  check('searchLayoutsRanked : top-1 = DashboardShell', dash[0]?.name === 'DashboardShell')

  const fb = await searchLayoutsRanked('une mise en page magazine éditoriale', ws, { bb: new Blackboard(), embed: async () => [], k: 1 })
  check('searchLayoutsRanked : repli mots-clés → MagazineGrid', fb[0]?.name === 'MagazineGrid')

  // Section de prompt (sous le seuil → tout listé, avec sections).
  const section = await relevantLayoutsSection('peu importe', ws, { embed: fakeEmbed, k: 8 })
  check('relevantLayoutsSection : liste + sections affichées', section.includes('LandingHero') && section.includes('hero › features › cta'))

  // Idempotence.
  let calls = 0
  const counting: Embed = async (t) => { calls++; return [t.length % 3, 0, 0] }
  const bbI = new Blackboard()
  await indexLayouts(ws, bbI, counting)
  const after = calls
  await indexLayouts(ws, bbI, counting)
  check('indexLayouts : idempotent (même updatedAt → pas de ré-embed)', calls === after)

  check('searchLayoutsRanked : bibliothèque vide → []', (await searchLayoutsRanked('x', fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-lay-empty-')), { embed: async () => [] })).length === 0)
  fs.rmSync(ws, { recursive: true, force: true })
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
