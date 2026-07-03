// Verrou GLOBAL de l'exécutant agent (N18, nuit 2026-07-03) — extrait d'index.ts
// pour que la boucle NOCTURNE puisse l'acquérir AUSSI : `runNocturnalBatch`
// tournait HORS verrou, en collision avec les tours de chat — `currentQuery`
// (singleton d'agent.ts) écrasé → `/api/stop` interrompait le MAUVAIS agent,
// l'autre devenait ininterruptible ; et le contexte vision (singleton assumé
// mono-tour) capturait la preview d'un AUTRE projet.
//
// Un seul runAgent à la fois, quel que soit l'appelant (chat OU nocturne).
// L'acquisition est atomique (test+set en un appel) — plus de fenêtre entre
// « if (busy) » et « busy = true ».
let busy = false;

export function isAgentBusy(): boolean {
  return busy;
}

/** Tente de prendre le verrou. true = à toi de jouer (release() obligatoire en finally). */
export function tryAcquireAgent(): boolean {
  if (busy) return false;
  busy = true;
  return true;
}

export function releaseAgent(): void {
  busy = false;
}
