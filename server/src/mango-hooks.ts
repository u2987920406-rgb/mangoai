// Couche de HOOKS déclarative de Mango — #172, Phase 0 (cœur pur, AUCUN branchement).
//
// Aujourd'hui, Mango a déjà des « hooks », mais chacun est une fonction TypeScript câblée
// à la main dans eleve.ts : le Gardien (eleve-gate.ts), la garde de portée (eleve-judge.ts),
// l'anti-spirale (eleve-antispiral.ts). Ce module leur donne un CONTRAT COMMUN —
// (événement + matcher + handler) — exécuté par UN dispatcher générique, pour qu'une 6ᵉ garde
// ne demande plus un nouveau fichier .ts + un câblage manuel dans le noyau.
//
// Phase 0 = le dispatcher SEUL, en isolation totale : il reçoit des handlers déjà résolus
// (des fonctions) et les exécute. Les résolveurs concrets (function/command/prompt) et le
// branchement dans askEleveAgentic viennent aux phases suivantes.
//
// Discipline Mango (non négociable) : « ne lève JAMAIS ». Un handler qui plante, time-out ou
// renvoie n'importe quoi ne doit pas casser un tour → il est traité comme absent (fail-open).

/** Les points d'ancrage réels de la boucle Mango (voir le tableau du plan #172, section 3). */
export type MangoHookEvent =
  | "PreToolUse"    // avant registry.invoke(name, args) — peut deny/ask/modifier l'input
  | "PostToolUse"   // après registry.invoke — observation (le résultat est déjà produit)
  | "OnBlock"       // le Stratège diagnostique un blocage
  | "PreFinish"     // avant que l'Élève ait le droit de finir (= le Gardien de clôture)
  | "OnEscalate"    // escalade vers le Maître (Claude)
  | "OnGapRecorded"; // une lacune non couverte est inscrite (auto-évolution #168)

/** Contexte passé à un hook. Champs communs + libres selon l'événement. */
export interface MangoHookInput {
  event: MangoHookEvent;
  projectDir: string;
  /** PreToolUse/PostToolUse : nom de l'outil concerné. */
  toolName?: string;
  /** PreToolUse/PostToolUse : arguments de l'outil (modifiables via updatedInput en PreToolUse). */
  toolInput?: Record<string, unknown>;
  /** OnBlock/OnEscalate/OnGapRecorded : détail libre (classe de blocage, raison…). */
  detail?: string;
  /** Champs spécifiques à un événement, sans casser le typage. */
  [k: string]: unknown;
}

/** Ce qu'un hook peut renvoyer. Tout est optionnel (un hook « observateur » ne renvoie rien). */
export interface MangoHookOutput {
  /** allow (défaut) · deny (bloque l'action) · ask (demande confirmation). */
  decision?: "allow" | "deny" | "ask";
  /** Justification, surfacée à l'appelant (concaténée pour les deny/ask). */
  reason?: string;
  /** PreToolUse SEULEMENT : réécrit les arguments de l'outil pour la suite. */
  updatedInput?: Record<string, unknown>;
}

/** Un handler résolu : une fonction pure du point de vue du dispatcher (I/O = son affaire). */
export type HookHandlerFn = (
  input: MangoHookInput,
) => Promise<MangoHookOutput | void> | MangoHookOutput | void;

/** Une entrée de hook déclarée (Phase 0 : `run` est injecté ; phases suivantes : résolu depuis JSON). */
export interface HookRegistration {
  /** Identité pour la déduplication (deux entrées de même id non vide → exécutée une seule fois). */
  id?: string;
  /** L'événement auquel ce hook s'accroche. */
  event: MangoHookEvent;
  /** Filtre sur toolName : "*"/absent = tout · "a|b" = liste · "pre*" = glob simple. */
  matcher?: string;
  /** Le handler résolu. */
  run: HookHandlerFn;
  /** Timeout dur propre à ce hook (défaut DEFAULT_HOOK_TIMEOUT_MS). */
  timeoutMs?: number;
}

/** Résultat agrégé d'un passage de dispatcher sur un événement. */
export interface MangoHookResult {
  /** Décision agrégée : deny si un seul deny · sinon ask si un seul ask · sinon allow. */
  decision: "allow" | "deny" | "ask";
  /** Raisons des hooks qui ont deny/ask, dans l'ordre d'exécution. */
  reasons: string[];
  /** PreToolUse : arguments après application séquentielle des updatedInput (absent si aucun). */
  updatedInput?: Record<string, unknown>;
  /** Nombre de hooks réellement exécutés (après matcher + dédup). */
  ran: number;
  /** Nombre de hooks tombés en erreur/timeout (fail-open : comptés mais ignorés). */
  errors: number;
}

/** Timeout dur par défaut d'un hook (function/command). Les hooks « prompt » utiliseront plus. */
export const DEFAULT_HOOK_TIMEOUT_MS = 5000;

const TIMEOUT = Symbol("hook-timeout");

/**
 * Le matcher matche-t-il ce nom d'outil ?
 *  - "" / "*" / absent → toujours (utile pour PreFinish/OnBlock qui n'ont pas de toolName).
 *  - "a|b|c" → l'un des noms exacts.
 *  - contient "*" → glob simple (converti en regex, `*` = « n'importe quoi »).
 *  - sinon → égalité stricte.
 */
export function matchesMatcher(matcher: string | undefined, toolName: string | undefined): boolean {
  const m = (matcher ?? "*").trim();
  if (m === "" || m === "*") return true;
  const name = toolName ?? "";
  for (const part of m.split("|").map((p) => p.trim()).filter(Boolean)) {
    if (part === "*") return true;
    if (part.includes("*")) {
      const rx = new RegExp("^" + part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      if (rx.test(name)) return true;
    } else if (part === name) {
      return true;
    }
  }
  return false;
}

/**
 * Sélectionne les hooks à exécuter pour un événement donné : bon event + matcher OK,
 * puis déduplication par `id` (les entrées sans id ne sont jamais dédupliquées entre elles).
 * Pur, ne lève jamais.
 */
export function selectHooks(
  handlers: HookRegistration[],
  event: MangoHookEvent,
  toolName?: string,
): HookRegistration[] {
  const seen = new Set<string>();
  const out: HookRegistration[] = [];
  for (const h of handlers ?? []) {
    if (!h || h.event !== event) continue;
    if (!matchesMatcher(h.matcher, toolName)) continue;
    if (h.id) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
    }
    out.push(h);
  }
  return out;
}

/** Exécute un handler avec timeout dur ; toute erreur/timeout → { error: true } (fail-open). */
async function safeRun(
  reg: HookRegistration,
  input: MangoHookInput,
  defaultTimeoutMs: number,
): Promise<{ out?: MangoHookOutput; error?: boolean }> {
  const ms = reg.timeoutMs && reg.timeoutMs > 0 ? reg.timeoutMs : defaultTimeoutMs;
  try {
    const raced = await new Promise<MangoHookOutput | void | typeof TIMEOUT>((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(TIMEOUT); }
      }, ms);
      Promise.resolve()
        .then(() => reg.run(input))
        .then(
          (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
          () => { if (!done) { done = true; clearTimeout(timer); resolve(TIMEOUT); } },
        );
    });
    if (raced === TIMEOUT) return { error: true };
    return { out: (raced ?? {}) as MangoHookOutput };
  } catch {
    return { error: true };
  }
}

/**
 * LE dispatcher. Exécute, en séquence, les hooks matchés pour `input.event`, puis agrège :
 *  - décision : deny > ask > allow (le plus restrictif l'emporte) ;
 *  - reasons : celles des hooks deny/ask, dans l'ordre ;
 *  - updatedInput (PreToolUse) : les updatedInput sont appliqués séquentiellement — chaque hook
 *    voit l'input déjà réécrit par les précédents ; le résultat final n'est renvoyé que si au
 *    moins un hook l'a modifié.
 * Ne lève JAMAIS : une défaillance globale renvoie un allow neutre.
 */
export async function runHooks(
  input: MangoHookInput,
  handlers: HookRegistration[],
  opts: { defaultTimeoutMs?: number } = {},
): Promise<MangoHookResult> {
  const base: MangoHookResult = { decision: "allow", reasons: [], ran: 0, errors: 0 };
  try {
    const selected = selectHooks(handlers, input.event, input.toolName);
    if (selected.length === 0) return base;

    const defaultTimeoutMs = opts.defaultTimeoutMs && opts.defaultTimeoutMs > 0
      ? opts.defaultTimeoutMs : DEFAULT_HOOK_TIMEOUT_MS;

    let decision: "allow" | "deny" | "ask" = "allow";
    const reasons: string[] = [];
    let mutated = false;
    // L'input évolue : chaque hook voit les updatedInput des précédents (PreToolUse).
    let currentInput: MangoHookInput = input;
    let ran = 0;
    let errors = 0;

    for (const reg of selected) {
      const r = await safeRun(reg, currentInput, defaultTimeoutMs);
      ran++;
      if (r.error || !r.out) { if (r.error) errors++; continue; }
      const out = r.out;

      if (out.decision === "deny") { decision = "deny"; }
      else if (out.decision === "ask" && decision !== "deny") { decision = "ask"; }

      if (out.reason && (out.decision === "deny" || out.decision === "ask")) {
        reasons.push(out.reason);
      }

      // updatedInput ne vaut que pour PreToolUse et n'est pris que si l'action n'est pas refusée.
      if (input.event === "PreToolUse" && out.updatedInput && out.decision !== "deny") {
        mutated = true;
        currentInput = {
          ...currentInput,
          toolInput: { ...(currentInput.toolInput ?? {}), ...out.updatedInput },
        };
      }
    }

    return {
      decision,
      reasons,
      updatedInput: mutated ? currentInput.toolInput : undefined,
      ran,
      errors,
    };
  } catch {
    // Défaillance imprévue du dispatcher lui-même → on laisse passer (fail-open absolu).
    return base;
  }
}

/**
 * (#172, Phase 5) Déclenche des hooks OBSERVATIONNELS de cycle de vie (OnBlock / OnEscalate /
 * OnGapRecorded) : on NOTIFIE, on n'attend pas de décision qui bloquerait le flux. Fail-open,
 * ne lève jamais ; `[]` de hooks → no-op immédiat. Renvoie le résultat (utile aux tests) mais
 * l'appelant peut l'ignorer (fire-and-forget via `void`).
 */
export async function fireObservationHook(
  event: MangoHookEvent,
  projectDir: string,
  detail: string,
  hooks: HookRegistration[],
): Promise<MangoHookResult> {
  const base: MangoHookResult = { decision: "allow", reasons: [], ran: 0, errors: 0 };
  if (!hooks || hooks.length === 0) return base;
  try {
    return await runHooks({ event, projectDir, detail }, hooks);
  } catch {
    return base;
  }
}
