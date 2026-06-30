// Limitation de conservation (RGPD art. 5 : pas de données gardées plus longtemps que nécessaire).
// Helpers PURS à brancher sur un balayage périodique (cron) qui efface ce qui a expiré. ZÉRO dépendance.
export interface Retainable {
  id: string;
  createdAt: number;
}

export function isExpired(item: Retainable, ttlMs: number, nowMs: number): boolean {
  return nowMs - item.createdAt > ttlMs;
}

export function selectExpired<T extends Retainable>(items: T[], ttlMs: number, nowMs: number): T[] {
  return items.filter((i) => isExpired(i, ttlMs, nowMs));
}

/**
 * Balaye une liste d'éléments, efface ceux qui ont dépassé le TTL via `eraseFn`,
 * renvoie les ids effacés. `eraseFn` est typiquement un DELETE de la brique 'db'.
 */
export async function sweepExpired<T extends Retainable>(
  items: T[],
  ttlMs: number,
  nowMs: number,
  eraseFn: (id: string) => Promise<void> | void,
): Promise<string[]> {
  const expired = selectExpired(items, ttlMs, nowMs);
  const erased: string[] = [];
  for (const item of expired) {
    await eraseFn(item.id);
    erased.push(item.id);
  }
  return erased;
}

export const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;
