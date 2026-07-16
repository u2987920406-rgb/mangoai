// ─── Test logique pur — bornes de resolvePlacement ────────────────────────────
// `resolvePlacement` (data/bank/index.js) décide le niveau de placement :
// <40 % → débutant · 40-70 % → intermédiaire · >70 % → avancé. Ces bornes sont
// documentées mais jamais vérifiées exactement (un test e2e avec 12 questions
// ne peut pas tomber pile sur 40,0 % / 70,0 %) — testé ici directement sur la
// fonction pure, aux valeurs limites précises. Pas de `page` : tourne hors
// navigateur (même exécuté deux fois, une fois par projet Playwright — coût
// négligeable pour une fonction pure).
import { test, expect } from "@playwright/test";
import { resolvePlacement } from "../src/data/bank/index.js";

test.describe("resolvePlacement — bornes exactes", () => {
  test("exactement 40% → intermédiaire (borne inclusive basse)", () => {
    expect(resolvePlacement(4, 10).level).toBe("intermediaire");
  });

  test("juste sous 40% → débutant", () => {
    expect(resolvePlacement(39, 100).level).toBe("debutant");
  });

  test("exactement 70% → intermédiaire (borne exclusive haute, PAS avancé)", () => {
    expect(resolvePlacement(7, 10).level).toBe("intermediaire");
  });

  test("juste au-dessus de 70% → avancé", () => {
    expect(resolvePlacement(71, 100).level).toBe("avance");
  });

  test("0/0 (aucune réponse) → débutant, ne lève pas", () => {
    const r = resolvePlacement(0, 0);
    expect(r.level).toBe("debutant");
    expect(r.ratio).toBe(0);
  });

  test("100% → avancé", () => {
    expect(resolvePlacement(10, 10).level).toBe("avance");
  });
});
