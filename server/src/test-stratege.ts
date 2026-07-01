// Tests du routeur Stratège Phase 1 (stratege.ts) — pur, déterministe, borné.
import { route, newStrategeState, commitRemedy, remedyKey, formatRemedy } from "./stratege.js";
import type { Diagnosis, BlockerClass } from "./stratege-signals.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
const diag = (blocker: BlockerClass, detail?: string): Diagnosis => ({
  blocker, cause: "c", evidence: "e", remedy: "r", detail,
});

console.log("[1] routage par classe");
{
  const md = route(diag("missing-dependency", "leaflet"), newStrategeState());
  check("missing-dependency + detail → install-dependency", md.kind === "install-dependency" && md.kind === "install-dependency" && md.pkg === "leaflet");
  check("install porte un nudge de reprise", md.kind === "install-dependency" && /install/i.test(md.nudge));

  const mdNo = route(diag("missing-dependency"), newStrategeState());
  check("missing-dependency sans detail → escalate", mdNo.kind === "escalate");

  const kg = route(diag("knowledge-gap"), newStrategeState());
  check("knowledge-gap → nudge (documente)", kg.kind === "nudge" && /chercher_web/.test(kg.nudge));

  const pl = route(diag("plateau-iterations"), newStrategeState());
  check("plateau-iterations → nudge (delegate)", pl.kind === "nudge" && /delegate/.test(pl.nudge));

  const rf = route(diag("repetitive-failure"), newStrategeState());
  check("repetitive-failure → nudge (change d'approche)", rf.kind === "nudge" && /chercher_web|delegate|DÉLÈGUE/i.test(rf.nudge));

  const wa = route(diag("wandering"), newStrategeState());
  check("wandering → nudge (ré-ancre)", wa.kind === "nudge" && /finish/.test(wa.nudge));

  const waPlan = route(diag("wandering"), newStrategeState(), { planReminder: "Plan: 1) X 2) Y" });
  check("wandering injecte le rappel de plan si fourni", waPlan.kind === "nudge" && /Plan: 1\) X/.test(waPlan.nudge));
}

console.log("\n[2] classes non routées en Phase 1 → escalate");
{
  for (const c of ["wrong-tool", "flaky-resource", "ambiguous", "none"] as BlockerClass[]) {
    const r = route(diag(c), newStrategeState());
    check(`${c} → escalate`, r.kind === "escalate");
  }
}

console.log("\n[3] bornage : budget + remède déjà tenté");
{
  const st = newStrategeState(1);
  const d = diag("knowledge-gap");
  const r1 = route(d, st);
  check("budget 1 : 1er remède OK", r1.kind === "nudge");
  commitRemedy(d, st);
  check("commitRemedy décrémente le budget (→0)", st.budget === 0);
  check("commitRemedy marque tenté", st.tried.has(remedyKey(d)));
  const r2 = route(d, st);
  check("budget épuisé → escalate", r2.kind === "escalate" && /budget/.test(r2.reason));

  // remède déjà tenté (budget encore dispo) → escalate aussi
  const st2 = newStrategeState(5);
  const d2 = diag("missing-dependency", "three");
  route(d2, st2);
  commitRemedy(d2, st2);
  const again = route(d2, st2);
  check("même remède déjà tenté → escalate (pas de boucle)", again.kind === "escalate" && /déjà tenté/.test(again.reason));
  // mais une AUTRE dépendance manquante reste routable
  const other = route(diag("missing-dependency", "leaflet"), st2);
  check("autre module manquant → toujours routable", other.kind === "install-dependency");
}

console.log("\n[4] formatRemedy lisible");
{
  check("format install", /installe/.test(formatRemedy(diag("missing-dependency", "gsap"), { kind: "install-dependency", pkg: "gsap", nudge: "" })));
  check("format escalate", /escalade/.test(formatRemedy(diag("none"), { kind: "escalate", reason: "x" })));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
