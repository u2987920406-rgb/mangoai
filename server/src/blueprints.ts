// Project blueprints (ideas 6 + 8): per project type, the optimal STACK
// (idea 6 — which libs) and a default FOLDER STRUCTURE (idea 8 — the tree).
// Injected as a compact catalogue into the agent's system prompt: when the
// user's request matches a type, the agent starts from a known stack and
// structure instead of improvising — fewer turns, fewer tokens, a result
// closer to the state of the art from the very first message.
//
// Depth chosen by the user: "structured but flexible" — clear folders adapted
// to the type, but the agent stays free to deviate when the project needs it.
// Kept terse on purpose (it rides in every turn's prompt; idea 13 watches the
// ~33k base). Stacks stay within what the Vite-SPA preview can run.

export const BLUEPRINTS_RULES = `
Project blueprints — when the request matches a type below, DEFAULT to its stack and folder structure; adapt freely when the project genuinely needs it. All types are React + Vite (the preview runs a Vite SPA); Tailwind v4 is preinstalled.
- Site vitrine / landing: plain CSS or Tailwind, no backend. src/components/<Section>.jsx (Hero, Features, Pricing, Contact…), assembled in src/App.jsx; single page, smooth anchor nav (remember scroll-padding-top under a fixed header). For an ANIMATED landing, install framer-motion (motion.* components, whileInView reveals with once:true, hover/tap springs) — the ready-made **motion** template ships exactly this stack (animated hero + scroll reveal), start from it.
- Web app interactive: state + data. src/components/, src/hooks/, src/lib/ (helpers + supabase.js if data/auth — see the Supabase rules), src/views/ or src/pages/ for routes; state via hooks/context, keep side-effects in hooks. For GENUINE multi-page navigation (persistent nav + URL routes + a * 404), install react-router-dom v7 (BrowserRouter/Routes/NavLink) — the ready-made **router** template ships this skeleton.
- Dashboard / admin: install recharts (ResponsiveContainer + Area/Bar/PieChart). src/layout/ (Sidebar, Topbar), src/widgets/ (StatCard, ChartCard, DataTable), src/data/ (mock or supabase); App.jsx = responsive grid. Numbers right-aligned, accessible color contrast. The ready-made **charts** template ships this Recharts stack (KPI cards + area + bars + donut) — start from it.
- Carte / cartographie interactive: install leaflet + react-leaflet. MapContainer + TileLayer (OpenStreetMap tiles) + Marker/Popup + Polyline for routes; src/components/Map.jsx, src/data/ for the points. IMPORTANT: fix Leaflet's default marker icons under the bundler (L.Icon.Default.mergeOptions with the imported marker-icon / -2x / -shadow png), and import 'leaflet/dist/leaflet.css'. The ready-made **leaflet** template ships a full-screen map with all of this wired — start from it.
- Jeu 2D: HTML <canvas> + a fixed-timestep requestAnimationFrame loop. src/game/ (loop.js, entities.js, input.js, render.js), src/components/GameCanvas.jsx, App.jsx. Sync the canvas to devicePixelRatio before the first frame for crisp sprites; decouple update() from render().
- Présentation / slides: src/slides/ (one component per slide), src/components/Deck.jsx (←/→ + space nav, progress bar, 16:9), App.jsx renders the deck. Keyboard-first.
- Agent spécialisé (AI assistant app): install @anthropic-ai/sdk. src/lib/claude.js (client reading import.meta.env.VITE_ANTHROPIC_API_KEY, never hardcoded), src/prompts/ (the assistant's system prompt), src/components/Chat.jsx (message list + streaming), App.jsx. Default to a current model (claude-opus-4-8, or claude-sonnet-4-6 for speed) and stream responses. SECURITY: the key sits in .env (git-ignored, excluded from the zip, NEVER deployed) — this is fine for local/personal use; tell the user a production deploy needs a small backend proxy so the key isn't shipped to the browser.
- Fullstack (React + Express backend): frontend in src/ (standard React/Vite), backend in api/src/index.ts (Express + CORS + dotenv, already scaffolded). Frontend calls the backend via import.meta.env.VITE_API_URL. Add routes in api/src/index.ts (or split into api/src/routes/*.ts). Never hardcode the API URL — always use VITE_API_URL. Keep secrets in api/.env (git-ignored), never in the frontend .env with VITE_ prefix.`;

// Lightweight classifier (jalon D Phase 2): maps a prompt to one of the blueprint
// types, for the metrics' "par type" breakdowns. Heuristic and order-sensitive —
// the most specific types are tested first. Returns "autre" when nothing matches.
export type ProjectType = "dashboard" | "carte" | "jeu" | "slides" | "agent" | "vitrine" | "webapp" | "fullstack" | "autre";

export function inferProjectType(text: string): ProjectType {
  const t = (text ?? "").toLowerCase();
  if (/dashboard|tableau de bord|\badmin\b|graphique|\bchart|\bstat(s|istique)?\b/.test(t)) return "dashboard";
  // Carte AVANT vitrine/webapp : une demande cartographique est plus spécifique. Termes ciblés
  // pour éviter les faux positifs (« carte du menu », « carte de visite », « carte à jouer »).
  if (/carte interactive|cartograph|\bleaflet\b|openstreetmap|itin[ée]raire|g[ée]olocalis|carte des (lieux|restaurants|magasins|villes|points|randonn)/.test(t)) return "carte";
  if (/\bjeu\b|\bgame\b|canvas|sprite|collision|arcade|platformer/.test(t)) return "jeu";
  if (/\bslides?\b|présentation|presentation|powerpoint|\bdeck\b|diapo/.test(t)) return "slides";
  if (/\bagent\b|chatbot|\bllm\b|assistant ia|\bia\b\s+(qui|conversationnel)/.test(t)) return "agent";
  if (/vitrine|landing|page d'accueil|site (web|vitrine)|portfolio/.test(t)) return "vitrine";
  if (/fullstack|full.stack|\bbackend\b|express|fastify|api\s+rest|webhook|server.side|côté serveur/.test(t)) return "fullstack";
  if (/\bapp(lication)?\b|formulaire|\bauth\b|login|signup|\bcrud\b|supabase|panier|e-?commerce|todo/.test(t)) return "webapp";
  return "autre";
}

/**
 * Lien blueprint → template scaffold : le template prêt-à-l'emploi qui incarne la stack d'un type
 * (le socle est déjà câblé → moins de tours, résultat state-of-the-art dès le 1ᵉʳ message). Renvoie
 * le nom d'un dossier de `server/templates/` ou null. PUR. Utilisé par `blueprintHintSection` et
 * disponible pour les runners (spec.template). Ne couvre que les types dont un template est LE socle.
 */
export function templateForType(type: ProjectType): string | null {
  switch (type) {
    case "carte": return "leaflet";     // react-leaflet + fix d'icônes bundler
    case "dashboard": return "charts";  // Recharts (KPI + aire + barres + camembert)
    case "vitrine": return "motion";    // landing animée Framer Motion
    case "webapp": return "router";     // squelette multi-pages react-router v7
    default: return null;
  }
}

/** selectAxioms v2.1 (jalon D) — type de projet ROBUSTE pour la récupération
 * d'axiomes. La tâche courante prime (intention la plus spécifique : "crée un
 * dashboard…"), mais si elle est neutre ("ajoute un bouton", "corrige l'espacement"),
 * on retombe sur la MÉMOIRE PERSISTANTE du projet, qui sait de quel type il s'agit.
 * Bien plus fiable que le seul prompt du tour. Renvoie "autre" si aucun signal. */
export function detectProjectType(task: string, projectMemory?: string): ProjectType {
  const fromTask = inferProjectType(task);
  if (fromTask !== "autre") return fromTask;
  return inferProjectType(projectMemory ?? "");
}
