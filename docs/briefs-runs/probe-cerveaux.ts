import { getBrain } from "../brain/brain-registry.js";
import { resolveProfile } from "../models/profile.js";

for (const r of ["codeur", "orchestrateur", "juge", "architecte", "forgeron", "accueil", "routeur"]) {
  const b = getBrain(r as never) as { model: string; provider: string };
  const p = resolveProfile(b.model);
  console.log(`${r.padEnd(15)} registre=${b.model.padEnd(22)} provider=${b.provider.padEnd(8)} profil=${p.id.padEnd(10)} agentic=${p.agentic}`);
}
