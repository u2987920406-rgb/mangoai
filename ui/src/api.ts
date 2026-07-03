// Client API central — remplace les 176 fetch() directs recensés par l'audit (§3.2 U3).
// Un seul endroit pour : parse JSON, normalisation d'erreur, retry léger (GET),
// et remontée des erreurs vers les toasts via un écouteur global.
//
// Usage :
//   const projets = await api<Project[]>("/api/projects");
//   await api("/api/gaps/12/forge", { method: "POST", body: { note } });
//   onApiError((e) => pushToast("error", e.userMessage));   // une fois, à la racine

export class ApiError extends Error {
  /** Code HTTP (0 = erreur réseau). */
  status: number;
  /** Corps d'erreur renvoyé par le backend, si parsable. */
  body: unknown;
  /** Message présentable à l'utilisateur (toast). */
  userMessage: string;

  constructor(status: number, userMessage: string, body?: unknown) {
    super(`API ${status}: ${userMessage}`);
    this.name = "ApiError";
    this.status = status;
    this.userMessage = userMessage;
    this.body = body;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Objet sérialisé en JSON (headers posés automatiquement). */
  body?: unknown;
  signal?: AbortSignal;
  /** Nombre de re-tentatives sur erreur réseau/5xx (GET uniquement). Défaut 1. */
  retry?: number;
  /** true = ne PAS notifier les écouteurs globaux (l'appelant gère l'erreur lui-même). */
  silent?: boolean;
}

type ErrorListener = (error: ApiError) => void;
const listeners = new Set<ErrorListener>();

/** Enregistre un écouteur global d'erreurs API (→ toasts). Renvoie la fonction de désabonnement. */
export function onApiError(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(error: ApiError, silent: boolean | undefined): void {
  if (!silent) for (const l of listeners) { try { l(error); } catch { /* un toast cassé ne casse pas l'appel */ } }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (typeof b.message === "string") return b.message;
  }
  return status === 0 ? "Serveur injoignable" : `Erreur ${status}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appel API JSON. Résout le corps parsé, lève ApiError sinon. */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, signal, silent } = options;
  const maxRetry = method === "GET" ? (options.retry ?? 1) : 0;

  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    if (attempt > 0) await wait(300 * attempt);
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        signal,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (signal?.aborted) throw e; // annulation volontaire — ni retry ni toast
      lastError = new ApiError(0, "Serveur injoignable");
      continue; // erreur réseau → retry si budget
    }

    let parsed: unknown = undefined;
    const text = await res.text();
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }

    if (res.ok) return parsed as T;
    lastError = new ApiError(res.status, extractMessage(parsed, res.status), parsed);
    if (res.status < 500) break; // 4xx = pas de retry
  }

  notify(lastError as ApiError, silent);
  throw lastError;
}
