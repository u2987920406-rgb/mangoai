// Volet IMAGES du Gardien de clôture (#161) — L114 + L116 (limites.md).
//
// Deux failles distinctes des gates existants (#153 chercher_image, #151 vois_ecran) :
//   L114 CONTEXTE  : une image insérée est-elle réellement SUR LE SUJET du texte
//                    adjacent, pas juste "une vraie photo qui charge" ?
//   L116 CADRAGE   : une image est-elle tronquée / mal cadrée / son sujet hors-champ ?
// Aucun gate actuel n'inspecte ces deux angles — seule la présence/le chargement HTTP
// (L30) et le goût visuel global (#152) sont vérifiés.
//
// Même mécanique que l'Œil-Coach (design-coach.ts) : un VL (`dispatch('vision', ...)`)
// regarde une capture d'écran, mais avec une CONSIGNE CIBLÉE distincte de la critique
// de goût (prompt court, question fermée par ligne, pour rester lisible par un petit
// VL local — même leçon L34 que critiqueSystem). PUR côté parsing, deps injectées pour
// toute I/O (capture + VL) — testable sans navigateur ni réseau. Ne lève JAMAIS
// (fail-open, comme tous les volets du Gardien) : une réponse VL illisible ou une
// capture indisponible NEUTRALISE le volet (applicable=false), ne pénalise jamais.
//
// Gate `ELEVE_GATE_IMAGES` (flags.ts, défaut OFF) — OFF => jamais appelé, verdict du
// Gardien byte-identique à avant ce volet (même contrat que PÉDAGO).

export interface ImagesDeps {
  /** Démarre l'aperçu et capture l'écran final (pleine hauteur) en base64. `null` si
   *  pas de rendu possible (tâche non-UI, preview KO) — volet devient non-applicable. */
  captureScreen: (projectDir: string) => Promise<string | null>;
  /** Regard VL ciblé (indépendant de la critique de goût — prompt distinct, plus court). */
  dispatch: (system: string, user: string, imageBase64: string) => Promise<{ status: string; summary?: string }>;
}

export interface ImagesVerdict {
  ok: boolean;
  /** false = pas de capture exploitable → volet neutre, ne pénalise pas. */
  applicable: boolean;
  cadrageOk: boolean;
  contexteOk: boolean;
  /** true = le VL n'a rendu aucun verdict lisible (illisible/timeout) → ne pénalise pas. */
  sautee: boolean;
  raisons: string[];
}

function verdictNeutre(applicable: boolean, sautee = false): ImagesVerdict {
  return { ok: true, applicable, cadrageOk: true, contexteOk: true, sautee, raisons: [] };
}

const IMAGES_SYSTEM = [
  "Tu inspectes une capture d'écran d'application web pour deux défauts précis, UN par UN.",
  "Réponds EXACTEMENT sur deux lignes, dans cet ordre :",
  "CADRAGE: OK ou PROBLEME(<description brève de l'image concernée>)",
  "CONTEXTE: OK ou PROBLEME(<description brève : quelle image ne correspond pas à son texte/sujet>)",
  "CADRAGE = une image est visiblement tronquée, mal cadrée, ou son sujet principal est hors-champ.",
  "CONTEXTE = une image est réelle et chargée mais ne correspond PAS au sujet du texte à côté d'elle (photo générique hors-sujet).",
  "Si tout va bien sur un critère, réponds OK pour ce critère. Sois bref, pas de justification longue.",
].join("\n");

const IMAGES_USER = "Voici la capture d'écran finale de l'application. Vérifie CADRAGE et CONTEXTE comme demandé.";

/** Parse la réponse VL (tolérant : le petit modèle vision peut varier légèrement le format). PUR. */
export function parseImagesVerdict(raw: string): { cadrageOk: boolean; contexteOk: boolean; cadrageDetail: string; contexteDetail: string; lisible: boolean } {
  const cadrageM = raw.match(/CADRAGE\s*:?\s*(OK|PROBL[EÈ]ME)\s*\(?([^)\n]*)\)?/i);
  const contexteM = raw.match(/CONTEXTE\s*:?\s*(OK|PROBL[EÈ]ME)\s*\(?([^)\n]*)\)?/i);
  const lisible = Boolean(cadrageM || contexteM);
  return {
    cadrageOk: !cadrageM || /^OK/i.test(cadrageM[1]),
    contexteOk: !contexteM || /^OK/i.test(contexteM[1]),
    cadrageDetail: (cadrageM?.[2] ?? "").trim(),
    contexteDetail: (contexteM?.[2] ?? "").trim(),
    lisible,
  };
}

/** Exécute le volet IMAGES. Ne lève JAMAIS. */
export async function checkImages(projectDir: string, deps: ImagesDeps): Promise<ImagesVerdict> {
  let imageBase64: string | null;
  try {
    imageBase64 = await deps.captureScreen(projectDir);
  } catch {
    imageBase64 = null;
  }
  if (!imageBase64) return verdictNeutre(false);

  let res: { status: string; summary?: string };
  try {
    res = await deps.dispatch(IMAGES_SYSTEM, IMAGES_USER, imageBase64);
  } catch {
    return verdictNeutre(true, true);
  }

  const parsed = parseImagesVerdict(res.summary ?? "");
  if (!parsed.lisible) return verdictNeutre(true, true);

  const raisons: string[] = [];
  if (!parsed.cadrageOk) {
    raisons.push(
      `CADRAGE — une image semble tronquée/mal cadrée (sujet hors-champ) : ${parsed.cadrageDetail || "voir capture"}. ` +
        `Corrige le \`object-fit\`/\`object-position\` CSS ou remplace l'image par une mieux cadrée (chercher_image).`,
    );
  }
  if (!parsed.contexteOk) {
    raisons.push(
      `CONTEXTE — une image ne correspond pas au sujet du texte adjacent : ${parsed.contexteDetail || "voir capture"}. ` +
        `Remplace-la par une image dont le sujet colle réellement au texte (chercher_image('description précise du sujet')).`,
    );
  }

  return {
    ok: raisons.length === 0,
    applicable: true,
    cadrageOk: parsed.cadrageOk,
    contexteOk: parsed.contexteOk,
    sautee: false,
    raisons,
  };
}

// ---------------------------------------------------------------------------
// Deps réelles (preview + capture + VL réels) — utilisées par eleve-gate.ts.
// ---------------------------------------------------------------------------

async function captureScreenReel(projectDir: string): Promise<string | null> {
  // Import dynamique : évite un cycle statique avec preview.ts/vision.ts au chargement
  // du module (même précaution que d'autres volets du Gardien qui restent chargeables
  // isolément en test sans dépendance réseau/navigateur au import-time).
  const { startPreview, stopPreview } = await import("./preview.js");
  const { capturePreview } = await import("./vision.js");
  try {
    const { url } = await startPreview(projectDir);
    try {
      const buf = await capturePreview(url, { fullPage: true });
      return buf.toString("base64");
    } finally {
      await stopPreview(projectDir).catch(() => {});
    }
  } catch {
    return null;
  }
}

async function dispatchReel(system: string, user: string, imageBase64: string): Promise<{ status: string; summary?: string }> {
  const { dispatch } = await import("./brain.js");
  return dispatch("vision", system, user, { imageBase64, trustExternal: true, freeform: true });
}

export const realImagesDeps: ImagesDeps = {
  captureScreen: captureScreenReel,
  dispatch: dispatchReel,
};

/** Fonction prête à brancher dans `GateDeps.checkImages` (eleve-gate.ts). */
export function checkImagesReel(projectDir: string): Promise<ImagesVerdict> {
  return checkImages(projectDir, realImagesDeps);
}
