// (C4-P0, 2026-07-03) Applique un PROFIL de cerveau au registre principal.
//
// Usage : `npx tsx src/apply-brain-profile.ts <nom>` (ex. full-local, cloud-actuel).
// Bascule TOUS les rôles d'un coup vers un jeu de cerveaux pré-défini — c'est
// l'INTERRUPTEUR de souveraineté : le jour où un modèle local tient la boucle
// (mur L51), `full-local` fait tout basculer en une commande. Réversible :
// `cloud-actuel` (snapshot des défauts) ramène l'état d'aujourd'hui.
//
// Sûr : backup automatique du registre courant avant remplacement (écriture
// atomique héritée de saveBrainRegistry), validation via coerceConfig (un profil
// corrompu est REFUSÉ sans toucher au registre en place), et un avertissement
// croisé avec les cartes mesurées (#148) si on passe full-local sans preuve que
// le cerveau codeur local tient la boucle agentique.
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import {
  loadBrainRegistry,
  saveBrainRegistry,
  brainProfilePath,
  AGENT_IDS,
  DEFAULT_REGISTRY,
  type AgentId,
  type BrainConfig,
} from "./brain/brain-registry.js";

export interface ApplyResult {
  ok: boolean;
  message: string;
  backupPath?: string;
}

/** Lit + valide un profil (registre complet). Renvoie null si absent/corrompu. PUR
 *  au sens : ne touche RIEN sur disque, juste lecture. */
export function readProfile(name: string): Record<AgentId, BrainConfig> | null {
  const pf = brainProfilePath(name);
  try {
    if (!fs.existsSync(pf)) return null;
    const parsed = JSON.parse(fs.readFileSync(pf, "utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    // On exige que TOUS les rôles soient présents (un profil est un registre complet).
    const out = {} as Record<AgentId, BrainConfig>;
    for (const id of AGENT_IDS) {
      const c = parsed[id];
      if (!c || typeof c !== "object" || typeof (c as Record<string, unknown>).provider !== "string") return null;
      out[id] = c as BrainConfig;
    }
    return out;
  } catch {
    return null;
  }
}

/** Applique le profil `name` : backup du registre courant, puis remplacement
 *  (validé par saveBrainRegistry). Fail-safe : profil invalide → refus, rien touché. */
export function applyProfile(name: string, registryFileForBackup?: string): ApplyResult {
  const profile = readProfile(name);
  if (!profile) {
    return { ok: false, message: `Profil « ${name} » introuvable ou invalide (${brainProfilePath(name)}) — registre inchangé.` };
  }
  // Backup du registre COURANT avant de le remplacer.
  let backupPath: string | undefined;
  try {
    const current = loadBrainRegistry();
    const dir = registryFileForBackup ? path.dirname(registryFileForBackup) : path.join(import.meta.dirname, "..", "data");
    backupPath = path.join(dir, "brain-registry.backup.json");
    atomicWriteFileSync(backupPath, JSON.stringify(current, null, 2));
  } catch {
    // un backup raté ne doit pas empêcher l'application, mais on le signale
    backupPath = undefined;
  }
  saveBrainRegistry(profile); // valide champ par champ + écriture atomique
  const warn = localWarning(name);
  return { ok: true, message: `Profil « ${name} » appliqué${backupPath ? " (backup créé)" : ""}.${warn}`, backupPath };
}

/** Avertissement L51 : passer full-local suppose qu'un cerveau local tienne la
 *  boucle — ce qui n'est PAS acquis (gemma4:12b/qwen2.5-coder:14b ne tiennent pas
 *  encore). On PRÉVIENT, on ne bloque pas (la décision reste à Raf). */
function localWarning(name: string): string {
  if (name !== "full-local") return "";
  return (
    "\n⚠ RAPPEL L51 : les modèles locaux (gemma4:12b, qwen2.5-coder:14b) ne tiennent PAS ENCORE la boucle agentique. " +
    "Ce profil est l'INTERRUPTEUR prêt à l'emploi — à activer quand un modèle local aura fait ses preuves (model-scan #148). " +
    "Reviens en arrière avec : npx tsx src/apply-brain-profile.ts cloud-actuel"
  );
}

/** Génère (si absent) le profil `cloud-actuel.json` = snapshot des défauts, pour
 *  garantir un chemin de retour même sans registre édité. Idempotent. */
export function ensureCloudActuelProfile(): void {
  const pf = brainProfilePath("cloud-actuel");
  if (fs.existsSync(pf)) return;
  const snapshot = {} as Record<AgentId, BrainConfig>;
  for (const id of AGENT_IDS) snapshot[id] = { ...DEFAULT_REGISTRY[id] };
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  atomicWriteFileSync(pf, JSON.stringify(snapshot, null, 2));
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Exécuté directement (npx tsx) : applique le profil passé en argument.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("apply-brain-profile.ts")) {
  ensureCloudActuelProfile();
  const name = process.argv[2];
  if (!name) {
    console.log("Usage : npx tsx src/apply-brain-profile.ts <profil>   (ex. full-local, cloud-actuel)");
    process.exit(1);
  }
  const r = applyProfile(name);
  console.log(r.ok ? `✅ ${r.message}` : `❌ ${r.message}`);
  process.exit(r.ok ? 0 : 1);
}
