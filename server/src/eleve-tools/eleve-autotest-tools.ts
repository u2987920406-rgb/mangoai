// Compétence AUTO-TEST de l'Élève — ecris_test + lance_tests.
//
// Donne à GLM le réflexe de se construire un FILET de tests déterministes et de le
// REJOUER après chaque changement, pour attraper SES régressions tout seul (au lieu de
// dépendre du seul teste_parcours one-shot #155 et du Gardien #161).
//
// v1 souveraine, ZÉRO nouvelle dépendance dans les projets générés : un test = un
// parcours utilisateur (mêmes actions/attendus que teste_parcours), persisté dans
// <projet>/.mango-tests/<slug>.json, rejoué via le moteur DÉJÀ prouvé (startPreview +
// runParcours). Gaté ELEVE_AUTOTEST=on (défaut OFF → zéro régression). Ne lève jamais.

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { startPreview } from "../preview.js";
import { runParcours, formatParcoursReport, type ParcoursEtape, type ParcoursReport } from "../eleve-parcours.js";

const TESTS_DIR = ".mango-tests";
const MAX_REPLAY = 12; // cap de sûreté : au plus 12 specs rejoués par appel

// Schéma d'un parcours (identique à teste_parcours → mêmes réflexes pour GLM).
const actionSchema = z.object({
  clickText: z.string().optional().describe("Cliquer le premier élément contenant ce texte"),
  clickSelector: z.string().optional().describe("Cliquer un élément par sélecteur CSS"),
  fill: z.object({ selector: z.string(), text: z.string() }).optional().describe("Remplir un champ (sélecteur CSS) avec un texte"),
  key: z.string().optional().describe("Presser une touche (ex. 'Enter', 'ArrowRight')"),
  wait: z.number().optional().describe("Attendre N ms (plafonné à 3000)"),
});
const attenduSchema = z.object({
  texte: z.string().optional().describe("Un texte qui DOIT être visible après les actions"),
  selecteur: z.string().optional().describe("Un élément CSS qui DOIT être visible"),
  image_chargee: z.boolean().optional().describe("true → au moins une <img> réellement chargée"),
  aucune_erreur_console: z.boolean().optional().describe("true → aucune erreur JS/console pendant l'étape"),
});
const etapeSchema = z.object({
  description: z.string().describe("Décris l'étape en clair"),
  actions: z.array(actionSchema).optional().describe("Actions à jouer dans l'ordre"),
  attendu: attenduSchema.optional().describe("Ce qui doit être vrai APRÈS les actions"),
});

export interface AutotestSpec {
  nom: string;
  etapes: ParcoursEtape[];
}

/** Dépendances injectables (tests sans navigateur ni disque). */
export interface AutotestToolDeps {
  startPreview: (projectDir: string) => Promise<{ url: string }>;
  runParcours: (url: string, etapes: ParcoursEtape[]) => Promise<ParcoursReport>;
  /** Liste les tests enregistrés (slug + spec). Ne lève jamais → [] si rien. */
  readSpecs: (projectDir: string) => Array<{ slug: string; spec: AutotestSpec }>;
  /** Écrit/écrase un test. */
  writeSpec: (projectDir: string, slug: string, spec: AutotestSpec) => void;
}

function slugify(s: string): string {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "test"
  );
}

const realDeps: AutotestToolDeps = {
  startPreview,
  runParcours: (url, etapes) => runParcours(url, etapes),
  readSpecs: (projectDir) => {
    const dir = path.join(projectDir, TESTS_DIR);
    let files: string[];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
    const out: Array<{ slug: string; spec: AutotestSpec }> = [];
    for (const f of files) {
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as AutotestSpec;
        if (spec && Array.isArray(spec.etapes) && spec.etapes.length) {
          out.push({ slug: f.replace(/\.json$/, ""), spec: { nom: spec.nom || f.replace(/\.json$/, ""), etapes: spec.etapes } });
        }
      } catch { /* fichier illisible ignoré */ }
    }
    return out;
  },
  writeSpec: (projectDir, slug, spec) => {
    const dir = path.join(projectDir, TESTS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(spec, null, 2), "utf8");
  },
};

export function buildEleveAutotestTools(projectDir: string, deps: AutotestToolDeps = realDeps): KernelTool[] {
  const ecrisTest: KernelTool = {
    name: "ecris_test",
    description:
      "ENREGISTRE un test de non-régression : un parcours utilisateur (mêmes `etapes` que teste_parcours — actions + " +
      "`attendu` déterministe) qui DOIT continuer à marcher. Construis un filet des flux CRITIQUES de l'app (nav " +
      "principale, formulaire, écran de jeu…). Chaque test est persisté et rejouable par `lance_tests` après chaque " +
      "changement. Donne un `nom` court et parlant + les `etapes`.",
    inputSchema: {
      nom: z.string().describe("Nom court du test (ex. 'nav-accueil-contact', 'formulaire-envoi')"),
      etapes: z.array(etapeSchema).min(1).describe("Les étapes du parcours à vérifier (max 20)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const nom = String(args.nom ?? "").trim();
      const etapes = (args.etapes ?? []) as ParcoursEtape[];
      if (!nom) return { text: "Donne un `nom` au test.", isError: true };
      if (!Array.isArray(etapes) || etapes.length === 0) return { text: "Donne au moins une étape (`etapes`).", isError: true };
      try {
        const slug = slugify(nom);
        deps.writeSpec(projectDir, slug, { nom, etapes });
        return {
          text:
            `Test « ${nom} » enregistré (${etapes.length} étape(s)) dans ${TESTS_DIR}/${slug}.json.\n` +
            `→ Relance ta suite avec \`lance_tests\` après chaque changement : un test rouge = corrige avant de finir.`,
        };
      } catch (e) {
        return { text: `Test non enregistré : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  const lanceTests: KernelTool = {
    name: "lance_tests",
    description:
      "REJOUE le filet de tests enregistrés (ecris_test) sur l'aperçu live et renvoie ✓/✗ par test. À lancer APRÈS " +
      "tout changement, pour attraper une RÉGRESSION avant de finir. `nom` optionnel pour ne rejouer qu'un test. " +
      "Un test rouge → lis les ✗, CORRIGE (edit_file), puis relance.",
    inputSchema: {
      nom: z.string().optional().describe("Ne rejouer que ce test (sinon toute la suite)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      let specs = deps.readSpecs(projectDir);
      const only = String(args.nom ?? "").trim();
      if (only) {
        const s = slugify(only);
        specs = specs.filter((x) => x.slug === s || x.spec.nom === only);
      }
      if (specs.length === 0) {
        return {
          text: only
            ? `Aucun test « ${only} » enregistré. Crée-le d'abord avec ecris_test.`
            : `Aucun test enregistré. Écris d'abord un filet avec ecris_test (les flux critiques de l'app).`,
        };
      }
      const capped = specs.slice(0, MAX_REPLAY);

      let url: string;
      try {
        ({ url } = await deps.startPreview(projectDir));
      } catch (e) {
        return { text: `Aperçu indisponible (${e instanceof Error ? e.message : String(e)}) — vérifie que le projet build, puis relance les tests.`, isError: true };
      }

      const results: Array<{ nom: string; ok: boolean; detail: string }> = [];
      for (const { spec } of capped) {
        let report: ParcoursReport;
        try {
          report = await deps.runParcours(url, spec.etapes);
        } catch (e) {
          report = { ok: false, etapes: [], consoleErrors: [String(e)] };
        }
        results.push({ nom: spec.nom, ok: report.ok, detail: formatParcoursReport(report) });
      }

      const passed = results.filter((r) => r.ok).length;
      const failed = results.length - passed;
      const omitted = specs.length - capped.length;
      const head = `🧪 Suite de ${results.length} test(s) : ${passed} ✓ / ${failed} ✗${omitted > 0 ? ` (+${omitted} non rejoué(s), cap ${MAX_REPLAY})` : ""}`;
      const summary = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.nom}`).join("\n");
      if (failed === 0) {
        return { text: `${head}\n${summary}\n\n→ Aucune régression. Tu peux finaliser.` };
      }
      const details = results.filter((r) => !r.ok).map((r) => `— ${r.nom} —\n${r.detail}`).join("\n\n");
      return {
        text: `${head}\n${summary}\n\n${details}\n\n→ Corrige les tests ✗ (edit_file), puis rappelle lance_tests.`,
        isError: true,
      };
    },
  };

  return [ecrisTest, lanceTests];
}
