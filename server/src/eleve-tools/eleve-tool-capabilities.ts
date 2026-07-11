// Modèle de CAPACITÉS des outils de l'Élève (#182 É1 — décision D1).
//
// PROBLÈME que ça résout : jusqu'ici la POSTURE UI (discuter/construire) décidait
// DIRECTEMENT quels outils exister — deux inventaires divergents (buildEleveActionTools
// vs buildEleveDiscussTools). Résultat : `vois_ecran`/Sharingan n'existait QUE côté
// Construire (le « trou » senti par Raf : en Discuter, l'Élève ne pouvait pas regarder
// un rendu). La cause-racine est structurelle : la sélection était posture-first.
//
// DÉCISION D1 — deux axes ORTHOGONAUX :
//   1. PLAFOND DE MUTATION = la posture (sûreté). Discuter → `read-only` : aucun outil
//      à effet de bord (write-fs/run-cmd/deps/content-gen/media-gen mutants). La posture
//      ne gouverne QUE l'effet de bord — jamais les capacités de LECTURE.
//   2. CAPACITÉS REQUISES = l'intention de la tâche (É2, hors périmètre ici). Quelles
//      capacités (read-web, vision, …) la tâche réclame.
//
// Ici on livre le MODÈLE (map outil→capacité+mutation) et le TRADUCTEUR
// `policyFromCaps(ceiling, requiredCaps)` → `ToolPolicy` (#175), qu'on applique via
// `applyToolPolicy` sur LE registre unifié (`buildEleveToolRegistry`). On RÉUTILISE le
// mécanisme #175 ; on ne réinvente rien.

import type { ToolPolicy } from "./eleve-action-tools.js";

/** Capacité d'un outil : ce que la TÂCHE réclame, indépendamment de la posture. */
export type Capability =
  | "read-local" // lire/lister/chercher/vérifier dans le PROJET (read_file, check_build…)
  | "read-web" // lire une page/site/API web en LECTURE (chercher_web, extraire_site, requete_web GET)
  | "read-memory" // interroger la mémoire cross-projet (Blackboard : chercher_artefact)
  | "vision" // regarder un rendu / une image (Sharingan : vois_ecran, lire_image)
  | "content-gen" // rédiger/juger du contenu structuré (genere_contenu…)
  | "media-gen" // produire/trouver des médias (chercher_image, genere_image, decoupe_assets)
  | "write-fs" // écrire/modifier un fichier du projet (write_file, edit_file)
  | "run-cmd" // lancer une commande shell (run_command)
  | "deps" // installer une dépendance curée (add_dependency)
  | "test" // écrire/rejouer des tests de parcours (teste_parcours, ecris_test, lance_tests)
  | "plan" // poser/avancer un plan d'étapes (planifier, etape_faite)
  | "build-control" // sentinelle de terminaison du build (finish)
  | "assemble" // composer des briques infra (assemble_brique)
  | "secret" // résoudre/injecter un secret (utilise_secret)
  | "unity" // compétence Unity/C# (unity_build, unity_test)
  | "delegate"; // déléguer à un sous-agent (réservé, É2+)

export interface ToolCapability {
  capability: Capability;
  /** true = l'outil a un EFFET DE BORD (écrit, exécute, installe, produit un média/POST).
   *  Un outil mutant est INTERDIT sous un plafond `read-only`, même si sa capacité est requise. */
  mutation: boolean;
}

/**
 * Registre de capacités : outil → (capacité, mutation). SOURCE UNIQUE de la classification.
 * Couvre l'union COMPLÈTE des outils enregistrables (y compris les outils gatés par
 * `ELEVE_*=on`, dormants par défaut). Un outil externe (MCP dynamique) absent d'ici n'a
 * pas de capacité connue → il n'est jamais retenu par une allowlist de capacité (il ne
 * survit qu'au préréglage Construire « toutes capacités », qui ne filtre pas — cf. D1).
 */
export const TOOL_CAPABILITIES: ReadonlyMap<string, ToolCapability> = new Map<string, ToolCapability>([
  // Lecture locale (Phase 1) — toujours sûre.
  ["read_file", { capability: "read-local", mutation: false }],
  ["list_files", { capability: "read-local", mutation: false }],
  ["search_code", { capability: "read-local", mutation: false }],
  ["check_build", { capability: "read-local", mutation: false }],
  // verifie_design (2026-07-12) — lit les fichiers du projet, ne mute rien, comme check_build.
  ["verifie_design", { capability: "read-local", mutation: false }],
  // Lecture de sources déposées (docs/archives) — read-only.
  ["lire_document", { capability: "read-local", mutation: false }],
  ["lire_archive", { capability: "read-local", mutation: false }],
  // Lecture web — read-only (récupère, n'écrit rien).
  ["lire_page", { capability: "read-web", mutation: false }],
  ["chercher_web", { capability: "read-web", mutation: false }],
  ["extraire_site", { capability: "read-web", mutation: false }],
  // requete_web : GET est read-web ; la variante POST (mutation) est gérée par le
  // plafond côté REGISTRE (httpGetOnly) — l'outil lui-même reste offrable en lecture.
  ["requete_web", { capability: "read-web", mutation: false }],
  // Mémoire cross-projet — lecture, mais capacité DISTINCTE (n'est pas offerte par défaut
  // en Discuter : c'est un rappel d'artefacts de build, pas une lecture de conversation).
  ["chercher_artefact", { capability: "read-memory", mutation: false }],
  // Vision / Sharingan — read-safe (regarde, ne mute pas). Le « trou » de D1 : désormais
  // OFFRABLE en Discuter dès que `vision` ∈ requiredCaps.
  ["vois_ecran", { capability: "vision", mutation: false }],
  ["lire_image", { capability: "vision", mutation: false }],
  // Sharingan direct (2026-07-11) — même capacité "vision" (regarde un rendu/une
  // image), déterministe (pas de coût VL), toujours dispo dès que vision ∈ requiredCaps.
  ["sharingan_url", { capability: "vision", mutation: false }],
  ["sharingan_image", { capability: "vision", mutation: false }],
  // Médias — chercher_image ne mute pas (rend des URLs) ; générer/découper écrit sur disque.
  ["chercher_image", { capability: "media-gen", mutation: false }],
  ["genere_image", { capability: "media-gen", mutation: true }],
  ["decoupe_assets", { capability: "media-gen", mutation: true }],
  // Contenu — genere_contenu écrit un lot ; verifie_coherence_images juge (lecture/jugement).
  ["genere_contenu", { capability: "content-gen", mutation: true }],
  ["verifie_coherence_images", { capability: "content-gen", mutation: false }],
  // Écriture / exécution / dépendances — MUTANTS (interdits sous plafond read-only).
  ["write_file", { capability: "write-fs", mutation: true }],
  ["edit_file", { capability: "write-fs", mutation: true }],
  ["run_command", { capability: "run-cmd", mutation: true }],
  ["add_dependency", { capability: "deps", mutation: true }],
  // Palier système (#180 É6, gate DESKTOP_SYSTEM_SHELL) — effets de bord SYSTÈME
  // (spawn OS, ouverture de fenêtre/navigateur) : classés run-cmd/mutants comme
  // run_command, pour qu'un futur plafond read-only les exclue par défaut.
  ["run_system_command", { capability: "run-cmd", mutation: true }],
  ["open_url", { capability: "run-cmd", mutation: true }],
  ["open_folder", { capability: "run-cmd", mutation: true }],
  ["reveal_in_explorer", { capability: "run-cmd", mutation: true }],
  // Tests — lance_tests rejoue (lecture) ; ecris_test écrit un fichier de test.
  ["teste_parcours", { capability: "test", mutation: false }],
  ["lance_tests", { capability: "test", mutation: false }],
  ["ecris_test", { capability: "test", mutation: true }],
  // Plan — pas d'effet de bord disque (annote un plan en mémoire).
  ["planifier", { capability: "plan", mutation: false }],
  ["etape_faite", { capability: "plan", mutation: false }],
  ["etape_bloquee", { capability: "plan", mutation: false }],
  // Sentinelle de terminaison — pas de mutation, mais capacité « build-control ».
  ["finish", { capability: "build-control", mutation: false }],
  // Assemblage d'infra — écrit dans le projet.
  ["assemble_brique", { capability: "assemble", mutation: true }],
  // Secret — injecte une valeur dans un appel sortant (effet de bord réseau).
  ["utilise_secret", { capability: "secret", mutation: true }],
  // Unity — build/test headless (lecture de résultat, pas d'écriture de source).
  ["unity_build", { capability: "unity", mutation: false }],
  ["unity_test", { capability: "unity", mutation: false }],
]);

/** Plafond de mutation imposé par la POSTURE (D1, axe sûreté). */
export type MutationCeiling = "read-only" | "mutation";

/** Capacités requises par l'INTENTION (D2). `"all"` = toutes (préréglage Construire :
 *  aucun filtre de capacité, seul le plafond de mutation s'applique). */
export type RequiredCaps = ReadonlySet<Capability> | "all";

/** Capacités par défaut du préréglage DISCUTER : lecture locale + lecture web. La vision,
 *  la mémoire d'artefacts, le plan, les tests, la génération… ne sont PAS offerts par
 *  défaut (mais le DEVIENNENT si É2 les ajoute à requiredCaps — cf. la preuve du trou). */
export const DISCUSS_DEFAULT_CAPS: ReadonlySet<Capability> = new Set<Capability>(["read-local", "read-web"]);

/** Noms de tous les outils MUTANTS connus (pour le plafond read-only en mode « toutes capacités »). */
export function mutationToolNames(): string[] {
  const out: string[] = [];
  for (const [name, cap] of TOOL_CAPABILITIES) if (cap.mutation) out.push(name);
  return out;
}

/**
 * Traduit (plafond de mutation, capacités requises) en `ToolPolicy` #175, appliquée par
 * `applyToolPolicy` sur le registre unifié. RÉUTILISE le mécanisme existant, ne le réinvente pas.
 *
 * - `requiredCaps === "all"` (préréglage Construire) :
 *     · plafond `mutation`  → `{}` (identité : aucun filtre, tout le registre survit).
 *     · plafond `read-only` → denylist de TOUS les outils mutants (lecture pure, toutes capacités).
 * - `requiredCaps` = ensemble précis (Discuter, É2) : allowlist = les outils dont la capacité
 *     est requise ET (sous plafond read-only) NON mutants. Un outil requis mais mutant est
 *     écarté par le plafond — la posture ne gouverne QUE l'effet de bord.
 *
 * PUR & déterministe. `finish` reste protégé par `applyToolPolicy` (ALWAYS_KEEP) UNIQUEMENT
 * s'il est présent dans le registre passé : le préréglage Discuter le construit SANS finish.
 */
export function policyFromCaps(ceiling: MutationCeiling, requiredCaps: RequiredCaps): ToolPolicy {
  const readOnly = ceiling === "read-only";

  if (requiredCaps === "all") {
    if (!readOnly) return {};
    return { deniedTools: mutationToolNames() };
  }

  const allowedTools: string[] = [];
  for (const [name, cap] of TOOL_CAPABILITIES) {
    if (!requiredCaps.has(cap.capability)) continue;
    if (readOnly && cap.mutation) continue;
    allowedTools.push(name);
  }
  return { allowedTools };
}

/**
 * Compose deux `ToolPolicy` (le préréglage de capacité PUIS la policy de l'appelant —
 * ex. l'allowlist scellée d'un sous-agent #175). Allowlists → INTERSECTION (les deux
 * doivent autoriser) ; denylists → UNION (l'une OU l'autre interdit) ; `allowRun` →
 * l'appelant (b) prime. Une policy `{}` est neutre (identité). PUR.
 */
export function mergePolicies(a: ToolPolicy, b: ToolPolicy): ToolPolicy {
  const out: ToolPolicy = {};

  if (a.allowedTools && b.allowedTools) {
    const bs = new Set(b.allowedTools);
    out.allowedTools = a.allowedTools.filter((n) => bs.has(n));
  } else if (a.allowedTools) {
    out.allowedTools = [...a.allowedTools];
  } else if (b.allowedTools) {
    out.allowedTools = [...b.allowedTools];
  }

  const denied = [...(a.deniedTools ?? []), ...(b.deniedTools ?? [])];
  if (denied.length) out.deniedTools = denied;

  if (a.allowRun !== undefined || b.allowRun !== undefined) out.allowRun = b.allowRun ?? a.allowRun;

  return out;
}
