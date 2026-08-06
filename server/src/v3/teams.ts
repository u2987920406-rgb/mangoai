// Refonte v3 — lot 3, le socle : LES ÉQUIPES.
//
// C'est le seul concept que la refonte garde pour dire « quelqu'un fait quelque
// chose ». Il en remplace six : rôles de cerveau, spécialistes forgés, Agent
// Factory, Super-Agent Builder, délégation Élève, Conseil de skills (doc 03 § 1).
//
// RÈGLE DU LOT 3, littérale : « v3/ APPELLE l'existant ; il ne le réécrit pas. »
// Ce fichier ne contient donc aucune logique de routage, aucun appel LLM, aucun
// filtrage d'outil. Il ne contient QUE la déclaration des équipes — et les
// dérivations pures qu'on peut en tirer. Tout le reste réutilise ce qui existe :
// `dispatch` (brain-dispatch), `TOOL_CAPABILITIES` + `policyFromCaps`
// (eleve-tool-capabilities), `requiredCapabilities` (intent-capabilities).
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI LES OUTILS SONT DÉCLARÉS NOMMÉMENT, ET NON DÉDUITS DES CAPACITÉS
// ─────────────────────────────────────────────────────────────────────────────
// `TOOL_CAPABILITIES` classe les outils par capacité de SÛRETÉ (que risque-t-on à
// l'offrir), pas par appartenance métier. Les deux ne coïncident pas :
// `verifie_design` y est `read-local` — il lit des fichiers du projet — alors
// qu'il appartient sans ambiguïté au 🎨 Design. Déduire les outils d'une équipe
// de ses capacités aurait donné le design à toute équipe qui lit un fichier.
// L'appartenance est donc DÉCLARÉE (doc 03), et la capacité DÉRIVÉE.

import {
  TOOL_CAPABILITIES,
  type Capability,
} from "../eleve-tools/eleve-tool-capabilities.js";
import type { AgentId } from "../brain/brain-registry.js";

/** Les 7 équipes. Voir la note « 7 et non 8 » plus bas — ce n'est pas une coquille. */
export type TeamId =
  | "orchestrateur"
  | "analyse"
  | "recherche"
  | "vision"
  | "construction"
  | "design"
  | "verification";

/**
 * Quand une équipe s'allume. Déterminé par l'Orchestrateur, JAMAIS par l'utilisateur.
 *
 * ⚠️ POINT MESURÉ, ET CONTRE-INTUITIF — lire avant d'ajouter une condition.
 * L'escalier de capacités (`intent-capabilities.ts`) ne peut **structurellement pas**
 * émettre `write-fs`, `run-cmd`, `deps`, `plan`, `test`, `assemble`, `build-control`,
 * `secret` ni `unity`. C'est délibéré (#182 D1) : les capacités disent ce que la tâche
 * RÉCLAME (axe intention, read-safe), le plafond dit ce qu'on a le droit de MUTER
 * (axe sûreté, posture). L'étage 2 ne détecte que des capacités read-safe, et l'étage 3
 * a une allowlist qui exclut explicitement write/run/deps.
 *
 * Conséquence : allumer 🔨 Construction sur la capacité `write-fs` revient à ne
 * jamais l'allumer. Le signal de « construire », c'est la POSTURE — d'où `surMutation`.
 * Cette erreur a été commise ici, puis attrapée par `test-v3-parcours` : une équipe
 * peut être parfaitement déclarée et n'être jamais appelée.
 */
export interface Ignition {
  /** Allumée à chaque tour, sans condition (🧭 Orchestrateur : c'est lui qui reçoit). */
  readonly inconditionnelle?: boolean;
  /** Allumée à la CLÔTURE de chaque tour, toujours en dernier, non désactivable. */
  readonly cloture?: boolean;
  /** Allumée si la tâche réclame au moins une de ces capacités. N'y mettre QUE des
   *  capacités que l'escalier peut réellement produire : `read-local`, `read-web`,
   *  `read-memory`, `vision`, `media-gen`, `content-gen`. Toute autre est décorative. */
  readonly capacites?: readonly Capability[];
  /** Allumée dès que le plafond autorise la MUTATION — c'est-à-dire dès que
   *  l'intention est « construire / modifier » (doc 03 § 2). */
  readonly surMutation?: boolean;
}

export interface Team {
  readonly id: TeamId;
  readonly emoji: string;
  /** Nom produit, celui du bandeau de statut. */
  readonly label: string;
  /** LE cerveau de l'équipe — un rôle du registre. Une équipe = un rôle enrichi. */
  readonly brain: AgentId;
  /** Cerveau SECONDAIRE, interne à l'équipe. Aujourd'hui : le `juge` de la Vérification,
   *  qui doit rester distinct de l'exécutant (doc 03 § 2, « non négociable »). */
  readonly brainInterne?: AgentId;
  /** La mission, en une phrase — c'est le system prompt de base de l'équipe. */
  readonly mission: string;
  /** Les outils que cette équipe sait manier. DÉCLARÉS, pas déduits (cf. en-tête).
   *  Vide = l'équipe n'exécute pas, elle délègue (cas de l'Orchestrateur). */
  readonly outils: readonly string[];
  readonly allumage: Ignition;
  /** Plafond de tours pour un allumage. Dépassement = extinction propre, jamais blocage. */
  readonly maxTours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 7 ÉQUIPES, ET NON 8 — écart assumé avec le doc 03
// ─────────────────────────────────────────────────────────────────────────────
// Le doc 03 § 2 décrit 8 équipes, dont 📄 EXTRACTION portée par le rôle
// `extracteur`. Ce rôle a été RETIRÉ du registre sur décision de Raf au lot 3
// (16 → 8 rôles : `extracteur` et `testeur` supprimés). Une équipe sans cerveau
// n'est pas une équipe — on ne la déclare donc pas.
//
// Ses 3 compétences sont RÉAFFECTÉES, elles ne sont pas perdues (le lot 3 exige
// « aucune capacité perdue ») :
//   · `lire_document`, `lire_archive` → 🔎 RECHERCHE — même mission littérale,
//     « trouver, lire et rapporter de l'information » ; que la source soit une URL
//     ou un PDF déposé ne change pas la nature du travail.
//   · `decoupe_assets`               → 👁️ VISION — c'est du découpage d'image.
//
// C'est une décision de conception, pas une transcription. Elle est réversible :
// rendre `extracteur` au registre et déclarer l'équipe ici suffit.
// ─────────────────────────────────────────────────────────────────────────────

export const TEAMS: Readonly<Record<TeamId, Team>> = Object.freeze({
  orchestrateur: {
    id: "orchestrateur",
    emoji: "🧭",
    label: "Orchestrateur",
    brain: "orchestrateur",
    mission:
      "Comprendre la demande, décider quelles équipes allumer, synthétiser leurs retours, répondre.",
    // Aucun outil : il délègue, il n'exécute pas (doc 03 § 2). C'est ce vide qui
    // l'empêche de redevenir un agent fourre-tout.
    outils: [],
    allumage: { inconditionnelle: true },
    maxTours: 4,
  },

  analyse: {
    id: "analyse",
    emoji: "🧠",
    label: "Analyse & Plan",
    brain: "architecte",
    mission:
      "Transformer une intention floue en plan exécutable, arbitrer les choix techniques.",
    outils: ["planifier", "etape_faite", "etape_bloquee"],
    // ⚠️ PAS `capacites: ["plan"]` : l'escalier n'émet jamais `plan` (cf. Ignition).
    // Un plan sert quand on va CONSTRUIRE — le signal est donc la posture.
    allumage: { surMutation: true },
    maxTours: 3,
  },

  recherche: {
    id: "recherche",
    emoji: "🔎",
    label: "Recherche",
    brain: "chercheur",
    mission: "Trouver, lire et rapporter de l'information externe fiable.",
    outils: [
      "chercher_web",
      "lire_page",
      "requete_web",
      "extraire_site",
      "lis_video_youtube",
      "chercher_image",
      "chercher_artefact",
      // Reprises de l'ex-📄 Extraction (cf. note ci-dessus).
      "lire_document",
      "lire_archive",
    ],
    allumage: { capacites: ["read-web", "read-memory"] },
    maxTours: 4,
  },

  vision: {
    id: "vision",
    emoji: "👁️",
    label: "Vision",
    // Contrainte MATÉRIELLE, pas de confort : ce rôle exige un modèle VL. C'est la
    // seule exception au regroupement par affinité fonctionnelle (doc 03 § 2).
    brain: "vision",
    mission: "Décrire fidèlement ce qui est à l'écran ou dans une image.",
    outils: [
      "vois_ecran",
      "lire_image",
      "sharingan_url",
      "sharingan_image",
      "regarde_site_web",
      // Reprise de l'ex-📄 Extraction : découper une image est un travail d'image.
      "decoupe_assets",
    ],
    allumage: { capacites: ["vision"] },
    maxTours: 3,
  },

  construction: {
    id: "construction",
    emoji: "🔨",
    label: "Construction",
    brain: "codeur",
    mission: "Écrire, modifier et faire compiler le code du projet.",
    outils: [
      "read_file",
      "write_file",
      "edit_file",
      "list_files",
      "search_code",
      "check_build",
      "run_command",
      "add_dependency",
      "assemble_brique",
      "finish",
      // Palier système (#180 É6) — même équipe, même plafond de mutation.
      "run_system_command",
      "open_url",
      "open_folder",
      "reveal_in_explorer",
      "utilise_secret",
      // Unity : une compétence de construction, pas une équipe (doc 03 § 8).
      "unity_build",
      "unity_test",
    ],
    // ⚠️ PAS `write-fs`/`run-cmd` ici : l'escalier ne les produit JAMAIS (cf. Ignition).
    // L'intention « construire » se lit sur la POSTURE — d'où `surMutation`. Écrire ces
    // capacités aurait donné une équipe déclarée que rien n'allume : c'est le défaut que
    // `test-v3-parcours` a attrapé.
    //
    // `read-local` s'y ajoute, et ce n'est pas une facilité. Les quatre lecteurs du
    // projet (`read_file`, `list_files`, `search_code`, `check_build`) appartiennent à
    // cette équipe et à aucune autre — 🔎 Recherche va chercher DEHORS. Sans cette
    // ligne, une question aussi banale que « que fait ce fichier ? » ne trouvait
    // personne pour y répondre sous plafond read-only : un trou fonctionnel, pas un
    // détail de cadrage. Sous read-only, le plafond réduit l'équipe à ses quatre
    // lecteurs — elle LIT le projet, elle ne le construit pas.
    //
    // ⚠️ Conséquence à traiter au lot 5 (surfaces) : `read-local` étant offert par
    // défaut à chaque tâche, 🔨 Construction apparaîtra au bandeau de presque tous les
    // tours. « Mango construit » affiché pendant une simple question serait un
    // contresens — le bandeau devra distinguer LIRE de CONSTRUIRE.
    allumage: { capacites: ["read-local"], surMutation: true },
    maxTours: 12,
  },

  design: {
    id: "design",
    emoji: "🎨",
    label: "Design",
    brain: "designer_ux",
    mission:
      "Donner au projet une direction visuelle cohérente, accessible, et conforme au goût de l'utilisateur.",
    outils: ["verifie_design", "genere_image", "genere_contenu"],
    // « Allumé quand le projet a une interface — donc presque toujours » (doc 03) :
    // tout tour qui construit passe par le Design, plus les demandes de média/contenu.
    allumage: { capacites: ["media-gen", "content-gen"], surMutation: true },
    maxTours: 4,
  },

  verification: {
    id: "verification",
    emoji: "🛡️",
    label: "Vérification",
    brain: "auditeur",
    // Le juge est INTERNE à l'équipe et distinct de l'exécutant. `test-brain-dispatch`
    // garde l'invariant `juge ≠ codeur` ET `auditeur ≠ codeur`, sur le registre VIVANT.
    brainInterne: "juge",
    mission:
      "Vérifier que ce qui est livré correspond à ce qui a été demandé, et le dire même quand c'est non.",
    outils: ["ecris_test", "lance_tests", "teste_parcours", "verifie_coherence_images"],
    allumage: { cloture: true },
    maxTours: 3,
  },
});

export const TEAM_IDS = Object.keys(TEAMS) as TeamId[];

/** L'équipe, ou `undefined` si l'identifiant n'en est pas un. Ne throw jamais. */
export function getTeam(id: string): Team | undefined {
  return (TEAMS as Record<string, Team>)[id];
}

/**
 * Les capacités d'une équipe, DÉRIVÉES de ses outils déclarés via l'unique source de
 * classification (`TOOL_CAPABILITIES`). Un outil inconnu de cette source est ignoré —
 * il n'a pas de capacité connue, donc pas de capacité tout court. PUR.
 */
export function teamCapabilities(team: Team): Set<Capability> {
  const out = new Set<Capability>();
  for (const nom of team.outils) {
    const c = TOOL_CAPABILITIES.get(nom);
    if (c) out.add(c.capability);
  }
  return out;
}

/**
 * Quelle équipe possède cet outil. Un outil n'appartient qu'à UNE équipe : deux
 * propriétaires, c'est le retour du fourre-tout que la refonte supprime. La
 * non-duplication est prouvée par `test-v3-teams`, pas supposée ici.
 */
export function teamOwningTool(nom: string): Team | undefined {
  for (const id of TEAM_IDS) {
    if (TEAMS[id].outils.includes(nom)) return TEAMS[id];
  }
  return undefined;
}

/**
 * Les outils connus du produit qu'AUCUNE équipe ne réclame. Doit rester vide : le lot 3
 * exige « aucune capacité perdue — les 41 outils restent joignables ». Cette fonction
 * existe pour que le test puisse le PROUVER à chaque exécution, et pour qu'ajouter un
 * outil sans lui donner d'équipe fasse échouer la suite au lieu de passer inaperçu.
 */
export function outilsOrphelins(): string[] {
  const out: string[] = [];
  for (const nom of TOOL_CAPABILITIES.keys()) {
    if (!teamOwningTool(nom)) out.push(nom);
  }
  return out;
}

/** Les outils déclarés par une équipe mais inconnus de `TOOL_CAPABILITIES` — donc
 *  jamais offrables. Doit rester vide : une équipe qui déclare un outil fantôme croit
 *  savoir faire quelque chose qu'elle ne fera jamais. */
export function outilsFantomes(): string[] {
  const out: string[] = [];
  for (const id of TEAM_IDS) {
    for (const nom of TEAMS[id].outils) {
      if (!TOOL_CAPABILITIES.has(nom)) out.push(`${id}:${nom}`);
    }
  }
  return out;
}
