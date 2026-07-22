// Preuve déterministe de l'assemblage du prompt (Coque Souple) : le gating par
// mode. Vérifie surtout que le bloc « tests auto » (idée 24) n'apparaît QU'en
// Élite, et au passage que les autres blocs Élite-only (analytic, plan, vision)
// sont bien gated. assembleSystemPrompt lit des magasins disque de façon
// tolérante (absents → ""), donc un projectDir bidon suffit.
//
// Lancer :  npx tsx src/test-scenario.ts

import os from "node:os";
import { assembleSystemPrompt } from "../scenario.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

const dir = os.tmpdir();
const elite = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir });
const mvp = assembleSystemPrompt({ mode: "mvp", model: "sonnet", projectDir: dir });
const eliteHaiku = assembleSystemPrompt({ mode: "elite", model: "haiku", projectDir: dir });

const TESTS = "Automated tests (optional";
const ANALYTIC = "Deep analysis";
const VISION_LOOP = "Closed visual loop"; // Élite
const VISION_MIN = "Visual self-check is minimal"; // MVP
const MOODBOARD_MVP = "MVP auto-grounding"; // moodboardMvp block (1 leader / 1 capture)
const CADRAGE = "Cadrage fondateur — multimodal grounding"; // idée #47, Élite-only
const MIROIR = "Le Miroir (.miroir.md) — comprehension mirror"; // idée #48, Élite-only
const CLARIF = "Proactive clarification — contradiction guardrail"; // idée #52, Élite+MVP

line("═");
console.log("scenario — gating des blocs par mode (Coque Souple)");
line();

// Idée 24 — le cœur de cette livraison
check("bloc tests PRÉSENT en Élite", elite.includes(TESTS));
check("bloc tests ABSENT en MVP", !mvp.includes(TESTS));

// Blocs Élite-only existants (régression)
check("analytic présent en Élite (sonnet)", elite.includes(ANALYTIC));
check("analytic absent en MVP", !mvp.includes(ANALYTIC));
check("analytic absent en Élite+haiku (gating modèle)", !eliteHaiku.includes(ANALYTIC));

// Vision : boucle complète en Élite, allégée en MVP
check("vision Élite = boucle complète", elite.includes(VISION_LOOP) && !elite.includes(VISION_MIN));
check("vision MVP = allégée", mvp.includes(VISION_MIN) && !mvp.includes(VISION_LOOP));

// Idée #56 Chantier C — bloc tutorial : présent UNIQUEMENT quand ctx.tutorial fourni
const TUTORIAL = "MODE TUTORIEL actif";
const eliteTut = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, tutorial: { id: 2 } });
const mvpTut = assembleSystemPrompt({ mode: "mvp", model: "sonnet", projectDir: dir, tutorial: { id: 1 } });
check("bloc tutorial absent hors tutoriel (Élite)", !elite.includes(TUTORIAL));
check("bloc tutorial absent hors tutoriel (MVP)", !mvp.includes(TUTORIAL));
check("bloc tutorial présent quand ctx.tutorial fourni (Élite)", eliteTut.includes(TUTORIAL) && eliteTut.includes("tutoriel 2"));
check("bloc tutorial présent quand ctx.tutorial fourni (MVP)", mvpTut.includes(TUTORIAL));
// D4 — Conscience temporelle : le prompt commence maintenant par "Contexte temporel"
// si TEMPORAL_AWARENESS=on (défaut). Le tutorial vient APRÈS la ligne temporelle.
const tutorialAfterTemporal = eliteTut.includes("Contexte temporel")
  ? eliteTut.split("\n").slice(2).join("\n").trimStart().startsWith("MODE TUTORIEL actif")
  : eliteTut.trimStart().startsWith("MODE TUTORIEL actif");
check("bloc tutorial en TÊTE du prompt (après contexte temporel)", tutorialAfterTemporal);

// Idée 7 — arborescence contextuelle (moodboard), Élite-only (bloc plan)
check("arborescence contextuelle présente en Élite", elite.includes("CONTEXTUAL INFORMATION ARCHITECTURE"));
check("arborescence contextuelle absente en MVP", !mvp.includes("CONTEXTUAL INFORMATION ARCHITECTURE"));

// PromptArchitect — mode architecte (scoping adaptatif progressif), Élite-only
check("mode architecte (scoping progressif) présent en Élite", elite.includes("ADAPTIVE & PROGRESSIVE"));
check("mode architecte absent en MVP", !mvp.includes("ADAPTIVE & PROGRESSIVE"));

// Moodboard MVP (idée #46 extension) — léger en MVP, absent en finition
const finition = assembleSystemPrompt({ mode: "finition", model: "sonnet", projectDir: dir });
check("moodboard MVP présent en mode MVP", mvp.includes(MOODBOARD_MVP));
check("moodboard MVP absent en Élite (couvert par bloc plan complet)", !elite.includes(MOODBOARD_MVP));
check("moodboard MVP absent en finition (phase freeze)", !finition.includes(MOODBOARD_MVP));

// Cadrage fondateur multimodal (idée #47) — chef d'orchestre Élite-only :
// présent en Élite, absent en MVP (a son moodboard léger) et en finition (freeze).
check("cadrage fondateur présent en Élite", elite.includes(CADRAGE));
check("cadrage fondateur absent en MVP", !mvp.includes(CADRAGE));
check("cadrage fondateur absent en finition (phase freeze)", !finition.includes(CADRAGE));

// Le Miroir (idée #48) — porte de validation Élite-only : présent en Élite,
// absent en MVP et en finition (freeze, pas de nouveau cadrage).
check("Le Miroir présent en Élite", elite.includes(MIROIR));
check("Le Miroir absent en MVP", !mvp.includes(MIROIR));
check("Le Miroir absent en finition (phase freeze)", !finition.includes(MIROIR));

// Clarification proactive (idée #52) — garde-fou cross-mode : présent en Élite
// ET en MVP (contradiction franche = 1 question même en mode rapide), absent en
// finition (freeze, pas de nouveau cadrage à clarifier).
check("clarification proactive présente en Élite", elite.includes(CLARIF));
check("clarification proactive présente en MVP", mvp.includes(CLARIF));
check("clarification proactive absente en finition (phase freeze)", !finition.includes(CLARIF));

// Mode nocturne (#58) — génération autonome : arsenal DESIGN d'Élite (moodboard
// COMPLET + vision complète + analytic) MAIS sans les portes humaines (cadrage
// qui sollicite, clarification, Miroir) ni le scoping architecte questionneur.
const nocturne = assembleSystemPrompt({ mode: "nocturne", model: "sonnet", projectDir: dir });
check("nocturne — moodboard COMPLET présent (arborescence contextuelle)", nocturne.includes("CONTEXTUAL INFORMATION ARCHITECTURE"));
check("nocturne — moodboard MVP léger absent (c'est le complet)", !nocturne.includes(MOODBOARD_MVP));
check("nocturne — scoping architecte questionneur ABSENT (pas de PLAN_RULES)", !nocturne.includes("ADAPTIVE & PROGRESSIVE"));
check("nocturne — cadrage (sollicite des refs) ABSENT", !nocturne.includes(CADRAGE));
check("nocturne — clarification (pose une question) ABSENTE", !nocturne.includes(CLARIF));
check("nocturne — Le Miroir (porte de validation) ABSENT", !nocturne.includes(MIROIR));
check("nocturne — vision complète présente (boucle fermée)", nocturne.includes(VISION_LOOP));
check("nocturne — analytic présent (sonnet)", nocturne.includes(ANALYTIC));
check("nocturne — tutorial absent (pas de tuto la nuit)", !nocturne.includes(TUTORIAL));

// Self-critique (idée #62) — constitutional check Élite-only : présent en Élite,
// absent en MVP, finition et nocturne (prompt-only, zéro fichier, zéro réseau).
const SELF_CRITIQUE = "constitutional check against axioms";
check("self-critique présent en Élite", elite.includes(SELF_CRITIQUE));
check("self-critique absent en MVP", !mvp.includes(SELF_CRITIQUE));
check("self-critique absent en finition", !finition.includes(SELF_CRITIQUE));
check("self-critique absent en nocturne", !nocturne.includes(SELF_CRITIQUE));

// Mode esthétique (#68) — polish graphique haute fidélité : graphicPolish +
// vision complète + analytic présents ; pas de nouveau scope (cadrage/miroir/plan)
// ni tutorial ni tests. Et le graphicPolish est absent des autres modes.
const GRAPHIC_POLISH = "Graphic polish — high-fidelity aesthetic pass";
const esthetique = assembleSystemPrompt({ mode: "esthetique", model: "sonnet", projectDir: dir });
check("esthetique — graphic polish PRÉSENT", esthetique.includes(GRAPHIC_POLISH));
check("esthetique — vision complète (boucle fermée) présente", esthetique.includes(VISION_LOOP));
check("esthetique — analytic présent (sonnet)", esthetique.includes(ANALYTIC));
check("esthetique — cadrage ABSENT (pas de nouveau scope)", !esthetique.includes(CADRAGE));
check("esthetique — Miroir ABSENT (pas de porte de validation)", !esthetique.includes(MIROIR));
check("esthetique — scoping architecte ABSENT (ADAPTIVE & PROGRESSIVE)", !esthetique.includes("ADAPTIVE & PROGRESSIVE"));
check("esthetique — tutorial ABSENT", !esthetique.includes(TUTORIAL));
check("esthetique — graphic polish ABSENT en Élite", !elite.includes(GRAPHIC_POLISH));
check("esthetique — graphic polish ABSENT en MVP", !mvp.includes(GRAPHIC_POLISH));
check("esthetique — graphic polish ABSENT en finition", !finition.includes(GRAPHIC_POLISH));

// Idée #99 — Perfect Plan : bloc injecté UNIQUEMENT quand perfectPlanSection fourni,
// présent en élite+mvp, absent en finition+esthetique+nocturne (SAUF si section fournie).
const PERFECT_PLAN = "PERFECT PLAN — CONTRAT CONTRAIGNANT";
const elitePP = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, perfectPlanSection: "## PERFECT PLAN — CONTRAT CONTRAIGNANT\ntest" });
const mvpPP   = assembleSystemPrompt({ mode: "mvp",   model: "sonnet", projectDir: dir, perfectPlanSection: "## PERFECT PLAN — CONTRAT CONTRAIGNANT\ntest" });
check("perfectPlan absent en Élite sans section (zéro poids)", !elite.includes(PERFECT_PLAN));
check("perfectPlan absent en MVP sans section (zéro poids)", !mvp.includes(PERFECT_PLAN));
check("perfectPlan présent en Élite quand section fournie", elitePP.includes(PERFECT_PLAN));
check("perfectPlan présent en MVP quand section fournie", mvpPP.includes(PERFECT_PLAN));
check("perfectPlan absent en finition", !finition.includes(PERFECT_PLAN));
check("perfectPlan absent en esthetique", !esthetique.includes(PERFECT_PLAN));
check("perfectPlan absent en nocturne", !nocturne.includes(PERFECT_PLAN));

// Idée #118 — réinjection des artefacts : bloc injecté UNIQUEMENT quand
// artifactsSection fourni, présent en élite+mvp, absent ailleurs / sans section.
const ARTIFACTS = "Palettes réutilisables — mémoire du Blackboard";
const sec = "## Palettes réutilisables — mémoire du Blackboard\n- projetX (cible, ~90% proche) : #000 #fff";
const eliteAR = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, artifactsSection: sec });
const mvpAR   = assembleSystemPrompt({ mode: "mvp",   model: "sonnet", projectDir: dir, artifactsSection: sec });
check("artefacts absent en Élite sans section (zéro poids)", !elite.includes(ARTIFACTS));
check("artefacts absent en MVP sans section (zéro poids)", !mvp.includes(ARTIFACTS));
check("artefacts présent en Élite quand section fournie", eliteAR.includes(ARTIFACTS));
check("artefacts présent en MVP quand section fournie", mvpAR.includes(ARTIFACTS));
check("artefacts absent en finition", !assembleSystemPrompt({ mode: "finition", model: "sonnet", projectDir: dir, artifactsSection: sec }).includes(ARTIFACTS));
check("artefacts absent en nocturne", !assembleSystemPrompt({ mode: "nocturne", model: "sonnet", projectDir: dir, artifactsSection: sec }).includes(ARTIFACTS));

// Idée #119 — composants pertinents + blueprint hint : injectés quand fournis,
// sinon retombent sur le comportement historique (dump complet / catalogue seul).
const compSec = "\n\nComposants réutilisables PERTINENTS pour cette tâche (lis workspace/.components/<Name>/component.tsx pour réutiliser) :\n- **DataTable**: table";
const eliteComp = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, componentsSection: compSec });
check("composants : section pertinente injectée quand fournie", eliteComp.includes("PERTINENTS pour cette tâche"));
check("composants : rules toujours présents (non-régression)", eliteComp.includes("Cross-project component library") && elite.includes("Cross-project component library"));
const eliteBP = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, blueprintHintSection: "\n\n→ Type de projet détecté pour cette demande : **dashboard**." });
check("blueprint hint injecté quand fourni", eliteBP.includes("Type de projet détecté"));
check("blueprint hint absent sans section (catalogue seul)", !elite.includes("Type de projet détecté"));
check("blueprints catalogue toujours présent", elite.includes("Project blueprints") && eliteBP.includes("Project blueprints"));

// Idée #120 — skills pertinents : section injectée quand fournie, sinon dump complet.
const skillSec = "\n\nLearned skills PERTINENTS pour cette tâche (how-to guides ; lis le SKILL.md et suis-le si l'un correspond) :\n- paginate: pagination";
const eliteSk = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: dir, skillsSection: skillSec });
check("skills : section pertinente injectée quand fournie", eliteSk.includes("skills PERTINENTS pour cette tâche"));
check("skills : relevance absente sans fourniture (comportement historique)", !elite.includes("skills PERTINENTS"));

// Figma retiré (#25) : son bloc ne doit plus apparaître dans aucun mode.
check("Figma absent des deux modes (intégration retirée)", !elite.includes("figma.com") && !mvp.includes("figma.com"));

// Clause de fidélité des sources : présente en Discuter (résumés fidèles), pas en build pur.
const discuss = assembleSystemPrompt({ mode: "discuss", model: "eleve", projectDir: dir });
check("clause FIDÉLITÉ présente en mode Discuter", discuss.includes("FIDÉLITÉ DES SOURCES"));
check("clause FIDÉLITÉ absente en build Élite", !elite.includes("FIDÉLITÉ DES SOURCES"));

// « Contexte d'abord » : présent dans les modes de BUILD (elite/mvp), absent en Discuter.
check("clause CONTEXTE D'ABORD présente en Élite", elite.includes("CONTEXTE D'ABORD"));
check("clause CONTEXTE D'ABORD présente en MVP", mvp.includes("CONTEXTE D'ABORD"));
check("clause CONTEXTE D'ABORD absente en Discuter (conseil, pas build)", !discuss.includes("CONTEXTE D'ABORD"));

// #196 (2026-07-22, incident réel « Open Design ») — garde-fou terme ambigu : Discuter doit
// demander une précision avant de chercher sur un terme générique, plutôt que de deviner sur
// le 1er résultat Google. Propre à Discuter (pas un mode de build).
check("clause TERME GÉNÉRIQUE/AMBIGU présente en Discuter", discuss.includes("TERME GÉNÉRIQUE/AMBIGU"));
check("clause TERME GÉNÉRIQUE/AMBIGU absente en build Élite (hors-sujet, pas de recherche web à l'aveugle en build)", !elite.includes("TERME GÉNÉRIQUE/AMBIGU"));

// Curseur de style — clause de DOSAGE entre 1 et 99 %, absente à 0/100/mode client.
const blend50 = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: dir, styleStrength: 50 });
const blend100 = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: dir, styleStrength: 100 });
const blend0 = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: dir, styleStrength: 0 });
const blendClient = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: dir, styleStrength: 50, clientMode: true });
check("curseur 50% → clause DOSAGE DE STYLE (avec ~50%)", blend50.includes("DOSAGE DE STYLE") && blend50.includes("~50%"));
check("curseur 100% (défaut) → pas de clause de dosage", !blend100.includes("DOSAGE DE STYLE"));
check("curseur 0% → pas de clause de dosage (le sujet domine)", !blend0.includes("DOSAGE DE STYLE"));
check("mode client prioritaire sur le curseur → pas de dosage", !blendClient.includes("DOSAGE DE STYLE"));

line("═");
if (failures === 0) {
  console.log("✅ Gating prouvé : tests/analytic/plan Élite-only, moodboard MVP en MVP only, vision adaptée au mode.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
