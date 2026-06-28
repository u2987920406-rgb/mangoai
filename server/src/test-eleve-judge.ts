// Tests du juge d'intention (#161). Déterministe, deps injectées (dispatch/readFile).
// On exerce : parseIntentVerdict (couverture + manques, tolérant, négatifs ignorés),
// judgeIntention happy, VL en erreur → verdict NEUTRE (ne bloque pas), fichiers lus
// bornés/confinés, ne lève jamais.

import { parseIntentVerdict, judgeIntention, applyScopeGuard, SCOPE_MISMATCH_CAP, type JudgeDeps } from "./eleve-judge.js";

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
    diff: over.diff ?? (() => null),
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

  console.log("\n[4b] L21 — judgeIntention envoie le DIFF d'un fichier modifié (pas le contenu)");
  {
    const seen2 = { users: [] as string[] };
    const dd: JudgeDeps = {
      dispatch: async (_a, _s, user) => {
        seen2.users.push(user);
        return ok("COUVERTURE: 80\nMANQUES:\n- rien");
      },
      readFile: () => "CONTENU INTÉGRAL NE DOIT PAS APPARAÎTRE",
      diff: (_dir, rel) => (rel === "src/App.jsx" ? "@@ -1 +1 @@\n-const a=1\n+const a=2" : null),
    };
    await judgeIntention("Change a en 2", "fait", ["src/App.jsx"], "/proj", dd);
    check("le DIFF est inclus", /\+const a=2/.test(seen2.users[0]) && /src\/App\.jsx \(diff\)/.test(seen2.users[0]));
    check("le contenu intégral n'est PAS utilisé (diff prioritaire)", !/CONTENU INTÉGRAL/.test(seen2.users[0]));
  }

  console.log("\n[4c] L21 — fichier NOUVEAU (pas de diff) → contenu, étiqueté « nouveau fichier »");
  {
    const seen2 = { users: [] as string[] };
    const dd: JudgeDeps = {
      dispatch: async (_a, _s, user) => {
        seen2.users.push(user);
        return ok("COUVERTURE: 90\nMANQUES:\n- rien");
      },
      readFile: (_dir, rel) => (rel === "src/New.jsx" ? "export const New = () => null" : null),
      diff: () => null, // nouveau fichier : aucun diff vs HEAD
    };
    await judgeIntention("Ajoute New", "fait", ["src/New.jsx"], "/proj", dd);
    check("contenu inclus + label nouveau fichier", /export const New/.test(seen2.users[0]) && /src\/New\.jsx \(nouveau fichier\)/.test(seen2.users[0]));
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

  console.log("\n[7] applyScopeGuard (L40) — garde de cadre déterministe, PURE");
  {
    const base = { couverture: 100, manques: [] as string[], note: "n" };
    const inScope = applyScopeGuard(base, "Ajoute une page Contact à mon site");
    check("dans le périmètre → verdict inchangé (100)", inScope.couverture === 100 && inScope.manques.length === 0);

    const unity = applyScopeGuard(base, "Fais-moi un jeu en Unity 3D");
    check("hors périmètre (Unity) → couverture plafonnée au cap", unity.couverture === SCOPE_MISMATCH_CAP);
    check("hors périmètre → manque de cadre ajouté", unity.manques.length === 1 && /hors périmètre/i.test(unity.manques[0]));

    const native = applyScopeGuard(base, "Une app Android natif en Kotlin avec Jetpack Compose");
    check("mobile natif détecté", native.couverture === SCOPE_MISMATCH_CAP && /mobile natif/i.test(native.manques[0]));

    // couverture déjà basse → on garde le min (ne remonte jamais)
    const low = applyScopeGuard({ couverture: 20, manques: ["x"], note: "n" }, "jeu Unreal Engine");
    check("couverture déjà < cap → reste basse (min)", low.couverture === 20);
    check("manque de cadre PRÉFIXÉ aux manques existants", low.manques.length === 2 && /hors périmètre/i.test(low.manques[0]) && low.manques[1] === "x");

    // opt-out
    const off = applyScopeGuard(base, "jeu Unity", { JUDGE_SCOPE_GUARD: "off" } as NodeJS.ProcessEnv);
    check("opt-out JUDGE_SCOPE_GUARD=off → inchangé", off.couverture === 100 && off.manques.length === 0);

    // pas de faux positif sur un mot proche
    const safe = applyScopeGuard(base, "une communauté de swifties (fans de musique)");
    check("pas de faux positif (community/swifties)", safe.couverture === 100);
  }

  console.log("\n[8] judgeIntention — la garde de cadre mord même quand le juge dit 100");
  {
    const { d } = deps({ dispatch: async () => ok("COUVERTURE: 100\nMANQUES:\n- rien") });
    const v = await judgeIntention("Fais un jeu mobile en Unity exporté en APK natif Android", "j'ai livré une app React", [], "/proj", d);
    check("juge LLM dit 100 MAIS cadre hors périmètre → plafonné", v.couverture === SCOPE_MISMATCH_CAP);
    check("manque de cadre présent", v.manques.some((m) => /hors périmètre/i.test(m)));
  }

  console.log("\n[9] judgeIntention — garde de cadre SANS cloud (juge indisponible)");
  {
    const { d } = deps({ dispatch: async () => ({ status: "error", summary: "réseau HS" }) });
    const v = await judgeIntention("Développe un jeu Unity natif", "résumé", [], "/proj", d);
    check("juge KO + cadre hors périmètre → quand même détecté (≤ cap)", v.couverture === SCOPE_MISMATCH_CAP);
    check("manque de cadre présent malgré juge KO", v.manques.some((m) => /hors périmètre/i.test(m)));
    // contre-épreuve : juge KO + tâche EN périmètre → reste neutre 100 (comportement d'origine préservé)
    const v2 = await judgeIntention("Ajoute un bouton", "résumé", [], "/proj", d);
    check("juge KO + en périmètre → neutre 100 (inchangé)", v2.couverture === 100 && v2.manques.length === 0);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-judge : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
