import { flagsSnapshot } from "../flags.js";
const all = flagsSnapshot();
const on = all.filter(f => f.active);
console.log("total:", all.length, "| ACTIFS:", on.length);
for (const f of on) console.log("  ON ", f.name, "= env", f.env, "| defaut", f.default);
const parEnv = on.filter(f => !f.default);
console.log("actifs UNIQUEMENT via .env :", parEnv.map(f => f.name).join(", ") || "aucun");
