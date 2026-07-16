// Tableau de contrôle live du pipeline (demande de Raf, 2026-07-16, nuit) —
// visualise en direct le flux réel entre les composants du harnais : boîtes
// (Élève / Outils / Build-QA / Stratège / Gardien / Mémoire) reliées par des
// arêtes animées, colorées selon le verdict (vert=ok, rouge=échec).
//
// Source de vérité : les `.backlog.jsonl` par projet (#183, "Boîte noire" —
// déjà écrit par CHAQUE acteur réel, Élève/Gardien/Agents forgés, ligne par
// ligne, append-only). PAS de nouvelle télémétrie : ce module TAIL les
// fichiers existants et les reclasse en boîtes/flèches, il n'invente aucune
// donnée. Honnêteté du mapping : la boîte « Mémoire » s'allume sur des PROXIES
// observables (memoire_rappel, chercher_web/chercher_image) — ce n'est PAS un
// tap direct sur les écritures Blackboard (aucun événement de ce type n'existe
// aujourd'hui dans `.backlog.jsonl`), noté ici pour ne pas laisser croire à une
// instrumentation plus fine qu'elle ne l'est.
import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "./projects.js";

type BoxId = "eleve" | "outils" | "build-qa" | "stratege" | "gardien" | "mangoqa" | "memoire" | "agent-forge";

interface BacklogLine {
  ts: string;
  actor: string;
  action: string;
  detail?: string;
  ok: boolean;
}

interface FlowEvent {
  ts: string;
  project: string;
  from: BoxId;
  to: BoxId;
  label: string;
  ok: boolean;
}

/** Classe une ligne de backlog en (boîte source, boîte cible, étiquette courte). */
function classify(line: BacklogLine): { from: BoxId; to: BoxId; label: string } {
  const actor = line.actor ?? "";
  const action = line.action ?? "";

  if (/^Gardien/.test(actor)) return { from: "eleve", to: "gardien", label: action || "clôture" };
  if (/^Agent forgé/.test(actor)) return { from: "agent-forge", to: "outils", label: action };

  // actor = "Élève (<modèle>)" — la majorité du volume réel observé cette session.
  if (["chercher_web", "chercher_image"].includes(action)) return { from: "eleve", to: "memoire", label: action };
  if (["memoire_rappel"].includes(action)) return { from: "memoire", to: "eleve", label: action };
  if (["check_build", "teste_parcours", "vois_ecran", "verifie_design"].includes(action)) {
    return { from: "eleve", to: "build-qa", label: action };
  }
  if (["write_file", "edit_file", "read_file", "list_files", "search_code"].includes(action)) {
    return { from: "eleve", to: "outils", label: action };
  }
  if (action === "finish") return { from: "eleve", to: "gardien", label: "finish" };
  if (/stratège|stratege|wandering|plateau/i.test(action + line.detail)) {
    return { from: "eleve", to: "stratege", label: action };
  }
  return { from: "eleve", to: "outils", label: action || "?" };
}

/** Position de lecture (octets) déjà consommée par fichier — mémoire du tail. */
const tailOffsets = new Map<string, number>();

function findBacklogFiles(): Array<{ project: string; file: string }> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ project: e.name, file: path.join(WORKSPACE_DIR, e.name, ".backlog.jsonl") }))
    .filter((e) => fs.existsSync(e.file));
}

/** Lit les nouvelles lignes d'un fichier depuis le dernier offset connu (tail). */
function readNewLines(file: string): string[] {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return [];
  }
  const from = tailOffsets.get(file) ?? Math.max(0, size - 8000); // 1er passage : ne relit pas tout l'historique
  if (size <= from) {
    tailOffsets.set(file, size);
    return [];
  }
  let chunk = "";
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(size - from);
    fs.readSync(fd, buf, 0, buf.length, from);
    fs.closeSync(fd);
    chunk = buf.toString("utf8");
  } catch {
    return [];
  }
  tailOffsets.set(file, size);
  return chunk.split("\n").filter((l) => l.trim().length > 0);
}

/** Un tick de polling : lit les nouvelles lignes de tous les projets, renvoie les FlowEvent. */
function pollOnce(): FlowEvent[] {
  const events: FlowEvent[] = [];
  for (const { project, file } of findBacklogFiles()) {
    for (const raw of readNewLines(file)) {
      let parsed: BacklogLine;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const { from, to, label } = classify(parsed);
      events.push({ ts: parsed.ts, project, from, to, label, ok: parsed.ok !== false });
    }
  }
  return events;
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>MangoOS — Tableau de contrôle live</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0b0d12; color:#e8e6e1; font:14px/1.4 system-ui,-apple-system,sans-serif; }
  header { padding:14px 20px; border-bottom:1px solid #23262f; display:flex; align-items:center; gap:12px; }
  header h1 { font-size:15px; margin:0; font-weight:600; letter-spacing:.02em; }
  #status { font-size:12px; color:#8a8f98; }
  #board { position:relative; width:100%; height:56vh; }
  .box { position:absolute; width:150px; height:70px; border-radius:10px; border:1px solid #2c3140;
    background:#151822; display:flex; align-items:center; justify-content:center; text-align:center;
    font-size:13px; padding:8px; transition:box-shadow .25s, border-color .25s; }
  .box.lit { border-color:#f5a623; box-shadow:0 0 18px rgba(245,166,35,.35); }
  .box.ok { border-color:#3ecf8e; box-shadow:0 0 18px rgba(62,207,142,.35); }
  .box.ko { border-color:#e5484d; box-shadow:0 0 18px rgba(229,72,77,.35); }
  svg#edges { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  .pulse { fill:#f5a623; }
  .pulse.ok { fill:#3ecf8e; }
  .pulse.ko { fill:#e5484d; }
  #log { border-top:1px solid #23262f; padding:10px 20px; height:34vh; overflow-y:auto; font-family:ui-monospace,monospace; font-size:12px; }
  .row { padding:2px 0; border-bottom:1px dashed #1c1f28; display:flex; gap:10px; }
  .row .t { color:#8a8f98; min-width:80px; }
  .row .p { color:#7aa2f7; min-width:110px; }
  .row .f { color:#c9c9c9; }
  .row.ko .f { color:#e5484d; }
  .legend { display:flex; gap:14px; padding:6px 20px; font-size:12px; color:#8a8f98; }
  .legend span::before { content:"●"; margin-right:5px; }
  .legend .g::before { color:#3ecf8e; } .legend .r::before { color:#e5484d; } .legend .o::before { color:#f5a623; }
</style>
</head>
<body>
<header>
  <h1>🥭 MangoOS — Tableau de contrôle live</h1>
  <span id="status">connexion…</span>
</header>
<div class="legend">
  <span class="g">flux OK</span><span class="r">flux en échec</span><span class="o">boîte active</span>
</div>
<div id="board">
  <svg id="edges"></svg>
</div>
<div id="log"></div>
<script>
const BOXES = {
  "eleve":       { label: "Élève",         x: 0.06, y: 0.40 },
  "stratege":    { label: "Stratège",      x: 0.30, y: 0.08 },
  "outils":      { label: "Outils",        x: 0.34, y: 0.72 },
  "build-qa":    { label: "Build / QA visuel", x: 0.58, y: 0.40 },
  "gardien":     { label: "Gardien",       x: 0.82, y: 0.14 },
  "mangoqa":     { label: "MangoQA",       x: 0.82, y: 0.66 },
  "memoire":     { label: "Mémoire (proxy)", x: 0.58, y: 0.90 },
  "agent-forge": { label: "Agent forgé",   x: 0.06, y: 0.85 },
};
const board = document.getElementById("board");
const svg = document.getElementById("edges");
const boxEls = {};
for (const [id, b] of Object.entries(BOXES)) {
  const el = document.createElement("div");
  el.className = "box"; el.textContent = b.label; el.id = "box-" + id;
  board.appendChild(el);
  boxEls[id] = el;
}
function layout() {
  const w = board.clientWidth, h = board.clientHeight;
  for (const [id, b] of Object.entries(BOXES)) {
    const el = boxEls[id];
    el.style.left = (b.x * w - 75) + "px";
    el.style.top = (b.y * h - 35) + "px";
  }
}
window.addEventListener("resize", layout);
layout();

function center(id) {
  const el = boxEls[id];
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}

function flash(id, cls) {
  const el = boxEls[id];
  el.classList.remove("lit", "ok", "ko");
  void el.offsetWidth; // relance l'animation CSS
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

function pulseAlong(from, to, ok) {
  const a = center(from), b = center(to);
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("r", "5");
  dot.setAttribute("class", "pulse " + (ok ? "ok" : "ko"));
  svg.appendChild(dot);
  const start = performance.now();
  const dur = 650;
  function step(t) {
    const p = Math.min(1, (t - start) / dur);
    dot.setAttribute("cx", a.x + (b.x - a.x) * p);
    dot.setAttribute("cy", a.y + (b.y - a.y) * p);
    if (p < 1) requestAnimationFrame(step);
    else dot.remove();
  }
  requestAnimationFrame(step);
}

const logEl = document.getElementById("log");
function logLine(ev) {
  const row = document.createElement("div");
  row.className = "row" + (ev.ok ? "" : " ko");
  const time = new Date(ev.ts).toLocaleTimeString("fr-FR");
  row.innerHTML = '<span class="t">' + time + '</span><span class="p">' + ev.project + '</span><span class="f">' +
    ev.from + ' → ' + ev.to + ' · ' + ev.label + '</span>';
  logEl.prepend(row);
  while (logEl.children.length > 300) logEl.removeChild(logEl.lastChild);
}

const statusEl = document.getElementById("status");
const es = new EventSource("/api/control-board/stream");
es.onopen = () => { statusEl.textContent = "connecté — flux en direct"; };
es.onerror = () => { statusEl.textContent = "reconnexion…"; };
es.onmessage = (msg) => {
  const events = JSON.parse(msg.data);
  for (const ev of events) {
    pulseAlong(ev.from, ev.to, ev.ok);
    flash(ev.from, "lit");
    flash(ev.to, ev.ok ? "ok" : "ko");
    logLine(ev);
  }
};
</script>
</body>
</html>`;

/** Enregistre `/control-board` (page) et `/api/control-board/stream` (SSE). */
export function registerControlBoardRoutes(app: Express): void {
  app.get("/control-board", (_req: Request, res: Response) => {
    res.type("html").send(PAGE_HTML);
  });

  app.get("/api/control-board/stream", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();

    const tick = () => {
      const events = pollOnce();
      if (events.length) res.write(`data: ${JSON.stringify(events)}\n\n`);
    };
    tick(); // premier tick immédiat (fixe les offsets sans spammer l'historique)
    const interval = setInterval(tick, 1200);
    req.on("close", () => clearInterval(interval));
  });
}
