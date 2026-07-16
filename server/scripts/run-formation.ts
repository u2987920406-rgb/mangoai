import "dotenv/config";
// CLI de la Fabrique (#181 É3) — sujet → formation complète, RESUMABLE par le manifest.
//
//   npx tsx server/src/run-formation.ts "la photographie argentique"
//   npx tsx server/src/run-formation.ts "les bases de l'espresso" --modules=3
//   npx tsx server/src/run-formation.ts "..." --dir=D:/chemin/vers/le/projet
//
// Reprend automatiquement : si `formation.json` existe déjà dans le dossier cible, on
// repart du premier module NON `verifie` (D6) — tuer le process en plein milieu puis
// relancer la même commande reprend exactement là où ça s'est arrêté, sans tout refaire.
//
// ELEVE_CLOSURE_GATE est forcé "on" si absent (règle absolue du projet : le Gardien de
// clôture est TOUJOURS actif). Positionne-le explicitement à "off" en amont si tu sais
// vraiment ce que tu fais (jamais recommandé).
if (!process.env.ELEVE_CLOSURE_GATE) process.env.ELEVE_CLOSURE_GATE = "on";

import { runFormationFabrique, realFabriqueDeps } from "../src/formation/formation-fabrique.js";

function argFlag(args: string[], name: string): string | undefined {
  const pfx = `--${name}=`;
  const hit = args.find((a) => a.startsWith(pfx));
  return hit ? hit.slice(pfx.length) : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const sujet = positional.join(" ").trim();
  if (!sujet) {
    console.error('Usage : npx tsx server/src/run-formation.ts "sujet" [--modules=N] [--items-par-type=N] [--dir=chemin]');
    process.exit(1);
  }
  const nModules = Number(argFlag(args, "modules") ?? 6);
  const itemsParType = Number(argFlag(args, "items-par-type") ?? 4);
  const dirOverride = argFlag(args, "dir");

  console.log(`🍋 La Fabrique — génération de « ${sujet} »\n`);
  const result = await runFormationFabrique(
    sujet,
    { nModules, itemsParType, projectDir: dirOverride },
    realFabriqueDeps((line) => console.log(line)),
  );

  console.log(`\nDossier projet : ${result.projectDir}`);
  if (!result.ok) {
    console.error(`\n✗ Échec : ${result.error}`);
    console.error("Relance EXACTEMENT la même commande pour reprendre au premier module non vérifié.");
    process.exit(1);
  }
  console.log("✅ Fabrique terminée avec succès.");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
