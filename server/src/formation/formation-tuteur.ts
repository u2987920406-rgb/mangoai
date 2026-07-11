// Le TUTEUR (#181 É5) — boucle adaptative LENTE (plan D4, deuxième moitié).
//
// La boucle RAPIDE (client, formation-adaptive.ts) est déterministe et
// s'exécute côté navigateur. Le Tuteur, lui, tourne côté serveur, de façon
// ASYNCHRONE : il lit le modèle apprenant miroité dans la collection partagée
// (D2, shared-data.ts), diagnostique les faiblesses PERSISTANTES avec le MÊME
// spine pur qu'É1 (`diagnoseWeaknesses`), et — seulement s'il y a vraiment
// quelque chose à corriger — génère un lot d'exercices CIBLÉS via la même
// mécanique que la Fabrique (É3, generateContentItems), le valide (schéma É1
// + cohérence image), et l'écrit en `bank-ext:<module>` : l'app cliente du
// starter É2 l'absorbe par SSE (subscribeBankExt, learner-store.ts), sans
// jamais régénérer l'app (D7 : le contenu voyage par la donnée).
//
// Discipline du repo : PUR pour le diagnostic + la construction du prompt
// ciblé (aucune I/O dans buildSujetCible/groupWeaknessesByModule/mergeBankExt) ;
// glue réseau/disque/LLM assumée (via deps injectées) pour l'orchestration,
// comme formation-fabrique.ts et stratege-run.ts. Ne lève jamais côté
// orchestrateur : fail-open par formation (le nocturne ne doit jamais
// s'arrêter pour une formation en panne).

import fs from "node:fs";
import path from "node:path";
import { flag } from "../flags.js";
import { diagnoseWeaknesses, type DiagnoseOptions, type WeaknessDiagnosis } from "./formation-adaptive.js";
import {
  ITEM_TYPES,
  validateItem,
  type Curriculum,
  type Item,
  type ItemType,
  type ModuleSpec,
  type LearnerModel,
  validateLearnerModel,
} from "./formation-model.js";
import { generateContentItems, checkImageCoherence, type GenContentDeps, type ImgCheckDeps } from "../eleve-content.js";
import { SCHEMA_BY_TYPE, CLES_BY_TYPE, loadManifest as loadFormationManifest } from "./formation-fabrique.js";
import { loadManifest as loadMangoAppManifest } from "../mango-app-contract.js";
import { getDoc as sharedGetDoc, putDoc as sharedPutDoc } from "../shared-data.js";
import { askLLM } from "../llm/llm-engine.js";
import { ELEVE_MODEL, ELEVE_PROVIDER, ELEVE_API_URL, OLLAMA } from "../eleve/provider.js";
import { searchPexelsImages } from "../taste/taste-images.js";
import { WORKSPACE_DIR } from "../projects.js";

// ---------------------------------------------------------------------------
// PUR — diagnostic → groupement par module → prompt ciblé → fusion de banque.
// ---------------------------------------------------------------------------

/** Regroupe les faiblesses diagnostiquées par module qui exerce le skill concerné
 * (un skill peut appartenir à plusieurs modules ; on cite la faiblesse dans
 * CHAQUE module qui la travaille — c'est là que l'exercice ciblé doit atterrir). */
export function groupWeaknessesByModule(
  curriculum: Curriculum,
  diagnosis: WeaknessDiagnosis[],
): Map<ModuleSpec, WeaknessDiagnosis[]> {
  const out = new Map<ModuleSpec, WeaknessDiagnosis[]>();
  for (const mod of curriculum.modules) {
    const concerned = diagnosis.filter((d) => mod.skillIds.includes(d.skillId));
    if (concerned.length) out.set(mod, concerned);
  }
  return out;
}

/** Construit le SUJET du lot ciblé : cite PRÉCISÉMENT les compétences faibles,
 * leur maîtrise mesurée, et le pattern d'erreur récurrent observé — jamais un
 * prompt générique (plan D4 : « le sujet du lot cite les erreurs réelles »). PUR. */
export function buildSujetCible(sujetFormation: string, mod: ModuleSpec, weaknesses: WeaknessDiagnosis[]): string {
  const details = weaknesses
    .map((w) => {
      const pattern =
        w.recentConsecutiveErrors >= 2
          ? ` (pattern d'erreur récurrent : ${w.recentConsecutiveErrors} échecs consécutifs récents)`
          : "";
      return `« ${w.skillId} » (maîtrise mesurée ${Math.round(w.mastery * 100)}% sur ${w.attempts} tentative(s)${pattern})`;
    })
    .join(" ; ");
  return (
    `Exercices de REMÉDIATION pour le module « ${mod.titre} » de la formation « ${sujetFormation} ». ` +
    `L'apprenant a des DIFFICULTÉS PERSISTANTES précises et mesurées sur : ${details}. ` +
    `Fabrique des items qui isolent et retravaillent SPÉCIFIQUEMENT ces points faibles (pas un rappel générique du module) — ` +
    `varie l'angle par rapport aux exercices déjà vus pour ne pas juste répéter la même formulation.`
  );
}

/** Fusionne un lot nouvellement généré avec la banque d'extension déjà présente
 * (le Tuteur peut tourner plusieurs fois sur le même module) : dédoublonnage
 * par id (le plus récent l'emporte), borné à `max` items pour ne jamais faire
 * grossir `bank-ext:<module>` sans limite. PUR. */
export function mergeBankExt(existing: unknown, added: Item[], max = 200): Item[] {
  const prev: Item[] = Array.isArray(existing) ? (existing as Item[]).filter((it) => validateItem(it).valid) : [];
  const byId = new Map<string, Item>();
  for (const it of prev) byId.set(it.id, it);
  for (const it of added) byId.set(it.id, it); // le nouveau écrase l'ancien à id égal
  const merged = [...byId.values()];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

/** Nom exact de la collection partagée que lit l'app cliente (learner-store.ts :
 * `COLLECTION = MANGOAPP_ID`, où MANGOAPP_ID est déjà lui-même "formation-<slug>"
 * — cf. personnaliserMangoapp dans formation-fabrique.ts). Corrigé #181 É6 : un
 * ancien double-préfixe (`formation-${mangoAppId}`) désynchronisait le Tuteur du
 * client et de `.mangoapp.json` (qui déclare la collection en préfixe simple).
 * Le contrat du Tuteur est de matcher ce que le client lit réellement. */
export function sharedCollectionForMangoAppId(mangoAppId: string): string {
  return mangoAppId;
}

// ---------------------------------------------------------------------------
// Dépendances injectables (I/O réseau/LLM + store partagé — testable en pur).
// ---------------------------------------------------------------------------

export interface TuteurDeps {
  /** Lit un document de la collection partagée (défaut : shared-data.ts en process).
   *  Peut être synchrone (accès direct au Blackboard) ou asynchrone (ex. un
   *  client HTTP /api/shared, utile quand l'appelant tourne dans un AUTRE
   *  process que le serveur — cf. `_prove-tuteur.ts`, preuve API réelle). */
  getDoc: (collection: string, key: string) => unknown | Promise<unknown>;
  /** Écrit un document de la collection partagée. */
  putDoc: (collection: string, key: string, value: unknown) => void | Promise<void>;
  ask: GenContentDeps["ask"];
  img: ImgCheckDeps;
  log: (line: string) => void;
  /** Horloge injectable (unicité des ids générés) — tests: date fixe. */
  now: () => Date;
}

// Raf (2026-07-11) : bindings LIVE (eleve/provider.ts), plus jamais process.env.ELEVE_MODEL brut.
function glmAskTuteur(): GenContentDeps["ask"] {
  return (system, user) =>
    askLLM(system, user, {
      provider: ELEVE_PROVIDER,
      model: ELEVE_MODEL,
      baseUrl: ELEVE_PROVIDER === "ollama" ? OLLAMA : ELEVE_API_URL,
      apiKeyEnv: "ELEVE_API_KEY",
      maxTokens: 6000,
      timeoutMs: 180_000,
    });
}

export function realTuteurDeps(log: (s: string) => void = (s) => console.log(s)): TuteurDeps {
  return {
    getDoc: sharedGetDoc,
    putDoc: (collection, key, value) => { sharedPutDoc(collection, key, value); },
    ask: glmAskTuteur(),
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
      judge: async () => null, // fail-open, cf. formation-fabrique.ts (mêmes raisons)
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
    now: () => new Date(),
  };
}

// ---------------------------------------------------------------------------
// Génération du lot ciblé pour UN module — mécanique EXACTE de la Fabrique
// (genererBanqueModule), restreinte aux types d'items adaptés à la remédiation
// (qcm + flashcard : des drills courts, pas une nouvelle leçon).
// ---------------------------------------------------------------------------

const TYPES_REMEDIATION: ItemType[] = (["qcm", "flashcard"] as ItemType[]).filter((t) =>
  (ITEM_TYPES as readonly string[]).includes(t),
);

export interface TuteurOptions extends DiagnoseOptions {
  /** Items générés par type de remédiation. Défaut 3. */
  itemsParType?: number;
  /** Types d'items utilisés pour la remédiation. Défaut [qcm, flashcard]. */
  typesRemediation?: ItemType[];
  /** Nombre maximal de modules traités par cycle (borne le coût d'un run). Défaut 3. */
  maxModulesParCycle?: number;
}

async function genererLotCible(
  mod: ModuleSpec,
  sujetFormation: string,
  weaknesses: WeaknessDiagnosis[],
  deps: Pick<TuteurDeps, "ask" | "log" | "now">,
  opts: TuteurOptions,
): Promise<Item[]> {
  const itemsParType = Math.max(1, opts.itemsParType ?? 3);
  const types = opts.typesRemediation?.length ? opts.typesRemediation : TYPES_REMEDIATION;
  const sujet = buildSujetCible(sujetFormation, mod, weaknesses);
  const skillIdsCibles = [...new Set(weaknesses.map((w) => w.skillId))];
  const uniq = deps.now().getTime();
  const items: Item[] = [];
  let counter = 1;

  for (const type of types) {
    const res = await generateContentItems(
      { sujet, schema: SCHEMA_BY_TYPE[type], n: itemsParType, langue: "français", clesRequises: CLES_BY_TYPE[type] },
      { ask: deps.ask },
    );
    if (!res.ok) {
      deps.log(`  ⚠ tuteur/${mod.id}/${type} : génération insuffisante (${res.error})`);
      continue;
    }
    res.items.forEach((raw) => {
      const base = {
        id: `${mod.id}-remedie-${type}-${uniq}-${counter++}`,
        moduleId: mod.id,
        skillIds: skillIdsCibles,
        difficulty: 2, // remédiation : on rebâtit depuis un cran facile-modéré
      };
      let candidate: Record<string, unknown>;
      if (type === "qcm") {
        candidate = {
          ...base, type,
          question: String(raw.question ?? ""),
          choix: Array.isArray(raw.choix) ? raw.choix.map(String) : [],
          reponse: Number(raw.reponse ?? 0),
          explication: String(raw.explication ?? ""),
        };
      } else if (type === "flashcard") {
        candidate = { ...base, type, recto: String(raw.recto ?? ""), verso: String(raw.verso ?? "") };
      } else {
        return; // type de remédiation non pris en charge (garde future extension)
      }
      const v = validateItem(candidate);
      if (v.valid) items.push(candidate as Item);
      else deps.log(`  ⚠ item de remédiation rejeté (${type}) : ${v.errors[0] ?? "raison inconnue"}`);
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Orchestrateur — UNE formation.
// ---------------------------------------------------------------------------

export interface TuteurRunResult {
  ran: boolean;
  modulesTraites: string[];
  itemsEcrits: number;
  raison?: string;
}

function noOp(raison: string): TuteurRunResult {
  return { ran: false, modulesTraites: [], itemsEcrits: 0, raison };
}

/**
 * Fait tourner le Tuteur sur UNE formation identifiée par sa collection
 * partagée (`formation-<mangoAppId>`, cf. `sharedCollectionForMangoAppId`) et
 * son curriculum (le `FormationManifest` lu sur disque, D6). Ne lève JAMAIS :
 * une erreur devient un `raison` dans le résultat (fail-open — l'appelant
 * nocturne n'a jamais besoin d'un try/catch autour de cet appel, mais on en
 * pose un quand même côté cycle multi-formations par prudence défensive).
 */
export async function runTuteurSurFormation(
  collection: string,
  curriculum: Curriculum,
  deps: TuteurDeps,
  opts: TuteurOptions = {},
): Promise<TuteurRunResult> {
  let learnerRaw: unknown;
  try {
    learnerRaw = await deps.getDoc(collection, "learner");
  } catch (e) {
    return noOp(`lecture du modèle apprenant impossible (${(e as Error).message})`);
  }
  if (learnerRaw === undefined) return noOp("aucun modèle apprenant miroité (rien à diagnostiquer)");
  const verdict = validateLearnerModel(learnerRaw);
  if (!verdict.valid) return noOp(`modèle apprenant invalide (${verdict.errors[0] ?? "schéma"})`);
  const learner = learnerRaw as LearnerModel;

  const diagnosis = diagnoseWeaknesses(learner, opts);
  if (diagnosis.length === 0) return noOp("aucune faiblesse persistante détectée — rien à générer");

  const groups = groupWeaknessesByModule(curriculum, diagnosis);
  if (groups.size === 0) return noOp("faiblesses diagnostiquées mais aucune ne correspond à un module du curriculum");

  const maxModules = Math.max(1, opts.maxModulesParCycle ?? 3);
  const entries = [...groups.entries()].slice(0, maxModules);

  const modulesTraites: string[] = [];
  let itemsEcrits = 0;

  for (const [mod, weaknesses] of entries) {
    try {
      deps.log(`🎯 Tuteur — module « ${mod.id} » : ${weaknesses.length} faiblesse(s) ciblée(s)`);
      const items = await genererLotCible(mod, curriculum.sujet, weaknesses, deps, opts);
      if (items.length === 0) {
        deps.log(`  ⚠ module « ${mod.id} » : aucun item de remédiation généré — skip`);
        continue;
      }

      // Cohérence image best-effort si (à l'avenir) un type illustré est ajouté
      // à TYPES_REMEDIATION — actuellement no-op (qcm/flashcard n'ont pas de
      // champ image), gardé pour cohérence avec le patron de la Fabrique.
      void checkImageCoherence;

      let existing: unknown;
      try {
        existing = await deps.getDoc(collection, `bank-ext:${mod.id}`);
      } catch {
        existing = undefined;
      }
      const merged = mergeBankExt(existing, items);
      await deps.putDoc(collection, `bank-ext:${mod.id}`, merged);
      modulesTraites.push(mod.id);
      itemsEcrits += items.length;
      deps.log(`  ✓ module « ${mod.id} » : ${items.length} nouvel(s) item(s) écrit(s) (bank-ext, ${merged.length} au total)`);
    } catch (e) {
      deps.log(`  ✗ module « ${mod.id} » : échec de remédiation (${(e as Error).message}) — module suivant`);
    }
  }

  return { ran: true, modulesTraites, itemsEcrits };
}

// ---------------------------------------------------------------------------
// Découverte des formations ACTIVES — V1 : scan de workspace/*/formation.json
// (choix simple documenté par le plan É5 ; pas de registre dédié pour l'instant).
// ---------------------------------------------------------------------------

export interface FormationActive {
  projectDir: string;
  collection: string;
  curriculum: Curriculum;
}

/** Liste les formations ACTIVES : un dossier de `workspace/` avec un
 * `formation.json` valide ET un `.mangoapp.json` avec un `id`. Best-effort,
 * ne lève jamais (un dossier corrompu est juste ignoré). */
export function listActiveFormations(workspaceDir: string = WORKSPACE_DIR): FormationActive[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FormationActive[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(workspaceDir, entry.name);
    if (!fs.existsSync(path.join(dir, "formation.json"))) continue;
    const manifest = loadFormationManifest(dir);
    if (!manifest) continue;
    const mangoapp = loadMangoAppManifest(dir);
    if (!mangoapp?.id) continue;
    out.push({ projectDir: dir, collection: sharedCollectionForMangoAppId(mangoapp.id), curriculum: manifest.curriculum });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cycle multi-formations — greffe nocturne (patron EXACT maybeRunStrategistCycle).
// ---------------------------------------------------------------------------

export interface TuteurCycleResult {
  ranFormations: number;
  itemsEcrits: number;
  errors: number;
}

/** Fait tourner le Tuteur sur TOUTES les formations actives, chacune dans son
 * propre try/catch (fail-open PAR formation) — un échec sur une formation
 * n'empêche jamais les autres de tourner, ni le lot nocturne appelant de finir. */
export async function runTuteurCycle(
  deps: TuteurDeps = realTuteurDeps(),
  opts: TuteurOptions = {},
  formations: FormationActive[] = listActiveFormations(),
): Promise<TuteurCycleResult> {
  let ranFormations = 0;
  let itemsEcrits = 0;
  let errors = 0;
  for (const f of formations) {
    try {
      const res = await runTuteurSurFormation(f.collection, f.curriculum, deps, opts);
      if (res.ran) {
        ranFormations++;
        itemsEcrits += res.itemsEcrits;
      } else {
        deps.log(`↷ Tuteur — formation « ${f.curriculum.sujet} » : ${res.raison}`);
      }
    } catch (e) {
      errors++;
      deps.log(`✗ Tuteur — formation « ${f.curriculum.sujet} » en échec (ignorée) : ${(e as Error).message}`);
    }
  }
  return { ranFormations, itemsEcrits, errors };
}

/**
 * Garde de greffe pour le nocturne (patron EXACT `maybeRunStrategistCycle`,
 * stratege-run.ts). `gateOn` = flag FORMATION_TUTEUR. OFF → false immédiat,
 * ZÉRO I/O (byte-identique). ON → cycle en FAIL-OPEN TOTAL : un throw ne
 * remonte jamais (le lot nocturne est déjà terminé quand on appelle ceci).
 */
export async function maybeRunTuteurCycle(
  gateOn: boolean,
  run: () => Promise<TuteurCycleResult> = () => runTuteurCycle(),
  log: (msg: string) => void = (m) => console.warn(m),
): Promise<boolean> {
  if (!gateOn) return false;
  try {
    const res = await run();
    log(
      `[formation-tuteur] cycle terminé — ${res.ranFormations} formation(s) enrichie(s), ${res.itemsEcrits} item(s) écrit(s)` +
        `${res.errors ? `, ${res.errors} échec(s) ignoré(s)` : ""}.`,
    );
    return true;
  } catch (err) {
    log(`[formation-tuteur] cycle en échec (ignoré, lot déjà terminé) : ${(err as Error)?.message ?? err}`);
    return false;
  }
}

/** Réexporte le gate pour un usage direct (route/CLI éventuels). */
export function tuteurGateOn(): boolean {
  return flag("FORMATION_TUTEUR");
}
