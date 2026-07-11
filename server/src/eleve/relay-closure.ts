// (Chantier archi — découpage runRelay) Gardes de CLÔTURE partagées (Gardien
// texte/artisanat, teste_parcours, MangoQA). Extrait VERBATIM de relay.ts.
import fs from "node:fs";
import path from "node:path";
import { measureProjectDesign, measureSummary } from "../design/design-metrics.js";
import { startPreview } from "../preview.js";
import { runParcours } from "../eleve-parcours.js";
import { isMangoQaActive, emitPhaseComplete, waitForVerdict } from "../mangoqa.js";
import { publishParcoursResult } from "../kernel/kernel-design-events.js";

/** Le rouage de la bascule : l'Élève tente, MangoOS juge, le Maître escalade. */
// #b incrément 2 — teste_parcours de CLÔTURE : ouvre la preview et vérifie qu'AUCUNE
// erreur console n'apparaît au chargement (la vérif « ça marche vraiment » du #155,
// appliquée en clôture — y compris quand le Maître a résolu). Ne lève JAMAIS (best-effort :
// si la preview est injoignable, on n'invente pas d'erreur → ok:true).
// (N15, 2026-07-03) Résumé d'ARTISANAT statique — lit les fichiers du projet et
// rend les défauts mesurables (polices, échelle typo, couleurs littérales, motion)
// en UNE ligne de log. Déterministe, $0, best-effort (l'appelant catch).
export function measureCraftSummary(projectDir: string, changedFiles: string[]): string {
  const read = (rel: string): string => {
    try {
      return fs.readFileSync(path.join(projectDir, rel), "utf8");
    } catch {
      return "";
    }
  };
  const cssFiles = [read("src/index.css"), read("src/App.css")].filter(Boolean);
  const componentFiles = changedFiles
    .filter((f) => /\.(jsx|tsx)$/i.test(f))
    .map(read)
    .filter(Boolean);
  if (!cssFiles.length && !componentFiles.length) return "";
  const m = measureProjectDesign({ cssFiles, componentFiles, indexHtml: read("index.html"), packageJson: read("package.json") });
  // Seules les lignes N15 nous intéressent ici (contrastes/palette = déjà portés par la critique).
  const lines = measureSummary(m)
    .split("\n")
    .filter((l) => /polices|échelle typographique|littérales|statique|motion/i.test(l));
  return lines.length ? lines.map((l) => l.replace(/^- /, "")).join(" · ") : "";
}

export async function runClosureParcours(projectDir: string): Promise<{ ok: boolean; errors: string[]; skipped?: string }> {
  try {
    const { url } = await startPreview(projectDir);
    // (N7, nuit 2026-07-03) au-delà du seul chargement de l'accueil, deux SONDES
    // génériques provoquent les erreurs qui n'apparaissent qu'à l'INTERACTION
    // (le motif « cassé au 2ᵉ clic ») : cliquer un lien de nav interne, cliquer
    // le premier bouton visible. Ces sondes sont TOLÉRANTES : un élément
    // introuvable (app sans nav, canvas plein écran…) ne compte PAS comme un
    // échec — seules les erreurs CONSOLE qu'elles révèlent comptent.
    const report = await runParcours(url, [
      { description: "Clôture — chargement de l'accueil sans erreur console", attendu: { aucune_erreur_console: true } },
      { description: "Sonde — clic sur un lien de navigation interne", actions: [{ clickSelector: 'nav a[href^="/"], header a[href^="/"], nav a[href^="#"]' }, { wait: 600 }] },
      { description: "Sonde — clic sur le premier bouton visible", actions: [{ clickSelector: "main button, button" }, { wait: 600 }] },
    ]);
    const chargementOk = report.etapes[0]?.ok ?? report.ok;
    const errors = report.consoleErrors ?? [];
    const ok = chargementOk && errors.length === 0;
    // (2026-07-11) publie le fait dur sur le Bus — MangoQA n'a aucun autre moyen de
    // savoir si un parcours utilisateur a RÉELLEMENT tourné et réussi (jusqu'ici elle
    // ne constatait que la PRÉSENCE de fichiers de test dans le code).
    try {
      publishParcoursResult({
        project: path.basename(projectDir),
        ok,
        etapesOk: report.etapes.filter((e) => e.ok).length,
        etapesTotal: report.etapes.length,
        consoleErrors: errors,
      });
    } catch { /* best-effort */ }
    return { ok, errors };
  } catch (e) {
    // Fail-open assumé (tâche non-UI, preview impossible) mais JAMAIS silencieux :
    // « ok non vérifié » et « ok vérifié » ne doivent plus être indiscernables.
    return { ok: true, errors: [], skipped: (e as Error).message.split("\n")[0] };
  }
}

// #b incrément 3 — audit MangoQA de CLÔTURE : si MangoQA tourne (sentinelle), on émet le
// signal de phase et on attend son verdict ; un RED devient un critère de re-correction
// (comme le Gardien/parcours). Fail-open : MangoQA absent/timeout → ok:true (ne bloque jamais).
export async function runClosureMangoQA(projectDir: string): Promise<{ ok: boolean; action: string; skipped?: string }> {
  try {
    if (!isMangoQaActive()) return { ok: true, action: "" };
    const name = path.basename(projectDir);
    emitPhaseComplete(name, "closure", []);
    // Timeout paramétrable : un audit MangoQA « lourd » peut dépasser 60 s (~140 s pour un gros
    // projet). Défaut inchangé (60 s) → comportement historique ; on peut l'allonger via env.
    const verdict = await waitForVerdict(name, Number(process.env.MANGOQA_CLOSURE_TIMEOUT) || 60_000);
    if (verdict && verdict.verdict === "red") {
      return { ok: false, action: verdict.rejection?.corrective_action || "revois l'architecture (verdict MangoQA RED)" };
    }
    return { ok: true, action: "" };
  } catch (e) {
    // (revue 2026-07-03, action #6, constat A) Fail-open ASSUMÉ (une panne MangoQA
    // ne doit jamais bloquer la livraison) mais plus JAMAIS silencieux : le tour
    // reste utilisable (ok:true) mais est désormais discernable comme NON-VÉRIFIÉ
    // (champ `skipped`) au lieu d'un simple "vert" indistinguable d'une vraie passe.
    const reason = (e as Error).message.split("\n")[0];
    console.warn(`[mangoqa] ⚠ clôture MangoQA indisponible (${reason}) — tour compté NON-VÉRIFIÉ (fail-open, pas "vert").`);
    return { ok: true, action: "", skipped: reason };
  }
}
