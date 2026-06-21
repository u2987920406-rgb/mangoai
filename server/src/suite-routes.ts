// #138 OS d'apps — Surface « Suite » (le shell qui révèle que les apps se parlent).
//
// La fenêtre Suite (ui/SuiteWindow.jsx) interroge ces routes pour : (a) lister
// les apps CONFORMES (celles qui ont un `.mangoapp.json`), (b) tracer le graphe
// des collections partagées (quelle app lit/écrit quoi), (c) afficher un aperçu
// LIVE de la donnée partagée. Lecture seule + scan de fichiers : aucun effet de
// bord, aucune génération ici.
import type { Express } from "express";
import { listProjects, projectDir } from "./projects.js";
import { loadManifest, type MangoAppManifest } from "./mango-app-contract.js";
import { listDocs } from "./shared-data.js";

interface SuiteApp {
  project: string;
  manifest: MangoAppManifest;
}

// Un nœud du graphe des collections : qui la lit, qui l'écrit, combien de docs.
interface CollectionNode {
  name: string;
  readers: string[];
  writers: string[];
  docCount: number;
}

function collectApps(): SuiteApp[] {
  const apps: SuiteApp[] = [];
  for (const project of listProjects()) {
    const manifest = loadManifest(projectDir(project));
    if (manifest) apps.push({ project, manifest });
  }
  return apps;
}

/** Agrège le graphe des collections à partir des manifests des apps conformes. */
function buildCollectionGraph(apps: SuiteApp[]): CollectionNode[] {
  const map = new Map<string, CollectionNode>();
  for (const { manifest } of apps) {
    for (const c of manifest.collections) {
      const node = map.get(c.name) ?? { name: c.name, readers: [], writers: [], docCount: 0 };
      const reads = c.access === "read" || c.access === "readwrite";
      const writes = c.access === "write" || c.access === "readwrite";
      if (reads && !node.readers.includes(manifest.name)) node.readers.push(manifest.name);
      if (writes && !node.writers.includes(manifest.name)) node.writers.push(manifest.name);
      map.set(c.name, node);
    }
  }
  // Compte des documents LIVE de chaque collection (état réel du Blackboard).
  for (const node of map.values()) {
    node.docCount = listDocs(node.name).length;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function registerSuiteRoutes(app: Express): void {
  // Liste des apps conformes + graphe des collections partagées.
  app.get("/api/suite/apps", (_req, res) => {
    const apps = collectApps();
    res.json({ apps, collections: buildCollectionGraph(apps) });
  });

  // Aperçu live d'une collection précise (polling de la fenêtre Suite).
  app.get("/api/suite/collection/:name", (req, res) => {
    const name = req.params["name"] as string;
    res.json({ name, docs: listDocs(name) });
  });
}
