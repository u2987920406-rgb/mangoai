// Moteur de Goût (#149 v2) — page de VALIDATION MOBILE servie par Express (pas de Vite).
// Le téléphone de Raf (même Wi-Fi) ouvre http://<ip-LAN>:<port>/taste/review : boîte de
// réception des runs de goût en attente, 1 tap = choix → axiome. Palette Mango (tons mangue +
// violet signature, style Apple translucide). HTML+CSS+JS vanilla, autonome, responsive.

export function tasteReviewPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0e0e15" />
<title>Goût · à valider</title>
<style>
  :root {
    --bg:#0e0e15; --panel:#171722; --raised:#1f1f2e; --edge:#2a2a3c;
    --ink:#ececf3; --dim:#a6a6bd; --faint:#6f6f88;
    --accent:#7c5cff; --accent-soft:#9d86ff; --mango:#F5A21F; --green:#34d399; --red:#f8717a;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:radial-gradient(1200px 600px at 50% -10%, #1a1530 0%, var(--bg) 55%); color:var(--ink);
    font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; min-height:100vh;
    padding:calc(env(safe-area-inset-top) + 14px) 14px calc(env(safe-area-inset-bottom) + 24px); }
  header { display:flex; align-items:center; gap:10px; margin:4px 2px 16px; }
  .logo { font-weight:800; letter-spacing:-.02em; font-size:19px; }
  .logo b { background:linear-gradient(90deg,var(--accent),var(--mango)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .count { margin-left:auto; font-size:12px; color:var(--dim); background:var(--raised); border:1px solid var(--edge); padding:4px 10px; border-radius:999px; }
  .run { background:linear-gradient(180deg,rgba(124,92,255,.06),transparent), var(--panel); border:1px solid var(--edge);
    border-radius:22px; padding:14px; margin-bottom:16px; box-shadow:0 12px 40px -20px #000; backdrop-filter:blur(8px); }
  .run h2 { font-size:14px; margin:0 0 2px; }
  .run .meta { font-size:11.5px; color:var(--faint); margin-bottom:12px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width:380px){ .grid{ grid-template-columns:1fr; } }
  .card { position:relative; border:1.5px solid var(--edge); border-radius:16px; overflow:hidden; background:#fff;
    transition:transform .12s, border-color .12s, box-shadow .12s; }
  .card.sel { border-color:var(--accent); box-shadow:0 0 0 3px rgba(124,92,255,.35); transform:translateY(-1px); }
  .card.broken { opacity:.55; }
  .card img { display:block; width:100%; aspect-ratio:16/10; object-fit:cover; object-position:top; }
  .card.broken img { filter:grayscale(1); }
  .badge { position:absolute; left:8px; top:8px; font-size:10.5px; font-weight:700; color:#fff; padding:3px 9px; border-radius:999px; box-shadow:0 2px 8px #0008; }
  .badge.reco { background:var(--accent); } .badge.score { background:#000a; } .badge.bad { background:var(--red); }
  .tick { position:absolute; right:8px; top:8px; width:24px; height:24px; border-radius:999px; background:var(--accent); color:#fff;
    display:none; align-items:center; justify-content:center; font-size:14px; }
  .card.sel .tick { display:flex; }
  .cap { padding:8px 10px; background:rgba(23,23,34,.82); }
  .cap .nm { font-size:12px; font-weight:600; }
  .cap .why { font-size:10.5px; color:var(--faint); margin-top:2px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .actions { display:flex; gap:8px; margin-top:12px; }
  input.note { flex:1; background:var(--raised); border:1px solid var(--edge); color:var(--ink); border-radius:12px; padding:10px 12px; font-size:14px; outline:none; }
  input.note::placeholder { color:var(--faint); }
  button.go { background:var(--accent); color:#fff; border:0; border-radius:12px; padding:10px 16px; font-size:14px; font-weight:700; }
  button.go:disabled { opacity:.4; }
  .empty { text-align:center; color:var(--dim); padding:60px 20px; }
  .empty .big { font-size:34px; margin-bottom:10px; }
  .toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:var(--green); color:#06231a; font-weight:700;
    padding:10px 18px; border-radius:999px; box-shadow:0 10px 30px -8px #000; opacity:0; transition:opacity .2s; font-size:13px; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<header>
  <span class="logo">Mango<b>OS</b> · Goût</span>
  <span class="count" id="count">…</span>
</header>
<main id="app"><div class="empty">Chargement…</div></main>
<div class="toast" id="toast"></div>
<script>
const app = document.getElementById('app');
const elCount = document.getElementById('count');
const toast = (t) => { const e=document.getElementById('toast'); e.textContent=t; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),1800); };
let runs = [];          // résumés des runs en attente
let detail = null;      // run courant détaillé
let sel = null;         // id du skin sélectionné

async function load() {
  try {
    runs = await (await fetch('/api/taste/pending')).json();
  } catch { runs = []; }
  elCount.textContent = runs.length ? runs.length + ' en attente' : 'à jour';
  if (!runs.length) { detail = null; render(); return; }
  detail = await (await fetch('/api/taste/run/' + encodeURIComponent(runs[0].id))).json();
  const ok = (detail.skins||[]).filter(s => s.ok !== false);
  const top = ok.find(s => s.recommended && !s.broken) || ok.find(s => !s.broken) || ok[0];
  sel = top ? top.id : null;
  render();
}

function render() {
  if (!detail) {
    app.innerHTML = '<div class="empty"><div class="big">✨</div>Tout est validé.<br>Reviens après la prochaine nuit.</div>';
    return;
  }
  const ok = (detail.skins||[]).filter(s => s.ok !== false)
    .sort((a,b)=> (b.broken?-1:(b.score??50)) - (a.broken?-1:(a.score??50)));
  const cards = ok.map(s => {
    const badge = s.recommended ? '<span class="badge reco">⭐ '+(s.score??'')+'</span>'
      : s.broken ? '<span class="badge bad">⚠ à éviter</span>'
      : (typeof s.score==='number' ? '<span class="badge score">'+s.score+'</span>' : '');
    return '<div class="card'+(s.id===sel?' sel':'')+(s.broken?' broken':'')+'" data-id="'+s.id+'">'
      + '<img src="'+s.image+'" alt="'+s.name+'"/>'+badge+'<div class="tick">✓</div>'
      + '<div class="cap"><div class="nm">'+s.name+'</div>'+(s.judgeReason?'<div class="why">👁 '+s.judgeReason+'</div>':'')+'</div></div>';
  }).join('');
  app.innerHTML = '<div class="run"><h2>'+detail.project+'</h2>'
    + '<div class="meta">Maille '+(detail.maille==='hero'?'Héros (composition)':'Style')+' · '+ok.length+' variantes · l\\'œil les a pré-triées</div>'
    + '<div class="grid">'+cards+'</div>'
    + '<div class="actions"><input class="note" id="note" placeholder="Un mot (optionnel)…" />'
    + '<button class="go" id="go"'+(sel?'':' disabled')+'>Valider</button></div></div>';
  app.querySelectorAll('.card').forEach(c => c.onclick = () => { sel = c.dataset.id; render(); });
  const go = document.getElementById('go'); if (go) go.onclick = decide;
}

async function decide() {
  if (!sel || !detail) return;
  const note = (document.getElementById('note')||{}).value || '';
  const go = document.getElementById('go'); if (go) go.disabled = true;
  try {
    const r = await fetch('/api/taste/run/'+encodeURIComponent(detail.id)+'/decide', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chosenId: sel, note })
    });
    if (!r.ok) { toast('Échec — réessaie'); if (go) go.disabled=false; return; }
    toast('Goût enregistré ✓');
    await load();
  } catch { toast('Réseau ?'); if (go) go.disabled=false; }
}

load();
</script>
</body>
</html>`;
}
