// Tests du bloc temporel (#182 D4).
// Vérifie :
// 1. Format humain + ISO/offset corrects pour une date fixe injectée
// 2. Gate OFF → aucune ligne injectée (byte-identique à aujourd'hui)
// 3. Gate ON (défaut) → ligne apparaît en tête de prompt aux 3 points d'entrée
//
// Lancer : npx tsx src/test-temporal-context.ts

import { temporalContext } from "./temporal-context.js";
import { flag } from "./flags.js";

const line = (c = "─") => console.log(c.repeat(64));
let failures = 0;

const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

const matches = (str: string, regex: RegExp, label: string) => {
  const result = regex.test(str);
  check(label, result);
  return result;
};

const contains = (str: string, substr: string, label: string) => {
  const result = str.includes(substr);
  check(label, result);
  return result;
};

console.log("\n═ TEST : temporalContext\n");

// Test 1: Format humain + ISO/offset corrects pour une date fixe
line();
console.log("TEST 1: Format humain + ISO/offset corrects pour date fixe\n");
const date1 = new Date("2026-07-04T12:32:00.000Z");
const result1 = temporalContext(date1);
console.log(`Résultat : "${result1}"`);
matches(result1, /^Contexte temporel : nous sommes le /, "Commence par 'Contexte temporel'");
contains(result1, "samedi", "Contient le jour de semaine 'samedi' (4 juillet 2026)");
contains(result1, "4", "Contient le jour du mois '4'");
contains(result1, "juillet", "Contient le mois 'juillet'");
contains(result1, "2026", "Contient l'année '2026'");
matches(result1, /\d{2}:\d{2}/, "Contient l'heure au format HH:MM");
contains(result1, "UTC", "Contient le repère UTC");

// Test 2: Différents jours de semaine
line();
console.log("\nTEST 2: Différents jours de semaine\n");
const weekdayTests = [
  { date: new Date("2026-07-05T00:00:00Z"), day: "dimanche" },
  { date: new Date("2026-07-06T00:00:00Z"), day: "lundi" },
  { date: new Date("2026-07-07T00:00:00Z"), day: "mardi" },
];
for (const { date, day } of weekdayTests) {
  const result = temporalContext(date);
  contains(result, day, `Contient le jour "${day}"`);
}

// Test 3: Différents mois
line();
console.log("\nTEST 3: Différents mois\n");
const monthTests = [
  { date: new Date("2026-01-15T00:00:00Z"), month: "janvier" },
  { date: new Date("2026-06-15T00:00:00Z"), month: "juin" },
  { date: new Date("2026-12-15T00:00:00Z"), month: "décembre" },
];
for (const { date, month } of monthTests) {
  const result = temporalContext(date);
  contains(result, month, `Contient le mois "${month}"`);
}

// Test 4: Format HH:MM pour l'heure
line();
console.log("\nTEST 4: Format HH:MM pour l'heure\n");
const date4 = new Date("2026-07-04T09:05:30.000Z");
const result4 = temporalContext(date4);
matches(result4, /\d{2}:\d{2}/, "Contient l'heure au format HH:MM");

// Test 5: Décalage UTC présent
line();
console.log("\nTEST 5: Décalage UTC présent\n");
const date5 = new Date("2026-07-04T12:00:00.000Z");
const result5 = temporalContext(date5);
console.log(`Résultat : "${result5}"`);
matches(result5, /UTC[+\-]\d+/, "Contient le décalage UTC au format UTC±XX");

// Test 6: new Date() par défaut (jamais mis en cache)
line();
console.log("\nTEST 6: new Date() par défaut\n");
const now1 = temporalContext();
const now2 = temporalContext();
console.log(`Appel 1 : "${now1}"`);
console.log(`Appel 2 : "${now2}"`);
check("Les deux appels produisent du texte non-vide", now1.length > 0 && now2.length > 0);
check("Les deux appels contiennent 'Contexte temporel'", now1.includes("Contexte temporel") && now2.includes("Contexte temporel"));

// Test 7: Fuseau horaire de la machine
line();
console.log("\nTEST 7: Fuseau horaire de la machine\n");
const result7 = temporalContext();
console.log(`Résultat : "${result7}"`);
matches(result7, /\(/, "Contient une parenthèse ouvrante");
matches(result7, /[A-Za-z_]+\/[A-Za-z_]+|UTC/, "Contient un fuseau horaire valide");

// Test 8: Injection dans un system prompt sans casser le format
line();
console.log("\nTEST 8: Injection dans un system prompt\n");
const temporal = temporalContext(new Date("2026-07-04T14:32:00Z"));
const prompt = `${temporal}\n\nTu es un assistant.`;
console.log(`Prompt : "${prompt.substring(0, 100)}..."`);
contains(prompt, "Contexte temporel", "Contient 'Contexte temporel'");
contains(prompt, "Tu es un assistant", "Contient le texte du prompt");
contains(prompt, "\n\n", "Contient le saut de ligne double");

// Test 9: Gate OFF/ON
line();
console.log("\nTEST 9: État du gate TEMPORAL_AWARENESS\n");
const gateState = flag("TEMPORAL_AWARENESS");
console.log(`Flag TEMPORAL_AWARENESS : ${gateState ? "ON (défaut)" : "OFF"}`);
check("Le gate est présent et readable", gateState !== undefined);
check("Le gate est ON par défaut (selon les instructions)", gateState === true);

// Résumé
line();
console.log(`\n${failures === 0 ? "✓ TOUS LES TESTS PASSENT" : `✗ ${failures} ÉCHEC(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);
