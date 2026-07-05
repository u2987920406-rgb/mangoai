// Starter `formation` (#181 É2) — modèle de l'apprenant, DOUBLE RÉSIDENCE (D2).
//
// 1) VÉRITÉ LOCALE : `localStorage`. L'app marche 100 % hors-ligne — jamais de
//    throw non catché sur un `fetch` qui échoue (dégradation gracieuse, patron
//    MANGO_DATA_RULES : "never crash on a failed fetch").
// 2) MIROIR partagé : collection `/api/shared/formation-<slug>` (REST + SSE,
//    repli polling) — best-effort, la file d'attente est REJOUÉE au retour du
//    backend. Clés du scope : `learner` (modèle courant), `events:<ts>`
//    (journal append-only), `bank-ext:<module>` (banques d'extension du Tuteur,
//    lues ici — jamais écrites par l'app).
//
// Patron EXACT de MANGO_DATA_RULES (server/src/scenario.ts) : client mince,
// base = import.meta.env.VITE_API_URL ?? "http://localhost:3000", header
// X-MangoApp-Id sur toute écriture.

import {
  emptyLearnerModel,
  validateLearnerModel,
  type AnswerRecord,
  type Item,
  type LearnerModel,
} from "./engine";

// L'id déclaré dans .mangoapp.json — la Fabrique (É3) le personnalise par
// formation (slug unique, cf. risque §4.7 du plan : collision de scope).
// MANGOAPP_ID porte DÉJÀ le préfixe complet ("formation-<slugUnique>", posé
// par personnaliserMangoapp() dans formation-fabrique.ts) — la collection
// partagée est cet id TEL QUEL, sans le re-préfixer (bug #181 É6 corrigé :
// un ancien `formation-${MANGOAPP_ID}` doublait le préfixe et désynchronisait
// le client de `.mangoapp.json` / du Tuteur).
export const MANGOAPP_ID = "formation-demo";

const BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? "http://localhost:3000";
const COLLECTION = MANGOAPP_ID;

const LOCAL_KEY = `formation:${MANGOAPP_ID}:learner`;
const QUEUE_KEY = `formation:${MANGOAPP_ID}:sync-queue`;

// ---------------------------------------------------------------------------
// Vérité locale (localStorage) — jamais de throw qui remonte à l'appelant.
// ---------------------------------------------------------------------------

function safeLocalStorage(): Storage | null {
  try {
    // `localStorage` peut être indisponible (mode privé strict, SSR de test) —
    // on le sonde plutôt que de supposer qu'il existe.
    const ls = globalThis.localStorage;
    const probeKey = "__formation_probe__";
    ls.setItem(probeKey, "1");
    ls.removeItem(probeKey);
    return ls;
  } catch {
    return null;
  }
}

/** Charge le modèle apprenant local ; vierge (et valide) si absent/corrompu. */
export function loadLearnerModel(moduleInitial: string): LearnerModel {
  const ls = safeLocalStorage();
  if (!ls) return emptyLearnerModel(moduleInitial);
  try {
    const raw = ls.getItem(LOCAL_KEY);
    if (!raw) return emptyLearnerModel(moduleInitial);
    const parsed = JSON.parse(raw);
    const verdict = validateLearnerModel(parsed);
    if (!verdict.valid) return emptyLearnerModel(moduleInitial);
    return parsed as LearnerModel;
  } catch {
    return emptyLearnerModel(moduleInitial);
  }
}

/** Persiste le modèle localement (vérité), puis tente le miroir (best-effort). */
export function saveLearnerModel(model: LearnerModel): void {
  const ls = safeLocalStorage();
  if (ls) {
    try {
      ls.setItem(LOCAL_KEY, JSON.stringify(model));
    } catch {
      /* quota dépassé ou storage indisponible — la session continue en mémoire */
    }
  }
  enqueueSync({ type: "learner", model });
  void flushQueue();
}

/** Enregistre une réponse (met à jour l'historique + enfile l'événement). */
export function recordAnswer(model: LearnerModel, item: Item, correct: boolean, now: Date): LearnerModel {
  const record: AnswerRecord = {
    itemId: item.id,
    skillIds: item.skillIds,
    difficulty: item.difficulty,
    correct,
    at: now.toISOString(),
  };
  // Historique borné (les 500 derniers événements suffisent au diagnostic).
  const historique = [...model.historique, record].slice(-500);
  const next: LearnerModel = { ...model, historique };
  enqueueSync({ type: "event", record, at: now.toISOString() });
  return next;
}

// ---------------------------------------------------------------------------
// File de synchronisation — best-effort, rejouée au retour du backend.
// ---------------------------------------------------------------------------

type SyncItem =
  | { type: "learner"; model: LearnerModel }
  | { type: "event"; record: AnswerRecord; at: string };

function readQueue(): SyncItem[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: SyncItem[]): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    // Bornée : on ne garde que le dernier "learner" (état courant) + les
    // événements récents, pour ne jamais faire exploser le localStorage.
    ls.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    /* best-effort */
  }
}

function enqueueSync(item: SyncItem): void {
  const queue = readQueue();
  if (item.type === "learner") {
    // Un seul "learner" en attente à la fois : le plus récent écrase le précédent.
    writeQueue([...queue.filter((q) => q.type !== "learner"), item]);
  } else {
    writeQueue([...queue, item]);
  }
}

let flushing = false;

/** Rejoue la file vers `/api/shared/formation-<slug>`. Ne lève jamais ;
 * s'arrête au premier échec réseau (retentera au prochain appel). */
export async function flushQueue(): Promise<{ ok: boolean; flushed: number }> {
  if (flushing) return { ok: false, flushed: 0 };
  flushing = true;
  let flushed = 0;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const item = queue[0];
      const ok = await pushOne(item);
      if (!ok) break;
      queue = queue.slice(1);
      writeQueue(queue);
      flushed++;
    }
    return { ok: true, flushed };
  } catch {
    return { ok: false, flushed };
  } finally {
    flushing = false;
  }
}

async function pushOne(item: SyncItem): Promise<boolean> {
  try {
    const key = item.type === "learner" ? "learner" : `events:${item.at}`;
    const value = item.type === "learner" ? item.model : item.record;
    const res = await fetch(`${BASE}/api/shared/${COLLECTION}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-MangoApp-Id": MANGOAPP_ID },
      body: JSON.stringify({ value }),
    });
    return res.ok;
  } catch {
    // backend éteint / réseau absent — dégradation gracieuse, on réessaiera.
    return false;
  }
}

/** Tente un flush au retour de connectivité + toutes les N secondes en tâche
 * de fond (best-effort, aucune garantie de latence). */
export function startBackgroundSync(intervalMs = 30_000): () => void {
  const onOnline = () => void flushQueue();
  try {
    globalThis.addEventListener?.("online", onOnline);
  } catch {
    /* environnement sans window (tests) — pas grave */
  }
  const timer = setInterval(() => void flushQueue(), intervalMs);
  return () => {
    clearInterval(timer);
    try {
      globalThis.removeEventListener?.("online", onOnline);
    } catch {
      /* ignore */
    }
  };
}

// ---------------------------------------------------------------------------
// Lecture des extensions du Tuteur (`bank-ext:<module>`) — SSE + repli polling.
// ---------------------------------------------------------------------------

export interface BankExtSubscription {
  stop: () => void;
}

/**
 * S'abonne aux extensions de banque écrites par le Tuteur (É5) pour un module.
 * SSE si dispo, repli polling sinon (patron MANGO_DATA_RULES). Le point
 * d'intégration (fusion de `bank-ext:*` avec la banque embarquée) est le plus
 * fragile du design (§5.5 du plan) : ici on livre juste la donnée brute, la
 * fusion (dédoublonnage par id) est laissée à l'appelant (écrans Exercice/
 * Révision), volontairement simple et testable séparément.
 */
export function subscribeBankExt(moduleId: string, onItems: (items: unknown[]) => void): BankExtSubscription {
  const key = `bank-ext:${moduleId}`;
  let stopped = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let es: EventSource | null = null;

  const fetchOnce = async () => {
    try {
      const res = await fetch(`${BASE}/api/shared/${COLLECTION}/${encodeURIComponent(key)}`);
      if (!res.ok) return;
      const data = await res.json();
      const value = (data as { value?: unknown })?.value;
      if (Array.isArray(value)) onItems(value);
    } catch {
      /* backend éteint — on retentera au prochain tick de polling */
    }
  };

  const startPolling = () => {
    if (pollTimer) return;
    void fetchOnce();
    pollTimer = setInterval(() => void fetchOnce(), 15_000);
  };

  try {
    if (typeof EventSource !== "undefined") {
      es = new EventSource(`${BASE}/api/shared/${COLLECTION}/stream`);
      es.addEventListener("snapshot", (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          const doc = (data?.docs ?? []).find((d: { key: string }) => d.key === key);
          if (doc && Array.isArray(doc.value)) onItems(doc.value);
        } catch {
          /* payload SSE inattendu — ignoré, le polling de secours couvrira */
        }
      });
      es.addEventListener("change", (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.key === key && Array.isArray(data.value)) onItems(data.value);
        } catch {
          /* ignore */
        }
      });
      es.onerror = () => {
        // SSE indisponible (backend éteint, CORS, proxy…) → repli polling.
        es?.close();
        es = null;
        if (!stopped) startPolling();
      };
    } else {
      startPolling();
    }
  } catch {
    startPolling();
  }

  return {
    stop: () => {
      stopped = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}
