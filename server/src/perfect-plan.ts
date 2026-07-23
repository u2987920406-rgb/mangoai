import fs from "node:fs";
import { atomicWriteFileSync } from "./safe-io.js";
import path from "node:path";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";

export interface PerfectPlanAnswer {
  id: string;
  value: string;
  label: string;
}

export interface PerfectPlanRef {
  kind: "url" | "palette" | "note";
  value: string;
  label?: string;
}

export interface PerfectPlanContract {
  answers: PerfectPlanAnswer[];
  refs: PerfectPlanRef[];
  createdAt: string;
  /** "perfect" = app unique planifiée (15 q) · "chantier" = gros projet multi-pages (30 q).
   *  Absent sur les anciens contrats → traités comme un gros chantier (rétrocompat). */
  kind?: "perfect" | "chantier";
}

// Banque de 30 questions. Les 15 PREMIÈRES = « Perfect Plan » (app unique planifiée) ;
// les 30 = « Gros chantier » (les 15 + 15 questions d'architecture/scope multi-pages).
// L'UI (PerfectPlan.jsx) tranche par `count` (15 ou 30) et découpe cette liste.
export const PERFECT_PLAN_QUESTIONS = [
  // ── 1-15 : Perfect Plan (essentiels d'une app soignée) ───────────────────
  {
    id: "type",
    text: "Quel type de projet ?",
    options: [
      { value: "webapp", label: "App web", example: "Notion, Vercel" },
      { value: "vitrine", label: "Site vitrine", example: "Apple, Airbnb" },
      { value: "jeu", label: "Jeu", example: "Vampire Survivors, Mario" },
      { value: "dashboard", label: "Dashboard", example: "Linear, Figma" },
      { value: "fullstack", label: "Full-stack", example: "Discord, Trello" },
    ],
  },
  {
    id: "objectif",
    text: "Objectif principal ?",
    options: [
      { value: "informer", label: "Informer / présenter", example: "vitrine, portfolio" },
      { value: "convertir", label: "Convertir / vendre", example: "landing, boutique" },
      { value: "outil", label: "Outil / productivité", example: "app métier, gestion" },
      { value: "divertir", label: "Divertir / jouer", example: "jeu, expérience" },
    ],
  },
  {
    id: "audience",
    text: "Public cible ?",
    options: [
      { value: "grand-public", label: "Grand public", example: "tout le monde" },
      { value: "pro", label: "Professionnels / métier", example: "usage expert" },
      { value: "interne", label: "Interne / équipe", example: "outil d'équipe" },
      { value: "perso", label: "Pour moi", example: "usage personnel" },
    ],
  },
  {
    id: "style",
    text: "Style visuel ?",
    options: [
      { value: "epure", label: "Épuré & minimaliste", example: "façon Apple" },
      { value: "vivant", label: "Vivant & chaleureux", example: "façon Airbnb" },
      { value: "corporate", label: "Strict & corporate", example: "façon IBM" },
      { value: "colore", label: "Coloré & joueur", example: "façon Google, Duolingo" },
    ],
  },
  {
    id: "ambiance",
    text: "Ambiance générale ?",
    options: [
      { value: "tech", label: "Moderne / tech", example: "dark, glassmorphism" },
      { value: "humain", label: "Chaleureux / humain", example: "clair, organique" },
      { value: "pro", label: "Classique / pro", example: "neutre, corporate" },
      { value: "joyeux", label: "Joyeux / créatif", example: "couleurs vives, décalé" },
    ],
  },
  {
    id: "couleur",
    text: "Dominante chromatique ?",
    options: [
      { value: "neutre", label: "Neutre / monochrome", example: "gris, noir & blanc" },
      { value: "accent", label: "Une couleur d'accent forte", example: "sur base neutre" },
      { value: "multicolore", label: "Palette riche", example: "vif, varié" },
      { value: "sombre-neon", label: "Sombre + néon", example: "dark, glow" },
    ],
  },
  {
    id: "typo",
    text: "Personnalité typographique ?",
    options: [
      { value: "sans", label: "Sans-serif neutre", example: "Inter, Helvetica" },
      { value: "serif", label: "Serif éditorial", example: "élégant, magazine" },
      { value: "display", label: "Display expressif", example: "titres à fort caractère" },
      { value: "mono", label: "Mono / technique", example: "code, terminal" },
    ],
  },
  {
    id: "densite",
    text: "Densité d'information ?",
    options: [
      { value: "aeree", label: "Aérée / minimaliste", example: "beaucoup d'espace" },
      { value: "equilibree", label: "Équilibrée", example: "ni vide ni chargé" },
      { value: "dense", label: "Dense / data-rich", example: "pro, tableaux" },
    ],
  },
  {
    id: "navigation",
    text: "Comment l'utilisateur navigue ?",
    options: [
      { value: "scroll", label: "Scroll unique", example: "landing page" },
      { value: "pages", label: "Plusieurs pages", example: "site multi-sections" },
      { value: "sidebar", label: "Sidebar + tableau de bord", example: "app métier" },
    ],
  },
  {
    id: "animation",
    text: "Niveau d'animation ?",
    options: [
      { value: "statique", label: "Statique / sobre", example: "aucun effet" },
      { value: "micro", label: "Micro-interactions", example: "hover, transitions" },
      { value: "riches", label: "Animations riches", example: "au scroll, à l'entrée" },
      { value: "immersif", label: "Immersif / cinétique", example: "parallax, 3D" },
    ],
  },
  {
    id: "device",
    text: "Cible d'affichage principale ?",
    options: [
      { value: "desktop", label: "Desktop d'abord", example: "grand écran" },
      { value: "mobile", label: "Mobile d'abord", example: "smartphone" },
      { value: "responsive", label: "Responsive équilibré", example: "les deux" },
    ],
  },
  {
    id: "data",
    text: "Les données ?",
    options: [
      { value: "memory", label: "En mémoire", example: "simple, pas de compte" },
      { value: "auth", label: "Avec comptes", example: "connexion" },
      { value: "static", label: "Fictives fixes", example: "démo, portfolio" },
      { value: "api", label: "API externe", example: "données live" },
    ],
  },
  {
    id: "contenu",
    text: "Source du contenu ?",
    options: [
      { value: "texte", label: "Texte fictif réaliste", example: "généré cohérent" },
      { value: "photos", label: "Vraies photos (stock)", example: "Pexels" },
      { value: "genere", label: "Données d'exemple générées", example: "faux jeux de données" },
      { value: "fourni", label: "Je fournirai", example: "mon contenu" },
    ],
  },
  {
    id: "ton",
    text: "Ton éditorial ?",
    options: [
      { value: "institutionnel", label: "Sérieux / institutionnel", example: "banque, corporate" },
      { value: "amical", label: "Amical / direct", example: "tu, chaleureux" },
      { value: "expert", label: "Expert / technique", example: "précis, pointu" },
      { value: "ludique", label: "Ludique / décalé", example: "fun, second degré" },
    ],
  },
  {
    id: "priorite",
    text: "Priorité n°1 ?",
    options: [
      { value: "rapidite", label: "Rapidité", example: "livrer vite" },
      { value: "esthetique", label: "Esthétique", example: "rendu léché" },
      { value: "robustesse", label: "Robustesse", example: "fonctionnel solide" },
      { value: "originalite", label: "Originalité", example: "effet wow" },
    ],
  },
  // ── 16-30 : Gros chantier (architecture & scope multi-pages) ─────────────
  {
    id: "pages",
    text: "Combien de pages / sections principales ?",
    options: [
      { value: "2-3", label: "2-3", example: "petit site" },
      { value: "4-6", label: "4-6", example: "site standard" },
      { value: "7-10", label: "7-10", example: "app fournie" },
      { value: "10+", label: "10 et +", example: "plateforme" },
    ],
  },
  {
    id: "auth_niveau",
    text: "Gestion des comptes ?",
    options: [
      { value: "aucune", label: "Aucune", example: "accès libre" },
      { value: "login", label: "Login simple", example: "email + mot de passe" },
      { value: "roles", label: "Rôles & permissions", example: "admin / user" },
      { value: "multitenant", label: "Multi-organisations", example: "espaces séparés" },
    ],
  },
  {
    id: "backend",
    text: "Backend nécessaire ?",
    options: [
      { value: "aucun", label: "Aucun (front seul)", example: "tout côté client" },
      { value: "local", label: "Stockage local", example: "localStorage / IndexedDB" },
      { value: "api-db", label: "API + base de données", example: "serveur + BDD" },
      { value: "temps-reel", label: "Temps réel", example: "websocket, live" },
    ],
  },
  {
    id: "paiement",
    text: "Monétisation / paiements ?",
    options: [
      { value: "aucun", label: "Aucun", example: "gratuit" },
      { value: "abonnement", label: "Abonnement", example: "SaaS mensuel" },
      { value: "achat", label: "Achat unique", example: "produit / licence" },
      { value: "marketplace", label: "Marketplace", example: "vendeurs multiples" },
    ],
  },
  {
    id: "cms",
    text: "Gestion de contenu ?",
    options: [
      { value: "statique", label: "Statique en dur", example: "figé dans le code" },
      { value: "editable", label: "Éditable (mini-CMS)", example: "admin modifie" },
      { value: "ugc", label: "Généré par les utilisateurs", example: "posts, avis" },
      { value: "importe", label: "Importé d'une API", example: "flux externe" },
    ],
  },
  {
    id: "recherche",
    text: "Recherche & filtres ?",
    options: [
      { value: "aucun", label: "Aucun", example: "liste simple" },
      { value: "simple", label: "Recherche simple", example: "barre de recherche" },
      { value: "filtres", label: "Filtres avancés", example: "critères multiples" },
      { value: "facettes", label: "Tri + facettes", example: "e-commerce" },
    ],
  },
  {
    id: "notifications",
    text: "Communication utilisateur ?",
    options: [
      { value: "aucune", label: "Aucune", example: "rien" },
      { value: "toasts", label: "Toasts in-app", example: "messages éphémères" },
      { value: "emails", label: "Emails", example: "confirmations" },
      { value: "push", label: "Push temps réel", example: "notifications live" },
    ],
  },
  {
    id: "i18n",
    text: "Multilingue ?",
    options: [
      { value: "une", label: "Une langue", example: "français seul" },
      { value: "bilingue", label: "Bilingue", example: "FR + EN" },
      { value: "multi", label: "Multilingue complet", example: "3 langues et +" },
    ],
  },
  {
    id: "offline",
    text: "Hors-ligne / PWA ?",
    options: [
      { value: "non", label: "Non requis", example: "en ligne toujours" },
      { value: "cache", label: "Cache basique", example: "lecture hors-ligne" },
      { value: "pwa", label: "PWA installable", example: "app installable" },
    ],
  },
  {
    id: "mesure",
    text: "Suivi & analytics ?",
    options: [
      { value: "aucun", label: "Aucun", example: "pas de tracking" },
      { value: "base", label: "Analytics de base", example: "visites, clics" },
      { value: "admin", label: "Tableau de bord admin", example: "stats internes" },
      { value: "ab", label: "Expérimentation A/B", example: "tests de variantes" },
    ],
  },
  {
    id: "accessibilite",
    text: "Exigence d'accessibilité ?",
    options: [
      { value: "standard", label: "Standard", example: "bonnes pratiques" },
      { value: "aa", label: "AA renforcé", example: "WCAG AA" },
      { value: "aaa", label: "AAA strict", example: "contraste maximal" },
    ],
  },
  {
    id: "performance",
    text: "Contrainte de performance ?",
    options: [
      { value: "normale", label: "Normale", example: "usage courant" },
      { value: "optimisee", label: "Optimisée", example: "léger & rapide" },
      { value: "critique", label: "Temps réel critique", example: "60 fps, faible latence" },
    ],
  },
  {
    id: "integrations",
    text: "Intégrations tierces ?",
    options: [
      { value: "aucune", label: "Aucune", example: "autonome" },
      { value: "une", label: "Une", example: "carte, calendrier, chat" },
      { value: "plusieurs", label: "Plusieurs", example: "combinaison de services" },
      { value: "ecosysteme", label: "Écosystème complet", example: "nombreuses API" },
    ],
  },
  {
    id: "etat",
    text: "Complexité de l'état applicatif ?",
    options: [
      { value: "simple", label: "Simple / local", example: "par écran" },
      { value: "global", label: "Partagé / global", example: "état commun" },
      { value: "serveur", label: "Synchronisé serveur", example: "source de vérité distante" },
      { value: "collaboratif", label: "Collaboratif temps réel", example: "multi-utilisateurs live" },
    ],
  },
  {
    id: "livraison",
    text: "Priorité de livraison ?",
    options: [
      { value: "mvp", label: "MVP vite", example: "l'essentiel d'abord" },
      { value: "equilibre", label: "Équilibre qualité / délai", example: "raisonnable" },
      { value: "finition", label: "Finition maximale", example: "peaufiné" },
      { value: "evolutif", label: "Évolutif long terme", example: "architecture durable" },
    ],
  },
] as const;

// #196 partie B (2026-07-23) — sélection CIBLÉE dans le catalogue fixe ci-dessus.
// Retour de Raf après relecture des 30 questions : trop décorrélées du sujet
// (une todo-list simple n'a pas à répondre à « Monétisation ? » ou
// « Multilingue ? »). Le catalogue ne bouge PAS (questions déjà curées) — un
// cerveau léger lit la description du projet et sélectionne seulement les
// identifiants réellement pertinents, jamais un texte inventé (fiabilité : un
// FILTRE dans un catalogue validé, pas une génération libre).
const VALID_QUESTION_IDS: Set<string> = new Set(PERFECT_PLAN_QUESTIONS.map((q) => q.id));

// Repli honnête si l'appel LLM échoue ou renvoie hors-format — sous-ensemble
// raisonnable pour n'importe quel projet, jamais un gate bloqué.
const DEFAULT_QUESTION_IDS = ["type", "objectif", "audience", "style", "data", "priorite"];

const SELECT_SYSTEM_PROMPT =
  "Tu sélectionnes les questions de cadrage PERTINENTES pour un projet précis, dans un catalogue fixe. " +
  'Réponds UNIQUEMENT par un tableau JSON d\'identifiants (zéro markdown, zéro backtick), ex: ["type","objectif"]. ' +
  "N'invente JAMAIS un identifiant hors catalogue. Choisis entre 6 et 8 questions RÉELLEMENT décisives pour CE projet précis — " +
  "ignore les questions sans rapport (ex. paiement/multilingue pour une simple todo-list, accessibilité AAA pour un prototype interne).";

export type PerfectPlanAsk = (system: string, user: string) => Promise<string>;

const defaultAsk: PerfectPlanAsk = (system, user) =>
  getBrain().complete(system, user, {
    provider: resolveProvider(process.env.PERFECT_PLAN_PROVIDER),
    maxTokens: 200,
    timeoutMs: 30_000,
  });

/** Extrait un tableau JSON d'identifiants depuis la sortie brute (tolérant aux
 *  fences markdown), ne garde que les IDs du catalogue, déduplique, plafonne à
 *  `maxCount`. Ne lève jamais — liste vide si hors-format. PUR. */
export function parseQuestionIds(raw: string, maxCount = 8): string[] {
  const txt = (raw ?? "").trim().replace(/```(?:json)?/gi, "").trim();
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(txt.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!VALID_QUESTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxCount) break;
  }
  return out;
}

/** Sélectionne les `maxCount` questions du catalogue les plus pertinentes pour
 *  `description`, via UN appel LLM léger. Repli sur `DEFAULT_QUESTION_IDS` si
 *  l'appel échoue ou renvoie hors-format — jamais un throw, jamais un gate
 *  bloqué. */
export async function selectRelevantQuestions(
  description: string,
  maxCount = 8,
  deps: { ask?: PerfectPlanAsk } = {},
): Promise<string[]> {
  const ask = deps.ask ?? defaultAsk;
  const catalogue = PERFECT_PLAN_QUESTIONS.map((q) => `- ${q.id} : ${q.text}`).join("\n");
  const user =
    `Description du projet :\n"${description.trim()}"\n\n` +
    `Catalogue de questions disponibles :\n${catalogue}\n\n` +
    `Sélectionne au maximum ${maxCount} questions les plus pertinentes pour CE projet précis.`;
  try {
    const raw = await ask(SELECT_SYSTEM_PROMPT, user);
    const ids = parseQuestionIds(raw, maxCount);
    if (ids.length > 0) return ids;
  } catch {
    /* repli honnête ci-dessous */
  }
  return DEFAULT_QUESTION_IDS.slice(0, maxCount);
}

const FILE = ".perfect-plan.json";

export function hasContract(dir: string): boolean {
  return fs.existsSync(path.join(dir, FILE));
}

export function loadContract(dir: string): PerfectPlanContract | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, FILE), "utf8")) as PerfectPlanContract;
  } catch {
    return null;
  }
}

export function saveContract(
  dir: string,
  data: { answers: PerfectPlanAnswer[]; refs: PerfectPlanRef[]; kind?: "perfect" | "chantier" },
): void {
  fs.mkdirSync(dir, { recursive: true });
  const contract: PerfectPlanContract = { ...data, createdAt: new Date().toISOString() };
  atomicWriteFileSync(path.join(dir, FILE), JSON.stringify(contract, null, 2));
}

export function deleteContract(dir: string): void {
  try {
    fs.unlinkSync(path.join(dir, FILE));
  } catch {
    /* already gone */
  }
}

/** Returns the injection block for the system prompt. "" when no contract exists (zero weight). */
export function perfectPlanSection(dir: string): string {
  const contract = loadContract(dir);
  if (!contract?.answers.length) return "";

  const lines = [
    "## PERFECT PLAN — CONTRAT CONTRAIGNANT",
    "L'utilisateur a défini ces choix AVANT de démarrer. Tu les respectes à la lettre, sans les réinterpréter ni les remettre en cause.",
    "",
    "### Choix validés",
  ];
  for (const a of contract.answers) {
    lines.push(`- **${a.id}** : ${a.label} (\`${a.value}\`)`);
  }

  const activeRefs = contract.refs.filter((r) => r.value.trim());
  if (activeRefs.length > 0) {
    lines.push("", "### Références imposées");
    for (const r of activeRefs) {
      if (r.kind === "url")
        lines.push(
          `- Site de référence : ${r.value}${r.label ? ` — ${r.label}` : ""} *(appelle sharingan_url pour en extraire palette et structure)*`,
        );
      else if (r.kind === "palette")
        lines.push(`- Palette imposée : ${r.value}`);
      else if (r.kind === "note")
        lines.push(`- Contrainte de style : ${r.value}`);
    }
  }

  lines.push(
    "",
    "### Règles d'application",
    "- Pour tout ce que ce contrat couvre : applique-le sans dévier.",
    "- Pour tout ce qu'il ne couvre pas : comble librement à ta manière.",
    "- Le bloc `clarification` ne repose PAS les questions déjà traitées ici.",
  );

  return lines.join("\n");
}
