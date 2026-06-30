// Cœur PUR du chantier #169 — « bibliothèque de briques d'infra back-end ».
// Découvre / valide / résout les manifestes `brick.json` d'un dossier `_bricks/`,
// et produit un PLAN D'ASSEMBLAGE déterministe (deps à ajouter, env à poser, snippets de montage).
// Aucune I/O directe : les accès disque sont injectés (BricksIO) → 100% testable sans FS ni réseau.
// Ne lève jamais sur une entrée malformée : renvoie des listes d'erreurs.

export interface BrickEnvVar {
  name: string;
  required: boolean;
  description?: string;
  example?: string;
}

export interface BrickMount {
  import: string;
  use: string;
}

export interface BrickManifest {
  name: string;
  title: string;
  description: string;
  level: "core" | "app";
  base?: string;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  env: BrickEnvVar[];
  files: string[];
  mount: BrickMount;
  provides: string[];
  requires: string[];
  tests?: string;
}

const LEVELS = new Set(["core", "app"]);

function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Valide un objet brut → liste de problèmes (vide = valide). Ne lève jamais. */
export function validateBrickManifest(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return ["manifeste : objet attendu"];
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) errors.push("name manquant");
  if (typeof o.title !== "string" || !o.title.trim()) errors.push("title manquant");
  if (typeof o.description !== "string" || !o.description.trim()) errors.push("description manquante");
  if (typeof o.level !== "string" || !LEVELS.has(o.level)) errors.push("level doit être 'core' ou 'app'");
  if (!o.files || !Array.isArray(o.files) || asStringArray(o.files).length === 0) errors.push("files : liste non vide attendue");
  const mount = o.mount as Record<string, unknown> | undefined;
  if (!mount || typeof mount.import !== "string" || typeof mount.use !== "string") {
    errors.push("mount.import et mount.use (strings) requis");
  }
  // env : si présent, chaque entrée doit avoir un name
  if (o.env !== undefined) {
    if (!Array.isArray(o.env)) errors.push("env doit être une liste");
    else o.env.forEach((e, i) => {
      if (!e || typeof e !== "object" || typeof (e as any).name !== "string") errors.push(`env[${i}].name manquant`);
    });
  }
  return errors;
}

/** Normalise un objet validé en BrickManifest plein (defaults sûrs). */
export function normalizeBrickManifest(raw: Record<string, unknown>): BrickManifest {
  const envRaw = Array.isArray(raw.env) ? (raw.env as unknown[]) : [];
  const env: BrickEnvVar[] = envRaw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as any).name === "string")
    .map((e) => ({
      name: String(e.name),
      required: e.required === true,
      description: typeof e.description === "string" ? e.description : undefined,
      example: typeof e.example === "string" ? e.example : undefined,
    }));
  const mount = (raw.mount ?? {}) as Record<string, unknown>;
  return {
    name: String(raw.name),
    title: String(raw.title),
    description: String(raw.description),
    level: raw.level === "app" ? "app" : "core",
    base: typeof raw.base === "string" ? raw.base : undefined,
    dependencies: asStringRecord(raw.dependencies),
    optionalDependencies: asStringRecord(raw.optionalDependencies),
    devDependencies: asStringRecord(raw.devDependencies),
    env,
    files: asStringArray(raw.files),
    mount: { import: String(mount.import ?? ""), use: String(mount.use ?? "") },
    provides: asStringArray(raw.provides),
    requires: asStringArray(raw.requires),
    tests: typeof raw.tests === "string" ? raw.tests : undefined,
  };
}

export interface ParseResult {
  manifest: BrickManifest | null;
  errors: string[];
}

/** Parse tolérant du texte d'un brick.json → manifeste normalisé ou erreurs. Ne lève jamais. */
export function parseBrickManifest(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { manifest: null, errors: [`JSON invalide : ${(e as Error).message}`] };
  }
  const errors = validateBrickManifest(raw);
  if (errors.length) return { manifest: null, errors };
  return { manifest: normalizeBrickManifest(raw as Record<string, unknown>), errors: [] };
}

// ---- Découverte (I/O injectée) -------------------------------------------------

export interface BricksIO {
  /** noms d'entrées (dossiers) directement sous `dir` */
  readdir(dir: string): Promise<string[]>;
  /** lecture d'un fichier texte ; rejette si absent */
  readFile(path: string): Promise<string>;
}

export interface DiscoveredBrick {
  name: string;
  manifest: BrickManifest | null;
  errors: string[];
}

/** Liste les briques d'un dossier `_bricks/` : un sous-dossier = une brique avec son brick.json. */
export async function listBricks(bricksDir: string, io: BricksIO): Promise<DiscoveredBrick[]> {
  let entries: string[];
  try {
    entries = await io.readdir(bricksDir);
  } catch {
    return [];
  }
  const out: DiscoveredBrick[] = [];
  for (const name of entries.sort()) {
    const manifestPath = `${bricksDir}/${name}/brick.json`;
    try {
      const text = await io.readFile(manifestPath);
      const { manifest, errors } = parseBrickManifest(text);
      out.push({ name, manifest, errors });
    } catch {
      // pas de brick.json → ce n'est pas une brique, on l'ignore silencieusement
    }
  }
  return out;
}

// ---- Résolution de dépendances + plan d'assemblage -----------------------------

export interface DepConflict {
  dep: string;
  versions: string[];
  bricks: string[];
}

export interface MissingRequire {
  brick: string;
  requires: string;
}

export interface AssemblyPlan {
  /** ordre de montage : briques 'core' d'abord, puis 'app', stable par nom */
  order: string[];
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  env: BrickEnvVar[];
  mounts: { brick: string; import: string; use: string }[];
  conflicts: DepConflict[];
  missingRequires: MissingRequire[];
}

function mergeDeps(
  target: Record<string, string>,
  source: Record<string, string>,
  brick: string,
  seenBy: Map<string, { version: string; bricks: string[] }>,
) {
  for (const [dep, version] of Object.entries(source)) {
    const prev = seenBy.get(dep);
    if (!prev) {
      seenBy.set(dep, { version, bricks: [brick] });
      target[dep] = version;
    } else {
      // conserve la 1ʳᵉ version vue ; un éventuel conflit est signalé séparément
      prev.bricks.push(brick);
    }
  }
}

/**
 * Construit le plan d'assemblage de N briques (déjà validées).
 * - fusionne les dépendances (et signale les conflits de version)
 * - déduplique les variables d'env par nom
 * - ordonne core → app
 * - détecte les `requires` non satisfaits par les `provides` de l'ensemble
 */
export function buildAssemblyPlan(bricks: BrickManifest[]): AssemblyPlan {
  const ordered = [...bricks].sort((a, b) => {
    if (a.level !== b.level) return a.level === "core" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const dependencies: Record<string, string> = {};
  const optionalDependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const depSeen = new Map<string, { version: string; bricks: string[] }>();
  const optSeen = new Map<string, { version: string; bricks: string[] }>();
  const devSeen = new Map<string, { version: string; bricks: string[] }>();
  const conflictTrack = new Map<string, Set<string>>(); // dep → set de versions

  const trackConflict = (deps: Record<string, string>) => {
    for (const [dep, version] of Object.entries(deps)) {
      if (!conflictTrack.has(dep)) conflictTrack.set(dep, new Set());
      conflictTrack.get(dep)!.add(version);
    }
  };

  for (const b of ordered) {
    mergeDeps(dependencies, b.dependencies, b.name, depSeen);
    mergeDeps(optionalDependencies, b.optionalDependencies, b.name, optSeen);
    mergeDeps(devDependencies, b.devDependencies, b.name, devSeen);
    trackConflict(b.dependencies);
  }

  const conflicts: DepConflict[] = [];
  for (const [dep, versions] of conflictTrack) {
    if (versions.size > 1) {
      conflicts.push({ dep, versions: [...versions], bricks: depSeen.get(dep)?.bricks ?? [] });
    }
  }

  // env dédupliqué par nom (une variable = une entrée ; required gagne)
  const envByName = new Map<string, BrickEnvVar>();
  for (const b of ordered) {
    for (const e of b.env) {
      const prev = envByName.get(e.name);
      if (!prev) envByName.set(e.name, { ...e });
      else if (e.required && !prev.required) prev.required = true;
    }
  }

  // requires non satisfaits
  const provided = new Set<string>();
  for (const b of ordered) for (const p of b.provides) provided.add(p);
  const missingRequires: MissingRequire[] = [];
  for (const b of ordered) {
    for (const req of b.requires) {
      if (!provided.has(req)) missingRequires.push({ brick: b.name, requires: req });
    }
  }

  return {
    order: ordered.map((b) => b.name),
    dependencies,
    optionalDependencies,
    devDependencies,
    env: [...envByName.values()],
    mounts: ordered.map((b) => ({ brick: b.name, import: b.mount.import, use: b.mount.use })),
    conflicts,
    missingRequires,
  };
}
