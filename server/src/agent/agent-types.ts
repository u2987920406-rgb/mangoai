// Idée #103 — Mango Agent Factory. Types partagés par tous les modules de l'Agent Factory.

export type AgentCategory = "collecteur" | "processeur" | "acteur" | "coordinateur";
export type AgentStatus = "idle" | "running" | "stopped" | "error" | "completed";
export type MessageType = "task" | "result" | "event" | "ping" | "abort";
export type MessageStatus = "pending" | "read" | "expired";

// Définition statique d'un agent — le « contrat d'embauche ».
export interface AgentDef {
  id: string;                          // slug unique, ex: "collecteur-meteo-paris"
  name: string;
  category: AgentCategory;
  description: string;                 // description utilisateur → prompt de génération
  createdAt: string;                   // ISO
  updatedAt: string;
  intervalMs?: number;                 // collecteur : fréquence de polling, défaut 60000
  triggerEvent?: string;               // acteur : nom de l'event déclencheur
  envVars: Record<string, string>;     // variables d'env injectées au spawn
  subordinates?: string[];             // coordinateur : ids des agents délégués
  generatedBy: "claude" | "manual";
  promptUsed?: string;                 // prompt exact envoyé à Claude lors de la génération
}

// État vivant d'un agent — le « badge de pointage » lu en temps réel.
export interface AgentRuntimeState {
  id: string;
  status: AgentStatus;
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeat?: string;              // mis à jour par l'agent toutes les 30s
  lastTaskResult?: string;             // résumé tronqué 500 chars du dernier runTask()
  taskCount: number;
  errorCount: number;                  // reset à 0 sur succès ; >= 5 → auto-stop
  missionId?: string;                  // coordinateur : mission en cours
  pendingDelegations?: number;
  completedDelegations?: number;
}

// Message du bus inter-agents.
export interface AgentMessage {
  id: string;
  from: string;                        // agent-id ou '__mango__' (MangoOS)
  to: string;                          // agent-id destinataire
  type: MessageType;
  payload: unknown;                    // JSON-serialisable
  ts: string;                          // ISO création
  ttlMs: number;                       // durée de vie, défaut 3_600_000 (1h)
  status: MessageStatus;
  readAt?: string;
}

// Plan d'une mission déléguée par un coordinateur.
export interface MissionStep {
  stepId: string;
  agentId: string;
  task: string;
  dependsOn?: string[];                // stepIds à attendre avant de déléguer
}

export interface MissionPlan {
  missionId: string;
  goal: string;
  steps: MissionStep[];
}
