// Types de la boucle de relais (extraits de eleve.ts, chantier archi #3).
// Quasi-feuille : n'importe que des types externes + EndpointOverride (provider),
// ce qui casse tout cycle entre escalade et relay.
import { type Inspection } from "../inspection.js";
import { type ModelProfile } from "../models/profile.js";
import { type LLMProvider } from "../llm/llm-engine.js";
import { type BrainPolicy } from "../brain/brain-runtime.js";
import { type PostFn } from "../eleve-runtime.js";
import { type EndpointOverride } from "./provider.js";
import type { GateDeps } from "../eleve-gate.js";

export type ResolvedBy = "eleve" | "maitre" | "none";

export interface RelayResult {
  resolvedBy: ResolvedBy;
  attempts: number; // tentatives de l'Élève avant succès/escalade
  success: boolean; // le build passe à la fin
  inspection: Inspection; // verdict objectif final
  axiom: boolean; // un axiome a-t-il été écrit lors de l'escalade
  costUsd: number; // coût Claude (0 si l'Élève a suffi)
  log: string[]; // trace lisible
  // Moteur agentique : build vert MAIS le moteur s'est arrêté sans conclure
  // (plafond/blocage) → la tâche n'est peut-être pas terminée (honnêteté #146).
  incomplete?: boolean;
  // L'utilisateur a cliqué « Stop » : arrêt VOLONTAIRE, ni échec ni escalade.
  // Le travail déjà écrit est committé par le tour → on peut reprendre ensuite.
  aborted?: boolean;
}

export interface RelayOptions {
  maxEleveAttempts?: number;
  /** Modèle Claude pour l'escalade (défaut sonnet). */
  maitreModel?: string;
  /** Reçoit chaque ligne de trace en direct (pour le streaming SSE). */
  onLog?: (line: string) => void;
  // #104 Phase 2 — porte FONCTIONNELLE : ne pas s'arrêter à « build vert » si
  // l'app est vide. Ne s'active que si gate=true (ou .env RELAY_FUNCTIONAL_GATE=1)
  // ET qu'un `judge` est fourni dans les deps. OFF par défaut → boucle inchangée.
  functionalGate?: boolean;
  /** Score fonctionnel minimal (/10) accepté quand la porte est active (défaut 5). */
  functionalMin?: number;
  // #104 Phase 3 — injecter à l'Élève les moyens text qu'il n'avait pas
  // (procédures #75, constellations #74). OFF par défaut (ou .env RELAY_INJECT_MEANS=1).
  injectMeans?: boolean;
  /** Surcharge le ModelProfile pour cet appel (agents spécialisés : uxui, layout…). */
  profile?: ModelProfile;
  /** Surcharge le modèle Ollama/API pour cet appel (ex. UXUI_AGENT_MODEL). */
  eleveModel?: string;
  /** Surcharge le PROVIDER pour cet appel (Phase E2 — multi-cerveaux par intention).
   * Absent → provider global (.env). Permet de router une intention vers un cerveau
   * cloud (openai-compat) ou local (ollama) indépendamment du global. */
  provider?: LLMProvider;
  /** Endpoint OpenAI-compat custom du binding courant (C1-P0, depuis le registre).
   * Absent → endpoint .env global (ELEVE_API_URL/KEY), comportement inchangé. */
  endpoint?: EndpointOverride;
  /** Politique d'outils gatée par la force mesurée du cerveau (Phase E3). Absent →
   * plein pouvoir (run_command + délégation), = comportement actuel. */
  toolPolicy?: BrainPolicy;
  /** Prompt système COMPLET (toute la coquille : skills, design system, identité…)
   * assemblé par l'appelant (index.ts via assembleSystemPrompt). Utilisé par le
   * moteur agentique pour que le cerveau pilote la coquille entière, pas un prompt
   * nu. Absent → repli sur une base minimale. */
  systemFull?: string;
}

/** Les deux cerveaux + les effets de bord, injectables pour les tests. */
export interface RelayDeps {
  askEleve: (system: string, user: string) => Promise<string>;
  inspect: (projectDir: string) => Promise<Inspection>;
  ensureDeps: (projectDir: string, log: (s: string) => void) => Promise<void>;
  escalate: (ctx: EscalationContext) => Promise<{ axiom: boolean; costUsd: number; codeChanged: boolean }>;
  // #104 Phase 2 — juge fonctionnel optionnel (injectable). Absent de
  // defaultRelayDeps → la porte ne peut JAMAIS se déclencher par défaut.
  judge?: (projectDir: string, task: string) => Promise<{ fonctionnel: number; note: string } | null>;
  // #146 Phase 2 — transport du MOTEUR agentique, injectable pour les tests.
  // Absent en prod → elevePost (vrai endpoint OpenAI-compat). Fourni → active le
  // moteur même hors provider openai (tests déterministes sans réseau).
  agenticPost?: PostFn;
  // Interruption coopérative (clic « Stop ») lue en tête de boucle agentique.
  // Absent → isInterrupted (drapeau module armé par /api/stop). Surchargeable en test.
  shouldAbort?: () => boolean;
  // (2026-08-05, refonte v3 lot 2) Dependances du Gardien de cloture, injectables.
  // Depuis que ELEVE_CLOSURE_GATE est fige ON, le Gardien tourne dans TOUS les chemins
  // du relais — y compris sur des repertoires de test qui ne peuvent pas le satisfaire
  // (intention 0/100, pas de package.json), ce qui declenchait une boucle de
  // re-correction du Maitre. Absent (production) → `realGateDeps` via le defaut de
  // `runClosureGate`. Fourni → cloture deterministe, sans reseau ni juge LLM.
  gateDeps?: GateDeps;
}

export interface EscalationContext {
  task: string;
  projectDir: string;
  lastError: string;
  maitreModel: string;
  /** Partition active — détermine axiomFiles et escalateAppendix. Défaut = PROFILE. */
  profile?: ModelProfile;
  /** #1 — true : l'Élève s'est ARRÊTÉ sans conclure (build vert mais tâche incomplète).
   * Le Maître doit TERMINER la tâche, pas réparer un build cassé. */
  incomplete?: boolean;
  /** Résumé de ce que l'Élève a fait avant de se bloquer (pour orienter le Maître). */
  eleveSummary?: string;
}
