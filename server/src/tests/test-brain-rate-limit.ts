// Le RATE LIMITER du Brain-Dispatch, testé pour la première fois de bout en bout.
//
// Pourquoi « pour la première fois » : jusqu'au remaniement du 2026-08-06, la fenêtre
// glissante lisait `Date.now()` en dur. `sleep` était injecté, l'horloge non — donc
// la moitié du mécanisme, l'EXPIRATION de la fenêtre de 60 s, ne pouvait se vérifier
// qu'en attendant 60 secondes réelles. Personne ne l'a jamais fait. Le limiteur était
// le seul organe du dispatcher à n'avoir aucune assertion sur son comportement propre.
//
// Ce fichier est donc le gain concret du découpage, pas sa justification a posteriori :
// une pièce qu'on peut isoler est une pièce qu'on peut prouver.

import {
  acquireSlot,
  resetRateLimits,
  slotsConsommes,
  RATE_LIMITS,
} from "../brain/brain-rate-limit.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Horloge et sleep pilotés : aucune attente réelle, aucun test instable. */
function banc() {
  let t = 0;
  const dodos: number[] = [];
  return {
    now: () => t,
    avance: (ms: number) => { t += ms; },
    // Le sleep NE FAIT PAS avancer l'horloge : c'est au test de décider si le temps
    // passe. Sinon on ne saurait pas distinguer « la fenêtre a expiré » de « le
    // backoff a duré » — or ce sont deux causes très différentes de déblocage.
    sleep: async (ms: number) => { dodos.push(ms); },
    dodos,
  };
}

async function run() {
  console.log("\n[1] La fenêtre glissante — le test qui ne pouvait pas s'écrire avant");
  {
    resetRateLimits();
    const b = banc();
    const max = RATE_LIMITS.claude; // 10

    for (let i = 0; i < max; i++) await acquireSlot("claude", b.sleep, b.now);
    check(`les ${max} créneaux de claude sont consommés`, slotsConsommes("claude") === max);
    check("aucun backoff tant que la fenêtre n'est pas pleine", b.dodos.length === 0);

    // 11ᵉ appel dans la MÊME fenêtre : saturé → 3 backoffs, puis laisser-passer.
    await acquireSlot("claude", b.sleep, b.now);
    check("saturé → backoff exponentiel 1 s, 2 s, 4 s", JSON.stringify(b.dodos) === JSON.stringify([1000, 2000, 4000]));
    check("après 3 tentatives, on LAISSE PASSER (le 429 du provider prend le relais)", slotsConsommes("claude") === max + 1);

    // 60 s plus tard : la fenêtre a expiré, le compteur repart de zéro. C'est
    // précisément l'assertion qui exigeait d'attendre une minute réelle.
    b.dodos.length = 0;
    b.avance(60_000);
    await acquireSlot("claude", b.sleep, b.now);
    check("à 60 s pile, la fenêtre expire et le compteur repart à 1", slotsConsommes("claude") === 1);
    check("fenêtre neuve → aucun backoff", b.dodos.length === 0);
  }

  console.log("\n[2] La frontière exacte de la fenêtre — 59 999 ms n'est pas 60 000");
  {
    resetRateLimits();
    const b = banc();
    const max = RATE_LIMITS.claude;

    for (let i = 0; i < max; i++) await acquireSlot("claude", b.sleep, b.now);
    b.avance(59_999);
    b.dodos.length = 0;
    await acquireSlot("claude", b.sleep, b.now);
    // Un `>` au lieu d'un `>=` dans la comparaison de fenêtre passerait inaperçu sans
    // cette paire d'assertions : c'est le genre d'écart d'un millième qui ne se voit
    // jamais en production, et qui décale tout le rythme d'appel.
    check("à 59 999 ms la fenêtre tient encore (saturée → backoff)", b.dodos.length === 3);

    b.avance(1);
    b.dodos.length = 0;
    await acquireSlot("claude", b.sleep, b.now);
    check("à 60 000 ms exactement elle expire (aucun backoff)", b.dodos.length === 0);
  }

  console.log("\n[3] Les providers sont cloisonnés");
  {
    resetRateLimits();
    const b = banc();

    // Saturer claude ne doit rien coûter à ollama — sinon un rôle local, gratuit et
    // souverain, se retrouverait ralenti par les quotas d'un cloud qu'il n'utilise pas.
    for (let i = 0; i < RATE_LIMITS.claude; i++) await acquireSlot("claude", b.sleep, b.now);
    b.dodos.length = 0;
    await acquireSlot("ollama", b.sleep, b.now);
    check("claude saturé n'impose aucun backoff à ollama", b.dodos.length === 0);
    check("ollama a son propre compteur", slotsConsommes("ollama") === 1);
    check("ollama est quasi illimité (local, pas de quota réel)", RATE_LIMITS.ollama === 999);
    check("claude est le plus contraint des providers cloud", RATE_LIMITS.claude === 10);
  }

  console.log("\n[4] resetRateLimits — le seul état global du dispatcher");
  {
    resetRateLimits();
    const b = banc();
    await acquireSlot("groq", b.sleep, b.now);
    check("un créneau est compté", slotsConsommes("groq") === 1);
    resetRateLimits();
    check("reset efface tout", slotsConsommes("groq") === 0);
    check("un provider jamais vu compte 0, sans exception", slotsConsommes("mistral") === 0);
  }

  console.log("\n[5] L'horloge par défaut reste la vraie");
  {
    // Le paramètre est OPTIONNEL : tout appelant existant (y compris `dispatch`
    // avant qu'on lui passe `now`) garde le comportement d'origine.
    resetRateLimits();
    await acquireSlot("openai", async () => { /* rien */ });
    check("appelé sans horloge, le limiteur fonctionne (défaut Date.now)", slotsConsommes("openai") === 1);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-rate-limit : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error("échec inattendu :", err);
  process.exit(1);
});
