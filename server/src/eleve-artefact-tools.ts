// Outil ARTEFACT de l'Élève agentique (#156) — « réutiliser > regénérer ».
//
// Transmission de compétence (directive permanente de Raf, cf. transmission-
// competences) : l'Élève GLM réinvente une palette/un univers visuel à chaque
// projet alors qu'il en a déjà créé de proches ailleurs. Le Blackboard #115→#117
// PERSISTE ces artefacts cross-projet (palettes design captées/produites,
// embedding = histogramme RGB déterministe). On donne à l'Élève le réflexe de
// Claude : AVANT de réinventer, CHERCHER s'il existe déjà une solution proche à
// réutiliser — pour la cohérence de son univers visuel et la vitesse.
//
// La mémoire d'artefacts d'aujourd'hui = des PALETTES (DesignArtifact). L'outil
// est donc orienté couleurs : on donne une palette cible (hex) → on retrouve les
// palettes les plus proches (cosinus, searchArtifacts), ou rien → on liste les
// plus récentes (listArtifacts). Pur, déterministe, zéro réseau ; ne lève jamais.

import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { searchArtifacts, listArtifacts, type ArtifactHit } from "./kernel-artifacts.js";
import { searchSiteDossiers, listSiteDossiers, type SiteDossierHit } from "./site-artifacts.js";

/** Borne dure du nombre de résultats renvoyés à l'Élève. */
const MAX_RESULTS = 8;
/** Couleur hexadécimale #rgb ou #rrggbb (le # est optionnel). */
const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/** Dépendances injectables (tests sans Blackboard réel). */
export interface ArtefactDeps {
  /** k palettes les plus proches (cosinus) de `colors`. */
  search: (colors: string[], k: number) => ArtifactHit[];
  /** tous les artefacts, plus récents en tête. */
  list: () => ArtifactHit[];
  /** k dossiers de site les plus proches (#159 Phase 4) — optionnel. */
  searchSites?: (colors: string[], k: number) => SiteDossierHit[];
  /** dossiers de site récents (#159 Phase 4) — optionnel. */
  listSites?: () => SiteDossierHit[];
}

const realDeps: ArtefactDeps = {
  search: (colors, k) => searchArtifacts(colors, k),
  list: () => listArtifacts(),
  searchSites: (colors, k) => searchSiteDossiers(colors, k),
  listSites: () => listSiteDossiers(),
};

/** Une ligne lisible par l'Élève : provenance + rôle + proximité + couleurs à copier. */
function formatHit(h: ArtifactHit): string {
  const a = h.artifact;
  const role = a.type === "design.reference" ? "cible" : "rendu";
  const pct = typeof h.score === "number" ? ` ~${Math.round(h.score * 100)}% proche,` : "";
  const cols = a.colors.slice(0, 8).join(" ");
  return `- ${a.project} (${role},${pct} ${a.colors.length} couleurs) : ${cols}`;
}

/** Une ligne lisible pour un dossier de site déjà extrait (#159 Phase 4). */
function formatSiteHit(h: SiteDossierHit): string {
  const a = h.artifact;
  const pct = typeof h.score === "number" ? ` ~${Math.round(h.score * 100)}% proche,` : "";
  const concept = a.concept ? ` — ${a.concept}` : "";
  const cols = a.palette.slice(0, 6).join(" ");
  const meca = a.mecaniques.length ? ` · mécaniques : ${a.mecaniques.slice(0, 4).join(", ")}` : "";
  return `- ${a.project} (site,${pct})${concept}${cols ? `\n  palette : ${cols}` : ""}${meca}`;
}

/** Section « sites déjà extraits » (vide si rien). Cherche par couleurs, ou liste les récents. */
function siteSection(deps: ArtefactDeps, colors: string[], k: number): string {
  const hits = colors.length > 0 ? deps.searchSites?.(colors, k) ?? [] : deps.listSites?.().slice(0, k) ?? [];
  if (hits.length === 0) return "";
  return (
    "\n\nSites déjà EXTRAITS (Sharingan) — réutilise concept/mécaniques/palette :\n" + hits.map(formatSiteHit).join("\n")
  );
}

/**
 * Outil `chercher_artefact` : interroge la mémoire d'artefacts du Blackboard.
 * - `couleurs` fournies → palettes proches à RÉUTILISER (recherche cosinus).
 * - aucune couleur → liste les artefacts récents (parcourir la bibliothèque).
 * Ne lève jamais : tout échec revient au modèle en isError pédagogique.
 */
export function buildEleveArtefactTools(_projectDir: string, deps: ArtefactDeps = realDeps): KernelTool[] {
  const chercherArtefact: KernelTool = {
    name: "chercher_artefact",
    description:
      "Cherche dans la MÉMOIRE cross-projet (Blackboard) des artefacts DÉJÀ créés à réutiliser : des PALETTES de couleurs (captées ou produites sur d'autres projets) ET des DOSSIERS DE SITES déjà extraits avec extraire_site (concept, mécaniques, palette, mood). Donne des couleurs hex pour retrouver les plus proches, ou n'en donne aucune pour lister les plus récents. RÉUTILISER l'existant > réinventer (cohérence + vitesse).",
    inputSchema: {
      couleurs: z
        .array(z.string())
        .optional()
        .describe(
          "Couleurs hex (#rrggbb) de la palette cible à matcher (ex. ['#1f2937','#f59e0b']). Vide → liste les artefacts récents.",
        ),
      n: z.number().int().min(1).max(MAX_RESULTS).optional().describe("Nombre de résultats (défaut 5, max 8)."),
    },
    handler: (args): KernelToolResult => {
      const k = Math.min(MAX_RESULTS, Math.max(1, Math.floor(Number(args.n) || 5)));
      const raw = Array.isArray(args.couleurs) ? args.couleurs : [];
      const colors = raw.filter((c): c is string => typeof c === "string" && HEX_RE.test(c.trim()));

      // Des couleurs ont été données mais aucune n'est un hex valide → guider l'Élève.
      if (raw.length > 0 && colors.length === 0) {
        return {
          text: "Donne les couleurs au format hexadécimal (#rrggbb), ex. #1f2937 #f59e0b — la recherche de palette se fait sur les valeurs hex.",
          isError: true,
        };
      }

      try {
        const sites = siteSection(deps, colors, k);

        if (colors.length > 0) {
          const hits = deps.search(colors, k);
          if (hits.length === 0) {
            return {
              text:
                "Aucune palette proche dans la mémoire cross-projet (bibliothèque vide ou rien de ressemblant). Tu peux créer une palette neuve — pense à rester cohérent avec le reste du projet." +
                sites,
            };
          }
          return {
            text:
              "Palettes proches DÉJÀ créées (réutilise ces couleurs pour la cohérence de ton univers visuel) :\n" +
              hits.map(formatHit).join("\n") +
              sites,
          };
        }

        const all = deps.list().slice(0, k);
        if (all.length === 0) {
          return {
            text:
              (sites
                ? "Aucune palette en mémoire, mais des sites ont été extraits :"
                : "La mémoire d'artefacts (Blackboard) est vide pour l'instant — rien à réutiliser, crée librement.") +
              sites,
          };
        }
        return {
          text:
            "Artefacts design récents en mémoire cross-projet (réutilise plutôt que réinventer) :\n" +
            all.map(formatHit).join("\n") +
            sites,
        };
      } catch (e) {
        return {
          text: `Recherche d'artefact impossible : ${e instanceof Error ? e.message : String(e)}`,
          isError: true,
        };
      }
    },
  };

  return [chercherArtefact];
}
