// Tests skills.ts (#174) : expansion PURE + parsing frontmatter + garde-fou slug.
// Déterministe. Les cas readSkill/skillsPromptSection créent des fichiers temp
// sous .skills/ (préfixe __test174-) et les nettoient dans un finally.

import fs from "node:fs";
import path from "node:path";
import {
  expandSkillBody,
  parseArgNames,
  isValidSlug,
  readSkill,
  skillsPromptSection,
  listSkills,
  SKILLS_DIR,
} from "./skills.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ---- expandSkillBody : substitution façon Claude Code ----
check("$ARGUMENTS → tout le texte", expandSkillBody("Déploie $ARGUMENTS maintenant", "staging eu") === "Déploie staging eu maintenant");
check("positionnels $1 $2", expandSkillBody("de $1 vers $2", "a b") === "de a vers b");
check("$2 manquant → vide", expandSkillBody("x=$1;y=$2", "seul") === "x=seul;y=");
check("noms du frontmatter", expandSkillBody("cible $env région $zone", "prod eu", ["env", "zone"]) === "cible prod région eu");
check("préfixe : $env n'entame pas $environnement", expandSkillBody("start=$environnement end=$env", "LONG COURT", ["environnement", "env"]) === "start=LONG end=COURT");
check("aucun placeholder + args → annexe", expandSkillBody("Fais le ménage.", "dossier tmp") === "Fais le ménage.\n\ndossier tmp");
check("aucun placeholder + aucun arg → corps tel quel", expandSkillBody("Corps seul.", "") === "Corps seul.");
check("$10 lu comme nombre complet (pas $1 puis 0)", expandSkillBody("$10", "a b c d e f g h i j") === "j");
check("$ARGUMENTS vide → chaîne vide", expandSkillBody("[$ARGUMENTS]", "") === "[]");
check("placeholder présent + pas d'arg → pas d'annexe", expandSkillBody("Salut $1.", "") === "Salut .");

// ---- parseArgNames ----
check("crochets", JSON.stringify(parseArgNames("[a, b]")) === JSON.stringify(["a", "b"]));
check("sans crochets", JSON.stringify(parseArgNames("env, zone")) === JSON.stringify(["env", "zone"]));
check("guillemets retirés", JSON.stringify(parseArgNames('["x"]')) === JSON.stringify(["x"]));
check("noms invalides filtrés", JSON.stringify(parseArgNames("[1nom, ok]")) === JSON.stringify(["ok"]));
check("undefined → []", parseArgNames(undefined).length === 0);

// ---- isValidSlug (anti path-traversal) ----
check("slug valide", isValidSlug("deploy-staging"));
check("traversal .. rejeté", !isValidSlug("../etc"));
check("slash rejeté", !isValidSlug("a/b"));
check("point rejeté", !isValidSlug("a.b"));
check("vide rejeté", !isValidSlug(""));

// ---- readSkill + skillsPromptSection (intégration légère, fichiers temp) ----
const tmpManual = "__test174-manual";
const tmpAuto = "__test174-auto";
const dirManual = path.join(SKILLS_DIR, tmpManual);
const dirAuto = path.join(SKILLS_DIR, tmpAuto);
try {
  fs.mkdirSync(dirManual, { recursive: true });
  fs.mkdirSync(dirAuto, { recursive: true });
  fs.writeFileSync(
    path.join(dirManual, "SKILL.md"),
    "---\nname: Déploiement\ndescription: Déploie l'app\ndisable-model-invocation: true\narguments: [environnement]\n---\nDéploie $environnement.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dirAuto, "SKILL.md"),
    "---\nname: Test auto\ndescription: skill passive\n---\nCorps auto.\n",
    "utf8",
  );

  const manual = readSkill(tmpManual);
  check("readSkill : body parsé", manual?.body === "Déploie $environnement.");
  check("readSkill : disable-model-invocation lu", manual?.disableModelInvocation === true);
  check("readSkill : arguments lus", JSON.stringify(manual?.arguments) === JSON.stringify(["environnement"]));
  check("readSkill : slug renseigné", manual?.slug === tmpManual);
  check("readSkill : expansion via corps réel", expandSkillBody(manual!.body, "prod", manual!.arguments) === "Déploie prod.");
  check("readSkill slug inconnu → null", readSkill("__inexistant174") === null);
  check("readSkill slug invalide → null", readSkill("../x") === null);

  const section = skillsPromptSection();
  check("skillsPromptSection : skill manuelle EXCLUE", !section.includes(tmpManual));
  check("skillsPromptSection : skill passive INCLUSE", section.includes(tmpAuto));

  const slugs = listSkills().map((s) => s.slug);
  check("listSkills expose le slug", slugs.includes(tmpManual) && slugs.includes(tmpAuto));
} finally {
  fs.rmSync(dirManual, { recursive: true, force: true });
  fs.rmSync(dirAuto, { recursive: true, force: true });
}

console.log(`\nskills (#174) : ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
