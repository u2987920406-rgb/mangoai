// Catalogue de COMPOSITIONS de hero — maille « héros » du Moteur de Goût (#149 v2).
//
// Pendant de taste-directions.ts, mais sur l'autre axe du goût : là où une DIRECTION
// varie l'HABILLAGE (palette/typo/rayon…), une COMPOSITION varie la STRUCTURE du hero
// (plein écran, split, bandeau éditorial, grille brutalist…). La maille héros fixe le
// STYLE (une direction) et fait varier la COMPOSITION → on isole le signal de goût
// pour la mise en page, exactement comme la maille skin isole le signal d'habillage.
//
// Pur : pas d'I/O, pas de réseau. `layout` est la consigne structurelle injectée dans
// le prompt de redesign du hero (taste-generate.ts) ; le juge-pixels (#149 v2) note
// ensuite chaque composition rendue. Diversité par CURATION : la liste est ordonnée
// pour que des picks à pas régulier soient déjà espacés.

export interface HeroComposition {
  id: string;
  name: string; // libellé FR montré dans l'UI
  blurb: string; // une ligne FR
  layout: string; // consigne structurelle STRICTE donnée à GLM (la composition imposée)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 compositions de hero, espacées sur l'axe média↔texte et symétrie↔asymétrie.
// L'ordre alterne volontairement (immersif → split → éditorial → minimal …) pour
// qu'un échantillonnage à pas régulier tombe sur des structures contrastées.
// ─────────────────────────────────────────────────────────────────────────────
export const COMPOSITIONS: HeroComposition[] = [
  {
    id: "plein-ecran-overlay",
    name: "Plein écran immersif",
    blurb: "Image couvrant tout l'écran, titre + CTA centrés sur un scrim.",
    layout:
      "Image de fond en PLEIN ÉCRAN (100vh ou très haute), couvrant toute la zone (cover, center). " +
      "Un scrim/overlay rgba sombre par-dessus, puis le titre, le sous-titre et le CTA CENTRÉS (texte clair, lisible). " +
      "Aucune bande de couleur de remplissage visible.",
  },
  {
    id: "split-image-droite",
    name: "Split — image à droite",
    blurb: "Texte à gauche, image pleine hauteur à droite (50/50).",
    layout:
      "Deux colonnes 50/50 (flex/grid). À GAUCHE : le bloc texte (titre, sous-titre, CTA) sur fond uni de la charte, " +
      "aligné à gauche, bien aéré. À DROITE : l'image en pleine hauteur de la section (object-fit:cover, 100% de sa colonne). " +
      "Sur mobile, l'image passe au-dessus du texte (pas de débordement horizontal).",
  },
  {
    id: "bandeau-editorial",
    name: "Bandeau éditorial",
    blurb: "Grand titre serif typographique, image en bandeau large dessous.",
    layout:
      "Composition ÉDITORIALE verticale : en haut un GRAND titre typographique (style magazine) + un chapô court en colonne " +
      "étroite, puis dessous une image en BANDEAU large (pleine largeur, hauteur modérée, cover). Le CTA sous le chapô. " +
      "Beaucoup d'air, conduite par la typographie.",
  },
  {
    id: "centre-minimal",
    name: "Centré minimal",
    blurb: "Fond uni/dégradé doux, titre énorme centré, beaucoup de vide.",
    layout:
      "PAS de photo dominante : fond uni ou dégradé doux de la charte. Au CENTRE, un titre ÉNORME, un sous-titre court et " +
      "le CTA, empilés et centrés, avec énormément de vide autour (luxe d'espace). L'image éventuelle reste un accent discret, " +
      "jamais un fond plein écran.",
  },
  {
    id: "carte-flottante",
    name: "Carte flottante",
    blurb: "Image de fond floutée + carte glass centrée (titre/CTA).",
    layout:
      "Image de fond en plein écran LÉGÈREMENT FLOUTÉE/assombrie. Par-dessus, une CARTE flottante centrée (effet glass : fond " +
      "translucide, blur, rayon généreux, ombre douce) contenant le titre, le sous-titre et le CTA. La carte ne déborde pas " +
      "(largeur max, marges).",
  },
  {
    id: "diagonale-cinematique",
    name: "Diagonale cinématique",
    blurb: "Image plein écran, dégradé diagonal profond, texte en bas à gauche.",
    layout:
      "Image en plein écran (cover) avec un DÉGRADÉ DIAGONAL profond (du coin bas-gauche sombre vers le haut-droit clair) " +
      "posé dessus pour la lisibilité. Le titre + sous-titre + CTA sont alignés EN BAS À GAUCHE, ambiance cinématique premium.",
  },
  {
    id: "grille-asymetrique",
    name: "Grille asymétrique",
    blurb: "Grille magazine décalée : gros titre, image, blocs volontairement désaxés.",
    layout:
      "Grille ASYMÉTRIQUE de type suisse/brutalist : un GROS titre occupant une zone large, l'image dans une autre cellule, " +
      "le CTA dans une troisième, avec des décalages et des alignements volontairement non centrés. Filets/bordures nettes " +
      "assumés. L'ensemble reste contenu (pas de scroll horizontal).",
  },
  {
    id: "split-image-gauche",
    name: "Split — image à gauche",
    blurb: "Image pleine hauteur à gauche, texte à droite (50/50).",
    layout:
      "Deux colonnes 50/50 (flex/grid). À GAUCHE : l'image en pleine hauteur de la section (object-fit:cover, 100% de sa colonne). " +
      "À DROITE : le bloc texte (titre, sous-titre, CTA) sur fond uni de la charte, bien aéré. " +
      "Sur mobile, l'image passe au-dessus du texte (pas de débordement horizontal).",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sampler de compositions — pas régulier sur la liste ordonnée (diversité par
// construction), avec amorçage optionnel par les compositions préférées (goût appris,
// pour la future boucle fermée). Déterministe → testable.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompositionSampleOptions {
  favorIds?: string[]; // compositions préférées par le goût appris (biais d'exploitation)
  seedIndex?: number; // décalage de départ déterministe (défaut 0)
  pool?: HeroComposition[]; // override du catalogue (tests)
}

/**
 * Choisit K compositions ESPACÉES sur la liste ordonnée (pas régulier ≈ n/k).
 * - `favorIds` amorce la sélection (exploitation du goût appris), dans l'ordre donné.
 * - Le reste est complété à pas régulier en sautant les déjà-choisies.
 * Déterministe.
 */
export function sampleCompositions(k: number, opts: CompositionSampleOptions = {}): HeroComposition[] {
  const pool = opts.pool ?? COMPOSITIONS;
  const n = pool.length;
  if (n === 0) return [];
  const count = Math.max(1, Math.min(k, n));
  const selected: HeroComposition[] = [];
  const used = new Set<string>();

  // 1. Amorçage par les favoris (goût appris).
  if (opts.favorIds?.length) {
    for (const id of opts.favorIds) {
      if (selected.length >= count) break;
      const c = pool.find((x) => x.id === id);
      if (c && !used.has(c.id)) { selected.push(c); used.add(c.id); }
    }
  }

  // 2. Complément à pas régulier (≈ n/k), décalé par seedIndex, en sautant les choisies.
  const stride = Math.max(1, Math.round(n / count));
  const start = (((opts.seedIndex ?? 0) % n) + n) % n;
  for (let step = 0; step < n && selected.length < count; step++) {
    const idx = (start + step * stride) % n;
    const c = pool[idx];
    if (!used.has(c.id)) { selected.push(c); used.add(c.id); }
  }
  // 3. Filet de sécurité : si le pas a bouclé sans remplir, on prend les restantes dans l'ordre.
  for (const c of pool) {
    if (selected.length >= count) break;
    if (!used.has(c.id)) { selected.push(c); used.add(c.id); }
  }

  return selected;
}

/** Récupère une composition par id. */
export function getComposition(id: string, pool: HeroComposition[] = COMPOSITIONS): HeroComposition | undefined {
  return pool.find((c) => c.id === id);
}

/** Fragment de consigne STRICTE imposant une composition au redesign du hero. */
export function compositionBrief(c: HeroComposition): string {
  return [`COMPOSITION IMPOSÉE : « ${c.name} » — ${c.blurb}`, `Structure obligatoire : ${c.layout}`].join("\n");
}
