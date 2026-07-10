// example-data.js
// Cartographie d'une VRAIE décision : « Faut-il migrer notre stack ? »
// 20 nœuds typés (concept / question / preuve / risque) + liens typés
// (cause→effet, soutient, contredit, dépend). Inclut un orphelin volontaire
// pour démontrer la détection de nœuds isolés.

// ── Vocabulaire sémantique des types de nœuds ────────────
export const NODE_TYPES = {
  concept:  { label: 'Concept',  accent: '#8b93a7', glyph: '◇' }, // slate — substrat neutre
  question: { label: 'Question', accent: '#22d3ee', glyph: '?' }, // cyan électrique — l'accent
  preuve:   { label: 'Preuve',   accent: '#34d399', glyph: '✓' }, // emerald — ancré au réel
  risque:   { label: 'Risque',   accent: '#fb7185', glyph: '!' }, // rose — danger
};

// ── Vocabulaire des liens typés ──────────────────────────
export const EDGE_TYPES = {
  cause:      { label: 'cause → effet', color: '#22d3ee', dash: null,     animated: true  },
  soutient:   { label: 'soutient',      color: '#34d399', dash: null,     animated: false },
  contredit:  { label: 'contredit',     color: '#fb7185', dash: '6 4',    animated: false },
  depend:     { label: 'dépend de',     color: '#8b93a7', dash: '2 5',    animated: false },
};

const N = (id, type, label, desc) => ({
  id,
  type: 'analytic',
  position: { x: 0, y: 0 },
  data: { type, label, desc },
});

const E = (id, source, target, rel) => ({
  id,
  source,
  target,
  data: { rel },
});

export const EXAMPLE_NODES = [
  N('q1', 'question', 'Faut-il migrer notre stack ?', 'Décision structurante Q3'),
  N('q2', 'question', 'Le coût de migration est-il soutenable ?', 'Budget + fenêtre de gel'),
  N('q3', 'question', 'Perd-on en stabilité pendant la bascule ?', 'Risque opérationnel'),

  N('c1', 'concept', 'Stack legacy (monolithe Rails)', 'Existant, 6 ans'),
  N('c2', 'concept', 'Cible : edge runtime + React 19', 'Architecture visée'),
  N('c3', 'concept', 'Dette technique croissante', 'Ralentit chaque feature'),
  N('c4', 'concept', 'Vélocité produit', 'Débit de l’équipe'),
  N('c5', 'concept', 'Time-to-market', 'Avance concurrentielle'),
  N('c6', 'concept', 'Recrutement facilité', 'Stack moderne attractive'),

  N('p1', 'preuve', 'Build CI : 14 min', 'Mesuré sur main'),
  N('p2', 'preuve', '3 incidents prod / mois', 'Post-mortems liés au legacy'),
  N('p3', 'preuve', 'POC edge : −60 % latence p95', 'Prototype validé'),
  N('p4', 'preuve', '2 devs déjà formés React 19', 'Compétence interne'),
  N('p5', 'preuve', 'Benchmark : +35 % throughput', 'Charge simulée'),

  N('r1', 'risque', 'Gel des features : 6 semaines', 'Coût d’opportunité'),
  N('r2', 'risque', 'Écosystème edge immature', 'Libs manquantes'),
  N('r3', 'risque', 'Perte de connaissance tribale', 'Legacy non documenté'),
  N('r4', 'risque', 'Régression SEO pendant bascule', 'Rendu à surveiller'),

  N('o1', 'concept', 'Piste : réécriture Rust ?', 'Non reliée — à instruire'),
];

export const EXAMPLE_EDGES = [
  // la dette pousse à migrer (chaîne causale)
  E('e1', 'c3', 'p1', 'cause'),
  E('e2', 'c3', 'p2', 'cause'),
  E('e3', 'c3', 'q1', 'cause'),
  // preuves qui soutiennent la migration
  E('e4', 'p1', 'q1', 'soutient'),
  E('e5', 'p2', 'q1', 'soutient'),
  E('e6', 'p3', 'c2', 'soutient'),
  E('e7', 'p5', 'c2', 'soutient'),
  E('e8', 'p4', 'q2', 'soutient'),
  // bénéfices en chaîne
  E('e9', 'c2', 'c4', 'cause'),
  E('e10', 'c4', 'c5', 'cause'),
  E('e11', 'c2', 'c6', 'cause'),
  E('e12', 'c6', 'q1', 'soutient'),
  // dépendances entre questions
  E('e13', 'q2', 'q1', 'depend'),
  E('e14', 'q3', 'q1', 'depend'),
  E('e15', 'c1', 'c2', 'depend'),
  // risques qui contredisent / pèsent
  E('e16', 'r1', 'q1', 'contredit'),
  E('e17', 'r2', 'c2', 'contredit'),
  E('e18', 'r4', 'q1', 'contredit'),
  E('e19', 'r3', 'q3', 'cause'),
  E('e20', 'r2', 'r3', 'cause'),
  E('e21', 'r1', 'q2', 'contredit'),
];
