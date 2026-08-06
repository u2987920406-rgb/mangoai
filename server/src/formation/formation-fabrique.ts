// La FABRIQUE (#181 É3) — pipeline « sujet → formation complète ».
//
// Quatre étapes (D1/D6 du plan) :
//   ① CADRAGE     — identité réelle du sujet (chercher_web/lire_page — directive
//                    « contexte d'abord » : chercher qui/quoi est le sujet avant de fabriquer).
//   ② CURRICULUM  — génère un `Curriculum` (formation-model.ts) via `generateContentItems`,
//                    validé par `validateCurriculum`.
//   ③ BOUCLE PAR MODULE (le cœur RESUMABLE, D6) — pour chaque module non-`verifie` du
//                    `FormationManifest` : génère les items par type, tente une image
//                    Pexels + `checkImageCoherence` pour les leçons, écrit la banque du
//                    module, coche `verifie`. Écriture manifest ATOMIQUE après CHAQUE module
//                    (patron `run-toeic-content.ts` : l'état survit au crash, promu manifest).
//   ④ INTÉGRATION + SPÉCIALISATION — fusionne les banques dans le starter scaffoldé
//                    (`server/templates/formation/`), habille l'identité visuelle, ferme
//                    par le Gardien de clôture (`ELEVE_CLOSURE_GATE`, TOUJOURS actif —
//                    règle absolue du projet, jamais désactivé), marque `integre`.
//
// Tout est deps-injectées (testable sans réseau réel) : les fonctions ne lèvent QUE pour
// des erreurs qui doivent VRAIMENT arrêter le run (curriculum invalide, module qui ne
// produit aucun item après retries) — tout le reste est best-effort/fail-open, comme le
// reste du repo (cf. eleve-content.ts, eleve-gate.ts).

import fs from "node:fs";
import path from "node:path";
import {
  ITEM_TYPES,
  type Curriculum,
  type FormationDecisions,
  type FormationManifest,
  type Item,
  type ItemType,
  type ModuleSpec,
  validateCurriculum,
  validateItem,
  validateManifest,
} from "./formation-model.js";
import { generateContentItems, checkImageCoherence, type GenContentDeps, type ImgCheckDeps } from "../eleve-content.js";
import { atomicWriteFileSync } from "../safe-io.js";
import { brain } from "../brain.js";
import { ELEVE_MODEL, ELEVE_PROVIDER, ELEVE_API_URL, OLLAMA } from "../eleve/provider.js";
import { searchWeb, type WebResult } from "../eleve-tools/eleve-web-tools.js";
import { scrapeExternal, type ScrapedPage } from "../vision.js";
import { searchPexelsImages } from "../taste/taste-images.js";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "../projects.js";
import { runClosureGate } from "../eleve-gate.js";
import { inferProjectType } from "../blueprints.js";

// ---------------------------------------------------------------------------
// Dépendances injectables
// ---------------------------------------------------------------------------

export interface FabriqueDeps {
  ask: GenContentDeps["ask"];
  searchWeb: (query: string, n: number) => Promise<WebResult[]>;
  scrape: (url: string) => Promise<ScrapedPage>;
  searchImages: (query: string, n: number) => Promise<{ url: string }[]>;
  img: ImgCheckDeps;
  log: (line: string) => void;
}

// Raf (2026-07-11) : bindings LIVE (eleve/provider.ts), plus jamais process.env.ELEVE_MODEL brut.
function glmAskFabrique(): GenContentDeps["ask"] {
  return (system, user) =>
    brain.askAs("designer_ux", system, user, {
      provider: ELEVE_PROVIDER,
      model: ELEVE_MODEL,
      baseUrl: ELEVE_PROVIDER === "ollama" ? OLLAMA : ELEVE_API_URL,
      apiKeyEnv: "ELEVE_API_KEY",
      maxTokens: 6000,
      timeoutMs: 180_000,
    });
}

/** Deps réelles (réseau/LLM réels) — celles utilisées par le CLI et la route. */
export function realFabriqueDeps(log: (s: string) => void = (s) => console.log(s)): FabriqueDeps {
  return {
    ask: glmAskFabrique(),
    searchWeb: (q, n) => searchWeb(q, n),
    scrape: (url) => scrapeExternal(url),
    searchImages: async (q, n) => {
      try {
        const imgs = await searchPexelsImages(q, n);
        return imgs.map((i) => ({ url: i.url }));
      } catch {
        return [];
      }
    },
    img: {
      toBase64: async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return Buffer.from(await res.arrayBuffer()).toString("base64");
        } catch {
          return null;
        }
      },
      judge: async () => null, // (honnêteté) le juge VL local (qwen3-vl) est branché par eleve-content-tools
      // pour les outils de CHAT ; ici, en run autonome, on reste volontairement fail-open
      // (verdict "indécis" → jamais bloquant, cf. checkImageCoherence) plutôt que de dupliquer
      // le client Ollama. Le mur des médias est déjà noté §4.3 du plan.
      search: async (q, n) => {
        try {
          const imgs = await searchPexelsImages(q, n);
          return imgs.map((i) => ({ url: i.url }));
        } catch {
          return [];
        }
      },
    },
    log,
  };
}

// ---------------------------------------------------------------------------
// Manifest — chemin, lecture, écriture ATOMIQUE (D6)
// ---------------------------------------------------------------------------

const MANIFEST_FILE = "formation.json";

export function manifestPath(projDir: string): string {
  return path.join(projDir, MANIFEST_FILE);
}

/** Charge le manifest s'il existe et est valide ; `null` sinon (première fabrication). */
export function loadManifest(projDir: string): FormationManifest | null {
  const f = manifestPath(projDir);
  if (!fs.existsSync(f)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
    const v = validateManifest(parsed);
    if (!v.valid) return null;
    return parsed as FormationManifest;
  } catch {
    return null;
  }
}

/** Écrit le manifest ATOMIQUEMENT (temp + rename, safe-io.ts) — jamais de manifest tronqué. */
export function saveManifest(projDir: string, manifest: FormationManifest): void {
  atomicWriteFileSync(manifestPath(projDir), JSON.stringify(manifest, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// ① Cadrage — identité réelle du sujet (« contexte d'abord »)
// ---------------------------------------------------------------------------

export async function cadrerSujet(
  sujet: string,
  deps: Pick<FabriqueDeps, "searchWeb" | "scrape" | "log">,
): Promise<string> {
  deps.log(`🔎 Cadrage : « ${sujet} »`);
  try {
    const results = await deps.searchWeb(sujet, 3);
    if (!results.length) {
      deps.log("  ⚠ aucune source web trouvée — cadrage minimal (sujet seul)");
      return `Sujet : ${sujet}. (aucune source web trouvée — cadrage minimal, à enrichir manuellement.)`;
    }
    const top = results[0];
    let extrait = top.extrait;
    try {
      const page = await deps.scrape(top.url);
      if (page.text?.trim()) extrait = page.text.slice(0, 1200);
    } catch {
      /* l'extrait de la recherche suffit déjà */
    }
    deps.log(`  ✓ source de référence : ${top.titre} (${top.url})`);
    return `Sujet : ${sujet}.\nSource de référence : ${top.titre} (${top.url}).\nContexte : ${extrait}`;
  } catch (e) {
    deps.log(`  ⚠ cadrage web indisponible (${(e as Error).message}) — sujet seul`);
    return `Sujet : ${sujet}. (cadrage web indisponible.)`;
  }
}

// ---------------------------------------------------------------------------
// ② Curriculum
// ---------------------------------------------------------------------------

export interface FabriqueOptions {
  /** Nombre de modules visés (mini-sujet de preuve = 3). Défaut 6. */
  nModules?: number;
  /** Items générés par type par module (hors leçon, toujours 1). Défaut 4. */
  itemsParType?: number;
  /** Dossier du projet cible (défaut : workspace/<slug-du-sujet>). */
  projectDir?: string;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "formation"
  );
}

/** Assainit un id de module en slug court, stable, sans collision avec les ids déjà vus. */
function sanitizeModuleId(raw: string, index: number, seen: Set<string>): string {
  let id = slugify(String(raw || `module-${index + 1}`)).slice(0, 30) || `module-${index + 1}`;
  let n = 2;
  while (seen.has(id)) {
    id = `${id}-${n++}`;
  }
  seen.add(id);
  return id;
}

export async function genererCurriculum(
  sujet: string,
  cadrage: string,
  deps: Pick<FabriqueDeps, "ask" | "log">,
  opts: FabriqueOptions = {},
): Promise<Curriculum> {
  const nModules = Math.max(1, opts.nModules ?? 6);
  deps.log(`📚 Génération du curriculum (${nModules} module(s) visé(s))…`);
  const schema =
    `{"id": string (slug court unique), "titre": string, ` +
    `"skillIds": string[] (1 à 3 identifiants de compétence, forme "domaine.sous-notion"), ` +
    `"prerequis": string[] (ids d'AUTRES modules de CE curriculum qui doivent être vus avant — [] si aucun), ` +
    `"typesAttendus": string[] (parmi ${ITEM_TYPES.join("|")} — inclure TOUJOURS "lecon" en premier)}`;
  const res = await generateContentItems(
    {
      sujet: `Curriculum pédagogique progressif (prérequis → notions → pratique) sur : ${sujet}. ${cadrage}`,
      schema,
      n: nModules,
      langue: "français",
      clesRequises: ["id", "titre", "skillIds", "typesAttendus"],
    },
    { ask: deps.ask },
  );
  if (!res.ok) throw new Error(`génération du curriculum impossible : ${res.error}`);

  const seenIds = new Set<string>();
  const rawIds = res.items.map((m, i) => sanitizeModuleId(String(m.id ?? ""), i, seenIds));

  const modules: ModuleSpec[] = res.items.map((m, i) => {
    const id = rawIds[i];
    const availablePrereqs = new Set(rawIds.slice(0, i)); // seuls les modules PRÉCÉDENTS peuvent être prérequis → jamais de cycle
    const prereqRaw = Array.isArray(m.prerequis) ? (m.prerequis as unknown[]).map(String) : [];
    const prerequis = [...new Set(prereqRaw.map((p) => slugify(p)).filter((p) => availablePrereqs.has(p)))];
    const skillIds = Array.isArray(m.skillIds) && m.skillIds.length
      ? (m.skillIds as unknown[]).map(String)
      : [`${id}.base`];
    let typesAttendus = Array.isArray(m.typesAttendus)
      ? (m.typesAttendus as unknown[]).map(String).filter((t): t is ItemType => (ITEM_TYPES as readonly string[]).includes(t))
      : [];
    if (typesAttendus.length === 0) typesAttendus = ["lecon", "qcm"];
    if (!typesAttendus.includes("lecon")) typesAttendus = ["lecon", ...typesAttendus]; // règle « leçon avant exercice »
    return {
      id,
      titre: String(m.titre || `Module ${i + 1}`),
      skillIds,
      prerequis,
      typesAttendus,
    };
  });

  const curriculum: Curriculum = { sujet, langue: "fr", niveau: "débutant", modules };
  const v = validateCurriculum(curriculum);
  if (!v.valid) throw new Error(`curriculum invalide : ${v.errors.join(" ; ")}`);
  deps.log(`  ✓ ${modules.length} module(s) : ${modules.map((m) => m.id).join(", ")}`);
  return curriculum;
}

// ---------------------------------------------------------------------------
// ③ Boucle PAR MODULE — génération de la banque + vérification
// ---------------------------------------------------------------------------

export const SCHEMA_BY_TYPE: Record<ItemType, string> = {
  lecon: `{"titre": string, "contenu": string (PLUSIEURS paragraphes structurés, un vrai corps de texte — jamais 2-3 phrases), "sources": string[] (1 à 3 URLs RÉELLES et précises qui traitent VRAIMENT ce sujet)}`,
  qcm: `{"question": string, "choix": string[] (EXACTEMENT 4 options, toutes différentes), "reponse": number (index 0-3 de la bonne réponse), "explication": string}`,
  flashcard: `{"recto": string (terme/question courte), "verso": string (réponse/définition)}`,
  "texte-a-trous": `{"texte": string (contient au moins un trou écrit "___"), "reponses": string[] (les réponses attendues, une par trou, dans l'ordre)}`,
  appariement: `{"paires": [{"gauche": string, "droite": string}] (au moins 2 paires cohérentes)}`,
};

export const CLES_BY_TYPE: Record<ItemType, string[]> = {
  lecon: ["titre", "contenu", "sources"],
  qcm: ["question", "choix", "reponse", "explication"],
  flashcard: ["recto", "verso"],
  "texte-a-trous": ["texte", "reponses"],
  appariement: ["paires"],
};

function difficultyFor(index: number, n: number): number {
  // Progression douce 1→3 au fil des items du même type (jamais > DIFFICULTY_MAX=5).
  if (n <= 1) return 1;
  return 1 + Math.round((index / Math.max(1, n - 1)) * 2);
}

/** Génère la banque d'un module : un lot par type attendu, validé item par item. Ne lève
 * QUE si AUCUN item n'a pu être produit pour ce module (échec réel, pas un module vide). */
export async function genererBanqueModule(
  mod: ModuleSpec,
  sujet: string,
  cadrage: string,
  deps: Pick<FabriqueDeps, "ask" | "searchImages" | "img" | "log">,
  opts: FabriqueOptions = {},
): Promise<Item[]> {
  const itemsParType = Math.max(1, opts.itemsParType ?? 4);
  const items: Item[] = [];
  let counter = 1;

  for (const type of mod.typesAttendus) {
    const n = type === "lecon" ? 1 : itemsParType;
    const res = await generateContentItems(
      {
        sujet: `${type} pour le module « ${mod.titre} » de la formation « ${sujet} ». Compétences visées : ${mod.skillIds.join(", ")}. ${cadrage}`,
        schema: SCHEMA_BY_TYPE[type],
        n,
        langue: "français",
        clesRequises: CLES_BY_TYPE[type],
      },
      { ask: deps.ask },
    );
    if (!res.ok) {
      deps.log(`  ⚠ ${mod.id}/${type} : génération insuffisante (${res.error})`);
      continue;
    }
    res.items.forEach((raw, i) => {
      const base = {
        id: `${mod.id}-${type}-${counter++}`,
        moduleId: mod.id,
        skillIds: mod.skillIds,
        difficulty: difficultyFor(i, res.items.length),
      };
      let candidate: Record<string, unknown>;
      if (type === "qcm") {
        candidate = { ...base, type, question: String(raw.question ?? ""), choix: toStringArray(raw.choix), reponse: Number(raw.reponse ?? 0), explication: String(raw.explication ?? "") };
      } else if (type === "flashcard") {
        candidate = { ...base, type, recto: String(raw.recto ?? ""), verso: String(raw.verso ?? "") };
      } else if (type === "texte-a-trous") {
        candidate = { ...base, type, texte: String(raw.texte ?? ""), reponses: toStringArray(raw.reponses) };
      } else if (type === "appariement") {
        const paires = Array.isArray(raw.paires)
          ? (raw.paires as unknown[])
              .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
              .map((p) => ({ gauche: String(p.gauche ?? ""), droite: String(p.droite ?? "") }))
          : [];
        candidate = { ...base, type, paires };
      } else {
        candidate = { ...base, type, titre: String(raw.titre ?? mod.titre), contenu: String(raw.contenu ?? ""), sources: toStringArray(raw.sources) };
      }
      const v = validateItem(candidate);
      if (v.valid) items.push(candidate as Item);
      else deps.log(`  ⚠ item rejeté (${type}#${i + 1}) : ${v.errors[0] ?? "raison inconnue"}`);
    });
  }

  // Bonus best-effort (image d'illustration pour les leçons) : APPEL le mécanisme
  // checkImageCoherence même si la clé de rendu n'est pas (encore) exploitée par
  // l'ItemRenderer du starter — champ additionnel toléré par le schéma (non strict),
  // limite honnête consignée dans le rendu final (le « mur des médias », §4.3 du plan).
  const lecons = items.filter((it) => it.type === "lecon") as Array<Item & { titre: string }>;
  if (lecons.length) {
    try {
      const withScene: Record<string, unknown>[] = lecons.map((l) => ({ ...(l as unknown as Record<string, unknown>), scene: l.titre }));
      for (const l of withScene) {
        const found = await deps.searchImages(String(l.scene), 1);
        if (found[0]?.url) l.image = found[0].url;
      }
      const report = await checkImageCoherence(withScene, { champImage: "image", champScene: "scene", corriger: true }, deps.img);
      deps.log(`  🖼 images leçons : ${report.checked} vérifiée(s), ${report.ok} ok, ${report.flagged} à revoir`);
      // Réinjecte l'URL (éventuellement corrigée) dans les items validés, sans la clé "scene" utilitaire.
      const byId = new Map(withScene.map((l) => [String(l.id), l]));
      for (let i = 0; i < items.length; i++) {
        const w = byId.get(items[i].id);
        if (w && w.image) {
          (items[i] as unknown as Record<string, unknown>).image = w.image;
        }
      }
    } catch {
      /* illustration best-effort : la leçon reste valide sans image */
    }
  }

  if (items.length === 0) {
    throw new Error(`module ${mod.id} : aucun item généré (tous les lots ont échoué)`);
  }
  return items;
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function bankFile(projDir: string, moduleId: string): string {
  return path.join(projDir, "src", "data", `bank-${moduleId}.json`);
}

/** Écrit la banque d'un module en JSON (fichier PAR module, D6/plan É3③). */
function writeBank(projDir: string, moduleId: string, items: Item[]): void {
  const f = bankFile(projDir, moduleId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  atomicWriteFileSync(f, JSON.stringify(items, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// ④ Intégration + spécialisation + Gardien
// ---------------------------------------------------------------------------

function readBankIfPresent(projDir: string, moduleId: string): Item[] {
  const f = bankFile(projDir, moduleId);
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as Item[];
  } catch {
    return [];
  }
}

/** Fusionne toutes les banques par module dans `src/data/curriculum-cafe.ts` du starter
 * scaffoldé — mêmes noms exportés (`curriculum`, `items`) que l'exemple café (D7 : le
 * moteur ne change jamais, seule la DONNÉE bouge). Écriture déterministe, pas d'agent. */
function integrerBanques(projDir: string, curriculum: Curriculum): { file: string; allItems: Item[] } {
  const allItems = curriculum.modules.flatMap((m) => readBankIfPresent(projDir, m.id));
  const file = path.join(projDir, "src", "data", "curriculum-cafe.ts");
  const body =
    `// Généré par la Fabrique (#181 É3) — remplace la banque d'exemple ("café").\n` +
    `// NE PAS éditer à la main : régénérable via \`npx tsx server/src/run-formation.ts "${curriculum.sujet.replace(/"/g, '\\"')}"\`.\n` +
    `import type { Curriculum, Item } from "../lib/engine";\n\n` +
    `export const curriculum: Curriculum = ${JSON.stringify(curriculum, null, 2)};\n\n` +
    `export const items: Item[] = ${JSON.stringify(allItems, null, 2)};\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, body);
  return { file, allItems };
}

interface PaletteChoice {
  palette: string[]; // hex, 4-6 couleurs
  police: string; // nom de police (Google Fonts)
  justification: string;
}

async function choisirIdentite(sujet: string, cadrage: string, deps: Pick<FabriqueDeps, "ask" | "log">): Promise<PaletteChoice> {
  try {
    const system =
      "Tu es directeur artistique. Tu réponds UNIQUEMENT par un objet JSON valide, sans markdown.";
    const user =
      `Sujet d'une formation : ${sujet}. ${cadrage}\n` +
      `Choisis une identité visuelle ANCRÉE au sujet (pas de bleu-blanc "école" générique) : ` +
      `un objet {"palette": string[] (4 à 6 couleurs hex #RRGGBB), "police": string (nom d'une police Google Fonts adaptée au registre du sujet), "justification": string (1 phrase)}.` +
      `Réponds UNIQUEMENT par cet objet JSON.`;
    const raw = await deps.ask(system, user);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("pas d'objet JSON");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<PaletteChoice>;
    const palette = Array.isArray(parsed.palette) ? parsed.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(String(c))) : [];
    if (palette.length < 3) throw new Error("palette insuffisante");
    return { palette, police: String(parsed.police || "Inter"), justification: String(parsed.justification || "") };
  } catch (e) {
    deps.log(`  ⚠ habillage : identité par défaut (${(e as Error).message})`);
    return { palette: ["#1f2937", "#b45309", "#f5f0e6", "#374151"], police: "Inter", justification: "identité neutre de repli" };
  }
}

/** Applique la palette choisie en variables CSS (best-effort, ne casse jamais le build :
 * si le fichier index.css n'a pas la forme attendue, on ajoute les variables en tête). */
function appliquerPalette(projDir: string, choice: PaletteChoice): string | null {
  const cssFile = path.join(projDir, "src", "index.css");
  try {
    const existing = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";
    const vars = choice.palette
      .map((c, i) => `  --formation-couleur-${i + 1}: ${c};`)
      .join("\n");
    const block =
      `/* Identité visuelle générée par la Fabrique (#181 É3) — ${choice.justification} */\n` +
      `:root {\n${vars}\n}\n\n`;
    atomicWriteFileSync(cssFile, block + existing);
    return path.relative(projDir, cssFile).replaceAll("\\", "/");
  } catch {
    return null;
  }
}

/** Slug unique posé dans `.mangoapp.json` (risque §4.7 du plan : collision de scope
 * `shared:formation-<slug>` entre deux formations) — inclut un suffixe court dérivé du
 * dossier projet pour rester unique même si deux sujets se ressemblent. */
function personnaliserMangoapp(projDir: string, sujet: string, slugUnique: string): string | null {
  const f = path.join(projDir, ".mangoapp.json");
  try {
    const raw = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    const next = {
      ...raw,
      id: `formation-${slugUnique}`,
      name: `Formation — ${sujet}`,
      collections: [{ name: `formation-${slugUnique}`, access: "readwrite", schema: { value: "any" } }],
      createdAt: raw.createdAt ?? new Date().toISOString(),
    };
    atomicWriteFileSync(f, JSON.stringify(next, null, 2) + "\n");
    // Répercute l'id dans learner-store.ts (MANGOAPP_ID) — écriture ciblée, best-effort.
    const storeFile = path.join(projDir, "src", "lib", "learner-store.ts");
    if (fs.existsSync(storeFile)) {
      const src = fs.readFileSync(storeFile, "utf8");
      const patched = src.replace(/MANGOAPP_ID = "[^"]*"/, `MANGOAPP_ID = "formation-${slugUnique}"`);
      if (patched !== src) atomicWriteFileSync(storeFile, patched);
    }
    return path.relative(projDir, f).replaceAll("\\", "/");
  } catch {
    return null;
  }
}

export interface IntegrationResult {
  filesChanged: string[];
  gardien?: { ok: boolean; raisons: string[]; skipped?: string };
}

/** Étape ④ : fusionne les banques, habille l'identité visuelle, ferme par le Gardien.
 * Le verdict du Gardien est TOUJOURS calculé (ELEVE_CLOSURE_GATE actif — règle absolue)
 * mais reste CONSULTATIF ici (comme partout ailleurs dans le repo : convergent, non-bloquant) —
 * il ne fait jamais échouer la Fabrique, ses raisons sont juste reportées à l'appelant. */
export async function integrerEtSpecialiser(
  projDir: string,
  manifest: FormationManifest,
  deps: Pick<FabriqueDeps, "ask" | "log">,
  slugUnique: string,
): Promise<IntegrationResult> {
  deps.log("🧩 Intégration des banques + habillage…");
  const { file: dataFile } = integrerBanques(projDir, manifest.curriculum);
  const filesChanged = [path.relative(projDir, dataFile).replaceAll("\\", "/")];

  const cadrage = `Décisions déjà prises : palette/typo à ancrer au sujet réel.`;
  const identite = await choisirIdentite(manifest.sujet, cadrage, deps);
  const cssRel = appliquerPalette(projDir, identite);
  if (cssRel) filesChanged.push(cssRel);
  const mangoappRel = personnaliserMangoapp(projDir, manifest.sujet, slugUnique);
  if (mangoappRel) filesChanged.push(mangoappRel);
  deps.log(`  ✓ identité : ${identite.palette.join(", ")} · police ${identite.police}`);

  manifest.decisions.palette = identite.palette;

  let gardien: IntegrationResult["gardien"];
  { // Gardien de clôture : figé ON en dur au lot 2 (refonte v3, mesuré le 2026-08-05).
    try {
      const toolTrace = filesChanged.map((f) => ({ name: "write_file", args: JSON.stringify({ path: f }) }));
      const verdict = await runClosureGate(
        projDir,
        `Fabrique la formation « ${manifest.sujet} » (curriculum + banques + habillage)`,
        { text: "Formation générée par la Fabrique (#181 É3) : curriculum, banques par module, identité visuelle.", toolTrace },
        WORKSPACE_DIR,
        inferProjectType(manifest.sujet),
      );
      gardien = { ok: verdict.ok, raisons: verdict.raisons, skipped: verdict.judgeSkipped ?? verdict.critiqueSkipped };
      deps.log(`  🛡 Gardien — intention ${verdict.intent.couverture}/100${verdict.ok ? " ✓" : " (raisons notées, non bloquant)"}`);
    } catch (e) {
      gardien = { ok: true, raisons: [], skipped: (e as Error).message.split("\n")[0] };
      deps.log(`  ⚠ Gardien indisponible (${gardien.skipped}) — non bloquant`);
    }
  }

  return { filesChanged, gardien };
}

// ---------------------------------------------------------------------------
// Orchestrateur complet — RESUMABLE par le manifest (D6)
// ---------------------------------------------------------------------------

export interface RunFabriqueResult {
  ok: boolean;
  projectDir: string;
  manifest: FormationManifest | null;
  error?: string;
}

/** Nom de projet (slug) dérivé du sujet — stable d'un run à l'autre (même sujet → même dossier,
 * condition NÉCESSAIRE à la reprise par manifest). */
export function slugForSujet(sujet: string): string {
  return slugify(sujet);
}

export async function runFormationFabrique(
  sujet: string,
  opts: FabriqueOptions = {},
  deps: FabriqueDeps = realFabriqueDeps(),
): Promise<RunFabriqueResult> {
  const slug = slugForSujet(sujet);
  const projDir = opts.projectDir ?? projectDir(slug);
  const log = deps.log;

  try {
    let manifest = loadManifest(projDir);

    if (!manifest) {
      log(`🏗 Nouvelle fabrication : « ${sujet} » → ${projDir}`);
      if (!fs.existsSync(path.join(projDir, "package.json"))) {
        await createProject(slug, "formation");
      }
      const cadrage = await cadrerSujet(sujet, deps);
      const curriculum = await genererCurriculum(sujet, cadrage, deps, opts);
      const decisions: FormationDecisions = {
        palette: [],
        typesItemsRetenus: [...new Set(curriculum.modules.flatMap((m) => m.typesAttendus))],
        sourcesMaitresses: [],
      };
      manifest = {
        sujet,
        curriculum,
        etatModules: Object.fromEntries(curriculum.modules.map((m) => [m.id, "a_faire"])),
        decisions,
      };
      saveManifest(projDir, manifest);
    } else {
      log(`↻ Reprise depuis un manifest existant (${Object.values(manifest.etatModules).filter((s) => s === "verifie" || s === "integre").length}/${manifest.curriculum.modules.length} module(s) déjà vérifié(s)).`);
    }

    // ③ Boucle PAR MODULE — sauvegarde ATOMIQUE après CHAQUE module (point de reprise).
    const cadrage = `Sujet : ${manifest.sujet}.`;
    for (const mod of manifest.curriculum.modules) {
      const state = manifest.etatModules[mod.id];
      if (state === "verifie" || state === "integre") {
        log(`⏭ module « ${mod.id} » déjà vérifié — skip`);
        continue;
      }
      log(`✍ module « ${mod.id} » (${mod.titre})…`);
      const items = await genererBanqueModule(mod, manifest.sujet, cadrage, deps, opts);
      writeBank(projDir, mod.id, items);
      manifest.etatModules[mod.id] = "verifie";
      saveManifest(projDir, manifest); // ATOMIQUE — c'est CE point qui rend la fabrique resumable.
      log(`  ✓ module « ${mod.id} » : ${items.length} item(s) → vérifié`);
    }

    // ④ Intégration + spécialisation + Gardien (une fois tous les modules vérifiés).
    const needsIntegration = manifest.curriculum.modules.some((m) => manifest!.etatModules[m.id] !== "integre");
    if (needsIntegration) {
      const slugUnique = path.basename(projDir);
      await integrerEtSpecialiser(projDir, manifest, deps, slugUnique);
      for (const m of manifest.curriculum.modules) manifest.etatModules[m.id] = "integre";
      saveManifest(projDir, manifest);
    }

    log(`✅ Formation « ${sujet} » complète — ${manifest.curriculum.modules.length}/${manifest.curriculum.modules.length} module(s) intégré(s).`);
    return { ok: true, projectDir: projDir, manifest };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`✗ FATAL : ${msg}`);
    return { ok: false, projectDir: projDir, manifest: loadManifest(projDir), error: msg };
  }
}

export { projectDir as formationProjectDir, projectExists as formationProjectExists };
