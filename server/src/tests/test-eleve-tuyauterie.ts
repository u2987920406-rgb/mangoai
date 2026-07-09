// Test de tuyauterie — Phase Ultime, début du Jalon D.
// But : prouver le RELAIS de bout en bout, PAS la qualité du code.
//   1. On envoie une tâche triviale à l'Élève (Gemma local via Ollama),
//      en lui imposant le format de SORTIE de la Coque Rigide.
//   2. On récupère sa réponse BRUTE.
//   3. On la passe dans le parseContract() réel de MangoOS.
//   4. Verdict : « l'Élève sait-il parler le contrat de MangoOS ? »
// Rien n'est écrit sur le disque, rien ne touche la boucle Claude.
//
// Lancer :  npx tsx src/test-eleve-tuyauterie.ts

import { parseContract } from "../contract.js";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";

// Face ENTRÉE (spec docs/contrat-es.md) : on enseigne la forme immuable.
const SYSTEM = `Tu es un développeur qui propose des actions à MangoOS.
Tu ne touches JAMAIS au disque : tu DÉCRIS les actions, MangoOS les exécutera.

Tu DOIS répondre UNIQUEMENT dans ce format à balises, rien d'autre, aucune prose autour :

<mangoos>
  <write path="chemin/relatif.js">
  ...contenu brut du fichier...
  </write>
  <edit path="src/App.jsx">
    <find>extrait exact à remplacer</find>
    <replace>nouvel extrait</replace>
  </edit>
  <run>commande shell éventuelle</run>
  <summary>Résumé court de ce que tu as fait.</summary>
</mangoos>

Règles :
- Le chemin (path) est TOUJOURS relatif au projet (jamais C:\\, jamais /, jamais ..).
- N'utilise <write> que pour les fichiers à créer/écraser entièrement.
- Termine toujours par un <summary>.
- AUCUN texte hors de l'enveloppe <mangoos>.`;

const TASK = `Crée un fichier "src/utils/greet.js" qui exporte une fonction greet(name)
renvoyant la chaîne "Bonjour, <name> !" (avec le prénom inséré).`;

async function askEleve(): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature: 0 }, // déterminisme pour un test de tuyau
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: TASK },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

function line(c = "─") {
  console.log(c.repeat(64));
}

(async () => {
  console.log(`Élève : ${MODEL}  (via ${OLLAMA})`);
  console.log(`Tâche : créer src/utils/greet.js\n`);

  const t0 = Date.now();
  let raw: string;
  try {
    raw = await askEleve();
  } catch (e) {
    console.error("❌ Échec de l'appel à l'Élève :", (e as Error).message);
    console.error("   (Le serveur Ollama tourne-t-il ? `ollama serve`)");
    process.exit(1);
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  line("═");
  console.log("RÉPONSE BRUTE DE L'ÉLÈVE");
  line();
  console.log(raw);
  line("═");

  const parsed = parseContract(raw);
  console.log(`\nVERDICT parseContract()  (généré en ${dt}s)`);
  line();
  if (!parsed.ok) {
    console.log(`❌ REJET — escalade vers le Maître (Claude) déclenchée.`);
    console.log(`   Raison : ${parsed.error}`);
    process.exit(2);
  }
  console.log(`✅ CONTRAT VALIDE  (réparé : ${parsed.repaired ? "oui" : "non"})`);
  console.log(`   Résumé   : ${parsed.summary || "(vide)"}`);
  console.log(`   Actions  : ${parsed.actions.length}`);
  for (const [i, a] of parsed.actions.entries()) {
    if (a.kind === "write") {
      console.log(`     ${i + 1}. write  ${a.path}  (${a.content.length} car.)`);
    } else if (a.kind === "edit") {
      console.log(`     ${i + 1}. edit   ${a.path}`);
    } else {
      console.log(`     ${i + 1}. run    ${a.command}`);
    }
  }
  if (parsed.axiom) console.log(`   Axiome   : ${parsed.axiom}`);
  console.log(`\n→ Tuyauterie validée : l'Élève parle le contrat, MangoOS le comprend.`);
})();
