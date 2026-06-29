// Tests de la conscience des limites (capabilities.ts) — détecteur pur + clause.
import { detectOutOfScope, scopeAllowList, CAPABILITIES_CLAUSE, MANGOOS_CANNOT, MANGOOS_BUILDS } from "./capabilities.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] detectOutOfScope — repère la dérive hors périmètre");
{
  check("Unity → moteur de jeu natif", detectOutOfScope("je veux faire ça avec Unity").includes("moteur de jeu natif"));
  check("Natif Android → mobile natif", detectOutOfScope("plutôt en natif Android, Kotlin").includes("mobile natif"));
  check("Flutter → mobile natif", detectOutOfScope("on part sur Flutter ?").includes("mobile natif"));
  check("Unreal → moteur de jeu natif", detectOutOfScope("UNREAL engine pour la 3D").includes("moteur de jeu natif"));
  check("Android SDK → mobile natif", detectOutOfScope("faut configurer l'Android SDK").includes("mobile natif"));
  check("plusieurs familles cumulées", detectOutOfScope("Unity export iOS avec Swift").length >= 2);
}

console.log("\n[2] detectOutOfScope — pas de faux positifs sur le WEB légitime");
{
  check("React/Vite/Tailwind → vide", detectOutOfScope("une SPA React avec Vite et Tailwind") .length === 0);
  check("jeu web Three.js → vide (c'est dans le périmètre)", detectOutOfScope("un jeu 3D dans le navigateur avec Three.js").length === 0);
  check("texte vide → vide", detectOutOfScope("").length === 0);
  check("« community » ne matche pas « kotlin » par sous-chaîne", detectOutOfScope("on construit une app community").length === 0);
  check("« swiftly » ne matche pas « swift »", detectOutOfScope("ça doit charger swiftly").length === 0);
  check("PWA mobile → vide (installable web, pas natif)", detectOutOfScope("une PWA installable sur mobile").length === 0);
}

console.log("\n[3] CAPABILITIES_CLAUSE — contenu de la clause");
{
  check("cite Unity (l'exemple déclencheur)", /Unity/.test(CAPABILITIES_CLAUSE));
  check("dit de proposer l'équivalent WEB", /Three\.js|web/i.test(CAPABILITIES_CLAUSE));
  check("interdit de jouer un rôle / détailler un setup non exécuté", /rôle|setup/i.test(CAPABILITIES_CLAUSE));
  check("liste non vide de ce qu'on NE sait PAS faire", MANGOOS_CANNOT.length >= 3);
  check("liste non vide de ce qu'on SAIT faire", MANGOOS_BUILDS.length >= 2);
}

console.log("\n[4] detectOutOfScope — allow list (Phase 3a, gate Unity)");
{
  // Unity réintégré dans le périmètre quand le domaine Unity est actif.
  check("Unity flaggé par défaut", detectOutOfScope("un jeu sur Unity").includes("moteur de jeu natif"));
  check("Unity dans l'allow list → plus flaggé", detectOutOfScope("un jeu sur Unity", ["unity"]).length === 0);
  check("mais Unreal de la même famille reste flaggé malgré allow unity", detectOutOfScope("un jeu sur Unreal", ["unity"]).includes("moteur de jeu natif"));
  check("scopeAllowList vide sans ELEVE_UNITY", (delete process.env["ELEVE_UNITY"], scopeAllowList().length === 0));
  check("scopeAllowList = [unity] avec ELEVE_UNITY=on", ((process.env["ELEVE_UNITY"] = "on"), scopeAllowList().join() === "unity"));
  delete process.env["ELEVE_UNITY"];
}

console.log(`\n${fail === 0 ? "✅" : "❌"} capabilities : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
