// Tests du juge d'intention (#161). Déterministe, deps injectées (dispatch/readFile).
// On exerce : parseIntentVerdict (couverture + manques, tolérant, négatifs ignorés),
// judgeIntention happy, VL en erreur → verdict NEUTRE (ne bloque pas), fichiers lus
// bornés/confinés, ne lève jamais.

import { parseIntentVerdict, judgeIntention, type JudgeDeps } from "./eleve-judge.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const ok = (summary: string) => ({ status: "ok", summary });

function deps(over: Partial<JudgeDeps> = {}): { d: JudgeDeps; seen: { users: string[] } } {
  const seen = { users: [] as string[] };
  const d: JudgeDeps = {
    dispatch:
      over.dispatch ??
      (async (_a, _s, user) => {
        seen.users.push(user);
        return ok("COUVERTURE: 90\nMANQUES:\n- rien");
      }),
    readFile: over.readFile ?? (() => null),
  };
  return { d, seen };
}

async function run() {
  console.log("\n[1] parseIntentVerdict — couverture + manques");
  {
    const v = parseIntentVerdict("COUVERTURE: 60\nMANQUES:\n- la page Contact\n- la validation email");
    check("couverture 60", v.couverture === 60);
    check("2 manques", v.manques.length === 2 && v.manques.includes("la validation email"));
  }

  console.log("\n[2] parseIntentVerdict — « rien » et placeholders ignorés");
  {
    const v = parseIntentVerdict("COUVERTURE: 100\nMANQUES:\n- rien");
    check("aucun manque (rien)", v.manques.length === 0);
    const v2 = parseIntentVerdict("COUVERTURE: 95\nMANQUES: aucun");
    check("aucun manque (inline aucun)", v2.manques.length === 0 && v2.couverture === 95);
  }

  console.log("\n[3] parseIntentVerdict — défaut neutre si pas de couverture");
  {
    const v = parseIntentVerdict("blabla sans format");
    check("couverture défaut = 100 (ne bloque pas)", v.couverture === 100);
  }

  console.log("\n[4] judgeIntention — happy + DEMANDE transmise");
  {
    const { d, seen } = deps({
      dispatch: async (_a, _s, user) => {
        return ok("COUVERTURE: 55\nMANQUES:\n- le bouton d'envoi");
      },
    });
    // injecter aussi readFile pour vérifier l'inclusion des extraits
    const dd: JudgeDeps = { ...d, readFile: (_dir, rel) => (rel === "src/App.jsx" ? "export default function App(){}" : null) };
    const seen2 = { users: [] as string[] };
    dd.dispatch = async (_a, _s, user) => {
      seen2.users.push(user);
      return ok("COUVERTURE: 55\nMANQUES:\n- le bouton d'envoi");
    };
    const v = await judgeIntention("Ajoute une page Contact avec bouton d'envoi", "J'ai fait la page", ["src/App.jsx"], "/proj", dd);
    check("verdict parsé", v.couverture === 55 && v.manques[0] === "le bouton d'envoi");
    check("DEMANDE dans le prompt", /Ajoute une page Contact/.test(seen2.users[0]));
    check("extrait de fichier inclus", /src\/App\.jsx/.test(seen2.users[0]) && /export default function App/.test(seen2.users[0]));
    check("résumé agent = DONNÉE (sanitize)", /UNTRUSTED|<<<|DONNÉE/i.test(seen2.users[0]));
  }

  console.log("\n[5] judgeIntention — VL en erreur → verdict NEUTRE (jamais bloquer à tort)");
  {
    const { d } = deps({ dispatch: async () => ({ status: "error", summary: "boom" }) });
    const v = await judgeIntention("tâche", "résumé", [], "/proj", d);
    check("couverture neutre 100", v.couverture === 100 && v.manques.length === 0);
  }

  console.log("\n[6] judgeIntention — dispatch qui lève → neutre, ne lève jamais");
  {
    const { d } = deps({
      dispatch: async () => {
        throw new Error("réseau HS");
      },
    });
    let threw = false;
    let v;
    try {
      v = await judgeIntention("t", "r", [], "/proj", d);
    } catch {
      threw = true;
    }
    check("ne lève pas", !threw);
    check("verdict neutre", v?.couverture === 100);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-judge : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
