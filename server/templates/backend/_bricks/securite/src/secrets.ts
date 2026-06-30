// Garde « secrets hors-code » : on REFUSE de démarrer si un secret obligatoire manque
// (échec rapide au boot plutôt qu'un 500 mystérieux en prod). ZÉRO dépendance.
// #170 (coffre-fort) : le jour venu, remplacer la lecture de process.env par une résolution
// de références secret://... côté serveur — l'appelant continuera d'utiliser requireEnv pareil.
export function requireEnv(names: string[], env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const missing = names.filter((n) => !env[n] || String(env[n]).trim() === "");
  if (missing.length) {
    throw new Error(`Secrets/variables d'environnement manquants : ${missing.join(", ")}`);
  }
  const out: Record<string, string> = {};
  for (const n of names) out[n] = String(env[n]);
  return out;
}
