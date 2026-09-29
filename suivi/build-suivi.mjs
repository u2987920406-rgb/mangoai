#!/usr/bin/env node
// Générateur du tableau de suivi de l'audit : lit suivi/plan.json, écrit suivi/suivi.html.
// Node pur, zéro dépendance. Déterministe : même plan.json → même HTML octet pour octet.
// Ne jamais éditer suivi.html à la main — éditer plan.json puis relancer :
//   node suivi/build-suivi.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(DIR, "plan.json"), "utf8"));

const ETATS = {
  "fait": { label: "Fait", tone: "vert" },
  "partiel": { label: "Partiel", tone: "orange" },
  "en-cours": { label: "En cours", tone: "orange" },
  "a-venir": { label: "À venir", tone: "gris" },
  "ouvert": { label: "Ouvert", tone: "gris" },
  "ecarte": { label: "Écarté", tone: "barre" },
};
const GRAVITES = ["G0", "G1", "G2", "G3", "hors-audit"];

// --- Validation : un plan.json invalide doit casser le build, pas produire un HTML menteur.
const erreurs = [];
const ids = new Set();
const verifier = (item, zone) => {
  if (!item.id) erreurs.push(`${zone} : entrée sans id`);
  if (ids.has(item.id)) erreurs.push(`${zone} : id en double ${item.id}`);
  ids.add(item.id);
  if (!ETATS[item.etat]) erreurs.push(`${item.id} : etat inconnu « ${item.etat} »`);
  if (item.gravite != null && !GRAVITES.includes(item.gravite))
    erreurs.push(`${item.id} : gravite inconnue « ${item.gravite} »`);
};
plan.lots.forEach((l) => verifier(l, "lots"));
plan.faiblesses.forEach((f) => verifier(f, "faiblesses"));
(plan.horsAudit ?? []).forEach((h) => verifier(h, "horsAudit"));
const lotIds = new Set(plan.lots.map((l) => l.id));
for (const f of plan.faiblesses)
  if (f.lot != null && !lotIds.has(f.lot)) erreurs.push(`${f.id} : lot inconnu « ${f.lot} »`);
if (erreurs.length) {
  console.error("plan.json invalide :\n  " + erreurs.join("\n  "));
  process.exit(1);
}

// --- Rendu
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Texte libre : échappé, puis `code` → <code>.
const txt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

const compte = (items) => {
  const c = { total: items.length, fait: 0, orange: 0, gris: 0, ecarte: 0 };
  for (const i of items) {
    const t = ETATS[i.etat].tone;
    if (t === "vert") c.fait++;
    else if (t === "orange") c.orange++;
    else if (t === "gris") c.gris++;
    else c.ecarte++;
  }
  return c;
};

const coche = (etat) => {
  const { label, tone } = ETATS[etat];
  const glyphe = tone === "vert" ? "✓" : tone === "orange" ? "◐" : tone === "barre" ? "✕" : "";
  return `<span class="coche coche-${tone}" role="img" aria-label="${label}">${glyphe}</span>`;
};
const pastille = (etat) => `<span class="etat etat-${ETATS[etat].tone}">${ETATS[etat].label}</span>`;
const meta = (k, v) => (v == null || v === "" ? "" : `<span class="meta"><b>${k}</b> ${txt(v)}</span>`);

const compteur = (titre, c, unite) => {
  const pct = c.total ? Math.round((c.fait / c.total) * 100) : 0;
  const detail = [
    c.orange && `${c.orange} en cours/partiel`,
    c.gris && `${c.gris} restant${c.gris > 1 ? "s" : ""}`,
    c.ecarte && `${c.ecarte} écarté${c.ecarte > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");
  return `<div class="compteur">
  <p class="compteur-titre">${titre}</p>
  <p class="compteur-chiffre"><strong>${c.fait}</strong> ${unite} / ${c.total}</p>
  <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.fait}" aria-label="${titre}"><span style="width:${pct}%"></span></div>
  <p class="compteur-detail">${detail || "tout est fait"}</p>
</div>`;
};

const faiblesse = (f) => `<li class="faiblesse">
  ${coche(f.etat)}
  <div>
    <p class="f-titre"><span class="id">${esc(f.id)}</span> ${txt(f.titre)}</p>
    <p class="f-meta">${f.gravite ? `<span class="grav grav-${esc(f.gravite)}">${esc(f.gravite)}</span>` : ""}${pastille(f.etat)}</p>
    ${f.note ? `<p class="f-note">${txt(f.note)}</p>` : ""}
  </div>
</li>`;

const lot = (l) => {
  const rattachees = plan.faiblesses.filter((f) => f.lot === l.id);
  return `<article class="carte carte-${ETATS[l.etat].tone}" id="${esc(l.id)}">
  <header class="carte-tete">
    ${coche(l.etat)}
    <div>
      <h3><span class="id">${esc(l.id)}</span> ${txt(l.titre)}</h3>
      <p class="metas">${l.gravite ? `<span class="grav grav-${esc(l.gravite)}">${esc(l.gravite)}</span>` : ""}${pastille(l.etat)}${meta("Effort", l.effort)}${meta("Régression", l.regression)}${meta("Acteur", l.acteur)}</p>
    </div>
  </header>
  ${l.fait ? `<p class="bloc"><b class="lib lib-vert">Fait</b> ${txt(l.fait)}</p>` : ""}
  ${l.reste ? `<p class="bloc"><b class="lib lib-gris">Reste</b> ${txt(l.reste)}</p>` : ""}
  ${l.preuve ? `<p class="bloc"><b class="lib">Preuve</b> ${txt(l.preuve)}</p>` : ""}
  ${l.bloquants?.length ? `<p class="bloc"><b class="lib">Dépend de</b> ${l.bloquants.map(esc).join(", ")}</p>` : ""}
  ${rattachees.length ? `<div class="rattachees"><p class="sous-titre">Faiblesses rattachées (${rattachees.filter((f) => f.etat === "fait").length}/${rattachees.length} fermées)</p><ul>${rattachees.map(faiblesse).join("\n")}</ul></div>` : ""}
</article>`;
};

const orphelines = plan.faiblesses.filter((f) => f.lot == null);
const horsAudit = plan.horsAudit ?? [];
const cLots = compte(plan.lots);
const cFaib = compte(plan.faiblesses);
const cHors = compte(horsAudit);

const CSS = `
*{box-sizing:border-box}
html{font-size:16px;-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;font-size:1rem;line-height:1.5;color:#1c1c1c;background:#f5f5f2}
main{max-width:1200px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 4px}
h2{font-size:1.375rem;margin:40px 0 16px}
h3{font-size:1.125rem;line-height:1.35;margin:0}
p{margin:0}
code{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:1em;background:#ebebE6;padding:0 4px;border-radius:4px;overflow-wrap:anywhere}
.sous{color:#4a4a4a}
.compteurs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin-top:24px}
.compteur{background:#fff;border:1px solid #d6d6d0;border-radius:12px;padding:16px}
.compteur-titre{font-weight:600}
.compteur-chiffre{font-size:1.25rem;margin:4px 0 8px}
.compteur-chiffre strong{font-size:2rem}
.compteur-detail{color:#4a4a4a}
.barre{height:12px;background:#e2e2dc;border-radius:6px;overflow:hidden;margin-bottom:8px}
.barre span{display:block;height:100%;background:#1a7f37}
.legende{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:20px;padding:0;list-style:none}
.legende li{display:flex;align-items:center;gap:8px}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:16px;align-items:start}
.carte{background:#fff;border:1px solid #d6d6d0;border-left-width:6px;border-radius:12px;padding:16px;min-width:0;overflow-wrap:anywhere}
.carte-vert{border-left-color:#1a7f37}
.carte-orange{border-left-color:#a14f00}
.carte-gris{border-left-color:#6b6b6b}
.carte-barre{border-left-color:#6b6b6b;background:#fafaf8}
.carte-tete{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
.carte-tete>div{min-width:0}
.coche{flex:0 0 44px;width:44px;height:44px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;line-height:1;border:2px solid}
.coche-vert{background:#1a7f37;border-color:#1a7f37;color:#fff}
.coche-orange{background:#fff4e5;border-color:#a14f00;color:#a14f00}
.coche-gris{background:#fff;border-color:#6b6b6b;color:#6b6b6b}
.coche-barre{background:#ececE8;border-color:#6b6b6b;color:#4a4a4a}
.id{font-family:ui-monospace,Consolas,monospace;font-weight:700;color:#333}
.metas,.f-meta{display:flex;flex-wrap:wrap;gap:6px 10px;margin-top:6px;align-items:center}
.meta{color:#3d3d3d}
.meta b{font-weight:600}
.etat,.grav{display:inline-block;font-size:1rem;font-weight:600;padding:0 8px;border-radius:6px;line-height:1.6}
.etat-vert{background:#1a7f37;color:#fff}
.etat-orange{background:#a14f00;color:#fff}
.etat-gris{background:#5c5c5c;color:#fff}
.etat-barre{background:#e2e2dc;color:#333;text-decoration:line-through}
.grav{background:#fff;border:1px solid #8a8a84;color:#1c1c1c}
.grav-G0{border-color:#b3261e;color:#9c1f18}
.grav-G1{border-color:#a14f00;color:#8a4300}
.bloc{margin-top:8px}
.lib{font-weight:700;margin-right:4px}
.lib-vert{color:#16692e}
.lib-gris{color:#4a4a4a}
.rattachees{margin-top:16px;border-top:1px solid #e2e2dc;padding-top:12px}
.sous-titre{font-weight:600;margin-bottom:8px}
ul{list-style:none;margin:0;padding:0}
.faiblesse{display:flex;gap:12px;align-items:flex-start;padding:8px 0;min-width:0}
.faiblesse>div{min-width:0}
.faiblesse+.faiblesse{border-top:1px dashed #e2e2dc}
.f-titre{font-weight:600}
.f-note{color:#3d3d3d;margin-top:4px}
.liste{background:#fff;border:1px solid #d6d6d0;border-radius:12px;padding:8px 16px;overflow-wrap:anywhere}
.liste-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));column-gap:24px}
.liste-grille .faiblesse+.faiblesse{border-top:none}
.liste-grille .faiblesse{border-bottom:1px dashed #e2e2dc}
footer{margin-top:40px;color:#4a4a4a}
`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suivi de l'audit MangoOS/MangoQA — ${esc(plan.maj)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <h1>Suivi de l'audit MangoOS / MangoQA</h1>
  <p class="sous">Audit du 2026-09-28 · mis à jour le ${esc(plan.maj)} · généré depuis <code>suivi/plan.json</code></p>
  <div class="compteurs">
    ${compteur("Lots du plan (D)", cLots, "faits")}
    ${compteur("Faiblesses (B)", cFaib, "fermées")}
    ${horsAudit.length ? compteur("Traités hors audit (H)", cHors, "faits") : ""}
  </div>
  <ul class="legende" aria-label="Légende">
    <li>${coche("fait")} Fait / fermé</li>
    <li>${coche("partiel")} Partiel ou en cours</li>
    <li>${coche("a-venir")} À venir / ouvert</li>
    <li>${coche("ecarte")} Écarté</li>
  </ul>
</header>

<section>
  <h2>Plan D1 → D${plan.lots.length}</h2>
  <div class="grille">
${plan.lots.map(lot).join("\n")}
  </div>
</section>

${orphelines.length ? `<section>
  <h2>Faiblesses sans lot (${orphelines.filter((f) => f.etat === "fait").length}/${orphelines.length} fermées)</h2>
  <div class="liste"><ul class="liste-grille">${orphelines.map(faiblesse).join("\n")}</ul></div>
</section>` : ""}

${horsAudit.length ? `<section>
  <h2>Traités hors audit</h2>
  <div class="liste"><ul class="liste-grille">${horsAudit.map((h) => faiblesse({ ...h, note: [h.date && `Le ${h.date}.`, h.note].filter(Boolean).join(" ") })).join("\n")}</ul></div>
</section>` : ""}

<footer><p>Ne pas éditer ce fichier : modifier <code>suivi/plan.json</code> puis lancer <code>node suivi/build-suivi.mjs</code>.</p></footer>
</main>
</body>
</html>
`;

writeFileSync(join(DIR, "suivi.html"), html);
console.log(
  `suivi.html écrit — lots ${cLots.fait}/${cLots.total} faits · faiblesses ${cFaib.fait}/${cFaib.total} fermées` +
    (horsAudit.length ? ` · hors audit ${cHors.fait}/${cHors.total}` : ""),
);
