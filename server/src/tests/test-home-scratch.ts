// Tests des parties PURES de home-scratch (détection d'intention, slug, conv id) +
// graduation avec `createProject` INJECTÉ (pas de scaffold/npm réel).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeConvId, graduateSlug, detectsBuildIntent, homeScratchDir, ensureHomeScratch, cleanHomeScratch, graduateHomeScratch } from "../home-scratch.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] safeConvId — sûr pour un nom de dossier");
{
  check("nettoie les caractères spéciaux", safeConvId("c123/../x") === "c123x");
  check("vide → default", safeConvId("") === "default");
  check("borné", safeConvId("a".repeat(80)).length === 48);
}

console.log("\n[2] detectsBuildIntent — CONSERVATEUR (build franc seulement)");
{
  // Positifs (intention de construire)
  for (const s of [
    "construis-moi une app de recettes",
    "ok on construit le site maintenant",
    "tu peux coder ça ?",
    "je veux une application pour gérer mes courses",
    "implémente la page de réservation",
    "fais-moi un site vitrine",
  ]) check(`build: « ${s} »`, detectsBuildIntent(s) === true);
  // Négatifs (simple discussion / lecture)
  for (const s of [
    "comment vas-tu ?",
    "peux-tu lire cette archive et me dire ce qu'elle contient",
    "explique-moi ce format zip",
    "qu'est-ce que tu en penses ?",
    "résume ce PDF",
  ]) check(`pas build: « ${s} »`, detectsBuildIntent(s) === false);
}

console.log("\n[3] graduateSlug — slug projet propre");
{
  check("accents + espaces → kebab", graduateSlug("Mon Café Génial") === "mon-cafe-genial");
  check("vide → fallback", graduateSlug("") === "projet-mango");
}

console.log("\n[4] scratch dir — sous .home (caché → exclu de listProjects)");
{
  check("chemin contient .home", homeScratchDir("c1").includes(`${path.sep}.home${path.sep}`));
}

console.log("\n[5] ensure/clean — crée puis supprime le brouillon (+ .assets)");
{
  const id = `test-${process.pid}`;
  const dir = ensureHomeScratch(id);
  check("dossier .assets créé", fs.existsSync(path.join(dir, ".assets")));
  cleanHomeScratch(id);
  check("brouillon supprimé après clean", !fs.existsSync(dir));
}

console.log("\n[6] graduateHomeScratch — copie .assets + amorce l'historique, create INJECTÉ");
await (async () => {
  const id = `gradtest-${process.pid}`;
  const scratch = ensureHomeScratch(id);
  fs.writeFileSync(path.join(scratch, ".assets", "note.txt"), "bonjour");

  // create injecté : crée un dossier projet temporaire SANS scaffold/npm.
  const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "gradproj-"));
  const fakeCreate = async (_name: string) => projDir;

  const desired = `Grad Test ${process.pid}`; // unique → pas de collision avec un vrai projet
  const out = await graduateHomeScratch(id, desired, [
    { role: "user", content: "salut" },
    { role: "assistant", content: "coucou" },
  ], { create: fakeCreate as never });

  check("renvoie un nom de projet sluggé", out.name === graduateSlug(desired));
  check("pièce jointe copiée dans le projet", fs.existsSync(path.join(projDir, ".assets", "note.txt")));
  check("historique amorcé (.chat-history.json)", fs.existsSync(path.join(projDir, ".chat-history.json")));
  const hist = JSON.parse(fs.readFileSync(path.join(projDir, ".chat-history.json"), "utf8")) as Array<{ role: string; text: string }>;
  check("historique : user→user, assistant→agent", hist[0].role === "user" && hist[1].role === "agent" && hist[1].text === "coucou");
  check("brouillon nettoyé après graduation", !fs.existsSync(scratch));

  fs.rmSync(projDir, { recursive: true, force: true });
})();

console.log(`\n${fail === 0 ? "✅" : "❌"} home-scratch : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
