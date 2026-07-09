// Juge-pixels (#149 v2) — l'œil note et trie les skins de goût AVANT le choix.
//
// Après que generateTasteSkins a capturé les K variantes (.skins/<id>.jpg), ce
// module les fait LIRE par le cerveau `vision` de Brain-Dispatch (#150/#151 →
// qwen3.5:cloud) et leur attribue une note 0-100 SELON LE GOÛT APPRIS de Raf
// (axiomes VISION `[validé-utilisateur]` + .design-system.md), pas en absolu. Il
// trie meilleure-d'abord (cassées en bas) et marque le top `recommended` → la
// galerie pré-sélectionne, Raf confirme en 1 tap. Ne throw JAMAIS : un échec du
// juge laisse les skins non notés (galerie inchangée).
import fs from "node:fs";
import path from "node:path";
import { dispatch as realDispatch } from "../brain.js";
import { selectAxioms } from "../axioms.js";
import { loadDesignSystem } from "../design/design-system.js";
import type { SkinRender } from "./taste-render.js";

export interface JudgeContext {
  tasteAxioms: string; // goût appris (axiomes VISION/UIUX), "" en cold-start
  designSystem: string; // tokens cross-projets (.design-system.md), "" si absent
}

export interface JudgeDeps {
  dispatch: (
    agentId: "vision",
    system: string,
    user: string,
    opts: { imageBase64?: string; trustExternal?: boolean; freeform?: boolean },
  ) => Promise<{ status: string; summary?: string }>;
  readImage: (absPath: string) => Buffer;
}

const realDeps: JudgeDeps = {
  dispatch: realDispatch,
  readImage: (p) => fs.readFileSync(p),
};

/** Rassemble le goût appris de Raf pour ancrer la note du juge sur SON goût. */
export function buildJudgeContext(workspaceDir: string, projectType?: string): JudgeContext {
  let tasteAxioms = "";
  let designSystem = "";
  try {
    tasteAxioms = selectAxioms(workspaceDir, { task: "goût visuel d'une variante d'interface", projectType, max: 6 });
  } catch { /* cold-start ou registre absent → "" */ }
  try {
    designSystem = loadDesignSystem(workspaceDir);
  } catch { /* absent → "" */ }
  return { tasteAxioms, designSystem };
}

/** Prompt système du juge — note 0-100 selon (a) le goût appris, (b) la qualité
 *  universelle, (c) l'exécution de la direction. Sortie STRICTE parsable. */
export function judgeSystem(ctx: JudgeContext): string {
  const gout = [
    ctx.tasteAxioms.trim() ? `GOÛT APPRIS DE RAF (priorité haute) :\n${ctx.tasteAxioms.trim()}` : "",
    ctx.designSystem.trim() ? `DESIGN SYSTEM (cohérence) :\n${ctx.designSystem.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return (
    "Tu es l'œil de Mango — un juge de goût UI/UX. On te donne une CAPTURE du rendu réel d'une variante " +
    "(skin) d'app. Donne-lui une NOTE de 0 à 100 selon, par ordre d'importance : " +
    "(a) le GOÛT de Raf ci-dessous s'il est fourni ; " +
    "(b) la qualité universelle : aucune casse (débordement, texte illisible, chevauchement, désalignement grossier), " +
    "contraste suffisant, cohérence de charte, hiérarchie claire ; " +
    "(c) l'exécution soignée de sa direction esthétique. " +
    (gout ? `\n\n${gout}\n\n` : "\n\n") +
    "Réponds STRICTEMENT sur une seule ligne, ce format exact :\n" +
    "SCORE: <0-100> | CASSÉ: <oui/non> | <raison courte en français>"
  );
}

/** Parse la réponse du juge (prose VL) → note bornée + casse + raison. Pur.
 *  `parsed:false` signale qu'AUCUNE note n'a pu être lue dans le texte (réponse
 *  vide, hors-format...) — `score` vaut alors 50 par convention d'affichage
 *  UNIQUEMENT ; l'appelant ne doit jamais le traiter comme un vrai jugement
 *  (sinon un échec d'appel se travestit silencieusement en note neutre — voir
 *  l'incident du 2026-07-07 : réponse vide notée 50/100 comme un skin réel). */
export function parseJudgeScore(text: string): { score: number; broken: boolean; reason: string; parsed: boolean } {
  const t = (text ?? "").trim();
  // Casse : explicite (CASSÉ: oui) ou mots-clés.
  const brokenExplicit = /CASS[ÉE]\s*:?\s*oui/i.test(t);
  const brokenKw = /(débord|overflow|illisible|chevauch|tronqué|cassé|superpos)/i.test(t);
  const broken = brokenExplicit || (brokenKw && !/CASS[ÉE]\s*:?\s*non/i.test(t));

  // Note : « SCORE: n » d'abord, sinon premier entier 0-100 plausible.
  let score = NaN;
  const m = t.match(/SCORE\s*:?\s*(\d{1,3})/i);
  if (m) score = parseInt(m[1], 10);
  else {
    const any = t.match(/\b(\d{1,3})\b/);
    if (any) score = parseInt(any[1], 10);
  }
  const parsed = Number.isFinite(score);
  if (!parsed) score = 50; // valeur d'affichage seulement — voir avertissement ci-dessus
  score = Math.max(0, Math.min(100, score));

  // Raison : après le 2e «|», sinon la 1re ligne nettoyée.
  let reason = "";
  const parts = t.split("|");
  if (parts.length >= 3) reason = parts.slice(2).join("|").trim();
  if (!reason) reason = t.split("\n")[0].replace(/SCORE\s*:?\s*\d+/i, "").replace(/CASS[ÉE]\s*:?\s*(oui|non)/i, "").replace(/^[|\s—-]+/, "").trim();
  return { score, broken, reason: reason.slice(0, 200), parsed };
}

/**
 * Note CHAQUE skin `ok` (en parallèle), enrichit score/judgeReason/broken, trie
 * meilleure-d'abord (cassées en bas, non notées au milieu) et marque le top
 * non-cassé `recommended`. Ne throw jamais : un skin dont le juge échoue reste
 * non noté. Retourne le tableau trié (mute aussi les objets en place).
 */
export async function judgeSkins(
  skinsDir: string,
  skins: SkinRender[],
  ctx: JudgeContext,
  deps: JudgeDeps = realDeps,
): Promise<SkinRender[]> {
  const system = judgeSystem(ctx);

  await Promise.all(
    skins.filter((s) => s.ok && s.file).map(async (s) => {
      try {
        const buf = deps.readImage(path.join(skinsDir, s.file!));
        const r = await deps.dispatch(
          "vision",
          system,
          `Note cette variante « ${s.name} ».`,
          { imageBase64: buf.toString("base64"), trustExternal: true, freeform: true },
        );
        if (r.status === "ok" && r.summary?.trim()) {
          const v = parseJudgeScore(r.summary);
          // (É2, render-integrity — 2026-07-07) axiome 10 : le déterministe (s'il a
          // déjà tranché broken:true, ex. render-integrity.ts) est PRIMAIRE — le VL
          // ne peut plus l'écraser en disant "non", il ne fait que le confirmer/compléter.
          if (!s.broken) s.broken = v.broken;
          if (v.parsed) {
            s.score = v.score;
            s.judgeReason = v.reason;
          } // sinon : réponse illisible → skin non noté (jamais un 50 fantôme)
        }
      } catch { /* skin non noté — jamais bloquant */ }
    }),
  );

  // Tri : score décroissant ; non notés (undefined) au milieu (traités comme 50) ;
  // cassés relégués en bas quel que soit leur score.
  const rank = (s: SkinRender) => (s.broken ? -1 : (s.score ?? 50));
  skins.sort((a, b) => rank(b) - rank(a));

  // Recommandé = le 1er non-cassé effectivement noté.
  const top = skins.find((s) => s.ok && !s.broken && typeof s.score === "number");
  if (top) top.recommended = true;

  return skins;
}
