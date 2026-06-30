// Idempotence des webhooks — Stripe peut livrer DEUX FOIS le même événement (retries) ;
// sans garde, on facturerait/créditerait deux fois. markProcessed(eventId) renvoie true la
// PREMIÈRE fois, false ensuite. Store INJECTABLE : mémoire par défaut, branchable sur la brique 'db'.
export interface IdempotencyStore {
  /** true si l'événement est nouveau (à traiter), false s'il a déjà été vu */
  markProcessed(eventId: string): Promise<boolean>;
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const seen = new Set<string>();
  return {
    async markProcessed(eventId) {
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    },
  };
}

// Variante persistante de référence : à brancher sur la brique 'db' (table processed_events).
// Exemple (à copier dans une migration db) :
//   CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
// puis :
//   export function createDbIdempotencyStore(db) {
//     return { async markProcessed(id) {
//       const exists = db.prepare("SELECT 1 FROM processed_events WHERE id = ?").get(id);
//       if (exists) return false;
//       db.prepare("INSERT INTO processed_events (id, at) VALUES (?, ?)").run(id, Date.now());
//       return true;
//     }};
//   }
