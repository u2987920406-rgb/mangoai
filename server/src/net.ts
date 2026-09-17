// Détection des adresses LAN — pour servir la page de validation de goût (#149 v2) au
// téléphone de Raf (même Wi-Fi) et logguer l'URL à ouvrir au démarrage.

import os from "node:os";

/** Adresses IPv4 non-internes de la machine (192.168.x, 10.x…), ordre des interfaces.
 *  Dédupliquées : une même IP peut apparaître sur plusieurs interfaces (ex. pont
 *  virtuel qui reflète l'IP hôte) — sans dédup on logguerait deux fois la même URL. */
export function lanIPv4s(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let ifaces: ReturnType<typeof os.networkInterfaces>;
  try { ifaces = os.networkInterfaces(); } catch { return []; }
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      // Node ≥18 : ni.family peut être "IPv4" (string) ou 4 (number).
      const isV4 = ni.family === "IPv4" || (ni.family as unknown as number) === 4;
      if (isV4 && !ni.internal && !seen.has(ni.address)) {
        seen.add(ni.address);
        out.push(ni.address);
      }
    }
  }
  return out;
}

/** URL LAN de base (1ère IPv4 non-interne) → http://<ip>:<port>, ou localhost en repli. */
export function lanBaseUrl(port: number): string {
  const ip = lanIPv4s()[0] ?? "localhost";
  return `http://${ip}:${port}`;
}
