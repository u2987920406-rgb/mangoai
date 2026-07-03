// MangoOS — Manifest des magasins de mémoire FICHIER (A0.2, socle 10 ans).
//
// Contexte : kernel-blackboard-sqlite.ts verse un PRAGMA user_version au
// Blackboard SQLite. Mais la majorité de la « mémoire apprise » de Mango vit
// dans des fichiers plats par projet (.axioms.md, .preferences.md, .references,
// procedures, lexique, skills...) — AUCUN d'eux ne trace sa version de format.
// Dans 10 ans, on ne pourra pas savoir si un fichier trouvé sur disque
// correspond à ce que le code courant sait lire. Ce manifest centralise UNE
// version par magasin, dans un seul fichier `workspace/.memory-manifest.json`,
// à côté des magasins qu'il décrit (jamais À L'INTÉRIEUR d'un magasin, pour ne
// jamais gêner un outil qui lit .axioms.md brut).
//
// Lecture : TOUJOURS fail-open (absent, corrompu, ou version future — jamais
// un throw, jamais un blocage). Écriture : gate-protégée (MEMORY_MANIFEST,
// cf. flags.ts) — tant que le gate est OFF, ensureManifest ne crée RIEN, donc
// le comportement actuel du serveur est inchangé par ce module.
import path from "node:path";
import fs from "node:fs";
import { atomicWriteFileSync } from "./safe-io.js";
import { flag } from "./flags.js";

export const MANIFEST_FILE_NAME = ".memory-manifest.json";

/** Version de schéma COURANTE connue de CE binaire — à monter (jamais
 *  rétrograder) à chaque évolution du format d'un des magasins listés. */
export const CURRENT_MANIFEST_VERSION = 1;

/** Une version par magasin fichier connu. Ajouter une clé = ajouter un magasin
 *  suivi ; ne JAMAIS retirer une clé existante (compat 10 ans + manifests déjà
 *  écrits sur disque qui la portent encore). */
export interface MemoryManifest {
  schemaVersion: number;
  stores: {
    axioms: number;
    preferences: number;
    references: number;
    procedures: number;
    lexique: number;
    skills: number;
  };
}

/** Le manifest par défaut : schéma courant, tous les magasins connus à v1
 *  (l'état actuel, avant toute migration de format d'un magasin fichier). */
function defaultManifest(): MemoryManifest {
  return {
    schemaVersion: CURRENT_MANIFEST_VERSION,
    stores: { axioms: 1, preferences: 1, references: 1, procedures: 1, lexique: 1, skills: 1 },
  };
}

function manifestPath(workspaceDir: string): string {
  return path.join(workspaceDir, MANIFEST_FILE_NAME);
}

/**
 * Lit le manifest. Fail-open à chaque étage :
 *  - fichier absent          → défaut, SANS créer de fichier (lecture pure).
 *  - JSON corrompu / forme inattendue → défaut + warn.
 *  - schemaVersion future (> CURRENT_MANIFEST_VERSION, ce binaire est plus
 *    vieux que le manifest) → warn « lecture seule conseillée » MAIS on
 *    retourne quand même le manifest lu (jamais de refus de démarrer).
 * Ne throw jamais.
 */
export function loadManifest(workspaceDir: string): MemoryManifest {
  const file = manifestPath(workspaceDir);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return defaultManifest(); // absent → défaut, on ne crée rien ici
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MemoryManifest> | null;
    if (
      !parsed ||
      typeof parsed.schemaVersion !== "number" ||
      typeof parsed.stores !== "object" ||
      parsed.stores === null
    ) {
      throw new Error("forme de manifest inattendue");
    }
    if (parsed.schemaVersion > CURRENT_MANIFEST_VERSION) {
      console.warn(
        `[memory-manifest] ${file} : schemaVersion ${parsed.schemaVersion} > ${CURRENT_MANIFEST_VERSION} (ce binaire) — manifest plus récent que ce binaire, lecture seule conseillée`,
      );
    }
    // Fusion avec les défauts : un magasin absent du fichier (ajouté au code
    // après l'écriture de CE manifest) reste défini plutôt que undefined.
    return {
      schemaVersion: parsed.schemaVersion,
      stores: { ...defaultManifest().stores, ...parsed.stores },
    };
  } catch (err) {
    console.warn(`[memory-manifest] ${file} illisible (JSON corrompu), défaut utilisé:`, err);
    return defaultManifest();
  }
}

/**
 * Écrit le manifest par défaut s'il est absent. No-op si :
 *  - le gate MEMORY_MANIFEST est OFF (défaut) — comportement actuel inchangé ;
 *  - un manifest existe déjà (on n'écrase jamais une version déjà tracée ici).
 * Fail-open à l'écriture (échec disque → warn, jamais de throw).
 */
export function ensureManifest(workspaceDir: string): void {
  if (!flag("MEMORY_MANIFEST")) return;
  const file = manifestPath(workspaceDir);
  if (fs.existsSync(file)) return;
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
    atomicWriteFileSync(file, JSON.stringify(defaultManifest(), null, 2));
  } catch (err) {
    console.warn(`[memory-manifest] écriture de ${file} impossible:`, err);
  }
}
