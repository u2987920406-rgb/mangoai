// Utilitaires de sortie partagés pour les tests autonomes (`npx tsx src/test-*.ts`).
// Sortie console STRICTEMENT identique au motif canonique historique (test-relay.ts) :
//   line()  → une règle de 64 caractères.
//   check() → `  ✓/✗ label`, et incrémente le compteur d'échecs du test appelant.
// Le compteur `failures` reste LOCAL à chaque test (via le callback onFail) : aucun
// site de lecture de `failures` n'est modifié lors de la migration.

export const line = (c = "─", n = 64): void => console.log(c.repeat(n));

export function makeCheck(onFail: () => void): (label: string, cond: boolean) => void {
  return (label: string, cond: boolean): void => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}`);
    if (!cond) onFail();
  };
}
