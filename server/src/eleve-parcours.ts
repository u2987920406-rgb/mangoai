// Moteur de PARCOURS utilisateur de l'Élève (#155) — « vérifie que ça MARCHE,
// pas juste que ça compile ».
//
// MISSION (transmission de compétence) : l'Élève sait check_build (= ça compile)
// mais ne VÉRIFIE jamais que le FLUX marche pour l'utilisateur. Le bug des images
// TOEIC (build vert, écran 📷 cassé, personne n'avait joué le quiz) en est l'exemple.
// On lui donne le réflexe de Claude : JOUER l'app et vérifier le résultat.
//
// FIABILITÉ (le cœur du chantier) : tout se joue sur UNE SEULE page persistante,
// ouverte une fois, conduite étape par étape. L'état du DOM/JS persiste entre les
// clics (un quiz, un formulaire, une navigation gardent leur contexte) — l'inverse
// d'un contexte par étape qui réinitialiserait tout. On capture aussi les erreurs
// console + pageerror sur tout le run : une app qui « s'affiche » mais jette des
// erreurs JS est signalée. Bornes partout (étapes, timeouts). Ne lève JAMAIS :
// toute panne devient un rapport ✗ exploitable par GLM.

import { type Browser } from "playwright";
import { getBrowser } from "./vision.js";

const VIEWPORT = { width: 1280, height: 800 };
const MAX_ETAPES = 20;
const ACTION_TIMEOUT_MS = 3_000; // une action (clic/saisie) qui dépasse → étape ✗
const GOTO_TIMEOUT_MS = 15_000;
const SETTLE_MS = 350; // laisse le DOM se stabiliser après les actions
const WAIT_CAP_MS = 3_000; // plafond d'une action wait demandée
const MSG_CAP = 300; // tronque les messages d'erreur

/** Une action jouée sur la page (une seule des clés est utilisée). */
export interface ParcoursAction {
  clickText?: string;
  clickSelector?: string;
  fill?: { selector: string; text: string };
  key?: string;
  wait?: number;
}

/** Ce qu'on vérifie APRÈS les actions d'une étape (vérifs déterministes). */
export interface ParcoursAttendu {
  texte?: string; // un texte visible doit apparaître
  selecteur?: string; // un élément CSS doit être visible
  image_chargee?: boolean; // au moins une <img> réellement chargée (naturalWidth>0)
  aucune_erreur_console?: boolean; // aucune nouvelle erreur console/JS pendant l'étape
}

export interface ParcoursEtape {
  description: string;
  actions?: ParcoursAction[];
  attendu?: ParcoursAttendu;
}

export interface EtapeReport {
  description: string;
  ok: boolean;
  messages: string[];
}

export interface ParcoursReport {
  ok: boolean;
  etapes: EtapeReport[];
  consoleErrors: string[];
  screenshotB64?: string;
}

/** Dépendances injectables (tests sans navigateur). */
export interface ParcoursDeps {
  getBrowser?: () => Promise<Browser>;
}

const realDeps: Required<ParcoursDeps> = { getBrowser };

function firstLine(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.split("\n")[0].slice(0, MSG_CAP);
}

function describeAction(a: ParcoursAction): string {
  if (a.clickText) return `cliquer le texte « ${a.clickText} »`;
  if (a.clickSelector) return `cliquer ${a.clickSelector}`;
  if (a.fill) return `remplir ${a.fill.selector}`;
  if (a.key) return `touche ${a.key}`;
  if (a.wait) return `attendre ${a.wait}ms`;
  return "action vide";
}

/**
 * Joue un parcours utilisateur sur une URL d'aperçu et renvoie un rapport
 * déterministe. UNE page persistante pour tout le parcours. Ne lève jamais.
 */
export async function runParcours(
  url: string,
  etapes: ParcoursEtape[],
  deps: ParcoursDeps = {},
): Promise<ParcoursReport> {
  const getB = deps.getBrowser ?? realDeps.getBrowser;
  const consoleErrors: string[] = [];
  const report: ParcoursReport = { ok: false, etapes: [], consoleErrors };

  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  try {
    const browser = await getB();
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();

    // Capture des erreurs sur TOUT le run (console.error + exceptions JS non gérées).
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, MSG_CAP));
    });
    page.on("pageerror", (e) => consoleErrors.push((e?.message ?? String(e)).slice(0, MSG_CAP)));

    await page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    const steps = etapes.slice(0, MAX_ETAPES);
    for (const etape of steps) {
      const messages: string[] = [];
      let ok = true;
      const errBefore = consoleErrors.length;

      // 1. Actions (chacune bornée ; un échec marque l'étape ✗ mais on continue).
      for (const a of etape.actions ?? []) {
        try {
          if (a.clickText) {
            await page.getByText(a.clickText, { exact: false }).first().click({ timeout: ACTION_TIMEOUT_MS });
          } else if (a.clickSelector) {
            await page.locator(a.clickSelector).first().click({ timeout: ACTION_TIMEOUT_MS });
          } else if (a.fill) {
            await page.locator(a.fill.selector).first().fill(a.fill.text, { timeout: ACTION_TIMEOUT_MS });
          } else if (a.key) {
            await page.keyboard.press(a.key);
          } else if (a.wait && a.wait > 0) {
            await page.waitForTimeout(Math.min(a.wait, WAIT_CAP_MS));
          }
        } catch (e) {
          ok = false;
          messages.push(`✗ ${describeAction(a)} : ${firstLine(e)}`);
        }
      }

      await page.waitForTimeout(SETTLE_MS); // laisse le rendu suivre les actions

      // 2. Vérifs attendues (déterministes).
      const att = etape.attendu;
      if (att) {
        if (att.texte) {
          const visible = await page
            .getByText(att.texte, { exact: false })
            .first()
            .isVisible()
            .catch(() => false);
          if (!visible) {
            ok = false;
            messages.push(`✗ texte attendu « ${att.texte} » introuvable/invisible`);
          } else {
            messages.push(`✓ texte « ${att.texte} » visible`);
          }
        }
        if (att.selecteur) {
          const visible = await page
            .locator(att.selecteur)
            .first()
            .isVisible()
            .catch(() => false);
          if (!visible) {
            ok = false;
            messages.push(`✗ élément ${att.selecteur} non visible`);
          } else {
            messages.push(`✓ ${att.selecteur} visible`);
          }
        }
        if (att.image_chargee) {
          const loaded = await page
            .evaluate(() => Array.from(document.images).some((img) => img.naturalWidth > 0))
            .catch(() => false);
          if (!loaded) {
            ok = false;
            messages.push("✗ aucune image réellement chargée (naturalWidth=0 partout) — image cassée");
          } else {
            messages.push("✓ au moins une image chargée");
          }
        }
        if (att.aucune_erreur_console) {
          const nouvelles = consoleErrors.slice(errBefore);
          if (nouvelles.length) {
            ok = false;
            messages.push(`✗ ${nouvelles.length} erreur(s) console pendant l'étape : ${nouvelles.join(" | ").slice(0, MSG_CAP)}`);
          } else {
            messages.push("✓ aucune erreur console");
          }
        }
      }

      report.etapes.push({ description: etape.description, ok, messages });
    }

    // Preuve : capture finale (best-effort).
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 70 });
      report.screenshotB64 = buf.toString("base64");
    } catch {
      /* la preuve visuelle est optionnelle */
    }

    report.ok = report.etapes.length > 0 && report.etapes.every((e) => e.ok);
  } catch (e) {
    // Panne globale (aperçu injoignable, navigateur KO) → rapport ✗ exploitable.
    report.etapes.push({
      description: "Ouverture de l'aperçu",
      ok: false,
      messages: [`✗ impossible de jouer le parcours : ${firstLine(e)}`],
    });
    report.ok = false;
  } finally {
    await context?.close().catch(() => {});
  }

  return report;
}

/** Met en forme un rapport en TEXTE clair pour GLM (réutilisé par l'outil + testable). */
export function formatParcoursReport(report: ParcoursReport): string {
  const head = report.ok
    ? "✅ Parcours RÉUSSI — toutes les étapes passent."
    : "❌ Parcours ÉCHOUÉ — au moins une étape a un problème.";
  const lines = report.etapes.map((e, i) => {
    const mark = e.ok ? "✓" : "✗";
    const detail = e.messages.length ? `\n     ${e.messages.join("\n     ")}` : "";
    return `  ${mark} Étape ${i + 1} : ${e.description}${detail}`;
  });
  const errs =
    report.consoleErrors.length > 0
      ? `\n\n⚠ ${report.consoleErrors.length} erreur(s) console au total :\n  - ${report.consoleErrors.slice(0, 8).join("\n  - ")}`
      : "";
  return `${head}\n${lines.join("\n")}${errs}`;
}
