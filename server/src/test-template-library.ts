// Tests de la bibliothèque de templates de domaine (nuit 2026-07-03).
// PUR + disque réel : parsing des manifests, détection FR/EN/accents, seuil
// anti-faux-positifs, repli "" quand rien ne matche, et chargement RÉEL des
// ~20 manifests de server/templates/*.md (tous parsables, aucun vide).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseManifest,
  normalize,
  loadDomainTemplates,
  detectDomain,
  domainTemplateSection,
  clearTemplateCache,
  scoreTemplate,
} from "./template-library.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-template-library");
console.log("─".repeat(60));

// ── 1. normalize ─────────────────────────────────────────────────────────────
console.log("\n[1] normalize");
check("désaccentue et minusculise", normalize("Événement Créé") === "evenement cree");

// ── 2. parseManifest ─────────────────────────────────────────────────────────
console.log("\n[2] parseManifest");
{
  const t = parseManifest(`---\ndomaine: test-dom\ndétection: [jeu, game, arcade épique]\n---\n# Titre\ncorps`);
  check("domaine + keywords + body", t?.domaine === "test-dom" && t?.keywords.length === 3 && t?.body.startsWith("# Titre"));
  check("keywords normalisés", t?.keywords.includes("arcade epique") === true);
  check("sans frontmatter → null", parseManifest("# pas de frontmatter") === null);
  check("frontmatter sans détection → null", parseManifest(`---\ndomaine: x\n---\ncorps`) === null);
}

// ── 3. détection sur un dossier temporaire contrôlé ──────────────────────────
console.log("\n[3] détection (dossier contrôlé)");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-"));
  fs.writeFileSync(path.join(dir, "jeu.md"), `---\ndomaine: jeu-arcade\ndétection: [jeu, game, arcade, shooter]\n---\nCORPS-JEU`);
  fs.writeFileSync(path.join(dir, "resto.md"), `---\ndomaine: restaurant\ndétection: [restaurant, resto, menu, café]\n---\nCORPS-RESTO`);
  fs.mkdirSync(path.join(dir, "vitrine")); // starter technique (dossier) → ignoré
  fs.writeFileSync(path.join(dir, "vitrine", "notes.md"), "pas un manifest racine");
  clearTemplateCache(dir);

  check("2 manifests chargés (dossiers ignorés)", loadDomainTemplates(dir).length === 2);
  check("détection FR (jeu + arcade)", detectDomain("fais-moi un jeu d'arcade spatial", dir)?.domaine === "jeu-arcade");
  check("détection EN (game + shooter)", detectDomain("build a space shooter game", dir)?.domaine === "jeu-arcade");
  check("détection accents (café → cafe)", detectDomain("un site pour mon café-restaurant de quartier", dir)?.domaine === "restaurant");
  check("« jeudi » ne matche PAS « jeu » (frontière de mots)", detectDomain("réunion jeudi arcade", dir)?.domaine === "jeu-arcade" ? scoreTemplate(loadDomainTemplates(dir)[0]!, normalize("réunion jeudi")) === 0 : true);
  check("un seul mot-clé court → sous le seuil (null)", detectDomain("une app avec un menu déroulant", dir) === null);
  check("aucun match → null + section vide", detectDomain("un convertisseur d'unités", dir) === null && domainTemplateSection("un convertisseur d'unités", dir) === "");
  check("section injectable contient le corps", domainTemplateSection("un jeu arcade rétro", dir).includes("CORPS-JEU"));

  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 4. les VRAIS manifests de server/templates ───────────────────────────────
console.log("\n[4] manifests réels (server/templates/*.md)");
{
  const real = loadDomainTemplates();
  check(`≥ 20 manifests chargés (trouvés : ${real.length})`, real.length >= 20);
  check("tous ont ≥ 4 mots-clés", real.every((t) => t.keywords.length >= 4));
  check("tous ont un corps substantiel (≥ 800 car)", real.every((t) => t.body.length >= 800));
  check("domaines uniques", new Set(real.map((t) => t.domaine)).size === real.length);
  // Chaque manifest porte les sections du format gold standard.
  const sections = ["Angle", "Squelette", "Design", "Pièges"];
  const manquants = real.filter((t) => !sections.every((s) => t.body.includes(s)));
  check(`format gold standard partout (manquants : ${manquants.map((t) => t.domaine).join(",") || "aucun"})`, manquants.length === 0);
  // Détections de bout en bout sur des demandes réalistes.
  check("« landing page pour ma startup SaaS » → landing-saas", detectDomain("une landing page pour ma startup SaaS")?.domaine === "landing-saas");
  check("« dashboard de monitoring dark » → dashboard", detectDomain("un dashboard de monitoring en dark mode")?.domaine === "dashboard");
  check("« site pour mon restaurant italien » → restaurant", detectDomain("un site pour mon restaurant italien avec le menu")?.domaine === "restaurant");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} template-library : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
