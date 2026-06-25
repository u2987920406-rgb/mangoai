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
import { searchSiteDossiers, listSiteDossiers, searchSiteDossiersByText, type SiteDossierHit } from "./site-artifacts.js";
import { recordArtefactUsage } from "./eleve-artefact-usage.js";
import { searchComponentsRanked } from "./kernel-reuse.js";
import { COMPONENTS_DIR_NAME, type ComponentMeta } from "./components.js";
import { WORKSPACE_DIR } from "./projects.js";

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
  /** (L3 Phase B) k dossiers de site les plus pertinents à une requête TEXTE
   * (par CONCEPT — embedding texte + repli mots-clés), pas que par couleur. */
  searchSitesText?: (query: string, k: number) => Promise<SiteDossierHit[]>;
  /** (L3) k composants réutilisables les plus pertinents à une requête TEXTE
   * (embedding + repli mots-clés). Défaut : la bibliothèque cross-projet réelle. */
  searchComponents?: (query: string, k: number) => Promise<ComponentMeta[]>;
  /** (L29) provenances d'artefacts servies ce tour → mesure de réutilisation.
   * Défaut : le store éphémère par projet. Injectable pour les tests. */
  record?: (sources: string[]) => void;
}

const realDeps: ArtefactDeps = {
  search: (colors, k) => searchArtifacts(colors, k),
  list: () => listArtifacts(),
  searchSites: (colors, k) => searchSiteDossiers(colors, k),
  listSites: () => listSiteDossiers(),
  searchSitesText: (query, k) => searchSiteDossiersByText(query, { k }),
  searchComponents: (query, k) => searchComponentsRanked(query, WORKSPACE_DIR, { k }),
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

/** Dossiers de site pertinents : par couleurs si fournies, sinon les récents. */
function fetchSiteHits(deps: ArtefactDeps, colors: string[], k: number): SiteDossierHit[] {
  return colors.length > 0 ? deps.searchSites?.(colors, k) ?? [] : deps.listSites?.().slice(0, k) ?? [];
}

/** Section « sites déjà extraits » (vide si rien). */
function formatSiteSection(hits: SiteDossierHit[]): string {
  if (hits.length === 0) return "";
  return (
    "\n\nSites déjà EXTRAITS (Sharingan) — réutilise concept/mécaniques/palette :\n" + hits.map(formatSiteHit).join("\n")
  );
}

/** Une ligne lisible pour un composant réutilisable (#36/L3) : nom + rôle + props + chemin. */
function formatComponentHit(c: ComponentMeta): string {
  const tags = c.tags?.length ? ` [${c.tags.join(", ")}]` : "";
  const props = c.props?.length ? ` — props: ${c.props.join(", ")}` : "";
  return `- **${c.name}**: ${c.description}${tags}${props}\n  → lis workspace/${COMPONENTS_DIR_NAME}/${c.name}/component.tsx pour le réutiliser`;
}

/** Volet « composants réutilisables » pour une recherche par SENS (#156/L3). */
function formatComponentSection(comps: ComponentMeta[]): string {
  if (comps.length === 0) {
    return "Aucun composant réutilisable proche de ta recherche dans la bibliothèque cross-projet — code-le proprement (et il pourra être mémorisé pour la prochaine fois).";
  }
  return (
    "Composants réutilisables PERTINENTS (lis le code et adapte-le plutôt que réécrire) :\n" +
    comps.map(formatComponentHit).join("\n")
  );
}

/**
 * Outil `chercher_artefact` : interroge la mémoire d'artefacts du Blackboard.
 * - `couleurs` fournies → palettes proches à RÉUTILISER (recherche cosinus).
 * - aucune couleur → liste les artefacts récents (parcourir la bibliothèque).
 * Ne lève jamais : tout échec revient au modèle en isError pédagogique.
 */
export function buildEleveArtefactTools(projectDir: string, deps: ArtefactDeps = realDeps): KernelTool[] {
  // (L29) Provenances servies ce tour → store éphémère par projet (consommé par le
  // finally du tour pour la mesure de réutilisation). Injectable pour les tests.
  const record = deps.record ?? ((sources: string[]) => recordArtefactUsage(projectDir, sources));
  const chercherArtefact: KernelTool = {
    name: "chercher_artefact",
    description:
      "Cherche dans la MÉMOIRE cross-projet (Blackboard) des artefacts DÉJÀ créés à réutiliser : (1) COMPOSANTS réutilisables et (2) DOSSIERS DE SITES déjà extraits — par SENS : donne `recherche` en texte (ex. 'barre de recherche', 'grille de cartes', 'site de jeu d'aventure') ; (3) PALETTES (et sites) par COULEUR : donne `couleurs` hex. Sans argument → liste les artefacts récents. RÉUTILISER l'existant > réinventer (cohérence + vitesse).",
    inputSchema: {
      recherche: z
        .string()
        .optional()
        .describe(
          "Décris en TEXTE le composant/élément réutilisable cherché (ex. 'barre de recherche', 'grille de cartes responsive', 'modale de confirmation'). Recherche par sens dans la bibliothèque de composants cross-projet.",
        ),
      couleurs: z
        .array(z.string())
        .optional()
        .describe(
          "Couleurs hex (#rrggbb) de la palette cible à matcher (ex. ['#1f2937','#f59e0b']). Vide → liste les artefacts récents.",
        ),
      n: z.number().int().min(1).max(MAX_RESULTS).optional().describe("Nombre de résultats (défaut 5, max 8)."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const k = Math.min(MAX_RESULTS, Math.max(1, Math.floor(Number(args.n) || 5)));
      const raw = Array.isArray(args.couleurs) ? args.couleurs : [];
      const colors = raw.filter((c): c is string => typeof c === "string" && HEX_RE.test(c.trim()));
      const query = typeof args.recherche === "string" ? args.recherche.trim() : "";

      // Couleurs données mais aucune valide ET pas de recherche texte → guider l'Élève.
      if (raw.length > 0 && colors.length === 0 && !query) {
        return {
          text: "Donne les couleurs au format hexadécimal (#rrggbb), ex. #1f2937 #f59e0b — la recherche de palette se fait sur les valeurs hex.",
          isError: true,
        };
      }

      try {
        const sources: string[] = [];
        const blocks: string[] = [];

        // 1) COMPOSANTS par SENS (#36/L3) — embedding texte + repli mots-clés.
        if (query) {
          const comps = (await deps.searchComponents?.(query, k)) ?? [];
          sources.push(...comps.map((c) => c.name));
          blocks.push(formatComponentSection(comps));

          // 1bis) DOSSIERS DE SITE par CONCEPT (L3 Phase B) — embedding texte sur
          // concept/mécaniques/mood, plus seulement la couleur de leur palette.
          const sitesByText = (await deps.searchSitesText?.(query, k)) ?? [];
          if (sitesByText.length > 0) {
            sources.push(...sitesByText.map((h) => h.artifact.project));
            blocks.push(formatSiteSection(sitesByText).trim());
          }
        }

        // 2) PALETTES + SITES par COULEUR (existant). Sauté si recherche TEXTE seule
        //    (ne pas dumper des palettes au hasard quand on cherche un composant).
        if (colors.length > 0 || !query) {
          const siteHits = fetchSiteHits(deps, colors, k);
          const sites = formatSiteSection(siteHits);
          const paletteHits = colors.length > 0 ? deps.search(colors, k) : deps.list().slice(0, k);
          sources.push(...paletteHits.map((h) => h.artifact.project), ...siteHits.map((h) => h.artifact.project));

          if (colors.length > 0) {
            blocks.push(
              paletteHits.length === 0
                ? "Aucune palette proche dans la mémoire cross-projet (bibliothèque vide ou rien de ressemblant). Tu peux créer une palette neuve — pense à rester cohérent avec le reste du projet." +
                    sites
                : "Palettes proches DÉJÀ créées (réutilise ces couleurs pour la cohérence de ton univers visuel) :\n" +
                    paletteHits.map(formatHit).join("\n") +
                    sites,
            );
          } else {
            blocks.push(
              paletteHits.length === 0
                ? (sites
                    ? "Aucune palette en mémoire, mais des sites ont été extraits :"
                    : "La mémoire d'artefacts (Blackboard) est vide pour l'instant — rien à réutiliser, crée librement.") +
                    sites
                : "Artefacts design récents en mémoire cross-projet (réutilise plutôt que réinventer) :\n" +
                    paletteHits.map(formatHit).join("\n") +
                    sites,
            );
          }
        }

        // (L29) Provenances servies (composants + palettes + sites) → réutilisation
        // mesurable, même quand le rendu n'expose pas de hex littéral (Tailwind).
        record(sources);

        return { text: blocks.join("\n\n") };
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
