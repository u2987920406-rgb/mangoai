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
  // N'enveloppe QUE si l'appel s'écarte des globaux (modèle, provider OU
  // endpoint). Sinon `deps.askEleve` reste la source — c'est ce qui rend le
  // relais injectable/testable (mock offline dans les tests, `askEleveDispatch`
  // tel quel en prod : `defaultRelayDeps.askEleve = askEleveDispatch`, donc
  // aucune différence de comportement réel quand tout est déjà par défaut).
  // Piège corrigé le 2026-07-20 : `callEndpoint` (baseUrl + apiKeyEnv, ex.
  // OPENROUTER_API_KEY) doit à lui seul déclencher l'enveloppe même si le
  // modèle/provider COÏNCIDENT avec le global — sinon `deps.askEleve` (qui
  // ignore `callEndpoint`) retombe sur `ELEVE_API_KEY` (.env) → clé vide →
  // « Clé API Élève manquante ». Un `callEndpoint` défini bat toujours le
  // raccourci deps.askEleve, qu'il coïncide ou non avec les globaux.
  const usesGlobalDefaults = callModel === ELEVE_MODEL && callProvider === ELEVE_PROVIDER_DEFAULT && !callEndpoint;
  const callAskEleve: (sys: string, usr: string) => Promise<string> = usesGlobalDefaults
    ? deps.askEleve
    : (sys, usr) => askEleveDispatch(sys, usr, callModel, callProvider, callEndpoint);
  // DÉCISION RAF 2026-09-29 : le MAÎTRE (escalade) est Opus 5.5 par défaut, plus Sonnet.
  // Justification : l'escalade est l'acte le PLUS exigeant du harnais (réparer un build que
  // l'Élève n'a pas su passer + distiller UN axiome) et il est RARE et BORNÉ (maxMaitreGate,
  // plafonds d'escalade du train-loop) — le poste de quota est faible, la contrepartie en
  // justesse est la plus élevée du système. Override toujours possible par appel
  // (`opts.maitreModel`), `TRAIN_ESCALATE_MODEL`, ou le cron (cron-scheduler.ts).
  // CHANTIER 1 — le modele du Maitre devient CONFIGURABLE (ELEVE_MAITRE_MODEL),
  // comme TRAIN_ESCALATE_MODEL l'est deja pour le train-loop. Sans ca, changer
  // de Maitre imposait de toucher au code (defaut fige "opus").
  const maitreModel = opts.maitreModel ?? (process.env.ELEVE_MAITRE_MODEL?.trim() || "opus");
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
