// (Chantier archi — découpage runRelay) Résolution de configuration d'un run +
// types de contexte partagés par les phases. Le corps de resolveRelayConfig est
// extrait VERBATIM du préambule de runRelay (aucun changement de comportement).
import { type Inspection } from "../inspection.js";
import { type ModelProfile } from "../models/profile.js";
import { type LLMProvider } from "../llm/llm-engine.js";
import { type BrainPolicy } from "../brain/brain-runtime.js";
import { loadHooks } from "../mango-hooks-config.js";
import { PROFILE, ELEVE_MODEL, ELEVE_PROVIDER_DEFAULT, askEleveDispatch, type EndpointOverride } from "./provider.js";
import { type RelayResult, type RelayOptions, type RelayDeps } from "./types.js";

export interface RelayConfig {
  task: string;
  projectDir: string;
  opts: RelayOptions;
  deps: RelayDeps;
  callProfile: ModelProfile;
  callModel: string;
  callProvider: LLMProvider;
  callEndpoint: EndpointOverride | undefined;
  callPolicy: BrainPolicy;
  callMaxAttempts: number;
  callCaps: { axiomCap: number; axiomFiles: string[]; fileBudget: number; fileMax: number };
  callAskEleve: (sys: string, usr: string) => Promise<string>;
  maitreModel: string;
  functionalGate: boolean;
  functionalMin: number;
  injectMeans: boolean;
  log: string[];
  push: (s: string) => void;
  relayHooks: ReturnType<typeof loadHooks>;
}

export interface RelayContext extends RelayConfig {
  inspectReady: () => Promise<Inspection>;
  finalizeEscalation: (
    lastErr: string,
    attempts: number,
    esc2?: { incomplete?: boolean; eleveSummary?: string },
  ) => Promise<RelayResult>;
}

export function resolveRelayConfig(
  task: string,
  projectDir: string,
  opts: RelayOptions,
  deps: RelayDeps,
): RelayConfig {
  const callProfile    = opts.profile ?? PROFILE;
  const callModel      = opts.eleveModel ?? ELEVE_MODEL;
  // Phase E2 — provider de l'appel (multi-cerveaux). Défaut = global.
  const callProvider   = opts.provider ?? ELEVE_PROVIDER_DEFAULT;
  // C1-P0 — endpoint custom du binding courant (registre). Absent → undefined,
  // openAiEndpoint retombe alors EXACTEMENT sur ELEVE_API_URL/KEY (.env).
  const callEndpoint   = opts.endpoint;
  // Phase E3 — politique d'outils. Défaut = plein pouvoir (= comportement actuel).
  const callPolicy: BrainPolicy = opts.toolPolicy ?? { allowRun: true, allowDelegate: true };
  const callMaxAttempts = opts.maxEleveAttempts ?? Number(process.env.ELEVE_MAX_ATTEMPTS ?? callProfile.caps.maxAttempts);
  const callAxiomCap   = Number(process.env.ELEVE_AXIOM_CAP   ?? callProfile.caps.axiomCap);
  const callFileBudget = Number(process.env.ELEVE_FILE_BUDGET ?? callProfile.caps.fileBudget);
  const callFileMax    = Number(process.env.ELEVE_FILE_MAX    ?? callProfile.caps.fileMax);
  const callCaps       = { axiomCap: callAxiomCap, axiomFiles: callProfile.axiomFiles, fileBudget: callFileBudget, fileMax: callFileMax };
  // Enveloppe TOUJOURS avec le modèle/provider/endpoint de l'appel — y compris
  // quand ils coïncident avec les globaux. L'ancien code ne ré-appliquait
  // `callEndpoint` (qui porte baseUrl + apiKeyEnv, ex. OPENROUTER_API_KEY) QUE si
  // le modèle différait du global ; dès que le cerveau de l'appel ÉTAIT le global
  // (ex. ELEVE_MODEL=tencent/hy3:free via openrouter), il retombait sur deps.askEleve
  // qui lit ELEVE_API_KEY (.env) → clé vide → « Clé API Élève manquante » (HTTP 500).
  // On applique donc systématiquement l'endpoint fourni (undefined = repli .env identique).
  const callAskEleve: (sys: string, usr: string) => Promise<string> =
    (sys, usr) => askEleveDispatch(sys, usr, callModel, callProvider, callEndpoint);
  const maitreModel = opts.maitreModel ?? "sonnet";
  const functionalGate = opts.functionalGate ?? (process.env.RELAY_FUNCTIONAL_GATE === "1");
  const functionalMin = opts.functionalMin ?? Number(process.env.RELAY_FUNCTIONAL_MIN ?? 5);
  const injectMeans = opts.injectMeans ?? (process.env.RELAY_INJECT_MEANS === "1");
  const log: string[] = [];
  const push = (s: string) => {
    log.push(s);
    console.log(`[relay] ${s}`);
    opts.onLog?.(s);
  };
  const relayHooks = process.env.ELEVE_HOOKS === "on" ? loadHooks(projectDir) : [];
  return {
    task, projectDir, opts, deps,
    callProfile, callModel, callProvider, callEndpoint, callPolicy, callMaxAttempts,
    callCaps, callAskEleve, maitreModel, functionalGate, functionalMin, injectMeans,
    log, push, relayHooks,
  };
}
