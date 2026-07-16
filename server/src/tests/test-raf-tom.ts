// Tests du module Theory of Mind (raf-tom.ts) — heuristique zéro-coût, persistée
// dans le Blackboard existant (scope raf:profil). Zéro réseau, déterministe.
import { Blackboard } from "../kernel/kernel-blackboard.js";
import { quickTone, updateProfile, calibrateEleve, tomSection, RAF_TOM_SCOPE } from "../stratege/raf-tom.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] quickTone — heuristique pure, zéro réseau");
{
  check("frustré : ??? / marche pas", quickTone("ça marche pas ???") === "frustré");
  check("pressé : commence par 'vite'", quickTone("vite, ajoute un bouton") === "pressé");
  check("fatigué : court + point final", quickTone("ok merci.") === "fatigué");
  check("exploratoire : message long/multi-lignes", quickTone("ligne1\nligne2\nligne3\nligne4") === "exploratoire");
  check("neutre par défaut", quickTone("ajoute un bouton retour") === "neutre");
}

console.log("\n[2] updateProfile — persistance Blackboard, moyenne mobile");
{
  const bb = new Blackboard(); // MemoryStore par défaut — suffisant, pas de prune ici
  const p1 = updateProfile("ça marche pas ??? je comprends pas", bb);
  check("tone détecté = frustré", p1.tone === "frustré");
  check("frustrationLevel monte depuis 0", p1.frustrationLevel > 0);

  const p2 = updateProfile("ok merci, c'est bon comme ça.", bb);
  check("frustrationLevel redescend après un message neutre/fatigué", p2.frustrationLevel < p1.frustrationLevel);
  check("profil bien relu depuis le Blackboard (pas recréé à zéro)", bb.get(RAF_TOM_SCOPE, "current") !== undefined);

  const p3 = updateProfile("x".repeat(400), bb);
  check("engagement augmente sur un message long", p3.engagement > p2.engagement);
}

console.log("\n[3] calibrateEleve — styles distincts selon le profil");
{
  const frustrated = calibrateEleve({ tone: "frustré", engagement: 0.5, frustrationLevel: 0.8, lastUpdated: 0 });
  check("frustration haute → température basse", (frustrated.temperature ?? 1) <= 0.3);

  const neutral = calibrateEleve({ tone: "neutre", engagement: 0, frustrationLevel: 0, lastUpdated: 0 });
  check("neutre → style par défaut, pas de frustration dans le style", !/théorie/.test(neutral.styleHint));

  const pressed = calibrateEleve({ tone: "pressé", engagement: 0.2, frustrationLevel: 0, lastUpdated: 0 });
  check("pressé → style orienté vitesse", /vitesse/.test(pressed.styleHint));
}

console.log("\n[4] tomSection — bloc de prompt borné et non vide");
{
  const s = tomSection({ tone: "exploratoire", engagement: 0.6, frustrationLevel: 0, lastUpdated: 0 });
  check("section non vide", s.length > 0);
  check("section raisonnablement bornée (< 300 car.)", s.length < 300);
  check("mentionne le style calibré", /structuré/.test(s));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} raf-tom : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
