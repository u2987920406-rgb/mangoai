// Tests du catalogue de régression (#196 fault-finding Partie 5). Déterministe,
// zéro réseau, zéro disque — vérifie la cohérence du catalogue lui-même, pas
// les incidents qu'il référence (ça, c'est le rôle des tests qu'il liste).
import { line, makeCheck } from "./test-util.js";
import { REGRESSION_CATALOG, catalogSummary } from "../regression/regression-catalog.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("regression-catalog — cohérence du catalogue (#196 fault-finding Partie 5)");
line();

check("le catalogue n'est pas vide", REGRESSION_CATALOG.length > 0);

const ids = REGRESSION_CATALOG.map((e) => e.id);
check("tous les ids sont uniques", new Set(ids).size === ids.length);

for (const entry of REGRESSION_CATALOG) {
  check(`${entry.id} : status="guarded" ⇒ au moins 1 guardedBy`, entry.status !== "guarded" || entry.guardedBy.length > 0);
  check(`${entry.id} : status="gap" ⇒ guardedBy vide`, entry.status !== "gap" || entry.guardedBy.length === 0);
  check(`${entry.id} : incident non vide`, entry.incident.trim().length > 0);
  check(`${entry.id} : note non vide (honnêteté du statut)`, entry.note.trim().length > 0);
}

{
  const s = catalogSummary();
  check("catalogSummary.total cohérent", s.total === REGRESSION_CATALOG.length);
  check("catalogSummary.guarded + gaps = total", s.guarded + s.gaps === s.total);
  check("catalogSummary.guarded cohérent avec le filtre réel", s.guarded === REGRESSION_CATALOG.filter((e) => e.status === "guarded").length);
}

line("═");
console.log(failures === 0 ? "✅ regression-catalog : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
