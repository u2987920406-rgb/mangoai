// Boucle de relais Maître/Élève — FAÇADE de ré-export (chantier archi #3).
//
// La logique vit désormais dans server/src/eleve/ :
//   provider.ts  — socle provider + transport chat fin (la FEUILLE bas-niveau)
//   contract.ts  — contrat d'outils + moteur agentique (postEleve*/askEleveAgentic)
//   escalade.ts  — escalade vers le Maître (Claude)
//   types.ts     — types de la boucle de relais
//   relay.ts     — buildEleveUser, ensureDeps, clôture, defaultRelayDeps, runRelay
//
// Ce fichier ne fait QUE ré-exporter la surface publique historique : les 18+
// importeurs de "./eleve.js" continuent de fonctionner sans modification.

// ── Socle provider + transport chat fin ──────────────────────────────────────
export {
  normalizeEleveProvider,
  completionsUrl,
  ELEVE_PROVIDER,
  ELEVE_PROVIDER_DEFAULT,
  isOpenAICompat,
  openAiEndpoint,
  chatEleve,
  type EndpointOverride,
} from "./eleve/provider.js";

// ── Contrat d'outils + moteur agentique ──────────────────────────────────────
export {
  elevePost,
  supportsTools,
  askEleveAgentic,
  AGENTIC_TOOL_CONTRACT,
  toOllamaMessages,
  fromOllamaResponse,
} from "./eleve/contract.js";

// ── Types de la boucle de relais ─────────────────────────────────────────────
export {
  type ResolvedBy,
  type RelayResult,
  type RelayOptions,
  type RelayDeps,
  type EscalationContext,
} from "./eleve/types.js";

// ── Signaux git de l'escalade (surface publique inchangée) ───────────────────
export { gitDirtyPaths, hasRealCodeChange } from "./git-signals.js";

// ── Boucle de relais ─────────────────────────────────────────────────────────
export { defaultRelayDeps, runRelay } from "./eleve/relay.js";
