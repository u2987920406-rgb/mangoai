// Orchestration d'assemblage des briques d'infra back (#169) — cœur PUR, I/O injectée, ne lève jamais.
// S'appuie sur backend-bricks.ts (listBricks + buildAssemblyPlan). Résout les `requires` de façon
// TRANSITIVE (demander RGPD tire automatiquement auth), copie les fichiers des briques dans le projet,
// fusionne les dépendances dans package.json, et rend un rapport (env à poser, snippets de montage).
import {
  listBricks,
  buildAssemblyPlan,
  type BrickManifest,
  type BricksIO,
  type BrickEnvVar,
} from "./backend-bricks.js";

export interface AssembleDeps {
  /** I/O pour découvrir les manifestes dans le dossier des briques */
  bricksIO: BricksIO;
  /** lit un fichier d'une brique, chemin relatif au dossier des briques (ex. "auth/src/auth.ts") */
  readBrickFile: (relFromBricksDir: string) => string;
  /** lit un fichier du projet (null si absent) */
  readProjectFile: (relFromProject: string) => string | null;
  /** écrit un fichier dans le projet (création de dossiers incluse) */
  writeProjectFile: (relFromProject: string, data: string) => void;
}

export interface AssembleResult {
  ok: boolean;
  requested: string[];
  resolved: string[]; // briques finales, dans l'ordre de montage (core → app)
  autoAdded: string[]; // briques ajoutées pour satisfaire des `requires`
  written: string[]; // chemins projet écrits
  depsAdded: Record<string, string>;
  env: BrickEnvVar[];
  mounts: { brick: string; import: string; use: string }[];
  errors: string[];
}

function emptyResult(requested: string[]): AssembleResult {
  return { ok: false, requested, resolved: [], autoAdded: [], written: [], depsAdded: {}, env: [], mounts: [], errors: [] };
}

/** Catalogue des briques disponibles (pour que l'Élève sache quoi assembler). */
export async function listAvailableBricks(
  bricksDir: string,
  bricksIO: BricksIO,
): Promise<{ name: string; title: string; level: string; provides: string[]; requires: string[]; env: string[] }[]> {
  const discovered = await listBricks(bricksDir, bricksIO);
  return discovered
    .filter((d) => d.manifest)
    .map((d) => ({
      name: d.name,
      title: d.manifest!.title,
      level: d.manifest!.level,
      provides: d.manifest!.provides,
      requires: d.manifest!.requires,
      env: d.manifest!.env.map((e) => e.name),
    }));
}

export async function assembleBricks(
  bricksDir: string,
  requested: string[],
  deps: AssembleDeps,
): Promise<AssembleResult> {
  const result = emptyResult(requested);
  if (!requested.length) {
    result.errors.push("aucune brique demandée");
    return result;
  }

  const discovered = await listBricks(bricksDir, deps.bricksIO);
  const byName = new Map<string, BrickManifest>();
  const providerOf = new Map<string, string>(); // un `provides` → la brique qui le fournit
  for (const d of discovered) {
    if (!d.manifest) continue;
    byName.set(d.name, d.manifest);
    for (const p of d.manifest.provides) providerOf.set(p, d.name);
  }

  // validation des noms demandés
  const selected = new Set<string>();
  for (const name of requested) {
    if (!byName.has(name)) result.errors.push(`brique inconnue : « ${name} »`);
    else selected.add(name);
  }
  if (result.errors.length) return result;

  // résolution TRANSITIVE des `requires` (auto-ajout des briques fournissant ce qui manque)
  const queue = [...selected];
  while (queue.length) {
    const m = byName.get(queue.shift()!)!;
    for (const req of m.requires) {
      const already = [...selected].some((s) => byName.get(s)!.provides.includes(req));
      if (already) continue;
      const provider = providerOf.get(req);
      if (!provider) {
        result.errors.push(`dépendance « ${req} » de ${m.name} introuvable parmi les briques`);
        continue;
      }
      if (!selected.has(provider)) {
        selected.add(provider);
        result.autoAdded.push(provider);
        queue.push(provider);
      }
    }
  }
  if (result.errors.length) return result;

  const manifests = [...selected].map((n) => byName.get(n)!);
  const plan = buildAssemblyPlan(manifests);
  for (const c of plan.conflicts) result.errors.push(`conflit de version : ${c.dep} (${c.versions.join(" vs ")}) entre ${c.bricks.join(", ")}`);
  for (const mr of plan.missingRequires) result.errors.push(`dépendance non satisfaite : ${mr.brick} requiert « ${mr.requires} »`);
  if (result.errors.length) return result;

  result.resolved = plan.order;
  result.mounts = plan.mounts;
  result.env = plan.env;
  result.depsAdded = { ...plan.dependencies };

  // copie des fichiers de chaque brique dans le projet (ordre core → app)
  for (const name of plan.order) {
    const m = byName.get(name)!;
    for (const f of m.files) {
      let content: string;
      try {
        content = deps.readBrickFile(`${name}/${f}`);
      } catch (e) {
        result.errors.push(`lecture ${name}/${f} : ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      try {
        deps.writeProjectFile(f, content);
        result.written.push(f);
      } catch (e) {
        result.errors.push(`écriture ${f} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // fusion des dépendances dans package.json (sans écraser l'existant)
  try {
    const raw = deps.readProjectFile("package.json");
    const pkg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    pkg.dependencies = { ...((pkg.dependencies as Record<string, string>) ?? {}), ...plan.dependencies };
    if (Object.keys(plan.devDependencies).length) {
      pkg.devDependencies = { ...((pkg.devDependencies as Record<string, string>) ?? {}), ...plan.devDependencies };
    }
    deps.writeProjectFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
    result.written.push("package.json");
  } catch (e) {
    result.errors.push(`package.json : ${e instanceof Error ? e.message : String(e)}`);
  }

  result.ok = result.errors.length === 0;
  return result;
}
