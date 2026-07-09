// 100% via MangoOS — pipeline COMPLET sur une app TOEIC, SANS intervention humaine.
// Elève GLM (via .env : ELEVE_PROVIDER=openai / ELEVE_MODEL=glm-5.2:cloud) + tout l'univers :
// auto-vérification (check_build + teste_parcours), auto-correction (boucle runRelay),
// Stratège #164, délégation, auto-évolution #168, Gardien de clôture #161 (Juge intention+goût+QA),
// puis audit MangoQA. Les gates sont fournis par l'environnement (voir la commande de lancement).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, projectDir } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { emitPhaseComplete, waitForVerdict, isMangoQaActive } from "../src/mangoqa.js";

const PROJECT_NAME = process.env.TOEIC_PROJECT || "toeic-mango";

const TOEIC_TASK = `Construis une maquette d'application web « TOEIC Quest » (React + Vite + Tailwind), DYNAMIQUE et INTERACTIVE, avec DEUX écrans navigables.

ÉCRAN ACCUEIL :
- En-tête : logo « TOEIC Quest », mascotte Mango (mangue orange souriante, en SVG), badge de série « 🔥 7 ».
- Hero : titre « Bon retour, futur champion ! », pastille « Score estimé : 650 ».
- Bandeau de stats : Niveau 4 · 1240 XP · 7 jours · 12 badges.
- 3 cartes de niveau avec barre de progression : Débutant 🌱 (350-550, 100%, terminé), Intermédiaire 🚀 (550-750, 45%, en cours), Avancé 🏆 (750-900+, 0%, verrouillé).
- Bouton « Continuer le parcours » qui mène à l'écran Quiz.

ÉCRAN QUIZ :
- Barre du haut : bouton retour, progression « Question 3 / 10 », timer.
- Badge « Part 3 · Conversation » (couleur bleue listening).
- Zone contexte : une illustration (art CSS/SVG d'une scène de bureau) + un indicateur audio animé.
- Question : « What does the woman suggest the man do? »
- 4 choix (A-D) : A. Reschedule the meeting · B. Call the client back · C. Send an email confirmation (BONNE RÉPONSE) · D. Book a larger conference room.
- Au clic sur un choix : feedback ANIMÉ (vert si correct, rouge sinon + met en évidence la bonne réponse C), mascotte qui réagit.
- Bouton « Question suivante ».

CONTRAINTES :
- Palette Mango : mango #F2A33C, coral #E8624A, listening #52BBE0, reading #4C8C14, fond crème #FDFBF7, texte #3A3632.
- Ton chaleureux en français, emojis, gamification.
- Design SOIGNÉ, DYNAMIQUE, INTERACTIF (animations, transitions, micro-interactions) — c'est LE point clé.
- Données factices, placeholders visuels (pas besoin de vraies images).
- La navigation entre les 2 écrans DOIT fonctionner. Build vert, zéro erreur console.`;

async function main() {
  const dir = projectDir(PROJECT_NAME);
  console.log("=== TOEIC 100% MangoOS — pipeline complet ===");
  console.log("MODELE ELEVE = " + (process.env.ELEVE_PROVIDER || "?") + "/" + (process.env.ELEVE_MODEL || "?"));
  console.log("MangoQA actif au demarrage : " + isMangoQaActive());

  if (!fs.existsSync(path.join(dir, "package.json"))) {
    console.log("Creation du projet « " + PROJECT_NAME + " »...");
    await createProject(PROJECT_NAME);
  } else {
    console.log("Projet existant — reprise");
  }

  console.log("Lancement du moteur COMPLET (Eleve + auto-verif + auto-correction + Stratege + delegation + auto-evolution + Gardien)...");
  const result: any = await runRelay(
    TOEIC_TASK,
    dir,
    { maitreModel: "sonnet", onLog: (line: string) => console.log("[relay] " + line) },
    defaultRelayDeps,
  );

  console.log("=== BUILD : " + (result?.success ? "OK" : "KO") +
    " — resolu par " + result?.resolvedBy +
    " en " + result?.attempts + " tentative(s), cout Claude $" + Number(result?.costUsd || 0).toFixed(3) + " ===");
  if (!result?.success) console.log("Signal build : " + (result?.inspection?.signal ?? "?"));

  // ---- Audit MangoQA (fail-open) ----
  if (isMangoQaActive()) {
    console.log("Audit MangoQA en cours...");
    try {
      emitPhaseComplete(PROJECT_NAME, "build-complete", []);
      const verdict: any = await waitForVerdict(PROJECT_NAME, 120_000);
      if (verdict) {
        console.log("=== MangoQA : " + (verdict.verdict === "green" ? "GREEN" : "RED") + " ===");
        if (verdict.rejection) console.log("MangoQA rejet : " + verdict.rejection.corrective_action + " (" + verdict.rejection.branch + ")");
        if (verdict.branches) for (const [b, v] of Object.entries<any>(verdict.branches)) console.log("  - " + b + " : " + v.status);
      } else {
        console.log("=== MangoQA : timeout/indisponible (fail-open) ===");
      }
    } catch (e: any) {
      console.log("=== MangoQA erreur (fail-open) : " + (e?.message ?? e) + " ===");
    }
  } else {
    console.log("=== MangoQA non actif (sentinelle absente) ===");
  }

  console.log("=== FINI. Projet : " + dir + " ===");
}

main().catch((e) => { console.error("FATAL", e instanceof Error ? e.stack : e); process.exitCode = 1; });
