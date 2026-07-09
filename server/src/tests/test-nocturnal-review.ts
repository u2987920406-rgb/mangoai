// Tests des helpers PURS de la review QCM (nocturnal.ts) : regroupement par verdict +
// rétro-compat booléen + critère LoRA. Pas de LLM ni de fichiers.
import { summarizeReviewAnswers, reviewLoraCandidate } from "../nocturnal.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] summarizeReviewAnswers — regroupe par niveau (QCM gradué)");
{
  const s = summarizeReviewAnswers({
    code: "bien", typographie: "rate", couleurs: "adore", iconographie: "moyen", interface: "adore",
  });
  check("adored = couleurs + interface", s.adored.sort().join(",") === "couleurs,interface");
  check("liked = code", s.liked.join(",") === "code");
  check("meh = iconographie", s.meh.join(",") === "iconographie");
  check("rated = typographie", s.rated.join(",") === "typographie");
  check("answersText lisible (niveaux traduits)", /typographie: raté/.test(s.answersText) && /couleurs: adoré/.test(s.answersText));
}

console.log("\n[2] rétro-compat — ancien format booléen (oui/non)");
{
  const s = summarizeReviewAnswers({ charte_graphique: true, fonctionnel: false });
  check("true → liked", s.liked.includes("charte_graphique"));
  check("false → rated", s.rated.includes("fonctionnel"));
  check("answersText : oui/non", /charte_graphique: oui/.test(s.answersText) && /fonctionnel: non/.test(s.answersText));
}

console.log("\n[3] vide");
{
  const s = summarizeReviewAnswers({});
  check("answersText = (aucune)", s.answersText === "(aucune)");
  check("tous les groupes vides", s.adored.length === 0 && s.liked.length === 0 && s.meh.length === 0 && s.rated.length === 0);
}

console.log("\n[4] reviewLoraCandidate — visuel ET ergonomie appréciés");
{
  check("interface adoré + ergonomie bien → candidat", reviewLoraCandidate({ interface: "adore", ergonomie: "bien" }) === true);
  check("couleurs bien + ergonomie adoré → candidat", reviewLoraCandidate({ couleurs: "bien", ergonomie: "adore" }) === true);
  check("visuel aimé mais ergonomie ratée → NON", reviewLoraCandidate({ interface: "adore", ergonomie: "rate" }) === false);
  check("ergonomie aimée mais aucun visuel → NON", reviewLoraCandidate({ ergonomie: "adore" }) === false);
  check("ancien format charte_graphique:true + ergonomie:true → candidat", reviewLoraCandidate({ charte_graphique: true, ergonomie: true }) === true);
  check("tout raté → NON", reviewLoraCandidate({ interface: "rate", ergonomie: "rate" }) === false);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} nocturnal-review : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
