// ── FORGE : données du configurateur de claviers mécaniques ──────────────────

export const FORMATS = [
  {
    id: "60",
    name: "60%",
    tagline: "Compact & minimaliste",
    description: "Pas de flèches, pas de fonction. Purisme absolu pour les puristes.",
    price: 189,
    keys: 61,
    // Layout simplifié : chaque rangée = liste de largeurs (en unités u)
    rows: [
      [{ w: 1, l: "`" }, { w: 1, l: "1" }, { w: 1, l: "2" }, { w: 1, l: "3" }, { w: 1, l: "4" }, { w: 1, l: "5" }, { w: 1, l: "6" }, { w: 1, l: "7" }, { w: 1, l: "8" }, { w: 1, l: "9" }, { w: 1, l: "0" }, { w: 1, l: "-" }, { w: 1, l: "=" }, { w: 2, l: "⌫" }],
      [{ w: 1.5, l: "Tab" }, { w: 1, l: "Q" }, { w: 1, l: "W" }, { w: 1, l: "E" }, { w: 1, l: "R" }, { w: 1, l: "T" }, { w: 1, l: "Y" }, { w: 1, l: "U" }, { w: 1, l: "I" }, { w: 1, l: "O" }, { w: 1, l: "P" }, { w: 1, l: "[" }, { w: 1, l: "]" }, { w: 1.5, l: "\\" }],
      [{ w: 1.75, l: "Caps" }, { w: 1, l: "A" }, { w: 1, l: "S" }, { w: 1, l: "D" }, { w: 1, l: "F" }, { w: 1, l: "G" }, { w: 1, l: "H" }, { w: 1, l: "J" }, { w: 1, l: "K" }, { w: 1, l: "L" }, { w: 1, l: ";" }, { w: 1, l: "'" }, { w: 2.25, l: "Enter" }],
      [{ w: 2.25, l: "Shift" }, { w: 1, l: "Z" }, { w: 1, l: "X" }, { w: 1, l: "C" }, { w: 1, l: "V" }, { w: 1, l: "B" }, { w: 1, l: "N" }, { w: 1, l: "M" }, { w: 1, l: "," }, { w: 1, l: "." }, { w: 1, l: "/" }, { w: 2.75, l: "Shift" }],
      [{ w: 1.25, l: "Ctrl" }, { w: 1.25, l: "Win" }, { w: 1.25, l: "Alt" }, { w: 6.25, l: "Space" }, { w: 1.25, l: "Alt" }, { w: 1.25, l: "Fn" }, { w: 1.25, l: "Menu" }, { w: 1.25, l: "Ctrl" }],
    ],
  },
  {
    id: "65",
    name: "65%",
    tagline: "Compact + flèches",
    description: "Le compromis parfait : compacité d'un 60% avec les flèches directionnelles.",
    price: 219,
    keys: 67,
    rows: [
      [{ w: 1, l: "`" }, { w: 1, l: "1" }, { w: 1, l: "2" }, { w: 1, l: "3" }, { w: 1, l: "4" }, { w: 1, l: "5" }, { w: 1, l: "6" }, { w: 1, l: "7" }, { w: 1, l: "8" }, { w: 1, l: "9" }, { w: 1, l: "0" }, { w: 1, l: "-" }, { w: 1, l: "=" }, { w: 1.5, l: "⌫" }, { w: 0.5, l: "Del" }],
      [{ w: 1.5, l: "Tab" }, { w: 1, l: "Q" }, { w: 1, l: "W" }, { w: 1, l: "E" }, { w: 1, l: "R" }, { w: 1, l: "T" }, { w: 1, l: "Y" }, { w: 1, l: "U" }, { w: 1, l: "I" }, { w: 1, l: "O" }, { w: 1, l: "P" }, { w: 1, l: "[" }, { w: 1, l: "]" }, { w: 1.5, l: "\\" }, { w: 0.5, l: "PgUp" }],
      [{ w: 1.75, l: "Caps" }, { w: 1, l: "A" }, { w: 1, l: "S" }, { w: 1, l: "D" }, { w: 1, l: "F" }, { w: 1, l: "G" }, { w: 1, l: "H" }, { w: 1, l: "J" }, { w: 1, l: "K" }, { w: 1, l: "L" }, { w: 1, l: ";" }, { w: 1, l: "'" }, { w: 2.25, l: "Enter" }, { w: 0.5, l: "PgDn" }],
      [{ w: 2.25, l: "Shift" }, { w: 1, l: "Z" }, { w: 1, l: "X" }, { w: 1, l: "C" }, { w: 1, l: "V" }, { w: 1, l: "B" }, { w: 1, l: "N" }, { w: 1, l: "M" }, { w: 1, l: "," }, { w: 1, l: "." }, { w: 1, l: "/" }, { w: 1.75, l: "Shift" }, { w: 0.5, l: "↑" }, { w: 0.5, l: "End" }],
      [{ w: 1.25, l: "Ctrl" }, { w: 1.25, l: "Win" }, { w: 1.25, l: "Alt" }, { w: 6.25, l: "Space" }, { w: 1.25, l: "Alt" }, { w: 1.25, l: "Fn" }, { w: 1.25, l: "Menu" }, { w: 1.25, l: "Ctrl" }, { w: 0.5, l: "←" }, { w: 0.5, l: "↓" }, { w: 0.5, l: "→" }],
    ],
  },
  {
    id: "75",
    name: "75%",
    tagline: "Compact + fonction",
    description: "Toutes les touches de fonction en colonne latérale. Le meilleur des deux mondes.",
    price: 249,
    keys: 84,
    rows: [
      [{ w: 1, l: "Esc" }, { w: 1, l: "F1" }, { w: 1, l: "F2" }, { w: 1, l: "F3" }, { w: 1, l: "F4" }, { w: 1, l: "F5" }, { w: 1, l: "F6" }, { w: 1, l: "F7" }, { w: 1, l: "F8" }, { w: 1, l: "F9" }, { w: 1, l: "F10" }, { w: 1, l: "F11" }, { w: 1, l: "F12" }, { w: 1, l: "Del" }],
      [{ w: 1, l: "`" }, { w: 1, l: "1" }, { w: 1, l: "2" }, { w: 1, l: "3" }, { w: 1, l: "4" }, { w: 1, l: "5" }, { w: 1, l: "6" }, { w: 1, l: "7" }, { w: 1, l: "8" }, { w: 1, l: "9" }, { w: 1, l: "0" }, { w: 1, l: "-" }, { w: 1, l: "=" }, { w: 2, l: "⌫" }],
      [{ w: 1.5, l: "Tab" }, { w: 1, l: "Q" }, { w: 1, l: "W" }, { w: 1, l: "E" }, { w: 1, l: "R" }, { w: 1, l: "T" }, { w: 1, l: "Y" }, { w: 1, l: "U" }, { w: 1, l: "I" }, { w: 1, l: "O" }, { w: 1, l: "P" }, { w: 1, l: "[" }, { w: 1, l: "]" }, { w: 1.5, l: "\\" }],
      [{ w: 1.75, l: "Caps" }, { w: 1, l: "A" }, { w: 1, l: "S" }, { w: 1, l: "D" }, { w: 1, l: "F" }, { w: 1, l: "G" }, { w: 1, l: "H" }, { w: 1, l: "J" }, { w: 1, l: "K" }, { w: 1, l: "L" }, { w: 1, l: ";" }, { w: 1, l: "'" }, { w: 2.25, l: "Enter" }],
      [{ w: 2.25, l: "Shift" }, { w: 1, l: "Z" }, { w: 1, l: "X" }, { w: 1, l: "C" }, { w: 1, l: "V" }, { w: 1, l: "B" }, { w: 1, l: "N" }, { w: 1, l: "M" }, { w: 1, l: "," }, { w: 1, l: "." }, { w: 1, l: "/" }, { w: 2.75, l: "Shift" }],
      [{ w: 1.25, l: "Ctrl" }, { w: 1.25, l: "Win" }, { w: 1.25, l: "Alt" }, { w: 6.25, l: "Space" }, { w: 1.25, l: "Alt" }, { w: 1.25, l: "Fn" }, { w: 1.25, l: "Menu" }, { w: 1.25, l: "Ctrl" }],
    ],
  },
  {
    id: "tkl",
    name: "TKL",
    tagline: "Tenkeyless classique",
    description: "Le standard de l'industrie. Toutes les touches, sans pavé numérique.",
    price: 279,
    keys: 87,
    rows: [
      [{ w: 1, l: "Esc" }, { w: 0.25, l: "" }, { w: 1, l: "F1" }, { w: 1, l: "F2" }, { w: 1, l: "F3" }, { w: 1, l: "F4" }, { w: 0.25, l: "" }, { w: 1, l: "F5" }, { w: 1, l: "F6" }, { w: 1, l: "F7" }, { w: 1, l: "F8" }, { w: 0.25, l: "" }, { w: 1, l: "F9" }, { w: 1, l: "F10" }, { w: 1, l: "F11" }, { w: 1, l: "F12" }, { w: 0.25, l: "" }, { w: 1, l: "PrtSc" }, { w: 1, l: "ScrLk" }, { w: 1, l: "Pause" }],
      [{ w: 1, l: "`" }, { w: 1, l: "1" }, { w: 1, l: "2" }, { w: 1, l: "3" }, { w: 1, l: "4" }, { w: 1, l: "5" }, { w: 1, l: "6" }, { w: 1, l: "7" }, { w: 1, l: "8" }, { w: 1, l: "9" }, { w: 1, l: "0" }, { w: 1, l: "-" }, { w: 1, l: "=" }, { w: 2, l: "⌫" }, { w: 0.25, l: "" }, { w: 1, l: "Ins" }, { w: 1, l: "Home" }, { w: 1, l: "PgUp" }],
      [{ w: 1.5, l: "Tab" }, { w: 1, l: "Q" }, { w: 1, l: "W" }, { w: 1, l: "E" }, { w: 1, l: "R" }, { w: 1, l: "T" }, { w: 1, l: "Y" }, { w: 1, l: "U" }, { w: 1, l: "I" }, { w: 1, l: "O" }, { w: 1, l: "P" }, { w: 1, l: "[" }, { w: 1, l: "]" }, { w: 1.5, l: "\\" }, { w: 0.25, l: "" }, { w: 1, l: "Del" }, { w: 1, l: "End" }, { w: 1, l: "PgDn" }],
      [{ w: 1.75, l: "Caps" }, { w: 1, l: "A" }, { w: 1, l: "S" }, { w: 1, l: "D" }, { w: 1, l: "F" }, { w: 1, l: "G" }, { w: 1, l: "H" }, { w: 1, l: "J" }, { w: 1, l: "K" }, { w: 1, l: "L" }, { w: 1, l: ";" }, { w: 1, l: "'" }, { w: 2.25, l: "Enter" }],
      [{ w: 2.25, l: "Shift" }, { w: 1, l: "Z" }, { w: 1, l: "X" }, { w: 1, l: "C" }, { w: 1, l: "V" }, { w: 1, l: "B" }, { w: 1, l: "N" }, { w: 1, l: "M" }, { w: 1, l: "," }, { w: 1, l: "." }, { w: 1, l: "/" }, { w: 2.75, l: "Shift" }, { w: 0.25, l: "" }, { w: 0, l: "" }, { w: 1, l: "↑" }, { w: 0, l: "" }],
      [{ w: 1.25, l: "Ctrl" }, { w: 1.25, l: "Win" }, { w: 1.25, l: "Alt" }, { w: 6.25, l: "Space" }, { w: 1.25, l: "Alt" }, { w: 1.25, l: "Win" }, { w: 1.25, l: "Menu" }, { w: 1.25, l: "Ctrl" }, { w: 0.25, l: "" }, { w: 1, l: "←" }, { w: 1, l: "↓" }, { w: 1, l: "→" }],
    ],
  },
];

export const SWITCHES = [
  {
    id: "red",
    name: "Crimson Linear",
    type: "Linéaire",
    force: "45g",
    sound: "Silencieux",
    color: "#E8624A",
    description: "Frappe fluide et silencieuse. Idéal pour le gaming rapide et le bureautique intensive.",
    price: 0,
  },
  {
    id: "brown",
    name: "Bronze Tactile",
    type: "Tactile",
    force: "55g",
    sound: "Doux",
    color: "#C89060",
    description: "Bump tactile discret sans clic audible. Le polyvalent par excellence.",
    price: 15,
  },
  {
    id: "blue",
    name: "Azure Clicky",
    type: "Clicky",
    force: "50g",
    sound: "Clic audible",
    color: "#5B9BD5",
    description: "Clic mécanique net à chaque pression. Pour ceux qui aiment entendre ce qu'ils tapent.",
    price: 15,
  },
  {
    id: "black",
    name: "Onyx Heavy",
    type: "Linéaire",
    force: "80g",
    sound: "Silencieux",
    color: "#3A3A3A",
    description: "Résistance lourde pour une frappe maîtrisée. Prisé des typistes experts.",
    price: 25,
  },
];

export const KEYCAPS = [
  {
    id: "obsidian",
    name: "Obsidian Noir",
    description: "Noir mat profond, légères de métal brossé. Élégance industrielle.",
    baseColor: "#1a1d22",
    accentColor: "#8a8f98",
    legendColor: "#e1ded8",
    price: 0,
  },
  {
    id: "mango",
    name: "Mango Forge",
    description: "Base anthracite avec touches d'accent en mango chaud. La signature FORGE.",
    baseColor: "#262a30",
    accentColor: "#F2A33C",
    legendColor: "#F2A33C",
    price: 35,
  },
  {
    id: "ivory",
    name: "Ivoire Vintage",
    description: "Crème rétro avec légendes en gris ardoise. Nostalgie des années 80.",
    baseColor: "#D4C9B8",
    accentColor: "#8B7355",
    legendColor: "#5A4A3A",
    price: 45,
  },
  {
    id: "coral",
    name: "Coral Reef",
    description: "Base corail vibrante avec légendes blanches. Pour les audacieux.",
    baseColor: "#E8624A",
    accentColor: "#1a1d22",
    legendColor: "#FFFFFF",
    price: 45,
  },
];

export const OPTIONS = [
  {
    id: "rgb",
    name: "Rétroéclairage RGB",
    description: "16,8M couleurs, effets personnalisables via logiciel.",
    price: 40,
  },
  {
    id: "wristrest",
    name: "Repose-poignet forgé",
    description: "Repose-poignet en aluminium anodisé assorti au châssis.",
    price: 35,
  },
];

export const GALLERY_ITEMS = [
  {
    id: 1,
    title: "Noir Forge",
    style: "custom",
    image: "https://images.pexels.com/photos/5944189/pexels-photo-5944189.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Châssis alu anodisé noir, keycaps Obsidian, switches Crimson Linear.",
  },
  {
    id: 2,
    title: "Pastel Dream",
    style: "artisan",
    image: "https://images.pexels.com/photos/35504606/pexels-photo-35504606.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Keycaps artisanaux pastel, switches Bronze Tactile, câble USB custom.",
  },
  {
    id: 3,
    title: "RGB Spectrum",
    style: "custom",
    image: "https://images.pexels.com/photos/5380584/pexels-photo-5380584.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Rétroéclairage RGB 16,8M couleurs, keycaps translucides, switches Azure Clicky.",
  },
  {
    id: 4,
    title: "Ivory Retro",
    style: "retro",
    image: "https://images.pexels.com/photos/35655038/pexels-photo-35655038.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Keycaps Ivoire Vintage, câble USB tressé rétractable, esthétique 80s.",
  },
  {
    id: 5,
    title: "Minimal White",
    style: "minimal",
    image: "https://images.pexels.com/photos/18114576/pexels-photo-18114576.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Blanc pur, lignes épurées, switches Bronze Tactile. Le minimalisme absolu.",
  },
  {
    id: 6,
    title: "Beige Classic",
    style: "retro",
    image: "https://images.pexels.com/photos/35471660/pexels-photo-35471660.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Keycaps beige custom, switches exposés, palette rétro chaleureuse.",
  },
  {
    id: 7,
    title: "Dark Desk",
    style: "minimal",
    image: "https://images.pexels.com/photos/15372896/pexels-photo-15372896.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Setup sombre minimaliste, châssis alu brossé, keycaps Obsidian.",
  },
  {
    id: 8,
    title: "Colorful Collection",
    style: "artisan",
    image: "https://images.pexels.com/photos/34877295/pexels-photo-34877295.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Collection de keycaps artisanaux colorés, switches variés sur mesure.",
  },
  {
    id: 9,
    title: "Gaming Setup",
    style: "custom",
    image: "https://images.pexels.com/photos/34928007/pexels-photo-34928007.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    description: "Configuration gaming avec RGB, switches Crimson Linear, repose-poignet forgé.",
  },
];

export const GALLERY_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "custom", label: "Custom" },
  { id: "artisan", label: "Artisan" },
  { id: "minimal", label: "Minimal" },
  { id: "retro", label: "Rétro" },
];

// ── Helpers de prix ──────────────────────────────────────────────────────────

export function calculatePrice(config) {
  const fmt = FORMATS.find((f) => f.id === config.formatId);
  const sw = SWITCHES.find((s) => s.id === config.switchId);
  const kc = KEYCAPS.find((k) => k.id === config.keycapId);
  let total = 0;
  if (fmt) total += fmt.price;
  if (sw) total += sw.price;
  if (kc) total += kc.price;
  for (const optId of config.optionIds) {
    const opt = OPTIONS.find((o) => o.id === optId);
    if (opt) total += opt.price;
  }
  return total;
}

export function formatPrice(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

export function buildConfigSummary(config) {
  const fmt = FORMATS.find((f) => f.id === config.formatId);
  const sw = SWITCHES.find((s) => s.id === config.switchId);
  const kc = KEYCAPS.find((k) => k.id === config.keycapId);
  const opts = config.optionIds
    .map((id) => OPTIONS.find((o) => o.id === id)?.name)
    .filter(Boolean);
  return {
    format: fmt?.name ?? "—",
    switchName: sw?.name ?? "—",
    keycap: kc?.name ?? "—",
    options: opts,
    keys: fmt?.keys ?? 0,
  };
}